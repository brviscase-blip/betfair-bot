export interface Bet {
  id: number;
  match: string;
  market: string;
  selection: string;
  bet_type: 'BACK' | 'LAY';
  stake: number;
  entry_odd: number;
  cash_out_target: number;
  projected_profit: number;
  current_odd: number;
  status: 'OPEN' | 'WIN' | 'LOSS' | 'CASHOUT';
  placed_at: string;
  pnl: number;
  close_odd?: number;
  closed_at?: string;
}

export interface Research {
  homeForm: string;
  awayForm: string;
  keyInfo: string;
}

export interface Opportunity {
  id: number;
  match: string;
  startTime: string;
  market: string;
  selection: string;
  bet_type: 'BACK' | 'LAY';
  entry_odd: number;
  exit_odd: number;
  cash_out_target: number;
  stake: number;
  projected_profit: number;
  confidence: number;
  reasoning: string;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  research: Research;
  timestamp: string;
}

export interface LogEntry {
  timestamp: string;
  msg: string;
  type: 'success' | 'warn' | 'error' | 'info';
}

export interface SimulationConfig {
  banca: number;
  dailyPnL: number;
  totalPnL: number;
  metaMensal: number;
  progressMensal: number;
  stopLoss: number;
  stopGain: number;
  canBet: { allowed: boolean; reason?: string };
  activeBets: Bet[];
  recentBets: Bet[];
}

export interface BotStatus {
  botRunning: boolean;
  lastScan: string;
  simulation: SimulationConfig;
  pendingOpportunities: Opportunity[];
  log: LogEntry[];
}

export interface Config {
  stopLoss: number;
  stopGain: number;
  metaMensal: number;
  banca: number;
}
