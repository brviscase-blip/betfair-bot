require('dotenv').config();
const Anthropic = require('@anthropic-ai/sdk');
const { formatOddsForMatch, getBestOdds } = require('./odds');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function analyzeTodaysMatches(matches) {
  if (!matches || matches.length === 0) return [];

  const matchList = matches.map((m, i) => {
    const oddsMap = formatOddsForMatch(m);
    const oddsLines = Object.entries(oddsMap)
      .map(([house, o]) => `    ${house}: Casa ${o.home ?? '-'} | Empate ${o.draw ?? '-'} | Fora ${o.away ?? '-'}`)
      .join('\n');

    const time = new Date(m.commence_time).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

    return `${i + 1}. ${m.home_team} x ${m.away_team} — ${m.sport_title} — ${time}\n${oddsLines}`;
  }).join('\n\n');

  const prompt = `Você é um analista esportivo especialista em futebol. Analise os jogos abaixo e preveja o resultado mais provável de cada um.

Use seu conhecimento sobre os times (forma recente, qualidade, posição no campeonato) e as odds como indicador de probabilidade implícita.

JOGOS DE HOJE:
${matchList}

Regras:
- Só preveja se tiver confiança mínima de 60%
- Se não tiver confiança suficiente, coloque "SKIP" na prediction
- Seja objetivo no reasoning (1 linha)

Responda APENAS com JSON válido, sem texto antes ou depois:
{
  "predictions": [
    {
      "match": "Time A x Time B",
      "home_team": "Time A",
      "away_team": "Time B",
      "prediction": "HOME" | "DRAW" | "AWAY" | "SKIP",
      "confidence": 0-100,
      "reasoning": "motivo em 1 linha"
    }
  ]
}`;

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 2000,
    messages: [{ role: 'user', content: prompt }],
  });

  try {
    const text = response.content[0].text;
    const json = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(json);
    const predictions = parsed.predictions || [];

    return predictions
      .filter(p => p.prediction !== 'SKIP')
      .map(p => {
        const match = matches.find(m => m.home_team === p.home_team && m.away_team === p.away_team);
        const best = match ? getBestOdds(match, p.prediction) : { house: null, odd: null };
        const allOdds = match ? formatOddsForMatch(match) : {};

        return {
          ...p,
          best_house: best.house,
          best_odd: best.odd,
          all_odds: allOdds,
        };
      });
  } catch {
    return [];
  }
}

module.exports = { analyzeTodaysMatches };
