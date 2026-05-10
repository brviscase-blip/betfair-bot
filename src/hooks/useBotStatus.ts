import { useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';
import type { BotStatus } from '../types/api';

export function useBotStatus(intervalMs = 10000) {
  const [status, setStatus] = useState<BotStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastFetch, setLastFetch] = useState<Date>(new Date());

  const fetchStatus = useCallback(async () => {
    try {
      const data = await api.getStatus();
      setStatus(data);
      setError(null);
      setLastFetch(new Date());
    } catch (err) {
      setError('Falha ao obter status do servidor.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    
    const interval = setInterval(fetchStatus, intervalMs);
    return () => clearInterval(interval);
  }, [fetchStatus, intervalMs]);

  return { status, isLoading, error, lastFetch, refetch: fetchStatus };
}
