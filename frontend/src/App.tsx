import { useState, useEffect, useCallback } from 'react';
import { Activity, AlertCircle, RefreshCw, BarChart2, Trophy, XCircle, Target, Play, Pause } from 'lucide-react';
import { api } from './services/api';
import { PredictionCard } from './components/PredictionCard';
import { SystemLog } from './components/SystemLog';
import type { BotStatus, Prediction, HistoryResponse } from './types/api';

export default function App() {
  const [status, setStatus] = useState<BotStatus | null>(null);
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [history, setHistory] = useState<HistoryResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [activeTab, setActiveTab] = useState<'today' | 'history'>('today');

  const fetchAll = useCallback(async () => {
    try {
      const [s, p, h] = await Promise.all([api.getStatus(), api.getPredictions(), api.getHistory()]);
      setStatus(s);
      setPredictions(p);
      setHistory(h);
      setError(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao conectar com o servidor');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
    const interval = setInterval(fetchAll, 15000);
    return () => clearInterval(interval);
  }, [fetchAll]);

  const handleToggle = async () => {
    setToggling(true);
    await api.toggleBot();
    await fetchAll();
    setToggling(false);
  };

  const handleAnalyze = async () => {
    setAnalyzing(true);
    await api.runAnalysis();
    await fetchAll();
    setAnalyzing(false);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Activity className="w-12 h-12 text-primary animate-pulse" />
          <p className="text-text-secondary font-mono text-sm animate-pulse">CARREGANDO...</p>
        </div>
      </div>
    );
  }

  if (error && !status) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="bg-surface border border-red-500/30 p-8 rounded-xl max-w-md text-center">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-text-primary mb-2">Erro de Conexão</h2>
          <p className="text-text-secondary mb-6">{error}</p>
          <button onClick={fetchAll} className="px-6 py-2 bg-primary/10 text-primary border border-primary/30 hover:bg-primary/20 rounded-lg transition-colors font-medium">
            Tentar Novamente
          </button>
        </div>
      </div>
    );
  }

  const pending = predictions.filter(p => p.result === 'PENDING');
  const resolved = predictions.filter(p => p.result !== 'PENDING');
  const stats = history?.stats;

  return (
    <div className="min-h-screen bg-background text-text-primary pb-12">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8">

        {/* Header */}
        <div className="flex items-center justify-between py-6 border-b border-border mb-8">
          <div className="flex items-center gap-3">
            <Activity className="w-7 h-7 text-primary" />
            <div>
              <h1 className="text-xl font-bold text-text-primary">BetBot AI</h1>
              <p className="text-text-muted text-xs">
                {status?.lastAnalysis
                  ? `Última análise: ${new Date(status.lastAnalysis).toLocaleString('pt-BR')}`
                  : 'Análise diária às 07:00'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleAnalyze}
              disabled={analyzing}
              className="flex items-center gap-2 px-4 py-2 bg-surface border border-border text-text-secondary hover:text-text-primary hover:border-primary/50 rounded-lg text-sm transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${analyzing ? 'animate-spin' : ''}`} />
              {analyzing ? 'Analisando...' : 'Analisar agora'}
            </button>
            <button
              onClick={handleToggle}
              disabled={toggling}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 ${
                status?.botRunning
                  ? 'bg-red-500/10 text-red-400 border border-red-500/30 hover:bg-red-500/20'
                  : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/20'
              }`}
            >
              {status?.botRunning ? <><Pause className="w-4 h-4" /> Pausar</> : <><Play className="w-4 h-4" /> Ligar</>}
            </button>
          </div>
        </div>

        {/* Stats cards */}
        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
            <div className="bg-surface border border-border rounded-xl p-4">
              <div className="flex items-center gap-2 mb-1">
                <Target className="w-4 h-4 text-text-muted" />
                <span className="text-text-muted text-xs">Total previsões</span>
              </div>
              <p className="text-2xl font-bold text-text-primary">{stats.total}</p>
            </div>
            <div className="bg-surface border border-border rounded-xl p-4">
              <div className="flex items-center gap-2 mb-1">
                <Trophy className="w-4 h-4 text-emerald-400" />
                <span className="text-text-muted text-xs">Acertos</span>
              </div>
              <p className="text-2xl font-bold text-emerald-400">{stats.wins}</p>
            </div>
            <div className="bg-surface border border-border rounded-xl p-4">
              <div className="flex items-center gap-2 mb-1">
                <XCircle className="w-4 h-4 text-red-400" />
                <span className="text-text-muted text-xs">Erros</span>
              </div>
              <p className="text-2xl font-bold text-red-400">{stats.losses}</p>
            </div>
            <div className="bg-surface border border-border rounded-xl p-4">
              <div className="flex items-center gap-2 mb-1">
                <BarChart2 className="w-4 h-4 text-primary" />
                <span className="text-text-muted text-xs">% Acerto</span>
              </div>
              <p className={`text-2xl font-bold ${stats.winRate >= 60 ? 'text-emerald-400' : stats.winRate >= 45 ? 'text-yellow-400' : 'text-red-400'}`}>
                {stats.winRate}%
              </p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">

            {/* Tabs */}
            <div className="flex gap-1 bg-surface border border-border rounded-lg p-1 w-fit">
              <button
                onClick={() => setActiveTab('today')}
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${activeTab === 'today' ? 'bg-primary/20 text-primary' : 'text-text-muted hover:text-text-secondary'}`}
              >
                Hoje ({predictions.length})
              </button>
              <button
                onClick={() => setActiveTab('history')}
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${activeTab === 'history' ? 'bg-primary/20 text-primary' : 'text-text-muted hover:text-text-secondary'}`}
              >
                Histórico ({history?.history.length ?? 0})
              </button>
            </div>

            {activeTab === 'today' && (
              <>
                {predictions.length === 0 ? (
                  <div className="bg-surface border border-border rounded-xl p-12 text-center">
                    <Activity className="w-8 h-8 text-text-muted mx-auto mb-3" />
                    <p className="text-text-secondary font-medium">Nenhuma previsão para hoje.</p>
                    <p className="text-text-muted text-sm mt-1">A análise automática roda às 07:00 ou clique em "Analisar agora".</p>
                  </div>
                ) : (
                  <>
                    {pending.length > 0 && (
                      <div>
                        <h2 className="text-sm font-semibold text-text-muted uppercase tracking-wider mb-3">Aguardando resultado</h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {pending.map(p => <PredictionCard key={p.id} prediction={p} onResultSet={fetchAll} />)}
                        </div>
                      </div>
                    )}
                    {resolved.length > 0 && (
                      <div>
                        <h2 className="text-sm font-semibold text-text-muted uppercase tracking-wider mb-3">Resultados registrados</h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {resolved.map(p => <PredictionCard key={p.id} prediction={p} onResultSet={fetchAll} />)}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </>
            )}

            {activeTab === 'history' && (
              <>
                {!history || history.history.length === 0 ? (
                  <div className="bg-surface border border-border rounded-xl p-12 text-center">
                    <BarChart2 className="w-8 h-8 text-text-muted mx-auto mb-3" />
                    <p className="text-text-secondary font-medium">Nenhum histórico ainda.</p>
                    <p className="text-text-muted text-sm mt-1">Registre os resultados das previsões de hoje para começar.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {history.history.map(p => <PredictionCard key={p.id} prediction={p} onResultSet={fetchAll} />)}
                  </div>
                )}
              </>
            )}
          </div>

          <div>
            <SystemLog logs={status?.log ?? []} />
          </div>
        </div>
      </div>
    </div>
  );
}
