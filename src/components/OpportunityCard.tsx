import { Check, X, ShieldAlert, BrainCircuit, Clock } from 'lucide-react';
import { formatCurrency, formatTime, cn } from '../lib/utils';
import type { Opportunity } from '../types/api';

interface OpportunityCardProps {
  opportunity: Opportunity;
  onApprove: (id: number) => void;
  onReject: (id: number) => void;
  isProcessing?: boolean;
}

export function OpportunityCard({ opportunity, onApprove, onReject, isProcessing = false }: OpportunityCardProps) {
  
  const getRiskColor = (risk: string) => {
    switch (risk) {
      case 'LOW': return 'bg-success/20 text-success border-success/30';
      case 'MEDIUM': return 'bg-warning/20 text-warning border-warning/30';
      case 'HIGH': return 'bg-error/20 text-error border-error/30';
      default: return 'bg-border text-text-secondary border-border';
    }
  };

  const getConfidenceColor = (conf: number) => {
    if (conf >= 75) return 'bg-success';
    if (conf >= 60) return 'bg-warning';
    return 'bg-error';
  };

  return (
    <div className="bg-surface border border-border rounded-xl p-5 hover:border-primary/50 transition-colors flex flex-col h-full">
      
      {/* Header */}
      <div className="flex justify-between items-start mb-4">
        <div>
          <h4 className="font-display font-medium text-lg text-text-primary leading-tight mb-1">
            {opportunity.match}
          </h4>
          <div className="flex items-center gap-2 text-xs font-mono text-text-muted">
            <Clock className="w-3.5 h-3.5" />
            <span>{formatTime(opportunity.startTime)}</span>
          </div>
        </div>
        <div className={cn("px-2 py-1 rounded text-[10px] font-mono font-bold tracking-wider border", getRiskColor(opportunity.riskLevel))}>
          RISK: {opportunity.riskLevel}
        </div>
      </div>

      {/* Details Grid */}
      <div className="grid grid-cols-2 gap-3 mb-4 flex-grow">
        <div className="bg-background rounded-lg p-3 border border-border/50">
          <p className="text-[10px] uppercase tracking-wider text-text-muted mb-1">Seleção</p>
          <p className="font-medium text-sm">
            <span className={cn("inline-block px-1.5 py-0.5 rounded text-[10px] font-bold mr-1.5", 
              opportunity.betType === 'BACK' ? 'bg-primary/20 text-primary' : 'bg-pink-500/20 text-pink-500'
            )}>
              {opportunity.betType}
            </span>
            {opportunity.selection}
          </p>
        </div>
        
        <div className="bg-background rounded-lg p-3 border border-border/50">
          <p className="text-[10px] uppercase tracking-wider text-text-muted mb-1">Odds Alvo / Saída</p>
          <div className="flex items-center gap-2">
            <span className="font-mono text-primary font-medium">@{opportunity.targetOdd.toFixed(2)}</span>
            <span className="text-text-muted text-xs">→</span>
            <span className="font-mono text-text-secondary text-sm">@{opportunity.exitOdd.toFixed(2)}</span>
          </div>
        </div>

        <div className="bg-background rounded-lg p-3 border border-border/50 col-span-2">
          <div className="flex justify-between mb-1.5">
            <p className="text-[10px] uppercase tracking-wider text-text-muted flex items-center gap-1">
              <BrainCircuit className="w-3 h-3" /> Confiança da IA
            </p>
            <span className="text-xs font-mono">{opportunity.confidence}%</span>
          </div>
          <div className="h-1.5 w-full bg-border rounded-full overflow-hidden">
            <div 
              className={cn("h-full transition-all duration-500", getConfidenceColor(opportunity.confidence))}
              style={{ width: `${opportunity.confidence}%` }}
            />
          </div>
        </div>
      </div>

      {/* Info & Actions */}
      <div className="mt-auto">
        <p className="text-xs text-text-secondary italic line-clamp-2 mb-4 h-[32px] leading-snug bg-background/50 p-2 rounded border-l-2 border-primary/50">
          "{opportunity.reasoning}"
        </p>
        
        <div className="flex items-center justify-between mt-4 pt-4 border-t border-border/50">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-text-muted">Stake Sugerida</p>
            <p className="font-mono font-medium">{formatCurrency(opportunity.stake)}</p>
          </div>
          
          <div className="flex gap-2">
            <button
              onClick={() => onReject(opportunity.id)}
              disabled={isProcessing}
              className="px-3 py-1.5 rounded-lg border border-border hover:bg-error/10 hover:text-error hover:border-error/30 transition-colors disabled:opacity-50 flex items-center justify-center font-medium text-sm"
              aria-label="Rejeitar"
            >
              <X className="w-4 h-4 mr-1" /> Rejeitar
            </button>
            <button
              onClick={() => onApprove(opportunity.id)}
              disabled={isProcessing}
              className="px-4 py-1.5 rounded-lg bg-primary/10 text-primary border border-primary/30 hover:bg-primary/20 hover:border-primary/50 transition-colors disabled:opacity-50 shadow-[0_0_10px_rgba(34,211,238,0.1)] hover:shadow-[0_0_15px_rgba(34,211,238,0.2)] flex items-center justify-center font-medium text-sm"
            >
              <Check className="w-4 h-4 mr-1" /> Aprovar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
