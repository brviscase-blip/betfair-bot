require('dotenv').config();
const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function analyzeMatch(marketData, odds, history = []) {
  const runners = odds?.runners?.map(r => ({
    name: r.runnerName || 'Runner',
    back: r.ex?.availableToBack?.[0]?.price || 0,
    lay: r.ex?.availableToLay?.[0]?.price || 0,
  })) || [];

  const prompt = `Você é um trader esportivo especialista na Betfair Exchange.

JOGO: ${marketData.event?.name || 'Futebol'}
RUNNERS E ODDS:
${runners.map((r, i) => `${i+1}. ${r.name}: Back ${r.back} | Lay ${r.lay}`).join('\n')}

HISTÓRICO RECENTE:
${history.length > 0 ? history.slice(-5).map(h => `- ${h.match}: ${h.result} (PnL: ${h.pnl})`).join('\n') : 'Sem histórico ainda'}

REGRAS:
- Odd mínima para entrar: 2.10
- Comissão Betfair: 5%
- Só entrar se confiança >= 70%
- Stake: 2-5% da banca

Analise e responda APENAS JSON válido:
{
  "shouldBet": true/false,
  "confidence": 0-100,
  "selection": "nome do runner",
  "betType": "BACK ou LAY",
  "targetOdd": número,
  "exitOdd": número,
  "stakePercent": 2-5,
  "reasoning": "motivo em 1 linha",
  "riskLevel": "LOW/MEDIUM/HIGH"
}`;

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 500,
    messages: [{ role: 'user', content: prompt }],
  });

  try {
    const text = response.content[0].text;
    const json = text.replace(/```json|```/g, '').trim();
    return JSON.parse(json);
  } catch {
    return { shouldBet: false, confidence: 0, reasoning: 'Erro ao parsear análise da IA' };
  }
}

module.exports = { analyzeMatch };
