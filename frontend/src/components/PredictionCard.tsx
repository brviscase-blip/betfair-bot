import { useState } from 'react';
import { CheckCircle, XCircle, Clock, TrendingUp } from 'lucide-react';
import type { Prediction } from '../types/api';
import { api } from '../services/api';

interface Props {
  prediction: Prediction;
  onResultSet: () => void;
}

const PRED_LABEL: Record<string, string> = {
  HOME: 'Casa vence',
  DRAW: 'Empate',
  AWAY: 'Fora vence',
};

export function PredictionCard({ prediction: p, onResultSet }: Props) {
  const [loading, setLoading] = useState(false);

  const handleResult = async (result: 'WIN' | 'LOSS') => {
    setLoading(true);
    await api.setResult(p.id, result);
    onResultSet();
    setLoading(false);
  };

  const confidenceColor =
    p.confidence >= 80 ? 'text-emerald-400' :
    p.confidence >= 65 ? 'text-yellow-400' : 'text-orange-400';

  const resultBadge =
    p.result === 'WIN'  ? <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-bold">ACERTOU</span> :
    p.result === 'LOSS' ? <span className="px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 text-xs font-bold">ERROU</span> :
                          <span className="px-2 py-0.5 rounded-full bg-yellow-500/20 text-yellow-400 text-xs font-bold flex items-center gap-1"><Clock className="w-3 h-3" />Pendente</span>;

  return (
    <div className="bg-surface border border-border rounded-xl p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-text-primary text-sm">{p.match}</p>
          <p className="text-text-muted text-xs mt-0.5">{new Date(p.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</p>
        </div>
        {resultBadge}
      </div>

      <div className="flex items-center gap-2">
        <TrendingUp className="w-4 h-4 text-primary flex-shrink-0" />
        <span className="text-text-primary font-medium text-sm">{PRED_LABEL[p.prediction] || p.prediction}</span>
        <span className={`ml-auto text-xs font-bold ${confidenceColor}`}>{p.confidence}%</span>
      </div>

      <p className="text-text-muted text-xs italic">{p.reasoning}</p>

      {p.best_house && p.best_odd && (
        <div className="bg-primary/5 border border-primary/20 rounded-lg px-3 py-2 text-xs">
          <span className="text-text-secondary">Melhor odd: </span>
          <span className="text-primary font-bold">{p.best_odd}</span>
          <span className="text-text-muted"> em {p.best_house}</span>
        </div>
      )}

      {Object.keys(p.all_odds || {}).length > 0 && (
        <div className="space-y-1">
          {Object.entries(p.all_odds).map(([house, odds]) => (
            <div key={house} className="flex justify-between text-xs text-text-muted">
              <span>{house}</span>
              <span className="font-mono">
                {odds.home ?? '-'} | {odds.draw ?? '-'} | {odds.away ?? '-'}
              </span>
            </div>
          ))}
        </div>
      )}

      {p.result === 'PENDING' && (
        <div className="flex gap-2 pt-1">
          <button
            onClick={() => handleResult('WIN')}
            disabled={loading}
            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/20 text-xs font-semibold transition-colors disabled:opacity-50"
          >
            <CheckCircle className="w-3.5 h-3.5" /> Acertei
          </button>
          <button
            onClick={() => handleResult('LOSS')}
            disabled={loading}
            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-red-500/10 text-red-400 border border-red-500/30 hover:bg-red-500/20 text-xs font-semibold transition-colors disabled:opacity-50"
          >
            <XCircle className="w-3.5 h-3.5" /> Errei
          </button>
        </div>
      )}
    </div>
  );
}
