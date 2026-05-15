require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const ws = require('ws');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY,
  { db: { schema: 'public' }, realtime: { transport: ws } }
);

// Inicializa as tabelas se não existirem
async function initDB() {
  // Cria tabela de simulação (banca/config)
  await supabase.rpc('exec_sql', {
    sql: `
      CREATE TABLE IF NOT EXISTS betbot_simulation (
        id SERIAL PRIMARY KEY,
        key TEXT UNIQUE NOT NULL,
        value JSONB NOT NULL,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS betbot_bets (
        id BIGINT PRIMARY KEY,
        match TEXT,
        market TEXT,
        selection TEXT,
        bet_type TEXT,
        stake NUMERIC,
        entry_odd NUMERIC,
        exit_odd NUMERIC,
        cash_out_target NUMERIC,
        projected_profit NUMERIC,
        current_odd NUMERIC,
        status TEXT DEFAULT 'OPEN',
        pnl NUMERIC DEFAULT 0,
        placed_at TIMESTAMPTZ,
        closed_at TIMESTAMPTZ,
        close_odd NUMERIC
      );
      CREATE TABLE IF NOT EXISTS betbot_history (
        id SERIAL PRIMARY KEY,
        match TEXT,
        market TEXT,
        selection TEXT,
        bet_type TEXT,
        odd NUMERIC,
        stake NUMERIC,
        pnl NUMERIC,
        result TEXT,
        recorded_at TIMESTAMPTZ DEFAULT NOW()
      );
    `
  }).catch(() => {});
}

// Simulation state
async function getSimState() {
  const { data } = await supabase
    .from('betbot_simulation')
    .select('value')
    .eq('key', 'state')
    .single();
  
  if (!data) {
    const initial = {
      banca: 100, bancaInicial: 100,
      dailyPnL: 0, totalPnL: 0,
      stopLoss: -3, stopGain: 1.5,
      metaMensal: 10,
      lastReset: new Date().toDateString(),
    };
    await setSimState(initial);
    return initial;
  }
  return data.value;
}

async function setSimState(state) {
  await supabase.from('betbot_simulation').upsert({
    key: 'state', value: state, updated_at: new Date().toISOString()
  }, { onConflict: 'key' });
}

// Bets
async function getActiveBets() {
  const { data } = await supabase
    .from('betbot_bets')
    .select('*')
    .eq('status', 'OPEN');
  return data || [];
}

async function insertBet(bet) {
  await supabase.from('betbot_bets').insert({
    id: bet.id, match: bet.match, market: bet.market,
    selection: bet.selection, bet_type: bet.betType,
    stake: bet.stake, entry_odd: bet.entryOdd,
    exit_odd: bet.exitOdd, cash_out_target: bet.cashOutTarget,
    projected_profit: bet.projectedProfit,
    current_odd: bet.entryOdd, status: 'OPEN',
    placed_at: new Date().toISOString()
  });
}

async function updateBet(id, updates) {
  await supabase.from('betbot_bets').update(updates).eq('id', id);
}

async function getRecentBets(limit = 10) {
  const { data } = await supabase
    .from('betbot_bets')
    .select('*')
    .neq('status', 'OPEN')
    .order('closed_at', { ascending: false })
    .limit(limit);
  return data || [];
}

// History
async function insertHistory(record) {
  await supabase.from('betbot_history').insert({
    match: record.match, market: record.market,
    selection: record.selection, bet_type: record.betType,
    odd: record.odd, stake: record.stake,
    pnl: record.pnl, result: record.result,
    recorded_at: new Date().toISOString()
  });
}

async function getHistory(limit = 20) {
  const { data } = await supabase
    .from('betbot_history')
    .select('*')
    .order('recorded_at', { ascending: false })
    .limit(limit);
  return data || [];
}

module.exports = { initDB, getSimState, setSimState, getActiveBets, insertBet, updateBet, getRecentBets, insertHistory, getHistory };
