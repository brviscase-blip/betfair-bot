import axios from 'axios';
import type { BotStatus, Config } from '../types/api';

const baseURL = process.env.VITE_API_URL || 'https://br-viscase-betfair-api.ly7t0m.easypanel.host';

const apiClient = axios.create({
  baseURL,
  timeout: 5000,
});

export const api = {
  getStatus: async (): Promise<BotStatus> => {
    const { data } = await apiClient.get<BotStatus>('/api/status');
    return data;
  },
  
  toggleBot: async (): Promise<void> => {
    await apiClient.post('/api/bot/toggle');
  },
  
  scanManual: async (): Promise<void> => {
    await apiClient.post('/api/scan');
  },
  
  approveBet: async (id: number): Promise<void> => {
    await apiClient.post(`/api/bet/approve/${id}`);
  },
  
  rejectBet: async (id: number): Promise<void> => {
    await apiClient.delete(`/api/bet/reject/${id}`);
  },

  closeBet: async (id: number, closeOdd: number): Promise<void> => {
    await apiClient.post(`/api/bet/close/${id}`, { result: 'CASHOUT', closeOdd });
  },
  
  getConfig: async (): Promise<Config> => {
    const { data } = await apiClient.get<Config>('/api/config');
    return data;
  },

  updateConfig: async (config: Config): Promise<void> => {
    await apiClient.post('/api/config', config);
  }
};

