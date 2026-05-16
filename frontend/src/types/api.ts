export interface Prediction {
  id: number;
  date: string;
  match: string;
  home_team: string;
  away_team: string;
  prediction: 'HOME' | 'DRAW' | 'AWAY';
  confidence: number;
  reasoning: string;
  best_house: string | null;
  best_odd: number | null;
  all_odds: Record<string, { home: number | null; draw: number | null; away: number | null }>;
  result: 'WIN' | 'LOSS' | 'PENDING';
  created_at: string;
}

export interface HistoryStats {
  total: number;
  wins: number;
  losses: number;
  winRate: number;
}

export interface HistoryResponse {
  history: Prediction[];
  stats: HistoryStats;
}

export interface BotStatus {
  botRunning: boolean;
  lastAnalysis: string | null;
  totalToday: number;
  log: LogEntry[];
}

export interface LogEntry {
  timestamp: string;
  msg: string;
  type: 'success' | 'warn' | 'error' | 'info';
}
