export interface Bet {
  id: number;
  match: string;
  selection: string;
  betType: 'BACK' | 'LAY';
  stake: number;
  odd: number;
  status: 'OPEN' | 'WIN' | 'LOSS';
  pnl: number;
  timestamp: string;
}

export interface Opportunity {
  id: number;
  match: string;
  startTime: string;
  selection: string;
  betType: 'BACK' | 'LAY';
  targetOdd: number;
  exitOdd: number;
  stake: number;
  confidence: number;
  reasoning: string;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  approved: boolean;
  timestamp: string;
}

export interface LogEntry {
  timestamp: string;
  msg: string;
  type: 'success' | 'warn' | 'error' | 'info';
}

export interface BankrollConfig {
  current: number;
  dailyPnL: number;
  totalPnL: number;
  monthlyGoal: number;
  canBet: { allowed: boolean; reason?: string };
  openBets: Bet[];
  recentBets: Bet[];
}

export interface BotStatus {
  botRunning: boolean;
  lastScan: string;
  bankroll: BankrollConfig;
  pendingOpportunities: Opportunity[];
  log: LogEntry[];
}

export interface Config {
  stopLossDailyPct: number;
  stopGainDailyPct: number;
  monthlyGoalPct: number;
  minStake: number;
}
