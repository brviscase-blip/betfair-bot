require('dotenv').config();
const fs = require('fs');

const BANKROLL_FILE = './bankroll.json';

function loadBankroll() {
  if (!fs.existsSync(BANKROLL_FILE)) {
    const initial = {
      initial: 100,
      current: 100,
      dailyStartBalance: 100,
      stopLossPercent: 3,
      stopGainPercent: 5,
      monthlyGoalPercent: 10,
      totalPnL: 0,
      dailyPnL: 0,
      lastReset: new Date().toDateString(),
      bets: [],
    };
    fs.writeFileSync(BANKROLL_FILE, JSON.stringify(initial, null, 2));
    return initial;
  }
  return JSON.parse(fs.readFileSync(BANKROLL_FILE));
}

function saveBankroll(data) {
  fs.writeFileSync(BANKROLL_FILE, JSON.stringify(data, null, 2));
}

function resetDailyIfNeeded(bankroll) {
  const today = new Date().toDateString();
  if (bankroll.lastReset !== today) {
    bankroll.dailyStartBalance = bankroll.current;
    bankroll.dailyPnL = 0;
    bankroll.lastReset = today;
    saveBankroll(bankroll);
  }
  return bankroll;
}

function canBet(bankroll) {
  bankroll = resetDailyIfNeeded(bankroll);
  const dailyLoss = ((bankroll.dailyStartBalance - bankroll.current) / bankroll.dailyStartBalance) * 100;
  const dailyGain = ((bankroll.current - bankroll.dailyStartBalance) / bankroll.dailyStartBalance) * 100;

  if (dailyLoss >= bankroll.stopLossPercent) {
    return { allowed: false, reason: `Stop Loss diário atingido (-${bankroll.stopLossPercent}%)` };
  }
  if (dailyGain >= bankroll.stopGainPercent) {
    return { allowed: false, reason: `Stop Gain diário atingido (+${bankroll.stopGainPercent}%)` };
  }
  return { allowed: true };
}

function getStakeAmount(bankroll, percent) {
  const stake = (bankroll.current * percent) / 100;
  return Math.max(2, Math.round(stake * 100) / 100); // mínimo R$2
}

function recordBet(marketId, match, selection, betType, stake, odd, status = 'OPEN') {
  const bankroll = loadBankroll();
  bankroll.bets.push({
    id: Date.now(),
    marketId,
    match,
    selection,
    betType,
    stake,
    odd,
    status,
    pnl: 0,
    timestamp: new Date().toISOString(),
  });
  saveBankroll(bankroll);
}

function closeBet(betId, pnl) {
  const bankroll = loadBankroll();
  const bet = bankroll.bets.find(b => b.id === betId);
  if (bet) {
    bet.status = pnl >= 0 ? 'WIN' : 'LOSS';
    bet.pnl = pnl;
    bankroll.current += pnl;
    bankroll.dailyPnL += pnl;
    bankroll.totalPnL += pnl;
    saveBankroll(bankroll);
  }
  return bankroll;
}

function getStatus() {
  const bankroll = resetDailyIfNeeded(loadBankroll());
  return {
    current: bankroll.current,
    dailyPnL: bankroll.dailyPnL,
    totalPnL: bankroll.totalPnL,
    monthlyGoal: (bankroll.initial * bankroll.monthlyGoalPercent) / 100,
    canBet: canBet(bankroll),
    openBets: bankroll.bets.filter(b => b.status === 'OPEN'),
    recentBets: bankroll.bets.slice(-10),
  };
}

module.exports = { loadBankroll, canBet, getStakeAmount, recordBet, closeBet, getStatus };
