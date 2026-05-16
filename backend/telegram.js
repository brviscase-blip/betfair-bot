require('dotenv').config();
const axios = require('axios');

const TOKEN = process.env.TELEGRAM_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const BASE = `https://api.telegram.org/bot${TOKEN}`;

async function sendMessage(text, parseMode = 'Markdown') {
  if (!TOKEN || !CHAT_ID) return;
  try {
    await axios.post(`${BASE}/sendMessage`, {
      chat_id: CHAT_ID,
      text,
      parse_mode: parseMode,
    });
  } catch (e) {
    console.error('Telegram error:', e.message);
  }
}

async function sendDailyReport(predictions) {
  if (!predictions || predictions.length === 0) {
    await sendMessage('📋 *Análise do dia — BetBot AI*\n\nNenhum jogo encontrado para hoje.');
    return;
  }

  const date = new Date().toLocaleDateString('pt-BR');
  const lines = predictions.map(p => {
    const predLabel = { HOME: `🏠 ${p.home_team}`, DRAW: '🤝 Empate', AWAY: `✈️ ${p.away_team}` }[p.prediction] || p.prediction;
    const bestInfo = p.best_house && p.best_odd ? ` | Melhor odd: *${p.best_odd}* (${p.best_house})` : '';
    return `⚽ *${p.match}*\n→ ${predLabel} (${p.confidence}% confiança)${bestInfo}\n_${p.reasoning}_`;
  });

  const text = `📋 *Análise do dia — ${date}*\n\n${lines.join('\n\n')}\n\n_Apostas manuais — registre o resultado no app._`;
  await sendMessage(text);
}

async function sendMessage2(text) {
  await sendMessage(text);
}

let lastUpdateId = 0;
async function pollUpdates(handler) {
  if (!TOKEN || !CHAT_ID) return;
  try {
    const { data } = await axios.get(`${BASE}/getUpdates`, {
      params: { offset: lastUpdateId + 1, timeout: 10 },
    });
    for (const update of (data.result || [])) {
      lastUpdateId = update.update_id;
      if (update.callback_query) await handler(update.callback_query);
    }
  } catch {
    // silencioso
  }
}

module.exports = { sendMessage, sendDailyReport, pollUpdates };
