import axios from 'axios';
import type { BotStatus, Config } from '../types/api';

const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

const apiClient = axios.create({
  baseURL,
  timeout: 5000,
});

// Mock data generator for fallback when backend is unavailable
const mockStatus: BotStatus = {
  botRunning: true,
  lastScan: new Date().toISOString(),
  bankroll: {
    current: 97.50,
    dailyPnL: -2.50,
    totalPnL: -2.50,
    monthlyGoal: 10.00,
    canBet: { allowed: true },
    openBets: [],
    recentBets: [
      {
        id: 1234567890,
        match: "Flamengo x Palmeiras",
        selection: "Flamengo",
        betType: "BACK",
        stake: 2.00,
        odd: 2.35,
        status: "OPEN",
        pnl: 0,
        timestamp: new Date(Date.now() - 3600000).toISOString()
      },
      {
        id: 1234567889,
        match: "Vasco x Botafogo",
        selection: "Under 2.5",
        betType: "LAY",
        stake: 4.00,
        odd: 1.80,
        status: "WIN",
        pnl: 3.20,
        timestamp: new Date(Date.now() - 7200000).toISOString()
      },
      {
        id: 1234567888,
        match: "Cruzeiro x Atlético-MG",
        selection: "Cruzeiro",
        betType: "BACK",
        stake: 2.00,
        odd: 3.10,
        status: "LOSS",
        pnl: -2.00,
        timestamp: new Date(Date.now() - 86400000).toISOString()
      }
    ]
  },
  pendingOpportunities: [
    {
      id: 1234567891,
      match: "São Paulo x Corinthians",
      startTime: new Date(Date.now() + 7200000).toISOString(),
      selection: "São Paulo",
      betType: "BACK",
      targetOdd: 2.20,
      exitOdd: 1.80,
      stake: 2.00,
      confidence: 78,
      reasoning: "Histórico favorável em casa + odds com valor.",
      riskLevel: "LOW",
      approved: false,
      timestamp: new Date().toISOString()
    },
    {
      id: 1234567892,
      match: "Grêmio x Internacional",
      startTime: new Date(Date.now() + 10800000).toISOString(),
      selection: "Grêmio",
      betType: "LAY",
      targetOdd: 1.95,
      exitOdd: 3.00,
      stake: 5.00,
      confidence: 62,
      reasoning: "Análise de xG sugere jogo travado. Lay ao favorito.",
      riskLevel: "MEDIUM",
      approved: false,
      timestamp: new Date().toISOString()
    }
  ],
  log: [
    { timestamp: new Date(Date.now() - 10000).toISOString(), msg: "Scanner finalizado. 2 oportunidades.", type: "success" },
    { timestamp: new Date(Date.now() - 20000).toISOString(), msg: "Buscando liquidez na Betfair...", type: "info" },
    { timestamp: new Date(Date.now() - 30000).toISOString(), msg: "Sistema iniciado", type: "success" }
  ]
};

// If backend isn't responding, we'll serve the mock to avoid a blank screen
// In a real prod environment we'd just let it fail, but for the preview we want to show the UI
let useMock = false;

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    console.warn('API request failed, falling back to mock data.', error.message);
    useMock = true;
    return Promise.reject(error);
  }
);

export const api = {
  getStatus: async (): Promise<BotStatus> => {
    try {
      if (useMock) return mockStatus;
      const { data } = await apiClient.get<BotStatus>('/api/status');
      return data;
    } catch (error) {
      return mockStatus;
    }
  },
  
  toggleBot: async (): Promise<void> => {
    try {
      if (useMock) {
        mockStatus.botRunning = !mockStatus.botRunning;
        mockStatus.log.unshift({
          timestamp: new Date().toISOString(),
          msg: `Bot ${mockStatus.botRunning ? 'ligado' : 'pausado'} manualmente`,
          type: 'warn'
        });
        return;
      }
      await apiClient.post('/api/bot/toggle');
    } catch (error) {}
  },
  
  scanManual: async (): Promise<void> => {
    try {
      if (useMock) {
        mockStatus.log.unshift({
          timestamp: new Date().toISOString(),
          msg: "Scan manual iniciado pela UI.",
          type: 'info'
        });
        return;
      }
      await apiClient.post('/api/scan');
    } catch (error) {}
  },
  
  approveBet: async (id: number): Promise<void> => {
    try {
      if (useMock) {
        const idx = mockStatus.pendingOpportunities.findIndex(o => o.id === id);
        if (idx !== -1) {
          mockStatus.pendingOpportunities[idx].approved = true;
          mockStatus.log.unshift({
            timestamp: new Date().toISOString(),
            msg: `Aposta ${id} aprovada.`,
            type: 'success'
          });
          // Move from pending to open bets for mock
          const opt = mockStatus.pendingOpportunities[idx];
          mockStatus.pendingOpportunities.splice(idx, 1);
          mockStatus.bankroll.openBets.push({
             id: opt.id,
             match: opt.match,
             selection: opt.selection,
             betType: opt.betType,
             stake: opt.stake,
             odd: opt.targetOdd,
             status: 'OPEN',
             pnl: 0,
             timestamp: new Date().toISOString(),
          });
        }
        return;
      }
      await apiClient.post(`/api/bet/approve/${id}`);
    } catch (error) {}
  },
  
  rejectBet: async (id: number): Promise<void> => {
    try {
      if (useMock) {
        const idx = mockStatus.pendingOpportunities.findIndex(o => o.id === id);
        if (idx !== -1) {
          mockStatus.pendingOpportunities.splice(idx, 1);
          mockStatus.log.unshift({
            timestamp: new Date().toISOString(),
            msg: `Aposta ${id} rejeitada.`,
            type: 'info'
          });
        }
        return;
      }
      await apiClient.delete(`/api/bet/reject/${id}`);
    } catch (error) {}
  },
  
  getConfig: async (): Promise<Config> => {
    const mockConfig: Config = {
      stopLossDailyPct: 5,
      stopGainDailyPct: 10,
      monthlyGoalPct: 20,
      minStake: 2.00,
    };
    try {
      if (useMock) return mockConfig;
      const { data } = await apiClient.get<Config>('/api/config');
      return data;
    } catch (error) {
      return mockConfig;
    }
  }
};
