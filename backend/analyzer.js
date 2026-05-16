require('dotenv').config();
const Anthropic = require('@anthropic-ai/sdk');
const { formatOddsForMatch, getBestOdds } = require('./odds');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function analyzeTodaysMatches(matches, researchMap = {}) {
  if (!matches || matches.length === 0) return [];

  const matchList = matches.map((m, i) => {
    const oddsMap = formatOddsForMatch(m);
    const oddsLines = Object.entries(oddsMap)
      .map(([house, o]) => `    ${house}: Casa ${o.home ?? '-'} | Empate ${o.draw ?? '-'} | Fora ${o.away ?? '-'}`)
      .join('\n');

    const time = new Date(m.commence_time).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const key = `${m.home_team}|${m.away_team}`;
    const r = researchMap[key];

    let researchBlock = '';
    if (r) {
      researchBlock = `
  📊 Dados reais:
    Forma ${m.home_team}: ${r.homeForm || 'N/A'} | Posição: ${r.homePosition || 'N/A'} | Lesões: ${r.homeInjuries || 'Nenhum'}
    Forma ${m.away_team}: ${r.awayForm || 'N/A'} | Posição: ${r.awayPosition || 'N/A'} | Lesões: ${r.awayInjuries || 'Nenhum'}
    Média gols: ${m.home_team} ${r.homeGoalsAvg ?? 'N/A'} | ${m.away_team} ${r.awayGoalsAvg ?? 'N/A'}
    H2H últimos 3: ${r.h2hLast3 || 'N/A'}
    Info-chave: ${r.keyInfo || 'N/A'}`;
    }

    return `${i + 1}. ${m.home_team} x ${m.away_team} — ${m.sport_title} — ${time}
${oddsLines}${researchBlock}`;
  }).join('\n\n');

  const prompt = `Você é um analista esportivo especialista em futebol. Analise os jogos abaixo usando OS DADOS REAIS fornecidos (forma recente, lesões, H2H, posição na tabela) combinados com as odds.

NÃO baseie sua decisão apenas nas odds. Use os dados de desempenho real dos times para avaliar se o favorito das odds merece confiança ou não.

JOGOS DE HOJE:
${matchList}

Regras:
- Só preveja se tiver confiança mínima de 65% baseada nos DADOS REAIS + odds
- Se os dados reais contradizem o favorito das odds, leve isso a sério
- Se não tiver confiança suficiente, coloque "SKIP"
- Reasoning deve mencionar dados reais específicos (forma, lesões, H2H)

Responda APENAS com JSON válido:
{
  "predictions": [
    {
      "match": "Time A x Time B",
      "home_team": "Time A",
      "away_team": "Time B",
      "prediction": "HOME" | "DRAW" | "AWAY" | "SKIP",
      "confidence": 0-100,
      "reasoning": "motivo baseado em dados reais em 1-2 linhas"
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
          sport_title: match?.sport_title || null,
          commence_time: match?.commence_time || null,
        };
      });
  } catch {
    return [];
  }
}

module.exports = { analyzeTodaysMatches };
