require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
const { getTodaysMatches } = require('./odds');
const { analyzeTodaysMatches } = require('./analyzer');
const { sendMessage, sendDailyReport } = require('./telegram');
const {
  initDB, getSimState, setSimState,
  insertPrediction, getTodaysPredictions,
  updatePredictionResult, getPredictionHistory,
  analysisAlreadyDoneToday,
} = require('./db');

const app = express();
app.use(cors());
app.use(express.json());

let botRunning = false;
let lastAnalysis = null;
let botLog = [];

function log(msg, type = 'info') {
  const entry = { timestamp: new Date().toISOString(), msg, type };
  botLog.unshift(entry);
  if (botLog.length > 100) botLog.pop();
  console.log(`[${type.toUpperCase()}] ${msg}`);
}

// ─── Análise diária ──────────────────────────────────────────────────────────

async function runDailyAnalysis() {
  if (!botRunning) { log('Bot pausado, análise cancelada', 'warn'); return; }

  const alreadyDone = await analysisAlreadyDoneToday();
  if (alreadyDone) { log('Análise já feita hoje, pulando', 'info'); return; }

  log('🔍 Iniciando análise diária...', 'info');
  lastAnalysis = new Date().toISOString();

  const matches = await getTodaysMatches();
  if (matches.length === 0) {
    log('Nenhum jogo encontrado para hoje', 'warn');
    await sendMessage('📋 *Análise do dia*\n\nNenhum jogo encontrado para hoje.');
    return;
  }

  log(`📋 ${matches.length} jogos encontrados — chamando IA...`, 'info');

  const predictions = await analyzeTodaysMatches(matches);
  if (predictions.length === 0) {
    log('IA não encontrou jogos com confiança suficiente', 'warn');
    await sendMessage('📋 *Análise do dia*\n\nNenhum jogo com confiança suficiente hoje.');
    return;
  }

  for (const p of predictions) {
    try {
      await insertPrediction(p);
    } catch (err) {
      log(`Erro ao salvar previsão: ${err.message}`, 'error');
    }
  }

  log(`✅ ${predictions.length} previsões salvas`, 'success');
  await sendDailyReport(predictions);
}

// ─── Cron: análise diária às 07:00 ──────────────────────────────────────────

cron.schedule('0 7 * * *', () => {
  runDailyAnalysis();
});

// ─── Endpoints ───────────────────────────────────────────────────────────────

app.get('/api/status', async (req, res) => {
  try {
    const predictions = await getTodaysPredictions();
    res.json({
      botRunning,
      lastAnalysis,
      totalToday: predictions.length,
      log: botLog.slice(0, 30),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/bot/toggle', async (req, res) => {
  botRunning = !botRunning;
  const sim = await getSimState();
  sim.botRunning = botRunning;
  await setSimState(sim);
  log(`Bot ${botRunning ? 'LIGADO' : 'DESLIGADO'}`, botRunning ? 'success' : 'warn');
  await sendMessage(`🤖 Bot ${botRunning ? '✅ LIGADO' : '⛔ DESLIGADO'}`);
  res.json({ botRunning });
});

app.post('/api/analyze', async (req, res) => {
  try {
    await runDailyAnalysis();
    const predictions = await getTodaysPredictions();
    res.json({ success: true, predictions });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/predictions', async (req, res) => {
  try {
    const predictions = await getTodaysPredictions();
    res.json(predictions);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/predictions/:id/result', async (req, res) => {
  const { result } = req.body;
  if (!['WIN', 'LOSS'].includes(result)) {
    return res.status(400).json({ error: 'result deve ser WIN ou LOSS' });
  }
  try {
    await updatePredictionResult(parseInt(req.params.id), result);
    log(`Resultado registrado: ID ${req.params.id} → ${result}`, result === 'WIN' ? 'success' : 'error');
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/history', async (req, res) => {
  try {
    const history = await getPredictionHistory(100);
    const wins = history.filter(h => h.result === 'WIN').length;
    const losses = history.filter(h => h.result === 'LOSS').length;
    const total = wins + losses;
    res.json({
      history,
      stats: {
        total,
        wins,
        losses,
        winRate: total > 0 ? parseFloat(((wins / total) * 100).toFixed(1)) : 0,
      },
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Start ───────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3001;
app.listen(PORT, async () => {
  console.log(`\n🚀 BetBot AI rodando na porta ${PORT}`);
  try {
    await initDB();
    const sim = await getSimState();
    botRunning = sim.botRunning || false;
    log(`Sistema iniciado — Bot ${botRunning ? 'LIGADO' : 'DESLIGADO'}`, 'success');
    await sendMessage(`🚀 *BetBot AI iniciado!*\nBot ${botRunning ? '✅ LIGADO' : '⏸ PAUSADO'}\nAnálise diária às 07:00.`);
  } catch (err) {
    log(`Erro ao iniciar: ${err.message}`, 'error');
  }
});
