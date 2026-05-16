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

function buildPredictionCard(p) {
  const PRED_LABEL = { HOME: p.home_team, DRAW: 'Empate', AWAY: p.away_team };
  const selectionName = PRED_LABEL[p.prediction] || p.prediction;

  const time = p.commence_time
    ? new Date(p.commence_time).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })
    : '--:--';

  const sport = p.sport_title || 'Futebol';
  const divider = '━━━━━━━━━━━━━━━━━━━';

  // build odds table
  const allOdds = p.all_odds || {};
  const predKey = p.prediction === 'HOME' ? 'home' : p.prediction === 'DRAW' ? 'draw' : 'away';
  const oddsEntries = Object.entries(allOdds)
    .map(([house, o]) => ({ house, odd: o[predKey] }))
    .filter(e => e.odd != null)
    .sort((a, b) => b.odd - a.odd)
    .slice(0, 5);

  let oddsLines = '';
  if (oddsEntries.length > 0) {
    const best = oddsEntries[0];
    const avg = (oddsEntries.reduce((s, e) => s + e.odd, 0) / oddsEntries.length).toFixed(2);
    const maxLen = Math.max(...oddsEntries.map(e => e.house.length));

    oddsLines = oddsEntries.map(e => {
      const padded = e.house.padEnd(maxLen + 2);
      const star = e.house === best.house ? ' ⭐ MELHOR' : '';
      return `${padded}${e.odd.toFixed(2)}${star}`;
    }).join('\n');

    oddsLines += `\n${'Média:'.padEnd(maxLen + 2)}${avg}`;
  } else {
    oddsLines = 'Odds não disponíveis';
  }

  const fireFlag = p.confidence >= 70 ? ' · 🔥 BOA ENTRADA' : '';

  return (
    `⚽ *${p.match}*\n` +
    `🏆 ${sport} · ${time}\n` +
    `🎯 BACK em: *${selectionName}*\n` +
    `💡 _${p.reasoning}_\n` +
    `\`${divider}\`\n` +
    `\`${oddsLines}\`\n` +
    `\`${divider}\`\n` +
    `Probabilidade: ${p.confidence}%${fireFlag}`
  );
}

async function sendDailyReport(predictions) {
  if (!predictions || predictions.length === 0) {
    await sendMessage('📋 *Análise do dia — BetBot AI*\n\nNenhum jogo encontrado para hoje.');
    return;
  }

  const date = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  await sendMessage(`📋 *${date} — ${predictions.length} análises de hoje*`);

  for (const p of predictions) {
    await sendMessage(buildPredictionCard(p));
    // small delay to avoid Telegram rate limit
    await new Promise(r => setTimeout(r, 300));
  }
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
