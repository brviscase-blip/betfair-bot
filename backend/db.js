require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

global.WebSocket = require('ws');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

async function initDB() { return true; }

async function getSimState() {
  const { data } = await supabase.from('betbot_simulation').select('value').eq('key', 'state').single();
  if (!data) {
    const initial = { banca: 100, bancaInicial: 100, dailyPnL: 0, totalPnL: 0, stopLoss: -3, stopGain: 1.5, metaMensal: 10, lastReset: new Date().toDateString() };
    await setSimState(initial);
    return initial;
  }
  return data.value;
}

async function setSimState(state) {
  await supabase.from('betbot_simulation').upsert({ key: 'state', value: state, updated_at: new Date().toISOString() }, { onConflict: 'key' });
}

async function getActiveBets() {
  const { data } = await supabase.from('betbot_bets').select('*').eq('status', 'OPEN');
  return data || [];
}

async function insertBet(bet) {
  await supabase.from('betbot_bets').insert({ id: bet.id, match: bet.match, market: bet.market, selection: bet.selection, bet_type: bet.betType, stake: bet.stake, entry_odd: bet.entryOdd, exit_odd: bet.exitOdd, cash_out_target: bet.cashOutTarget, projected_profit: bet.projectedProfit, current_odd: bet.entryOdd, status: 'OPEN', placed_at: new Date().toISOString() });
}

async function updateBet(id, updates) {
  await supabase.from('betbot_bets').update(updates).eq('id', id);
}

async function getRecentBets(limit = 10) {
  const { data } = await supabase.from('betbot_bets').select('*').neq('status', 'OPEN').order('closed_at', { ascending: false }).limit(limit);
  return data || [];
}

async function insertHistory(record) {
  await supabase.from('betbot_history').insert({ match: record.match, market: record.market, selection: record.selection, bet_type: record.betType, odd: record.odd, stake: record.stake, pnl: record.pnl, result: record.result, recorded_at: new Date().toISOString() });
}

async function getHistory(limit = 20) {
  const { data } = await supabase.from('betbot_history').select('*').order('recorded_at', { ascending: false }).limit(limit);
  return data || [];
}

module.exports = { initDB, getSimState, setSimState, getActiveBets, insertBet, updateBet, getRecentBets, insertHistory, getHistory };
