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

    let dataBlock = '';
    if (r) {
      dataBlock = `
  📊 DADOS REAIS:
    ${m.home_team} (MANDANTE):
      Forma geral (últ 5):  ${r.homeForm || 'N/A'}
      Forma em CASA (últ 5): ${r.homeFormHome || r.homeForm || 'N/A'}
      Posição na tabela:    ${r.homePosition || 'N/A'}
      Gols marcados/jogo:   ${r.homeGoalsAvg ?? 'N/A'}
      Gols sofridos/jogo:   ${r.homeGoalsConceded ?? 'N/A'}
      Clean sheets:         ${r.homeCleanSheets || 'N/A'}
      Motivação:            ${r.homeMotivation || 'N/A'}
      Lesões/Suspensos:     ${r.homeInjuries || 'N/A'}

    ${m.away_team} (VISITANTE):
      Forma geral (últ 5):  ${r.awayForm || 'N/A'}
      Forma FORA (últ 5):   ${r.awayFormAway || r.awayForm || 'N/A'}
      Posição na tabela:    ${r.awayPosition || 'N/A'}
      Gols marcados/jogo:   ${r.awayGoalsAvg ?? 'N/A'}
      Gols sofridos/jogo:   ${r.awayGoalsConceded ?? 'N/A'}
      Clean sheets:         ${r.awayCleanSheets || 'N/A'}
      Motivação:            ${r.awayMotivation || 'N/A'}
      Lesões/Suspensos:     ${r.awayInjuries || 'N/A'}

    H2H (confrontos diretos): ${r.h2hLast3 || 'N/A'}
    Info adicional:           ${r.keyInfo || 'N/A'}`;
    }

    return `${i + 1}. ${m.home_team} x ${m.away_team} — ${m.sport_title} — ${time}
${oddsLines}${dataBlock}`;
  }).join('\n\n');

  const prompt = `Você é um analista esportivo profissional especialista em futebol. Analise cada jogo com profundidade usando TODOS os dados fornecidos.

INSTRUÇÕES DE ANÁLISE:
1. Forma em casa/fora é MAIS relevante que a forma geral — um time que perde fora mas vence em casa muda completamente o prognóstico
2. Gols sofridos e clean sheets revelam solidez defensiva — tão importante quanto ataque
3. Motivação importa: um time no Z4 luta muito mais do que um time estagnado no meio
4. Se as odds contradizem os dados reais, questione — o mercado erra
5. H2H recente pode indicar padrões psicológicos entre os times
6. Só preveja com confiança mínima de 65% baseada nos dados concretos

JOGOS:
${matchList}

Responda APENAS com JSON válido:
{
  "predictions": [
    {
      "match": "Time A x Time B",
      "home_team": "Time A",
      "away_team": "Time B",
      "prediction": "HOME" | "DRAW" | "AWAY" | "SKIP",
      "confidence": 0-100,
      "reasoning": "análise objetiva citando dados reais: forma casa/fora, posição, gols, motivação, H2H — 2-3 linhas"
    }
  ]
}`;

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 3000,
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
