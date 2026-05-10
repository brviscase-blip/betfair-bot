import { useState } from 'react';
import { useBotStatus } from './hooks/useBotStatus';
import { api } from './services/api';
import { Header } from './components/Header';
import { BankrollCards } from './components/BankrollCards';
import { OpportunityCard } from './components/OpportunityCard';
import { BetsTable } from './components/BetsTable';
import { SystemLog } from './components/SystemLog';
import { ConfigPanel } from './components/ConfigPanel';
import { Activity, AlertCircle } from 'lucide-react';

export default function App() {
  const { status, isLoading, error, refetch } = useBotStatus(10000); // Poll every 10s
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [processingIds, setProcessingIds] = useState<Set<number>>(new Set());

  if (isLoading && !status) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <Activity className="w-12 h-12 text-primary animate-pulse relative z-10" />
            <div className="absolute inset-0 bg-primary/30 blur-2xl rounded-full" />
          </div>
          <p className="text-text-secondary font-mono tracking-widest text-sm animate-pulse">INICIALIZANDO TERMINAL...</p>
        </div>
      </div>
    );
  }

  if (error && !status) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="bg-surface border border-error/30 p-8 rounded-xl max-w-md text-center">
          <AlertCircle className="w-12 h-12 text-error mx-auto mb-4" />
          <h2 className="text-xl font-display font-medium text-text-primary mb-2">Erro de Conexão</h2>
          <p className="text-text-secondary mb-6">{error}</p>
          <button 
            onClick={refetch}
            className="px-6 py-2 bg-primary/10 text-primary border border-primary/30 hover:bg-primary/20 rounded-lg transition-colors font-medium"
          >
            Tentar Novamente
          </button>
        </div>
      </div>
    );
  }

  if (!status) return null;

  const handleApprove = async (id: number) => {
    setProcessingIds(prev => new Set(prev).add(id));
    await api.approveBet(id);
    await refetch();
    setProcessingIds(prev => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  const handleReject = async (id: number) => {
    setProcessingIds(prev => new Set(prev).add(id));
    await api.rejectBet(id);
    await refetch();
    setProcessingIds(prev => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  return (
    <div className="min-h-screen bg-background text-text-primary pb-12">
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8">
        <Header 
          botRunning={status.botRunning} 
          onRefresh={refetch} 
          onToggleConfig={() => setIsConfigOpen(true)}
        />
        
        <BankrollCards bankroll={status.bankroll} />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
          
          {/* Main Content Area (Opportunities) */}
          <div className="lg:col-span-2 space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-display font-bold flex items-center gap-2">
                Oportunidades Pendentes
                <span className="bg-primary/20 text-primary text-xs px-2 py-0.5 rounded-full font-mono">
                  {status.pendingOpportunities.length}
                </span>
              </h2>
            </div>
            
            {status.pendingOpportunities.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {status.pendingOpportunities.map(opp => (
                  <OpportunityCard 
                    key={opp.id} 
                    opportunity={opp} 
                    onApprove={handleApprove}
                    onReject={handleReject}
                    isProcessing={processingIds.has(opp.id)}
                  />
                ))}
              </div>
            ) : (
              <div className="bg-surface/50 border border-border rounded-xl p-12 text-center flex flex-col items-center justify-center">
                <Activity className="w-8 h-8 text-text-muted mb-4" />
                <p className="text-text-secondary font-medium">Nenhuma oportunidade encontrada.</p>
                <p className="text-text-muted text-sm mt-1">Aguardando próximo scan do mercado...</p>
              </div>
            )}

            <div className="pt-6">
              <h2 className="text-xl font-display font-bold mb-4">Apostas Recentes</h2>
              <BetsTable bets={status.bankroll.recentBets} />
            </div>
          </div>

          {/* Sidebar Area (Logs) */}
          <div className="space-y-6">
            <SystemLog logs={status.log} />
            
            {/* Quick Stats or Additional info could go here */}
            {status.bankroll.openBets.length > 0 && (
               <div className="bg-surface border border-border rounded-xl p-5">
                 <h3 className="font-display font-medium text-sm text-text-secondary uppercase tracking-wider mb-4">Apostas Abertas ({status.bankroll.openBets.length})</h3>
                 <div className="space-y-3">
                   {status.bankroll.openBets.map(bet => (
                     <div key={bet.id} className="flex justify-between items-center text-sm border-b border-border/50 pb-2 last:border-0 last:pb-0">
                       <span className="font-medium truncate pr-4">{bet.match}</span>
                       <span className="font-mono text-primary">@{bet.odd.toFixed(2)}</span>
                     </div>
                   ))}
                 </div>
               </div>
            )}
          </div>
        </div>
      </div>

      <ConfigPanel isOpen={isConfigOpen} onClose={() => setIsConfigOpen(false)} />
    </div>
  );
}
