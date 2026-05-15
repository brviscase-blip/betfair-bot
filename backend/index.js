require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
const { login } = require('./auth');
const { getFootballMarkets, getMarketOdds } = require('./markets');
const { analyzeMatch } = require('./analyzer');
const { researchMatch } = require('./researcher');
const { getLearningContext } = require('./learner');
const { sendMessage, sendOpportunityAlert, sendCashOutAlert, sendDailySummary, processCallback, pollUpdates } = require('./telegram');
const {
  initDB, getSimState, setSimState,
  getActiveBets, insertBet, updateBet,
  getRecentBets, insertHistory, getHistory
} = require('./db');

const app = express();
app.use(cors());
app.use(express.json());

let botRunning = false;
let lastScan = null;
let pendingOpportunities = [];
const analyzedMarkets = new Map();
let botLog = [];

function log(msg, type = 'info') {
  const entry = { timestamp: new Date().toISOString(), msg, type };
  botLog.unshift(entry);
  if (botLog.length > 100) botLog.pop();
  console.log(`[${type.toUpperCase()}] ${msg}`);
}

async function canBet(sim) {
  const today = new Date().toDateString();
  if (sim.lastReset !== today) {
    sim.dailyPnL = 0;
    sim.lastReset = today;
    await setSimState(sim);
    await sendDailySummary({ ...sim, progressMensal: ((sim.totalPnL / sim.metaMensal) * 100).toFixed(1) });
  }
  if (sim.dailyPnL <= sim.stopLoss) return { allowed: false, reason: `Stop Loss atingido (R$${sim.stopLoss})` };
  if (sim.dailyPnL >= sim.stopGain) return { allowed: false, reason: `Stop Gain atingido! 🎉 R$${sim.stopGain}` };
  return { allowed: true };
}

async function getStatus() {
  const sim = await getSimState();
  const activeBets = await getActiveBets();
  const recentBets = await getRecentBets(10);
  const check = await canBet(sim);
  const progressMensal = parseFloat(((sim.totalPnL / sim.metaMensal) * 100).toFixed(1));
  return {
    banca: parseFloat(sim.banca.toFixed(2)),
    dailyPnL: parseFloat(sim.dailyPnL.toFixed(2)),
    totalPnL: parseFloat(sim.totalPnL.toFixed(2)),
    metaMensal: sim.metaMensal,
    progressMensal,
    stopLoss: sim.stopLoss,
    stopGain: sim.stopGain,
    canBet: check,
    activeBets,
    recentBets,
  };
}

app.get('/api/status', async (req, res) => {
  try {
    res.json({
      botRunning, lastScan,
      simulation: await getStatus(),
      pendingOpportunities,
      log: botLog.slice(0, 30),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/bot/toggle', async (req, res) => {
  botRunning = !botRunning;
  const sim2 = await getSimState();
  sim2.botRunning = botRunning;
  await setSimState(sim2);
  log(`Bot ${botRunning ? 'LIGADO' : 'DESLIGADO'}`, botRunning ? 'success' : 'warn');
  await sendMessage(`🤖 Bot ${botRunning ? '✅ LIGADO' : '⛔ DESLIGADO'}`);
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

async function approveOpportunity(oppId) {
  const opp = pendingOpportunities.find(o => o.id === oppId);
  if (!opp) return { success: false, error: 'Oportunidade não encontrada' };
  const sim = await getSimState();
  const check = await canBet(sim);
  if (!check.allowed) return { success: false, error: check.reason };
  await insertBet(opp);
  sim.banca -= opp.stake;
  await setSimState(sim);
  pendingOpportunities = pendingOpportunities.filter(o => o.id !== oppId);
  log(`✅ Aposta simulada: ${opp.match} | ${opp.selection} @ ${opp.entryOdd} | R$${opp.stake}`, 'success');
  return { success: true };
}

app.post('/api/bet/approve/:id', async (req, res) => {
  const result = await approveOpportunity(parseFloat(req.params.id));
  if (!result.success) return res.status(400).json({ error: result.error });
  res.json({ success: true });
});

app.delete('/api/bet/reject/:id', (req, res) => {
  pendingOpportunities = pendingOpportunities.filter(o => o.id !== parseFloat(req.params.id));
  res.json({ success: true });
});

app.post('/api/bet/close/:id', async (req, res) => {
  const { result, closeOdd } = req.body;
  const betId = parseInt(req.params.id);
  const activeBets = await getActiveBets();
  const bet = activeBets.find(b => b.id === betId);
  if (!bet) return res.status(404).json({ error: 'Aposta não encontrada' });
  let pnl = 0;
  if (result === 'WIN' || result === 'CASHOUT') {
    const gross = bet.stake * ((closeOdd || bet.exit_odd) - 1);
    pnl = parseFloat((gross * 0.95).toFixed(2));
  } else {
    pnl = -bet.stake;
  }
  await updateBet(betId, { status: result, pnl, closed_at: new Date().toISOString(), close_odd: closeOdd });
  const sim = await getSimState();
  sim.banca += bet.stake + pnl;
  sim.dailyPnL += pnl;
  sim.totalPnL += pnl;
  await setSimState(sim);
  await insertHistory({ match: bet.match, market: bet.market, selection: bet.selection, betType: bet.bet_type, odd: closeOdd || bet.exit_odd, stake: bet.stake, pnl, result });
  await sendCashOutAlert(bet, pnl);
  log(`Aposta encerrada: ${bet.match} | ${result} | R$${pnl}`, pnl >= 0 ? 'success' : 'error');
  res.json({ success: true, pnl });
});

app.get('/api/config', async (req, res) => {
  const sim = await getSimState();
  res.json({ stopLoss: sim.stopLoss, stopGain: sim.stopGain, metaMensal: sim.metaMensal, banca: sim.banca });
});

app.post('/api/config', async (req, res) => {
  const sim = await getSimState();
  if (req.body.stopLoss !== undefined) sim.stopLoss = req.body.stopLoss;
  if (req.body.stopGain !== undefined) sim.stopGain = req.body.stopGain;
  if (req.body.metaMensal !== undefined) sim.metaMensal = req.body.metaMensal;
  await setSimState(sim);
  res.json({ success: true });
});

async function scanMarkets() {
  log('🔍 Iniciando scan de mercados...');
  lastScan = new Date().toISOString();
  const sim = await getSimState();
  const check = await canBet(sim);
  if (!check.allowed) { log(`⛔ ${check.reason}`, 'warn'); return; }
  const markets = await getFootballMarkets();
  if (markets.length === 0) { log('Sem mercados disponíveis, pulando análise IA'); return; }
  log(`📋 ${markets.length} mercados encontrados`);
  const history = await getHistory(20);
  const learningContext = history.length > 0
    ? `Histórico: ${history.filter(h => h.result === 'WIN').length} vitórias, ${history.filter(h => h.result === 'LOSS').length} derrotas nas últimas ${history.length} apostas.`
    : 'Sem histórico ainda.';
  for (const market of markets.slice(0, 5)) {
    try {
      const lastAnalyzed = analyzedMarkets.get(market.marketId);
      if (lastAnalyzed && Date.now() - lastAnalyzed < 2 * 60 * 60 * 1000) {
        log(`⏭️ ${market.event.name}: já analisado, pulando`);
        continue;
      }
      analyzedMarkets.set(market.marketId, Date.now());
      const odds = await getMarketOdds(market.marketId);
      if (!odds?.runners?.length) continue;
      const teams = market.event.name.split(' v ');
      const research = teams.length === 2 ? await researchMatch(teams[0].trim(), teams[1].trim()) : {};
      const analysis = await analyzeMatch(market, odds, research, learningContext);
      log(`🤖 ${market.event.name}: ${analysis.shouldBet ? `✅ ${analysis.market} @ ${analysis.entryOdd}` : `❌ ${analysis.reasoning}`} (${analysis.confidence}%)`);
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
          research: { homeForm: research.homeForm, awayForm: research.awayForm, keyInfo: research.keyInfo },
          timestamp: new Date().toISOString(),
        };
        pendingOpportunities.push(opp);
        log(`💡 Oportunidade: ${opp.match} | ${opp.selection} @ ${opp.entryOdd} | R$${opp.projectedProfit}`, 'success');
        await sendOpportunityAlert(opp);
      }
    } catch (err) {
      log(`Erro ao analisar ${market.event.name}: ${err.message}`, 'error');
    }
  }
  const threeHoursAgo = Date.now() - 3 * 60 * 60 * 1000;
  pendingOpportunities = pendingOpportunities.filter(o => new Date(o.timestamp).getTime() > threeHoursAgo);
}

cron.schedule('*/2 * * * *', async () => {
  const activeBets = await getActiveBets();
  for (const bet of activeBets) {
    try {
      const odds = await getMarketOdds(bet.market_id);
      if (!odds) continue;
      const runner = odds.runners?.find(r => r.runnerName === bet.selection);
      if (!runner) continue;
      const currentOdd = runner.ex?.availableToBack?.[0]?.price;
      if (!currentOdd) continue;
      await updateBet(bet.id, { current_odd: currentOdd });
      const shouldCashOut = bet.bet_type === 'BACK' ? currentOdd <= bet.cash_out_target : currentOdd >= bet.cash_out_target;
      if (shouldCashOut) {
        const gross = bet.stake * (currentOdd - 1);
        const pnl = parseFloat((gross * 0.95).toFixed(2));
        await updateBet(bet.id, { status: 'CASHOUT', pnl, closed_at: new Date().toISOString(), close_odd: currentOdd });
        const sim = await getSimState();
        sim.banca += bet.stake + pnl;
        sim.dailyPnL += pnl;
        sim.totalPnL += pnl;
        await setSimState(sim);
        await insertHistory({ match: bet.match, market: bet.market, selection: bet.selection, betType: bet.bet_type, odd: currentOdd, stake: bet.stake, pnl, result: 'CASHOUT' });
        await sendCashOutAlert(bet, pnl);
        log(`💰 Cash out: ${bet.match} | R$${pnl}`, 'success');
      }
    } catch (err) {
      log(`Erro ao monitorar aposta: ${err.message}`, 'error');
    }
  }
});

cron.schedule('*/3 * * * * *', async () => {
  await pollUpdates(async (callbackQuery) => {
    await processCallback(callbackQuery, pendingOpportunities, approveOpportunity, (id) => {
      pendingOpportunities = pendingOpportunities.filter(o => o.id !== id);
    });
  });
});

cron.schedule('*/30 * * * *', async () => {
  if (botRunning) await scanMarkets();
});

cron.schedule('55 23 * * *', async () => {
  const sim = await getSimState();
  const progressMensal = ((sim.totalPnL / sim.metaMensal) * 100).toFixed(1);
  await sendDailySummary({ ...sim, progressMensal });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, async () => {
  console.log(`\n🚀 BetBot AI rodando na porta ${PORT} [MODO SIMULAÇÃO]`);
  try {
    await initDB();
    await login();
    const sim = await getSimState();
    botRunning = sim.botRunning || false;
    log(`Sistema iniciado — Bot ${botRunning ? 'LIGADO' : 'DESLIGADO'}`, 'success');
    await sendMessage(`🚀 *BetBot AI iniciado!*\nBot ${botRunning ? '✅ LIGADO' : '⏸ PAUSADO'}\nModo Simulação ativo.`);
  } catch (err) {
    log(`Erro ao iniciar: ${err.message}`, 'error');
  }
});
