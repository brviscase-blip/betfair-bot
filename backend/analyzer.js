require('dotenv').config();
const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function analyzeMatch(marketData, odds, history = []) {
  const prompt = `Você é um analista especialista em trading esportivo pré-jogo na Betfair.

MERCADO: ${marketData.event?.name || 'Jogo de futebol'}
DATA: ${marketData.marketStartTime}
RUNNERS (Seleções):
${odds.runners?.map(r => `- ${r.runnerName}: Back ${r.ex?.availableToBack?.[0]?.price || 'N/A'} | Lay ${r.ex?.availableToLay?.[0]?.price || 'N/A'}`).join('\n')}

HISTÓRICO RECENTE DO BOT:
${history.length > 0 ? history.slice(-5).map(h => `- ${h.match}: ${h.result} (PnL: ${h.pnl})`).join('\n') : 'Sem histórico ainda'}

REGRAS DO SISTEMA:
- Banca: R$100
- Meta mensal: 10%
- Comissão Betfair: 5% sobre lucro
- Odd mínima para entrar: 2.10 (cobre taxa + 100% de lucro)
- Valor mínimo de aposta da Betfair: R$2,00
- Só entrar se confiança >= 70%

Analise este mercado e responda APENAS em JSON válido:
{
  "shouldBet": true/false,
  "confidence": 0-100,
  "selection": "nome do runner escolhido",
  "betType": "BACK ou LAY",
  "targetOdd": número,
  "exitOdd": número (odd para saída com lucro),
  "stakePercent": 2-5 (% da banca a arriscar),
  "reasoning": "motivo em 2 linhas",
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
