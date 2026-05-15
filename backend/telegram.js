require('dotenv').config();
const axios = require('axios');

const TOKEN = process.env.TELEGRAM_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const BASE = `https://api.telegram.org/bot${TOKEN}`;

// Envia mensagem simples
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

// Envia alerta de oportunidade com botões Aprovar/Rejeitar
async function sendOpportunityAlert(opp) {
  if (!TOKEN || !CHAT_ID) return;

  const riskEmoji = { LOW: '🟢', MEDIUM: '🟡', HIGH: '🔴' }[opp.riskLevel] || '⚪';
  const betTypeEmoji = opp.betType === 'BACK' ? '📈' : '📉';

  const text = `
🤖 *NOVA OPORTUNIDADE — BetBot AI*

⚽ *${opp.match}*
🕐 ${new Date(opp.startTime).toLocaleString('pt-BR')}

${betTypeEmoji} *${opp.betType}* — ${opp.selection}
📊 Mercado: ${opp.market}
🎯 Odd entrada: *${opp.entryOdd}*
🚪 Cash out alvo: ${opp.cashOutTarget}

💰 Valor: R$ ${opp.stake}
✨ Lucro projetado: *R$ ${opp.projectedProfit}*
🎲 Confiança: ${opp.confidence}% ${riskEmoji}

📝 _${opp.reasoning}_

🏠 Forma casa: ${opp.research?.homeForm || 'N/A'}
✈️ Forma fora: ${opp.research?.awayForm || 'N/A'}
💡 ${opp.research?.keyInfo || ''}
  `.trim();

  try {
    await axios.post(`${BASE}/sendMessage`, {
      chat_id: CHAT_ID,
      text,
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [[
          { text: '✅ APROVAR', callback_data: `approve_${opp.id}` },
          { text: '❌ REJEITAR', callback_data: `reject_${opp.id}` },
        ]],
      },
    });
  } catch (e) {
    console.error('Telegram opportunity alert error:', e.message);
  }
}

// Envia alerta de cash out
async function sendCashOutAlert(bet, pnl) {
  const emoji = pnl >= 0 ? '💰' : '📉';
  await sendMessage(
    `${emoji} *Cash Out — ${bet.match}*\n${bet.selection} | R$ ${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}`
  );
}

// Envia resumo diário
async function sendDailySummary(sim) {
  const emoji = sim.dailyPnL >= 0 ? '🟢' : '🔴';
  await sendMessage(`
📊 *Resumo do Dia — BetBot AI*

${emoji} P&L hoje: R$ ${sim.dailyPnL >= 0 ? '+' : ''}${sim.dailyPnL.toFixed(2)}
💰 Banca atual: R$ ${sim.banca.toFixed(2)}
🎯 Meta mensal: ${sim.progressMensal}% concluído
  `.trim());
}

// Processa callback de botões do Telegram
async function processCallback(callbackQuery, pendingOpportunities, approveHandler, rejectHandler) {
  const data = callbackQuery.data;
  const messageId = callbackQuery.message.message_id;
  const callbackId = callbackQuery.id;

  // Responde o callback para remover o "loading" do botão
  await axios.post(`${BASE}/answerCallbackQuery`, { callback_query_id: callbackId });

  if (data.startsWith('approve_')) {
    const oppId = parseFloat(data.replace('approve_', ''));
    const result = await approveHandler(oppId);
    if (result.success) {
      await axios.post(`${BASE}/editMessageReplyMarkup`, {
        chat_id: CHAT_ID, message_id: messageId,
        reply_markup: { inline_keyboard: [] }
      });
      await sendMessage(`✅ *Aposta aprovada!*\nAguardando execução...`);
    } else {
      await sendMessage(`❌ Erro: ${result.error}`);
    }
  } else if (data.startsWith('reject_')) {
    const oppId = parseFloat(data.replace('reject_', ''));
    await rejectHandler(oppId);
    await axios.post(`${BASE}/editMessageReplyMarkup`, {
      chat_id: CHAT_ID, message_id: messageId,
      reply_markup: { inline_keyboard: [] }
    });
    await sendMessage(`❌ Oportunidade rejeitada.`);
  }
}

// Polling de updates do Telegram
let lastUpdateId = 0;
async function pollUpdates(handler) {
  if (!TOKEN || !CHAT_ID) return;
  try {
    const { data } = await axios.get(`${BASE}/getUpdates`, {
      params: { offset: lastUpdateId + 1, timeout: 10 }
    });
    for (const update of (data.result || [])) {
      lastUpdateId = update.update_id;
      if (update.callback_query) {
        await handler(update.callback_query);
      }
    }
  } catch (e) {
    // silencioso
  }
}

module.exports = { sendMessage, sendOpportunityAlert, sendCashOutAlert, sendDailySummary, processCallback, pollUpdates };
