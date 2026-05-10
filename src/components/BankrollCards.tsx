import { formatCurrency } from '../lib/utils';
import type { BankrollConfig } from '../types/api';
import { DollarSign, TrendingUp, Target, ShieldAlert } from 'lucide-react';
import { cn } from '../lib/utils';

interface BankrollCardsProps {
  bankroll: BankrollConfig;
}

export function BankrollCards({ bankroll }: BankrollCardsProps) {
  const isPositivePnL = bankroll.dailyPnL > 0;
  const isNegativePnL = bankroll.dailyPnL < 0;
  
  const statusColor = bankroll.canBet.allowed ? 'text-success' : 'text-warning';
  const statusText = bankroll.canBet.allowed ? 'Operando' : bankroll.canBet.reason || 'Pausado';

  // Calculate progress to goal
  const progressPercent = Math.min(100, Math.max(0, ((bankroll.dailyPnL > 0 ? bankroll.dailyPnL : 0) / bankroll.monthlyGoal) * 100));

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
      
      {/* Current Bankroll */}
      <div className="bg-surface border border-border rounded-xl p-5 relative overflow-hidden group hover:border-primary/50 transition-colors">
        <div className="absolute top-0 right-0 p-5 opacity-10 text-primary">
          <DollarSign className="w-16 h-16" />
        </div>
        <p className="text-text-secondary text-sm font-medium mb-1">Banca Atual</p>
        <h3 className="font-display text-3xl font-bold">{formatCurrency(bankroll.current)}</h3>
      </div>

      {/* Daily PnL */}
      <div className="bg-surface border border-border rounded-xl p-5 relative overflow-hidden group hover:border-primary/50 transition-colors">
        <div className={cn("absolute top-0 right-0 p-5 opacity-10", isPositivePnL ? "text-success" : isNegativePnL ? "text-error" : "text-text-secondary")}>
          <TrendingUp className="w-16 h-16" />
        </div>
        <p className="text-text-secondary text-sm font-medium mb-1">P&L do Dia</p>
        <h3 className={cn(
          "font-display text-3xl font-bold",
          isPositivePnL ? "text-success" : isNegativePnL ? "text-error" : "text-text-primary"
        )}>
          {bankroll.dailyPnL > 0 ? '+' : ''}{formatCurrency(bankroll.dailyPnL)}
        </h3>
      </div>

      {/* Monthly Goal */}
      <div className="bg-surface border border-border rounded-xl p-5 relative group hover:border-primary/50 transition-colors flex flex-col justify-between">
        <div className="flex justify-between items-start mb-2">
          <div>
            <p className="text-text-secondary text-sm font-medium mb-1">Meta Mensal</p>
            <h3 className="font-display text-2xl font-bold">{formatCurrency(bankroll.monthlyGoal)}</h3>
          </div>
          <Target className="w-6 h-6 text-primary/50" />
        </div>
        
        <div className="mt-auto pt-2">
          <div className="flex justify-between text-xs font-mono text-text-muted mb-1">
            <span>Progresso</span>
            <span>{progressPercent.toFixed(1)}%</span>
          </div>
          <div className="h-1.5 w-full bg-border rounded-full overflow-hidden">
            <div 
              className="h-full bg-primary transition-all duration-1000 ease-out relative"
              style={{ width: `${progressPercent}%` }}
            >
              <div className="absolute inset-0 bg-white/20 animate-pulse" />
            </div>
          </div>
        </div>
      </div>

      {/* Status */}
      <div className="bg-surface border border-border rounded-xl p-5 relative overflow-hidden group hover:border-primary/50 transition-colors">
        <div className={cn("absolute top-0 right-0 p-5 opacity-10", statusColor)}>
          <ShieldAlert className="w-16 h-16" />
        </div>
        <p className="text-text-secondary text-sm font-medium mb-1">Status Hoje</p>
        <div className="flex items-center gap-2 mt-1">
          <div className={cn("w-3 h-3 rounded-full animate-pulse", bankroll.canBet.allowed ? "bg-success" : "bg-warning", !bankroll.canBet.allowed && bankroll.canBet.reason?.includes('Loss') ? "bg-error" : "")} />
          <h3 className="font-display text-2xl font-bold">{statusText}</h3>
        </div>
      </div>

    </div>
  );
}
