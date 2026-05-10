import { Activity, Power, RefreshCw, Settings } from 'lucide-react';
import { cn } from '../lib/utils';
import { api } from '../services/api';

interface HeaderProps {
  botRunning: boolean;
  onRefresh: () => void;
  onToggleConfig: () => void;
}

export function Header({ botRunning, onRefresh, onToggleConfig }: HeaderProps) {
  
  const handleToggleBot = async () => {
    await api.toggleBot();
    onRefresh(); // Trigger a refetch immediately
  };

  const handleScan = async () => {
    await api.scanManual();
    onRefresh();
  };

  return (
    <header className="flex items-center justify-between py-6 mb-8 border-b border-border/50">
      <div className="flex items-center gap-3">
        <div className="p-2.5 bg-primary/10 rounded-xl relative">
          <Activity className="w-6 h-6 text-primary relative z-10" />
          <div className="absolute inset-0 bg-primary/20 blur-xl rounded-full" />
        </div>
        <div>
          <h1 className="font-display font-bold text-2xl tracking-tight text-glow">BetBot AI</h1>
          <p className="text-sm font-mono text-text-secondary">Terminal de Operações</p>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-3 bg-surface border border-border px-4 py-2 rounded-lg">
          <div className={cn("w-2.5 h-2.5 rounded-full animate-pulse", botRunning ? "bg-success" : "bg-error")} />
          <span className="font-mono text-sm font-medium">
            {botRunning ? "Bot Ativo" : "Bot Pausado"}
          </span>
          <button 
            onClick={handleToggleBot}
            className={cn(
              "ml-2 flex items-center justify-center p-1.5 rounded-md transition-colors",
              botRunning ? "bg-error/10 text-error hover:bg-error/20" : "bg-success/10 text-success hover:bg-success/20"
            )}
            title={botRunning ? "Pausar Bot" : "Iniciar Bot"}
          >
            <Power className="w-4 h-4" />
          </button>
        </div>

        <button 
          onClick={handleScan}
          className="flex items-center gap-2 px-4 py-2 bg-surface hover:bg-surface-hover border border-border rounded-lg text-sm font-medium transition-colors"
        >
          <RefreshCw className="w-4 h-4 text-primary" />
          Scan Manual
        </button>
        
        <button
          onClick={onToggleConfig}
          className="p-2.5 bg-surface hover:bg-surface-hover border border-border rounded-lg transition-colors text-text-secondary hover:text-primary"
        >
          <Settings className="w-5 h-5" />
        </button>
      </div>
    </header>
  );
}
