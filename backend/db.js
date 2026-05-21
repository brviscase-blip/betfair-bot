require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

global.WebSocket = require('ws');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY,
  { db: { schema: 'betfair-bot' } }
);

async function initDB() { return true; }

// ─── Simulação (estado geral do bot) ────────────────────────────────────────

async function getSimState() {
  const { data } = await supabase.from('betbot_simulation').select('value').eq('key', 'state').single();
  if (!data) {
    const initial = { banca: 100, bancaInicial: 100, dailyPnL: 0, totalPnL: 0, stopLoss: -3, stopGain: 1.5, metaMensal: 10, lastReset: new Date().toDateString(), botRunning: false };
    await setSimState(initial);
    return initial;
  }
  return data.value;
}

async function setSimState(state) {
  await supabase.from('betbot_simulation').upsert({ key: 'state', value: state, updated_at: new Date().toISOString() }, { onConflict: 'key' });
}

// ─── Previsões diárias ───────────────────────────────────────────────────────

async function insertPrediction(prediction) {
  const today = new Date().toISOString().split('T')[0];
  const { data, error } = await supabase.from('betbot_predictions').insert({
    date: today,
    match: prediction.match,
    home_team: prediction.home_team,
    away_team: prediction.away_team,
    prediction: prediction.prediction,
    confidence: prediction.confidence,
    reasoning: prediction.reasoning,
    best_house: prediction.best_house,
    best_odd: prediction.best_odd,
    all_odds: prediction.all_odds,
    sport_title: prediction.sport_title || null,
    sport_key: prediction.sport_key || null,
    commence_time: prediction.commence_time || null,
    result: 'PENDING',
    created_at: new Date().toISOString(),
  }).select().single();

  if (error) throw error;
  return data;
}

async function getTodaysPredictions() {
  const today = new Date().toISOString().split('T')[0];
  const { data } = await supabase
    .from('betbot_predictions')
    .select('*')
    .eq('date', today)
    .neq('prediction', 'SKIP')
    .order('created_at', { ascending: true });
  return data || [];
}

async function getTodaysAnalyzedMatchKeys() {
  const today = new Date().toISOString().split('T')[0];
  const { data } = await supabase
    .from('betbot_predictions')
    .select('home_team, away_team')
    .eq('date', today);
  return new Set((data || []).map(p => `${p.home_team}|${p.away_team}`));
}

async function updatePredictionResult(id, result) {
  await supabase
    .from('betbot_predictions')
    .update({ result })
    .eq('id', id);
}

async function getPredictionHistory(limit = 50) {
  const { data } = await supabase
    .from('betbot_predictions')
    .select('*')
    .neq('result', 'PENDING')
    .order('created_at', { ascending: false })
    .limit(limit);
  return data || [];
}

async function analysisAlreadyDoneToday() {
  const today = new Date().toISOString().split('T')[0];
  const sim = await getSimState();
  return sim.lastAnalysisDate === today;
}

async function markAnalysisDoneToday() {
  const sim = await getSimState();
  sim.lastAnalysisDate = new Date().toISOString().split('T')[0];
  await setSimState(sim);
}

async function getPendingPredictions() {
  const since = new Date();
  since.setDate(since.getDate() - 3);
  const { data } = await supabase
    .from('betbot_predictions')
    .select('*')
    .eq('result', 'PENDING')
    .gte('date', since.toISOString().split('T')[0]);
  return data || [];
}

// ─── Calibração semanal ───────────────────────────────────────────────────────

async function saveCalibration(report) {
  await supabase.from('betbot_calibrations').insert({
    date: new Date().toISOString().split('T')[0],
    report,
    created_at: new Date().toISOString(),
  });
}

async function getLatestCalibration() {
  const { data } = await supabase
    .from('betbot_calibrations')
    .select('report')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();
  return data?.report || null;
}

// ─── Snapshots de odds (rastreamento de movimentação) ────────────────────────

async function saveOddsSnapshot(matchKey, sportKey, label, oddsData) {
  const today = new Date().toISOString().split('T')[0];
  await supabase.from('betbot_odds_snapshots').upsert({
    date: today,
    match_key: matchKey,
    sport_key: sportKey,
    snapshot_label: label,
    snapshot_time: new Date().toISOString(),
    odds_data: oddsData,
  }, { onConflict: 'date,match_key,snapshot_label' });
}

async function getOddsMovement(date, matchKey) {
  // Busca snapshots dos últimos 7 dias para ter histórico completo
  const since = new Date(date);
  since.setDate(since.getDate() - 7);
  const sinceStr = since.toISOString().split('T')[0];

  const { data } = await supabase
    .from('betbot_odds_snapshots')
    .select('*')
    .eq('match_key', matchKey)
    .gte('date', sinceStr)
    .lte('date', date)
    .order('snapshot_time', { ascending: true });

  if (!data || data.length < 2) return null;

  const first = data[0].odds_data;
  const last  = data[data.length - 1].odds_data;
  const daySpan = data[data.length - 1].date !== data[0].date
    ? ` (${data[0].date} → ${data[data.length - 1].date})`
    : ' (hoje)';

  const movements = [];
  for (const house of Object.keys(last)) {
    if (!first[house]) continue;
    for (const side of ['home', 'draw', 'away']) {
      const ini = first[house]?.[side];
      const cur = last[house]?.[side];
      if (!ini || !cur) continue;
      const pct = ((cur - ini) / ini) * 100;
      if (Math.abs(pct) >= 5) {
        movements.push({ house, side, initial: ini, current: cur, pct: pct.toFixed(1), span: daySpan });
      }
    }
  }
  return movements.length > 0 ? movements : null;
}

module.exports = {
  initDB,
  getSimState,
  setSimState,
  insertPrediction,
  getTodaysPredictions,
  getTodaysAnalyzedMatchKeys,
  getPendingPredictions,
  updatePredictionResult,
  getPredictionHistory,
  analysisAlreadyDoneToday,
  markAnalysisDoneToday,
  saveOddsSnapshot,
  getOddsMovement,
  saveCalibration,
  getLatestCalibration,
};
