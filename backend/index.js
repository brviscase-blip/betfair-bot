require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
const { login, getToken } = require('./auth');
const { getFootballMarkets, getMarketOdds } = require('./markets');
const { analyzeMatch } = require('./analyzer');
const { getStatus, canBet, loadBankroll, getStakeAmount, recordBet } = require('./bankroll');

const app = express();
app.use(cors());
app.use(express.json());

let botRunning = false;
let lastScan = null;
let pendingOpportunities = [];
let botLog = [];

function log(msg, type = 'info') {
  const entry = { timestamp: new Date().toISOString(), msg, type };
  botLog.unshift(entry);
  if (botLog.length > 100) botLog.pop();
  console.log(`[${type.toUpperCase()}] ${msg}`);
}

// ─── ROTAS DA API ───────────────────────────────────────────

// Status geral
app.get('/api/status', (req, res) => {
  res.json({
    botRunning,
    lastScan,
    bankroll: getStatus(),
    pendingOpportunities,
    log: botLog.slice(0, 20),
  });
});

// Liga/desliga o bot
app.post('/api/bot/toggle', (req, res) => {
  botRunning = !botRunning;
  log(`Bot ${botRunning ? 'LIGADO' : 'DESLIGADO'}`, botRunning ? 'success' : 'warn');
  res.json({ botRunning });
});

// Scan manual de mercados
app.post('/api/scan', async (req, res) => {
  try {
    await scanMarkets();
    res.json({ success: true, opportunities: pendingOpportunities });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Aprovar uma oportunidade manualmente
app.post('/api/bet/approve/:id', (req, res) => {
  const opp = pendingOpportunities.find(o => o.id === parseInt(req.params.id));
  if (!opp) return res.status(404).json({ error: 'Oportunidade não encontrada' });
  opp.approved = true;
  log(`✅ Oportunidade aprovada manualmente: ${opp.match}`, 'success');
  res.json({ success: true });
});

// Rejeitar uma oportunidade
app.delete('/api/bet/reject/:id', (req, res) => {
  pendingOpportunities = pendingOpportunities.filter(o => o.id !== parseInt(req.params.id));
  res.json({ success: true });
});

// Configurações da banca
app.get('/api/config', (req, res) => {
  const b = loadBankroll();
  res.json({
    stopLossPercent: b.stopLossPercent,
    stopGainPercent: b.stopGainPercent,
    monthlyGoalPercent: b.monthlyGoalPercent,
  });
});

// ─── LÓGICA DO BOT ──────────────────────────────────────────

async function scanMarkets() {
  log('🔍 Iniciando scan de mercados de futebol...');
  lastScan = new Date().toISOString();

  const bankroll = loadBankroll();
  const betCheck = canBet(bankroll);
  if (!betCheck.allowed) {
    log(`⛔ ${betCheck.reason}`, 'warn');
    return;
  }

  const markets = await getFootballMarkets();
  log(`📋 ${markets.length} mercados encontrados`);

  const history = bankroll.bets.slice(-20).map(b => ({
    match: b.match,
    result: b.status,
    pnl: b.pnl,
  }));

  for (const market of markets.slice(0, 5)) {
    try {
      const odds = await getMarketOdds(market.marketId);
      if (!odds) continue;

      const analysis = await analyzeMatch(market, odds, history);
      log(`🤖 ${market.event?.name}: confiança ${analysis.confidence}% | entrar: ${analysis.shouldBet}`);

      if (analysis.shouldBet && analysis.confidence >= 70) {
        const stake = getStakeAmount(bankroll, analysis.stakePercent || 2);
        const opp = {
          id: Date.now(),
          marketId: market.marketId,
          match: market.event?.name,
          startTime: market.marketStartTime,
          selection: analysis.selection,
          betType: analysis.betType,
          targetOdd: analysis.targetOdd,
          exitOdd: analysis.exitOdd,
          stake,
          confidence: analysis.confidence,
          reasoning: analysis.reasoning,
          riskLevel: analysis.riskLevel,
          approved: false,
          timestamp: new Date().toISOString(),
        };
        pendingOpportunities.push(opp);
        log(`💡 Oportunidade encontrada: ${opp.match} | ${opp.selection} @ ${opp.targetOdd}`, 'success');
      }
    } catch (err) {
      log(`Erro ao analisar ${market.event?.name}: ${err.message}`, 'error');
    }
  }

  // Remove oportunidades antigas (>2h)
  const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
  pendingOpportunities = pendingOpportunities.filter(o => new Date(o.timestamp).getTime() > twoHoursAgo);
}

// Scan automático a cada 30 minutos quando o bot está ligado
cron.schedule('*/30 * * * *', async () => {
  if (botRunning) await scanMarkets();
});

// ─── INICIALIZAÇÃO ───────────────────────────────────────────

const PORT = process.env.PORT || 3001;

app.listen(PORT, async () => {
  console.log(`\n🚀 Betfair Bot API rodando na porta ${PORT}`);
  try {
    await login();
    log('Sistema iniciado com sucesso', 'success');
  } catch (err) {
    log(`Erro ao iniciar: ${err.message}`, 'error');
  }
});
