import axios from 'axios';
import type { BotStatus, Prediction, HistoryResponse } from '../types/api';

const baseURL = import.meta.env.VITE_API_URL || 'https://br-viscase-betfair-api.ly7t0m.easypanel.host';

const apiClient = axios.create({ baseURL, timeout: 10000 });

export const api = {
  getStatus: async (): Promise<BotStatus> => {
    const { data } = await apiClient.get<BotStatus>('/api/status');
    return data;
  },

  toggleBot: async (): Promise<void> => {
    await apiClient.post('/api/bot/toggle');
  },

  runAnalysis: async (): Promise<Prediction[]> => {
    const { data } = await apiClient.post<{ predictions: Prediction[] }>('/api/analyze');
    return data.predictions;
  },

  getPredictions: async (): Promise<Prediction[]> => {
    const { data } = await apiClient.get<Prediction[]>('/api/predictions');
    return data;
  },

  setResult: async (id: number, result: 'WIN' | 'LOSS'): Promise<void> => {
    await apiClient.post(`/api/predictions/${id}/result`, { result });
  },

  getHistory: async (): Promise<HistoryResponse> => {
    const { data } = await apiClient.get<HistoryResponse>('/api/history');
    return data;
  },
};
