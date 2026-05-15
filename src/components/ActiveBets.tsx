import { TrendingUp, DollarSign } from 'lucide-react';
import { formatCurrency, cn } from '../lib/utils';
import type { Bet } from '../types/api';
import { api } from '../services/api';

interface ActiveBetsProps {
  bets: Bet[];
  onRefresh: () => void;
}

export function ActiveBets({ bets, onRefresh }: ActiveBetsProps) {
  const handleClose = async (id: number, currentOdd: number) => {
    await api.closeBet(id, currentOdd);
    onRefresh();
  };

  if (bets.length === 0) return null;

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-display font-bold">Apostas Ativas</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {bets.map(bet => {
          const profitOrLoss = (bet.stake * bet.entryOdd) - (bet.stake * bet.currentOdd);
          const profitColor = profitOrLoss > 0 ? 'text-success' : 'text-error';
          const progress = Math.min(100, Math.max(0, ((bet.entryOdd - bet.currentOdd) / (bet.entryOdd - bet.cashOutTarget)) * 100));

          return (
            <div key={bet.id} className="bg-surface border border-border rounded-xl p-5 hover:border-primary/50 transition-colors">
              <div className="flex justify-between items-start mb-3">
                <p className="font-medium truncate pr-2">{bet.match}</p>
                <div className={cn("px-2 py-0.5 rounded text-[10px] font-bold bg-primary/10 text-primary uppercase")}>{bet.market}</div>
              </div>
              
              <div className="flex justify-between items-center mb-4">
                <span className="text-sm">
                   <span className="font-bold text-primary">{bet.betType}</span> {bet.selection}
                </span>
                <span className="font-mono text-primary font-bold">@{bet.currentOdd.toFixed(2)}</span>
              </div>

              <div className="h-1.5 w-full bg-border rounded-full mb-4 overflow-hidden">
                <div className="h-full bg-primary transition-all duration-500" style={{ width: `${progress}%` }} />
              </div>

              <div className="flex justify-between items-center pt-4 border-t border-border/50">
                <div className={profitColor}>
                    <p className="text-[10px] uppercase text-text-muted">PnL Atual</p>
                    <p className="font-bold font-mono">{profitOrLoss > 0 ? '+' : ''}{formatCurrency(profitOrLoss)}</p>
                </div>
                <button 
                  onClick={() => handleClose(bet.id, bet.currentOdd)}
                  className="px-4 py-2 bg-warning/10 text-warning border border-warning/30 hover:bg-warning/20 rounded-lg text-sm font-medium transition-colors"
                >
                  Fechar Agora
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
