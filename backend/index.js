require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
const { getTodaysMatches, formatOddsForMatch } = require('./odds');
const { analyzeTodaysMatches } = require('./analyzer');
const { getMatchStats } = require('./stats');
const { researchMatch } = require('./researcher');
const { getWeather } = require('./weather');
const { sendMessage, sendDailyReport, sendDebugReport, sendCalibrationReport, startPolling } = require('./telegram');
const { checkDailyResults } = require('./results');
const { runWeeklyCalibration } = require('./calibrator');
const {
  initDB, getSimState, setSimState,
  insertPrediction, getTodaysPredictions,
  updatePredictionResult, getPredictionHistory,
  analysisAlreadyDoneToday,
  saveOddsSnapshot, getOddsMovement,
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

// ─── Snapshot de odds (rastreamento de movimentação) ─────────────────────────

async function takeOddsSnapshot(label) {
  try {
    const matches = await getTodaysMatches();
    if (!matches.length) return;
    for (const m of matches) {
      const key = `${m.home_team}|${m.away_team}`;
      const oddsData = formatOddsForMatch(m);
      await saveOddsSnapshot(key, m.sport_key, label, oddsData);
    }
    log(`📸 Snapshot de odds salvo — ${label} (${matches.length} jogos)`, 'info');
  } catch (err) {
    log(`Erro no snapshot de odds: ${err.message}`, 'error');
  }
}

// ─── Análise diária ──────────────────────────────────────────────────────────

async function runDailyAnalysis({ force = false } = {}) {
  if (!botRunning) { log('Bot pausado, análise cancelada', 'warn'); return; }

  if (!force) {
    const alreadyDone = await analysisAlreadyDoneToday();
    if (alreadyDone) { log('Análise já feita hoje, pulando', 'info'); return; }
  }

  log('🔍 Iniciando análise diária...', 'info');
  lastAnalysis = new Date().toISOString();

  const matches = await getTodaysMatches();
  if (matches.length === 0) {
    log('Nenhum jogo encontrado para hoje', 'warn');
    await sendMessage('📋 *Análise do dia*\n\nNenhum jogo encontrado para hoje.');
    return;
  }

  // Salva snapshot de abertura das odds
  const today = new Date().toISOString().split('T')[0];
  for (const m of matches) {
    await saveOddsSnapshot(`${m.home_team}|${m.away_team}`, m.sport_key, 'morning', formatOddsForMatch(m));
  }

  log(`📋 ${matches.length} jogos encontrados — buscando estatísticas reais...`, 'info');

  // Ligas com cobertura completa na football-data.org — web search nunca é fallback para essas
  const COVERED_SPORTS = new Set([
    'soccer_brazil_campeonato',
    'soccer_spain_la_liga',
    'soccer_england_premier_league',
    'soccer_uefa_champs_league',
    'soccer_germany_bundesliga',
    'soccer_italy_serie_a',
    'soccer_france_ligue_one',
  ]);

  const researchMap = {};
  for (const m of matches) {
    const key = `${m.home_team}|${m.away_team}`;
    const stats = await getMatchStats(m.home_team, m.away_team, m.sport_key);
    if (stats) {
      researchMap[key] = stats;
      log(`📊 [API] ${m.home_team} x ${m.away_team}`, 'info');
    } else if (!COVERED_SPORTS.has(m.sport_key)) {
      // Web search apenas para ligas sem cobertura na API estruturada
      const web = await researchMatch(m.home_team, m.away_team);
      if (web) {
        researchMap[key] = web;
        log(`🌐 [Web] ${m.home_team} x ${m.away_team}`, 'info');
      }
    } else {
      log(`⚠️ [SEM DADOS] ${m.home_team} x ${m.away_team} — nome não encontrado na API`, 'warn');
    }
  }

  // Movimentação de odds (histórico 7 dias)
  const movementMap = {};
  for (const m of matches) {
    const key = `${m.home_team}|${m.away_team}`;
    const mv = await getOddsMovement(today, key);
    if (mv) movementMap[key] = mv;
  }

  // Clima do estádio mandante
  const weatherMap = {};
  await Promise.all(matches.map(async m => {
    const w = await getWeather(m.home_team);
    if (w) weatherMap[`${m.home_team}|${m.away_team}`] = w;
  }));

  const researched = Object.keys(researchMap).length;
  log(`🔎 ${researched}/${matches.length} jogos com dados reais — analisando...`, 'info');

  const allPredictions = await analyzeTodaysMatches(matches, researchMap, movementMap, weatherMap);
  const predictions = allPredictions.filter(p => p.prediction !== 'SKIP');

  // Relatório completo sempre enviado (aprovados + descartados com checklist)
  await sendDebugReport(allPredictions);

  if (predictions.length === 0) {
    log('IA não encontrou jogos com confiança suficiente', 'warn');
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

// ─── Crons ───────────────────────────────────────────────────────────────────

cron.schedule('0 6 * * *',  () => runDailyAnalysis());           // Análise principal
cron.schedule('0 14 * * *', () => takeOddsSnapshot('afternoon')); // Snapshot tarde
cron.schedule('0 18 * * *', () => takeOddsSnapshot('evening'));   // Snapshot noite
cron.schedule('0 23 * * *', async () => {                         // Verifica resultados
  try {
    const count = await checkDailyResults();
    if (count > 0) log(`✅ ${count} resultado(s) verificado(s) automaticamente`, 'success');
  } catch (err) { log(`Erro ao verificar resultados: ${err.message}`, 'error'); }
});
cron.schedule('0 22 * * 0', async () => {                         // Calibração semanal (domingo)
  try {
    log('🧠 Iniciando calibração semanal...', 'info');
    const calibration = await runWeeklyCalibration();
    if (calibration) {
      await sendCalibrationReport(calibration);
      log(`🧠 Calibração concluída — win rate ${(calibration.overall_win_rate * 100).toFixed(1)}%`, 'success');
    } else {
      log('Calibração pulada — dados insuficientes (mínimo 10 apostas resolvidas)', 'warn');
    }
  } catch (err) { log(`Erro na calibração: ${err.message}`, 'error'); }
});

// ─── Endpoints ───────────────────────────────────────────────────────────────

app.get('/api/status', async (req, res) => {
  try {
    const predictions = await getTodaysPredictions();
    res.json({ botRunning, lastAnalysis, totalToday: predictions.length, log: botLog.slice(0, 30) });
  } catch (e) { res.status(500).json({ error: e.message }); }
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
    await runDailyAnalysis({ force: true });
    const predictions = await getTodaysPredictions();
    res.json({ success: true, predictions });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/predictions', async (req, res) => {
  try {
    const predictions = await getTodaysPredictions();
    res.json(predictions);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/predictions/:id/result', async (req, res) => {
  const { result } = req.body;
  if (!['WIN', 'LOSS'].includes(result)) return res.status(400).json({ error: 'result deve ser WIN ou LOSS' });
  try {
    await updatePredictionResult(parseInt(req.params.id), result);
    log(`Resultado: ID ${req.params.id} → ${result}`, result === 'WIN' ? 'success' : 'error');
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/history', async (req, res) => {
  try {
    const history = await getPredictionHistory(100);
    const wins = history.filter(h => h.result === 'WIN').length;
    const losses = history.filter(h => h.result === 'LOSS').length;
    const total = wins + losses;
    res.json({
      history,
      stats: { total, wins, losses, winRate: total > 0 ? parseFloat(((wins / total) * 100).toFixed(1)) : 0 },
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
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
    await sendMessage(`🚀 *BetBot AI iniciado!*\nBot ${botRunning ? '✅ LIGADO' : '⏸ PAUSADO'}\nAnálise diária às 06:00.\n\nComandos disponíveis:\n/ligar — liga o bot\n/desligar — desliga o bot\n/analisar — força análise agora\n/status — situação atual`);
  } catch (err) {
    log(`Erro ao iniciar: ${err.message}`, 'error');
  }

  startPolling(async (cmd) => {
    try {
      if (cmd === '/ligar') {
        botRunning = true;
        const sim = await getSimState();
        sim.botRunning = true;
        await setSimState(sim);
        log('Bot LIGADO via Telegram', 'success');
        await sendMessage('✅ Bot *LIGADO*.');

      } else if (cmd === '/desligar') {
        botRunning = false;
        const sim = await getSimState();
        sim.botRunning = false;
        await setSimState(sim);
        log('Bot DESLIGADO via Telegram', 'warn');
        await sendMessage('⛔ Bot *DESLIGADO*.');

      } else if (cmd === '/analisar') {
        await sendMessage('🔍 Análise manual iniciada... pode levar alguns minutos, aguarde os cards.');
        runDailyAnalysis({ force: true }).catch(async err => {
          await sendMessage(`❌ Erro na análise: ${err.message}`);
        });

      } else if (cmd === '/status') {
        const predictions = await getTodaysPredictions();
        const state = botRunning ? '✅ LIGADO' : '⛔ DESLIGADO';
        const last = lastAnalysis
          ? new Date(lastAnalysis).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
          : 'Nunca';
        await sendMessage(
          `🤖 *BetBot AI — Status*\n\nBot: ${state}\nÚltima análise: ${last}\nPrevisões hoje: ${predictions.length}`
        );
      }
    } catch (err) {
      log(`Erro no comando Telegram: ${err.message}`, 'error');
    }
  });
});
