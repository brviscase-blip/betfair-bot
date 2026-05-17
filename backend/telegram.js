require('dotenv').config();
const axios = require('axios');

const TOKEN = process.env.TELEGRAM_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const BASE = `https://api.telegram.org/bot${TOKEN}`;

async function sendMessage(text, parseMode = 'Markdown') {
  if (!TOKEN || !CHAT_ID) return;
  try {
    const payload = { chat_id: CHAT_ID, text };
    if (parseMode) payload.parse_mode = parseMode;
    await axios.post(`${BASE}/sendMessage`, payload);
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
    `🎯 Apostar em: *${selectionName}*\n` +
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
      const text = update.message?.text || update.callback_query?.data;
      if (text) await handler(text.trim().toLowerCase());
    }
  } catch {
    // silencioso
  }
}

async function drainPendingUpdates() {
  // Descarta todas as mensagens acumuladas antes do bot iniciar
  try {
    const { data } = await axios.get(`${BASE}/getUpdates`, {
      params: { offset: -1, timeout: 0 },
    });
    if (data.result?.length > 0) {
      lastUpdateId = data.result[data.result.length - 1].update_id;
    }
  } catch {
    // silencioso
  }
}

function startPolling(handler) {
  const loop = async () => {
    await pollUpdates(handler);
    setTimeout(loop, 1000);
  };
  drainPendingUpdates().then(loop);
}

async function sendDebugReport(allPredictions) {
  if (!allPredictions || allPredictions.length === 0) return;

  const approved = allPredictions.filter(p => p.prediction !== 'SKIP');
  const skipped  = allPredictions.filter(p => p.prediction === 'SKIP');
  const date = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  const ICON = { true: '✅', false: '❌', null: '⚪' };
  const PRED = { HOME: 'MANDANTE', DRAW: 'EMPATE', AWAY: 'VISITANTE' };

  // Cabeçalho em texto puro para evitar erros de escape MarkdownV2
  await sendMessage(
    `📋 Análise completa — ${date}\n` +
    `${allPredictions.length} jogos | ✅ ${approved.length} aprovados (conf. >=65%) | ⏭ ${skipped.length} descartados`,
    null
  );

  // Um card por jogo — sem Markdown complexo para evitar erros de formatação
  for (const p of allPredictions) {
    const isSkip = p.prediction === 'SKIP';
    const pred   = isSkip ? 'SKIP' : (PRED[p.prediction] || p.prediction);
    const icon   = isSkip ? '⏭' : '🎯';

    let card = `${icon} ${p.match} — ${p.confidence}% — ${pred}\n`;
    card += `${p.reasoning}\n`;

    if (p.checklist?.length) {
      card += p.checklist.map(item => {
        const key = item.v === true ? 'true' : item.v === false ? 'false' : 'null';
        return `${ICON[key]} ${item.c}: ${item.n}`;
      }).join('\n');
    }

    await sendMessage(card, null); // null = sem parse_mode, texto puro
    await new Promise(r => setTimeout(r, 300));
  }
}

async function sendCalibrationReport(calibration) {
  if (!calibration) return;
  const { notes, overall_win_rate, sample_size, period_days } = calibration;
  const winPct = (overall_win_rate * 100).toFixed(1);
  const noteLines = notes.map(n => `• ${n}`).join('\n');
  const text =
    `🧠 *Calibração Semanal — BetBot AI*\n\n` +
    `📊 *Desempenho (últimos ${period_days} dias):*\n` +
    `✅ Win rate: *${winPct}%* em ${sample_size} apostas\n\n` +
    `📝 *Ajustes identificados pelo Sonnet:*\n${noteLines}\n\n` +
    `_Esses aprendizados já estão sendo aplicados na próxima análise._`;
  await sendMessage(text);
}

module.exports = { sendMessage, sendDailyReport, sendDebugReport, sendCalibrationReport, startPolling };
