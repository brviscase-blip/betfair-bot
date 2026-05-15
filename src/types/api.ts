export interface Bet {
  id: number;
  match: string;
  market: string;
  selection: string;
  betType: 'BACK' | 'LAY';
  stake: number;
  entryOdd: number;
  cashOutTarget: number;
  projectedProfit: number;
  currentOdd: number;
  status: 'OPEN' | 'WIN' | 'LOSS' | 'CASHOUT';
  placedAt: string;
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
  betType: 'BACK' | 'LAY';
  entryOdd: number;
  exitOdd: number;
  cashOutTarget: number;
  stake: number;
  projectedProfit: number;
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
  stopLossDailyPct: number;
  stopGainDailyPct: number;
  monthlyGoalPct: number;
}
