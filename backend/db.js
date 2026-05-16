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
    .order('created_at', { ascending: true });
  return data || [];
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
  const { count } = await supabase
    .from('betbot_predictions')
    .select('id', { count: 'exact', head: true })
    .eq('date', today);
  return (count || 0) > 0;
}

module.exports = {
  initDB,
  getSimState,
  setSimState,
  insertPrediction,
  getTodaysPredictions,
  updatePredictionResult,
  getPredictionHistory,
  analysisAlreadyDoneToday,
};
