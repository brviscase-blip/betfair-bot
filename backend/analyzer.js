require('dotenv').config();
const Anthropic = require('@anthropic-ai/sdk');
const { formatOddsForMatch, getBestOdds } = require('./odds');
const { getLatestCalibration } = require('./db');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ─── Helpers de pré-processamento (robô) ────────────────────────────────────

function calcFormScore(formStr) {
  if (!formStr || formStr === 'N/A') return null;
  const chars = formStr.replace(/[^VDE]/g, '').split('').slice(0, 5);
  if (chars.length === 0) return null;
  const score = chars.reduce((s, c) => s + (c === 'V' ? 3 : c === 'E' ? 1 : 0), 0);
  return { score, max: chars.length * 3, str: chars.join('') };
}

function motivScore(motivText) {
  if (!motivText || motivText === 'N/A') return 1;
  const t = motivText.toLowerCase();
  if (t.includes('título') || t.includes('lider') || t.includes('líder')) return 3;
  if (t.includes('rebaixamento') || t.includes('evitar')) return 3;
  if (t.includes('europeia') || t.includes('continental') || t.includes('classificação')) return 2;
  return 1;
}

function bestOddForSide(oddsMap, side) {
  return Object.values(oddsMap)
    .map(o => o[side])
    .filter(Boolean)
    .sort((a, b) => b - a)[0] || null;
}

function buildChecklist(r, oddsMap, prediction, confidence, mv) {
  const hForm = calcFormScore(r?.homeFormHome);
  const aForm = calcFormScore(r?.awayFormAway);
  const hDef  = parseFloat(r?.homeGoalsConceded);
  const aDef  = parseFloat(r?.awayGoalsConceded);
  const hMotiv = motivScore(r?.homeMotivation);
  const aMotiv = motivScore(r?.awayMotivation);
  const isHome = prediction === 'HOME';
  const isAway = prediction === 'AWAY';

  // Forma
  let formV = null, formN = 'Sem dados';
  if (hForm !== null && aForm !== null) {
    formV = isHome ? (hForm.score > aForm.score ? true : hForm.score < aForm.score ? false : null)
          : isAway ? (aForm.score > hForm.score ? true : aForm.score < hForm.score ? false : null)
          : null;
    formN = `Casa ${hForm.str}(${hForm.score}/15) vs Fora ${aForm.str}(${aForm.score}/15)`;
  }

  // Ataque (gols marcados)
  const hAtk = parseFloat(r?.homeGoalsAvg);
  const aAtk = parseFloat(r?.awayGoalsAvg);
  let atkV = null, atkN = 'Sem dados';
  if (!isNaN(hAtk) && !isNaN(aAtk)) {
    atkV = isHome ? hAtk >= aAtk : isAway ? aAtk >= hAtk : null;
    atkN = `${hAtk} vs ${aAtk} gols marcados/j`;
  }

  // Defensiva
  let defV = null, defN = 'Sem dados';
  if (!isNaN(hDef) && !isNaN(aDef)) {
    defV = isHome ? hDef <= aDef : isAway ? aDef <= hDef : null;
    defN = `${hDef} vs ${aDef} gols sofridos/j`;
  }

  // Motivação
  let motivV = null, motivN = 'Sem dados';
  if (r?.homeMotivation && r?.awayMotivation) {
    motivV = isHome ? (hMotiv > aMotiv ? true : hMotiv < aMotiv ? false : null)
           : isAway ? (aMotiv > hMotiv ? true : aMotiv < hMotiv ? false : null)
           : null;
    motivN = `${r.homeMotivation.split('—')[0].trim()} | ${r.awayMotivation.split('—')[0].trim()}`;
  }

  // H2H — mantido como contexto textual, não avaliado por código
  const h2hN = r?.h2hLast3 && r.h2hLast3 !== 'Sem dados' ? r.h2hLast3 : 'Sem dados';

  // Movimentação de odds
  let movV = null, movN = 'Estável';
  if (mv?.length > 0) {
    const predKey = isHome ? 'home' : isAway ? 'away' : 'draw';
    const relevant = mv.filter(m => m.side === predKey);
    if (relevant.length > 0) {
      const avgPct = relevant.reduce((s, m) => s + parseFloat(m.pct), 0) / relevant.length;
      movV = avgPct < -5 ? true : avgPct > 5 ? false : null;
      movN = `${avgPct > 0 ? '+' : ''}${avgPct.toFixed(1)}% desde abertura`;
    }
  }

  // Valor da odd vs confiança
  const predKey2 = isHome ? 'home' : isAway ? 'away' : 'draw';
  const best = bestOddForSide(oddsMap, predKey2);
  let valueV = null, valueN = 'Sem dados';
  if (best && confidence) {
    const impl = (1 / best * 100).toFixed(0);
    valueV = confidence > (1 / best * 100) + 5 ? true : confidence < (1 / best * 100) ? false : null;
    valueN = `Conf. ${confidence}% vs implícita ${impl}% (odd ${best})`;
  }

  return [
    { c: 'Forma casa/fora', v: formV, n: formN },
    { c: 'Ataque',          v: atkV,  n: atkN  },
    { c: 'Defensiva',       v: defV,  n: defN  },
    { c: 'Motivação',       v: motivV, n: motivN },
    { c: 'H2H',             v: null,  n: h2hN  },
    { c: 'Mov. odds',       v: movV,  n: movN  },
    { c: 'Valor da odd',    v: valueV, n: valueN },
  ];
}

function makeAutoSkip(m, reason) {
  const allOdds = formatOddsForMatch(m);
  return {
    match:        `${m.home_team} x ${m.away_team}`,
    home_team:    m.home_team,
    away_team:    m.away_team,
    prediction:   'SKIP',
    confidence:   0,
    reasoning:    reason,
    checklist:    ['Forma casa/fora','Ataque','Defensiva','Motivação','H2H','Mov. odds','Valor da odd']
                    .map(c => ({ c, v: null, n: 'Sem dados' })),
    best_house:   null,
    best_odd:     null,
    all_odds:     allOdds,
    sport_title:  m.sport_title || null,
    sport_key:    m.sport_key   || null,
    commence_time: m.commence_time || null,
  };
}

// ─── Análise principal ───────────────────────────────────────────────────────

async function analyzeTodaysMatches(matches, researchMap = {}, movementMap = {}, weatherMap = {}) {
  if (!matches || matches.length === 0) return [];

  const calibration = await getLatestCalibration();

  // ETAPA 1 — Robô: separa jogos com e sem dados
  const autoSkipped = [];
  const toAnalyze   = [];

  for (const m of matches) {
    const key = `${m.home_team}|${m.away_team}`;
    if (!researchMap[key]) {
      autoSkipped.push(makeAutoSkip(m, 'Sem dados estatísticos — time não encontrado na API.'));
      console.log(`[ANALYZER] Auto-SKIP (sem dados): ${m.home_team} x ${m.away_team}`);
    } else {
      toAnalyze.push(m);
    }
  }

  console.log(`[ANALYZER] ${autoSkipped.length} auto-SKIP (sem dados) | ${toAnalyze.length} enviados para IA`);

  if (toAnalyze.length === 0) return autoSkipped;

  // ETAPA 2 — Robô: monta prompt compacto com dados pré-processados
  const matchList = toAnalyze.map((m, i) => {
    const key    = `${m.home_team}|${m.away_team}`;
    const r      = researchMap[key];
    const mv     = movementMap[key];
    const w      = weatherMap[key];
    const odds   = formatOddsForMatch(m);
    const time   = new Date(m.commence_time).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

    const hForm  = calcFormScore(r.homeFormHome);
    const aForm  = calcFormScore(r.awayFormAway);
    const formCasa = hForm ? `${r.homeFormHome}(${hForm.score}/15)` : (r.homeForm || 'N/A');
    const formFora = aForm ? `${r.awayFormAway}(${aForm.score}/15)` : (r.awayForm || 'N/A');

    const bHome = bestOddForSide(odds, 'home');
    const bDraw = bestOddForSide(odds, 'draw');
    const bAway = bestOddForSide(odds, 'away');
    const impl  = o => o ? `(${(1/o*100).toFixed(0)}%)` : '';
    const oddsLine = `Casa@${bHome ?? '-'}${impl(bHome)} Empate@${bDraw ?? '-'}${impl(bDraw)} Fora@${bAway ?? '-'}${impl(bAway)}`;

    const movLine = mv?.length > 0
      ? mv.map(v => `${v.house}:${v.side} ${parseFloat(v.pct) > 0 ? 'SUBIU+' : 'CAIU'}${v.pct}%`).join(' | ')
      : 'estável';

    const wLine = w ? `${w.description}${w.alerts ? ' ⚠️ ' + w.alerts : ''}` : 'N/A';

    return (
      `${i + 1}. ${m.home_team} x ${m.away_team} — ${m.sport_title} — ${time}\n` +
      `   CASA: forma=${formCasa} | marcados=${r.homeGoalsAvg ?? 'N/A'}/j | sofridos=${r.homeGoalsConceded ?? 'N/A'}/j | cs=${r.homeCleanSheets || 'N/A'} | pos=${r.homePosition || 'N/A'} | motiv=${r.homeMotivation || 'N/A'}\n` +
      `   FORA: forma=${formFora} | marcados=${r.awayGoalsAvg ?? 'N/A'}/j | sofridos=${r.awayGoalsConceded ?? 'N/A'}/j | cs=${r.awayCleanSheets || 'N/A'} | pos=${r.awayPosition || 'N/A'} | motiv=${r.awayMotivation || 'N/A'}\n` +
      `   H2H: ${r.h2hLast3 || 'sem dados'} | Clima: ${wLine} | Mov: ${movLine}\n` +
      `   Odds: ${oddsLine}`
    );
  }).join('\n\n');

  const calibrationBlock = calibration
    ? `CALIBRAÇÃO (aplique obrigatoriamente):\n${calibration.notes.map(n => `• ${n}`).join('\n')}\nWin rate: ${(calibration.overall_win_rate * 100).toFixed(1)}% em ${calibration.sample_size} apostas\n\n`
    : '';

  const prompt =
    `Você é um analista de apostas esportivas. Os dados abaixo foram pré-processados. Sua tarefa: integrar os sinais, decidir e justificar.\n` +
    `${calibrationBlock}` +
    `CRITÉRIOS (prioridade): 1)Forma casa/fora (score /15) 2)Ataque (marcados/j) 3)Defesa (sofridos/j) 4)Motivação 5)H2H 6)Mov.odds: CAIU=dinheiro-entrando=bom-sinal; SUBIU=mercado-saindo=mau-sinal 7)Valor: só aposte se confiança > probabilidade implícita da odd\nLIMIAR MÍNIMO: confiança < 65% → obrigatoriamente SKIP, independente de valor calculado.\nREBAIXAMENTO BILATERAL: se visitante só precisa de empate para sobreviver → reduza confiança no mandante, o visitante jogará retrancado e dificilmente perde.\nFIM-DE-TEMPORADA: time já campeão ou sem nada a disputar rotaciona jogadores — desconsidere forma recente, reduza confiança.\n\n` +
    `JOGOS (${toAnalyze.length} com dados):\n${matchList}\n\n` +
    `Responda APENAS com JSON válido. Inclua TODOS os ${toAnalyze.length} jogos:\n` +
    `{\n  "predictions": [\n    {\n      "match": "Time A x Time B",\n      "home_team": "Time A",\n      "away_team": "Time B",\n      "prediction": "HOME" | "DRAW" | "AWAY" | "SKIP",\n      "confidence": 0-100,\n      "reasoning": "1-2 linhas citando dados específicos"\n    }\n  ]\n}`;

  // ETAPA 3 — IA: apenas decisão + raciocínio (sem checklist)
  const response = await client.messages.create({
    model:      'claude-sonnet-4-6',
    max_tokens: 4000,
    messages:   [{ role: 'user', content: prompt }],
  });

  const stopReason = response.stop_reason;
  console.log(`[ANALYZER] stop_reason: ${stopReason} | tokens usados: ${response.usage?.output_tokens ?? '?'}`);
  if (stopReason === 'max_tokens') {
    console.log('[ANALYZER] RESPOSTA TRUNCADA — aumentar max_tokens');
  }

  let aiPredictions = [];
  try {
    const text   = response.content[0].text;
    const match0 = text.match(/\{[\s\S]*"predictions"[\s\S]*\}/);
    const jsonStr = match0 ? match0[0] : text.replace(/```json|```/g, '').trim();
    aiPredictions = JSON.parse(jsonStr).predictions || [];
    console.log(`[ANALYZER] Sonnet retornou ${aiPredictions.length} previsões`);
  } catch (err) {
    console.log(`[ANALYZER] ERRO ao parsear resposta do Sonnet: ${err.message}`);
    return autoSkipped;
  }

  // ETAPA 4 — Robô: enriquece cada previsão com odds + checklist calculado
  const enriched = aiPredictions.map(p => {
    const m      = toAnalyze.find(x => x.home_team === p.home_team && x.away_team === p.away_team);
    const key    = m ? `${m.home_team}|${m.away_team}` : null;
    const r      = key ? researchMap[key] : null;
    const mv     = key ? movementMap[key] : null;
    const isSkip = p.prediction === 'SKIP';
    const best   = (!isSkip && m) ? getBestOdds(m, p.prediction) : { house: null, odd: null };
    const allOdds = (!isSkip && m) ? formatOddsForMatch(m) : {};
    const checklist = buildChecklist(r, allOdds, p.prediction, p.confidence, mv);

    return {
      ...p,
      checklist,
      best_house:    best.house,
      best_odd:      best.odd,
      all_odds:      allOdds,
      sport_title:   m?.sport_title   || null,
      sport_key:     m?.sport_key     || null,
      commence_time: m?.commence_time || null,
    };
  });

  // ETAPA 5 — Robô: mescla resultados preservando ordem original
  return matches.map(m => {
    const key = `${m.home_team}|${m.away_team}`;
    return (
      autoSkipped.find(p => `${p.home_team}|${p.away_team}` === key) ||
      enriched.find(p => `${p.home_team}|${p.away_team}` === key) ||
      makeAutoSkip(m, 'Não retornado pelo modelo.')
    );
  });
}

module.exports = { analyzeTodaysMatches };
