import { formatCurrency, formatTime, cn } from '../lib/utils';
import type { Bet } from '../types/api';

interface BetsTableProps {
  bets: Bet[];
}

export function BetsTable({ bets }: BetsTableProps) {
  
  if (bets.length === 0) {
    return (
      <div className="text-center p-8 bg-surface border border-border rounded-xl">
        <p className="text-text-muted">Nenhuma aposta recente.</p>
      </div>
    );
  }

  const getStatusBadge = (status: Bet['status']) => {
    switch (status) {
      case 'OPEN':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold tracking-wider bg-blue-500/20 text-blue-400 border border-blue-500/30">OPEN</span>;
      case 'WIN':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold tracking-wider bg-success/20 text-success border border-success/30">WIN</span>;
      case 'LOSS':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold tracking-wider bg-error/20 text-error border border-error/30">LOSS</span>;
    }
  };

  return (
    <div className="bg-surface border border-border rounded-xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="text-[10px] uppercase text-text-muted bg-background/50 border-b border-border/50">
            <tr>
              <th className="px-4 py-3 font-medium">Horário</th>
              <th className="px-4 py-3 font-medium">Jogo</th>
              <th className="px-4 py-3 font-medium">Seleção</th>
              <th className="px-4 py-3 font-medium">Odd</th>
              <th className="px-4 py-3 font-medium">Stake</th>
              <th className="px-4 py-3 font-medium text-center">Status</th>
              <th className="px-4 py-3 font-medium text-right">P&L</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/20">
            {bets.map((bet) => (
              <tr key={bet.id} className="hover:bg-surface-hover/30 transition-colors">
                <td className="px-4 py-3 font-mono text-text-secondary whitespace-nowrap">{formatTime(bet.timestamp)}</td>
                <td className="px-4 py-3 font-medium whitespace-nowrap">{bet.match}</td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <span className={cn("inline-block px-1.5 py-0.5 rounded text-[10px] font-bold mr-1.5", 
                    bet.betType === 'BACK' ? 'bg-primary/10 text-primary' : 'bg-pink-500/10 text-pink-500'
                  )}>
                    {bet.betType}
                  </span>
                  {bet.selection}
                </td>
                <td className="px-4 py-3 font-mono">@{bet.odd.toFixed(2)}</td>
                <td className="px-4 py-3 font-mono text-text-secondary">{formatCurrency(bet.stake)}</td>
                <td className="px-4 py-3 text-center">{getStatusBadge(bet.status)}</td>
                <td className={cn(
                  "px-4 py-3 font-mono text-right font-medium",
                  bet.pnl > 0 ? "text-success" : bet.pnl < 0 ? "text-error" : "text-text-muted"
                )}>
                  {bet.pnl > 0 ? '+' : ''}{bet.pnl !== 0 ? formatCurrency(bet.pnl) : '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
