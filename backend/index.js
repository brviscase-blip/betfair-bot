require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
const { login, getToken } = require('./auth');
const { getFootballMarkets, getMarketOdds } = require('./markets');
const { analyzeMatch } = require('./analyzer');
const { researchMatch } = require('./researcher');
const { getLearningContext } = require('./learner');
const { canBet, placeBet, updateOdd, closeBet, getSimulationStatus, loadSimulation } = require('./trader');

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

// ─── ROTAS ──────────────────────────────────────────────────────

app.get('/api/status', (req, res) => {
  res.json({
    botRunning,
    lastScan,
    simulation: getSimulationStatus(),
    pendingOpportunities,
    log: botLog.slice(0, 30),
  });
});

app.post('/api/bot/toggle', (req, res) => {
  botRunning = !botRunning;
  log(`Bot ${botRunning ? 'LIGADO' : 'DESLIGADO'}`, botRunning ? 'success' : 'warn');
  if (botRunning) scanMarkets();
  res.json({ botRunning });
});

app.post('/api/scan', async (req, res) => {
  try {
    await scanMarkets();
    res.json({ success: true, opportunities: pendingOpportunities });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Aprovar oportunidade → simula a aposta
app.post('/api/bet/approve/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const opp = pendingOpportunities.find(o => o.id === id);
  if (!opp) return res.status(404).json({ error: 'Oportunidade não encontrada' });

  const sim = loadSimulation();
  const check = canBet(sim);
  if (!check.allowed) return res.status(400).json({ error: check.reason });

  const bet = placeBet(opp);
  pendingOpportunities = pendingOpportunities.filter(o => o.id !== id);
  log(`✅ Aposta simulada: ${opp.match} | ${opp.selection} @ ${opp.entryOdd} | R$${opp.stake}`, 'success');
  res.json({ success: true, bet });
});

app.delete('/api/bet/reject/:id', (req, res) => {
  pendingOpportunities = pendingOpportunities.filter(o => o.id !== parseInt(req.params.id));
  res.json({ success: true });
});

// Fechar aposta manualmente
app.post('/api/bet/close/:id', (req, res) => {
  const { result, closeOdd } = req.body;
  const bet = closeBet(parseInt(req.params.id), result, closeOdd);
  if (!bet) return res.status(404).json({ error: 'Aposta não encontrada' });
  log(`Aposta encerrada: ${bet.match} | ${result} | R$${bet.pnl}`, bet.pnl >= 0 ? 'success' : 'error');
  res.json({ success: true, bet });
});

app.get('/api/config', (req, res) => {
  const sim = loadSimulation();
  res.json({
    stopLoss: sim.stopLoss,
    stopGain: sim.stopGain,
    metaMensal: sim.metaMensal,
    banca: sim.banca,
  });
});

app.post('/api/config', (req, res) => {
  const fs = require('fs');
  const sim = loadSimulation();
  if (req.body.stopLoss !== undefined) sim.stopLoss = req.body.stopLoss;
  if (req.body.stopGain !== undefined) sim.stopGain = req.body.stopGain;
  if (req.body.metaMensal !== undefined) sim.metaMensal = req.body.metaMensal;
  fs.writeFileSync('./simulation.json', JSON.stringify(sim, null, 2));
  res.json({ success: true });
});

// ─── LÓGICA DO BOT ──────────────────────────────────────────────

async function scanMarkets() {
  log('🔍 Iniciando scan de mercados...');
  lastScan = new Date().toISOString();

  const sim = loadSimulation();
  const check = canBet(sim);
  if (!check.allowed) {
    log(`⛔ ${check.reason}`, 'warn');
    return;
  }

  const markets = await getFootballMarkets();
  log(`📋 ${markets.length} mercados encontrados`);

  const learningContext = getLearningContext();

  for (const market of markets.slice(0, 5)) {
    try {
      const odds = await getMarketOdds(market.marketId);
      if (!odds || !odds.runners?.length) continue;

      // Pesquisa sobre os times
      const teams = market.event.name.split(' v ');
      const research = teams.length === 2
        ? await researchMatch(teams[0].trim(), teams[1].trim())
        : {};

      const analysis = await analyzeMatch(market, odds, research, learningContext);
      log(`🤖 ${market.event.name}: ${analysis.shouldBet ? `✅ ${analysis.market} @ ${analysis.entryOdd}` : '❌ Sem oportunidade'} (${analysis.confidence}%)`);

      if (analysis.shouldBet && analysis.confidence >= 65 && analysis.entryOdd >= 2.0) {
        const opp = {
          id: Date.now() + Math.random(),
          marketId: market.marketId,
          match: market.event.name,
          startTime: market.marketStartTime,
          market: analysis.market,
          selection: analysis.selection,
          betType: analysis.betType,
          entryOdd: analysis.entryOdd,
          exitOdd: analysis.exitOdd,
          cashOutTarget: analysis.cashOutTarget,
          stake: analysis.stake,
          projectedProfit: analysis.projectedProfit,
          confidence: analysis.confidence,
          reasoning: analysis.reasoning,
          riskLevel: analysis.riskLevel,
          research: {
            homeForm: research.homeForm,
            awayForm: research.awayForm,
            keyInfo: research.keyInfo,
          },
          timestamp: new Date().toISOString(),
        };
        pendingOpportunities.push(opp);
        log(`💡 Oportunidade: ${opp.match} | ${opp.selection} @ ${opp.entryOdd} | Lucro projetado: R$${opp.projectedProfit}`, 'success');
      }
    } catch (err) {
      log(`Erro ao analisar ${market.event.name}: ${err.message}`, 'error');
    }
  }

  // Remove oportunidades antigas (>3h)
  const threeHoursAgo = Date.now() - 3 * 60 * 60 * 1000;
  pendingOpportunities = pendingOpportunities.filter(o => new Date(o.timestamp).getTime() > threeHoursAgo);
}

// Monitoramento de apostas ativas a cada 2 minutos
cron.schedule('*/2 * * * *', async () => {
  const sim = loadSimulation();
  for (const bet of sim.activeBets) {
    try {
      const odds = await getMarketOdds(bet.marketId);
      if (!odds) continue;
      const runner = odds.runners?.find(r => r.runnerName === bet.selection);
      if (!runner) continue;
      const currentOdd = runner.ex?.availableToBack?.[0]?.price;
      if (currentOdd) {
        const result = updateOdd(bet.id, currentOdd);
        if (result?.status === 'CASHOUT') {
          log(`💰 Cash out automático: ${bet.match} | R$${result.pnl}`, 'success');
        }
      }
    } catch (err) {
      log(`Erro ao monitorar aposta ${bet.id}: ${err.message}`, 'error');
    }
  }
});

// Scan automático a cada 30 minutos
cron.schedule('*/30 * * * *', async () => {
  if (botRunning) await scanMarkets();
});

// ─── START ───────────────────────────────────────────────────────

const PORT = process.env.PORT || 3001;
app.listen(PORT, async () => {
  console.log(`\n🚀 BetBot AI rodando na porta ${PORT} [MODO SIMULAÇÃO]`);
  try {
    await login();
    log('Sistema iniciado com sucesso — Modo Simulação ativo', 'success');
  } catch (err) {
    log(`Erro ao iniciar: ${err.message}`, 'error');
  }
});
