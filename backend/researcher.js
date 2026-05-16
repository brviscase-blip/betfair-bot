require('dotenv').config();
const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function researchMatch(homeTeam, awayTeam) {
  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1200,
      tools: [{ type: 'web_search_20250305', name: 'web_search' }],
      messages: [{
        role: 'user',
        content: `Pesquise informações ATUAIS sobre o jogo ${homeTeam} x ${awayTeam} e responda APENAS com JSON válido:
{
  "homeForm": "últimos 5 resultados ex: VVDEV (V=vitória D=derrota E=empate)",
  "awayForm": "últimos 5 resultados",
  "homeFormHome": "últimos 5 jogos em CASA (apenas como mandante)",
  "awayFormAway": "últimos 5 jogos FORA (apenas como visitante)",
  "homeGoalsAvg": número média de gols marcados por jogo,
  "awayGoalsAvg": número,
  "homeGoalsConceded": número média de gols sofridos por jogo,
  "awayGoalsConceded": número,
  "homeXG": "xG médio por jogo dos últimos 5 (expected goals) ou N/A",
  "awayXG": "xG médio por jogo dos últimos 5 ou N/A",
  "h2hLast3": "últimos 3 confrontos diretos com placar",
  "homeInjuries": "lesionados/suspensos importantes ou Nenhum",
  "awayInjuries": "lesionados/suspensos importantes ou Nenhum",
  "homePosition": "posição na tabela ou N/A",
  "awayPosition": "posição na tabela ou N/A",
  "homeMotivation": "contexto motivacional do time mandante",
  "awayMotivation": "contexto motivacional do time visitante",
  "keyInfo": "fato mais relevante para este jogo em 1 frase"
}`,
      }],
    });

    const text = response.content.filter(b => b.type === 'text').map(b => b.text).join('');
    const json = text.replace(/```json|```/g, '').trim();
    const match = json.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('no json');
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

module.exports = { researchMatch };
