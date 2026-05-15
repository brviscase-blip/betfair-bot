require('dotenv').config();
const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function researchMatch(teamHome, teamAway) {
  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 800,
      tools: [{
        type: 'web_search_20250305',
        name: 'web_search',
      }],
      messages: [{
        role: 'user',
        content: `Pesquise e responda APENAS JSON sobre ${teamHome} x ${teamAway}:
{
  "homeForm": "últimos 5 jogos (ex: VVDVD)",
  "awayForm": "últimos 5 jogos",
  "h2hLast5": "histórico H2H resumido",
  "homeGoalsAvg": número,
  "awayGoalsAvg": número,
  "keyInfo": "1 frase sobre contexto importante",
  "predictedWinner": "home/away/draw",
  "confidence": 0-100
}`,
      }],
    });

    const text = response.content.filter(b => b.type === 'text').map(b => b.text).join('');
    const json = text.replace(/```json|```/g, '').trim();
    return JSON.parse(json);
  } catch {
    return {
      homeForm: 'N/A', awayForm: 'N/A', h2hLast5: 'N/A',
      homeGoalsAvg: 0, awayGoalsAvg: 0,
      keyInfo: 'Dados não disponíveis',
      predictedWinner: 'unknown', confidence: 0,
    };
  }
}

module.exports = { researchMatch };
