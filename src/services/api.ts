import axios from 'axios';
import type { BotStatus, Config } from '../types/api';

const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

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
  
  getConfig: async (): Promise<Config> => {
    const { data } = await apiClient.get<Config>('/api/config');
    return data;
  }
};

