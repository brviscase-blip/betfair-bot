require('dotenv').config();
const fs = require('fs');

const HISTORY_FILE = './history.json';

function loadHistory() {
  if (!fs.existsSync(HISTORY_FILE)) {
    fs.writeFileSync(HISTORY_FILE, JSON.stringify({ bets: [], patterns: [] }, null, 2));
  }
  return JSON.parse(fs.readFileSync(HISTORY_FILE));
}

function saveHistory(data) {
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(data, null, 2));
}

function recordBetResult(bet) {
  const history = loadHistory();
  history.bets.push({
    ...bet,
    recordedAt: new Date().toISOString(),
  });
  // Mantém apenas os últimos 100 registros
  if (history.bets.length > 100) history.bets = history.bets.slice(-100);
  saveHistory(history);
}

function getLearningContext() {
  const history = loadHistory();
  const bets = history.bets.slice(-20);
  if (bets.length === 0) return 'Sem histórico ainda.';

  const wins = bets.filter(b => b.result === 'WIN').length;
  const losses = bets.filter(b => b.result === 'LOSS').length;
  const totalPnL = bets.reduce((acc, b) => acc + (b.pnl || 0), 0);

  const winMarkets = bets.filter(b => b.result === 'WIN').map(b => b.market);
  const lossMarkets = bets.filter(b => b.result === 'LOSS').map(b => b.market);

  return `HISTÓRICO (últimas ${bets.length} apostas):
- Vitórias: ${wins} | Derrotas: ${losses} | P&L: R$${totalPnL.toFixed(2)}
- Mercados com mais vitórias: ${[...new Set(winMarkets)].slice(0, 3).join(', ') || 'N/A'}
- Mercados com mais perdas: ${[...new Set(lossMarkets)].slice(0, 3).join(', ') || 'N/A'}
- Odds médias vencedoras: ${bets.filter(b => b.result === 'WIN').reduce((a, b) => a + (b.odd || 0), 0) / (wins || 1).toFixed(2)}`;
}

module.exports = { recordBetResult, getLearningContext };
