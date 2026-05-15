require('dotenv').config();
const fs = require('fs');
const { recordBetResult } = require('./learner');

const SIMULATION_FILE = './simulation.json';

function loadSimulation() {
  if (!fs.existsSync(SIMULATION_FILE)) {
    const initial = {
      banca: 100,
      bancaInicial: 100,
      dailyPnL: 0,
      totalPnL: 0,
      stopLoss: -3,
      stopGain: 1.5,
      metaMensal: 10,
      lastReset: new Date().toDateString(),
      activeBets: [],
      closedBets: [],
    };
    fs.writeFileSync(SIMULATION_FILE, JSON.stringify(initial, null, 2));
    return initial;
  }
  return JSON.parse(fs.readFileSync(SIMULATION_FILE));
}

function saveSimulation(data) {
  fs.writeFileSync(SIMULATION_FILE, JSON.stringify(data, null, 2));
}

function resetDailyIfNeeded(sim) {
  const today = new Date().toDateString();
  if (sim.lastReset !== today) {
    sim.dailyPnL = 0;
    sim.lastReset = today;
    saveSimulation(sim);
  }
  return sim;
}

function canBet(sim) {
  sim = resetDailyIfNeeded(sim);
  if (sim.dailyPnL <= sim.stopLoss) return { allowed: false, reason: `Stop Loss atingido (R$${sim.stopLoss})` };
  if (sim.dailyPnL >= sim.stopGain) return { allowed: false, reason: `Stop Gain atingido! Objetivo do dia batido 🎉` };
  return { allowed: true };
}

function placeBet(opportunity) {
  const sim = loadSimulation();
  const bet = {
    id: Date.now(),
    match: opportunity.match,
    market: opportunity.market,
    selection: opportunity.selection,
    betType: opportunity.betType,
    stake: opportunity.stake,
    entryOdd: opportunity.entryOdd,
    exitOdd: opportunity.exitOdd,
    cashOutTarget: opportunity.cashOutTarget,
    projectedProfit: opportunity.projectedProfit,
    status: 'OPEN',
    placedAt: new Date().toISOString(),
    currentOdd: opportunity.entryOdd,
  };
  sim.activeBets.push(bet);
  sim.banca -= opportunity.stake;
  saveSimulation(sim);
  return bet;
}

function updateOdd(betId, currentOdd) {
  const sim = loadSimulation();
  const bet = sim.activeBets.find(b => b.id === betId);
  if (!bet) return null;

  bet.currentOdd = currentOdd;

  // Verifica se atingiu o alvo de cash out
  const shouldCashOut = bet.betType === 'BACK'
    ? currentOdd <= bet.cashOutTarget
    : currentOdd >= bet.cashOutTarget;

  if (shouldCashOut) {
    return closeBet(betId, 'CASHOUT', currentOdd);
  }

  saveSimulation(sim);
  return { status: 'MONITORING', currentOdd };
}

function closeBet(betId, result, closeOdd = null) {
  const sim = loadSimulation();
  const betIndex = sim.activeBets.findIndex(b => b.id === betId);
  if (betIndex === -1) return null;

  const bet = sim.activeBets[betIndex];
  let pnl = 0;

  if (result === 'WIN' || result === 'CASHOUT') {
    if (bet.betType === 'BACK') {
      const grossProfit = bet.stake * ((closeOdd || bet.exitOdd) - 1);
      pnl = grossProfit * 0.95; // 5% comissão
    } else {
      pnl = bet.stake * 0.95;
    }
  } else if (result === 'LOSS') {
    pnl = -bet.stake;
  }

  bet.status = result;
  bet.pnl = parseFloat(pnl.toFixed(2));
  bet.closedAt = new Date().toISOString();
  bet.closeOdd = closeOdd;

  sim.banca += bet.stake + pnl;
  sim.dailyPnL += pnl;
  sim.totalPnL += pnl;
  sim.closedBets.push(bet);
  sim.activeBets.splice(betIndex, 1);

  saveSimulation(sim);

  // Registra para aprendizado
  recordBetResult({
    match: bet.match,
    market: bet.market,
    selection: bet.selection,
    betType: bet.betType,
    odd: closeOdd || bet.exitOdd,
    stake: bet.stake,
    pnl: bet.pnl,
    result,
  });

  return bet;
}

function getSimulationStatus() {
  const sim = resetDailyIfNeeded(loadSimulation());
  const progressMensal = ((sim.totalPnL / sim.metaMensal) * 100).toFixed(1);
  return {
    banca: parseFloat(sim.banca.toFixed(2)),
    dailyPnL: parseFloat(sim.dailyPnL.toFixed(2)),
    totalPnL: parseFloat(sim.totalPnL.toFixed(2)),
    metaMensal: sim.metaMensal,
    progressMensal: parseFloat(progressMensal),
    stopLoss: sim.stopLoss,
    stopGain: sim.stopGain,
    canBet: canBet(sim),
    activeBets: sim.activeBets,
    recentBets: sim.closedBets.slice(-10),
  };
}

module.exports = { loadSimulation, canBet, placeBet, updateOdd, closeBet, getSimulationStatus };
