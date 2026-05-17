require('dotenv').config();
const Anthropic = require('@anthropic-ai/sdk');
const { formatOddsForMatch, getBestOdds } = require('./odds');
const { getLatestCalibration } = require('./db');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SIDE_LABEL = { home: 'mandante', draw: 'empate', away: 'visitante' };

function buildMovementBlock(movements) {
  if (!movements?.length) return '';
  const lines = movements.map(mv => {
    const dir = mv.pct > 0 ? '📈' : '📉';
    return `    ${dir} ${mv.house} — ${SIDE_LABEL[mv.side] || mv.side}: ${mv.initial} → ${mv.current} (${mv.pct > 0 ? '+' : ''}${mv.pct}%)`;
  }).join('\n');
  return `\n  ⚠️ MOVIMENTAÇÃO DE MERCADO (vs abertura):\n${lines}`;
}

async function analyzeTodaysMatches(matches, researchMap = {}, movementMap = {}, weatherMap = {}) {
  if (!matches || matches.length === 0) return [];

  const calibration = await getLatestCalibration();

  const matchList = matches.map((m, i) => {
    const oddsMap = formatOddsForMatch(m);
    const oddsLines = Object.entries(oddsMap)
      .map(([house, o]) => `    ${house}: Casa ${o.home ?? '-'} | Empate ${o.draw ?? '-'} | Fora ${o.away ?? '-'}`)
      .join('\n');

    const time = new Date(m.commence_time).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const key = `${m.home_team}|${m.away_team}`;
    const r = researchMap[key];
    const mv = movementMap[key];
    const w = weatherMap[key];

    let dataBlock = '';
    if (r) {
      dataBlock = `
  📊 DADOS REAIS:
    ${m.home_team} (MANDANTE):
      Forma geral últ.5:     ${r.homeForm || 'N/A'}
      Forma em CASA últ.5:   ${r.homeFormHome || 'N/A'}
      Posição na tabela:     ${r.homePosition || 'N/A'}
      Gols marcados/jogo:    ${r.homeGoalsAvg ?? 'N/A'}
      Gols sofridos/jogo:    ${r.homeGoalsConceded ?? 'N/A'}
      xG médio/jogo:         ${r.homeXG || 'N/A'}
      Clean sheets (últ.10): ${r.homeCleanSheets || 'N/A'}
      Motivação:             ${r.homeMotivation || 'N/A'}
      Lesões/Suspensos:      ${r.homeInjuries || 'Nenhum conhecido'}

    ${m.away_team} (VISITANTE):
      Forma geral últ.5:     ${r.awayForm || 'N/A'}
      Forma FORA últ.5:      ${r.awayFormAway || 'N/A'}
      Posição na tabela:     ${r.awayPosition || 'N/A'}
      Gols marcados/jogo:    ${r.awayGoalsAvg ?? 'N/A'}
      Gols sofridos/jogo:    ${r.awayGoalsConceded ?? 'N/A'}
      xG médio/jogo:         ${r.awayXG || 'N/A'}
      Clean sheets (últ.10): ${r.awayCleanSheets || 'N/A'}
      Motivação:             ${r.awayMotivation || 'N/A'}
      Lesões/Suspensos:      ${r.awayInjuries || 'Nenhum conhecido'}

    H2H (confrontos diretos): ${r.h2hLast3 || 'N/A'}
    Info adicional:           ${r.keyInfo || 'N/A'}`;
    }

    dataBlock += buildMovementBlock(mv);

    if (w) {
      dataBlock += `\n  🌤️ CLIMA (${w.city}): ${w.description}`;
      if (w.alerts) dataBlock += `\n     ⚠️ Alerta: ${w.alerts}`;
    }

    return `${i + 1}. ${m.home_team} x ${m.away_team} — ${m.sport_title} — ${time}
${oddsLines}${dataBlock}`;
  }).join('\n\n');

  const calibrationBlock = calibration
    ? `\nCALIBRAÇÃO HISTÓRICA (aprendizado baseado nos seus resultados reais — aplique obrigatoriamente):\n${calibration.notes.map(n => `  • ${n}`).join('\n')}\nWin rate atual: ${(calibration.overall_win_rate * 100).toFixed(1)}% em ${calibration.sample_size} apostas (${calibration.period_days} dias)\n`
    : '';

  const prompt = `Você é um analista esportivo profissional especialista em futebol. Analise cada jogo com profundidade máxima usando TODOS os dados fornecidos.
${calibrationBlock}

CRITÉRIOS DE ANÁLISE (em ordem de importância):
1. FORMA CASA/FORA: é mais decisiva que a forma geral — um visitante com DDDDD fora não merece apoio independente das odds
2. xG (Expected Goals): revela se resultados recentes foram merecidos ou sorte — xG alto com poucos gols = time perigoso
3. GOLS SOFRIDOS + CLEAN SHEETS: solidez defensiva é tão importante quanto ataque
4. MOTIVAÇÃO: zona de rebaixamento gera desespero e intensidade extra; meio de tabela sem objetivos é apático
5. H2H: padrões psicológicos entre times específicos importam
6. CLIMA: chuva forte favorece times físicos e prejudica times técnicos; vento >10m/s atrapalha passes longos e chutes de longa distância; calor extremo favorece time local acostumado
7. MOVIMENTAÇÃO DE ODDS: se odds caíram significativamente desde a abertura, apostadores profissionais sabem algo — leve muito a sério
7. ODDS BRUTAS: use apenas para confirmar probabilidade implícita do mercado, nunca como critério único

DECISÃO:
- Só preveja se tiver 65%+ de confiança baseada nos dados concretos
- Se os dados contradizem as odds, questione — o mercado erra
- SKIP quando há muita incerteza ou dados insuficientes

JOGOS:
${matchList}

Responda APENAS com JSON válido. Inclua TODOS os jogos, incluindo os com SKIP:
{
  "predictions": [
    {
      "match": "Time A x Time B",
      "home_team": "Time A",
      "away_team": "Time B",
      "prediction": "HOME" | "DRAW" | "AWAY" | "SKIP",
      "confidence": 0-100,
      "reasoning": "cite dados específicos — 1-2 linhas objetivas",
      "checklist": [
        {"c": "Forma casa/fora", "v": true|false|null, "n": "nota curta"},
        {"c": "Defensiva", "v": true|false|null, "n": "nota curta"},
        {"c": "Motivação", "v": true|false|null, "n": "nota curta"},
        {"c": "H2H", "v": true|false|null, "n": "nota curta"},
        {"c": "Mov. odds", "v": true|false|null, "n": "nota curta"},
        {"c": "Valor da odd", "v": true|false|null, "n": "nota curta"}
      ]
    }
  ]
}
v: true=favorável | false=desfavorável | null=sem dados`;

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 6000,
    messages: [{ role: 'user', content: prompt }],
  });

  try {
    const text = response.content[0].text;
    const json = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(json);
    const predictions = parsed.predictions || [];

    return predictions.map(p => {
      const match = matches.find(m => m.home_team === p.home_team && m.away_team === p.away_team);
      const isSkip = p.prediction === 'SKIP';
      const best = (!isSkip && match) ? getBestOdds(match, p.prediction) : { house: null, odd: null };
      const allOdds = (!isSkip && match) ? formatOddsForMatch(match) : {};
      return {
        ...p,
        best_house: best.house,
        best_odd: best.odd,
        all_odds: allOdds,
        sport_title: match?.sport_title || null,
        sport_key: match?.sport_key || null,
        commence_time: match?.commence_time || null,
      };
    });
  } catch {
    return [];
  }
}

module.exports = { analyzeTodaysMatches };
