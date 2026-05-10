import { Settings2, X, Percent, DollarSign } from 'lucide-react';
import type { Config } from '../types/api';
import { formatCurrency } from '../lib/utils';
import { useEffect, useState } from 'react';
import { api } from '../services/api';

interface ConfigPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ConfigPanel({ isOpen, onClose }: ConfigPanelProps) {
  const [config, setConfig] = useState<Config | null>(null);

  useEffect(() => {
    if (isOpen && !config) {
      api.getConfig().then(setConfig);
    }
  }, [isOpen, config]);

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-40" onClick={onClose} />
      <div className="fixed right-0 top-0 h-full w-full max-w-sm bg-surface border-l border-border z-50 shadow-2xl animate-fade-in flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-border/50">
          <div className="flex items-center gap-2">
            <Settings2 className="w-5 h-5 text-primary" />
            <h2 className="font-display font-medium text-lg">Configurações</h2>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 hover:bg-white/10 rounded-lg transition-colors text-text-secondary"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 flex-1 overflow-y-auto">
          {config ? (
            <div className="space-y-6">
              
              <div className="space-y-4">
                <h3 className="text-sm font-medium text-text-secondary uppercase tracking-wider">Gestão de Risco</h3>
                
                <div className="bg-background border border-border/50 rounded-lg p-3">
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-sm font-medium">Stop Loss Diário</label>
                    <Percent className="w-3.5 h-3.5 text-text-muted" />
                  </div>
                  <div className="text-error font-mono font-bold text-lg">{config.stopLossDailyPct}%</div>
                </div>

                <div className="bg-background border border-border/50 rounded-lg p-3">
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-sm font-medium">Stop Gain Diário</label>
                    <Percent className="w-3.5 h-3.5 text-text-muted" />
                  </div>
                  <div className="text-success font-mono font-bold text-lg">{config.stopGainDailyPct}%</div>
                </div>

                <div className="bg-background border border-border/50 rounded-lg p-3">
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-sm font-medium">Meta Mensal</label>
                    <Percent className="w-3.5 h-3.5 text-text-muted" />
                  </div>
                  <div className="text-primary font-mono font-bold text-lg">{config.monthlyGoalPct}%</div>
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="text-sm font-medium text-text-secondary uppercase tracking-wider">Operacional</h3>
                
                <div className="bg-background border border-border/50 rounded-lg p-3">
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-sm font-medium">Stake Mínima</label>
                    <DollarSign className="w-3.5 h-3.5 text-text-muted" />
                  </div>
                  <div className="text-text-primary font-mono font-bold text-lg">{formatCurrency(config.minStake)}</div>
                  <p className="text-xs text-text-muted mt-1">Valor base sugerido para operações LOW risk.</p>
                </div>
              </div>

              <div className="p-4 bg-primary/10 border border-primary/20 rounded-lg mt-8">
                <p className="text-[13px] text-primary/80 text-center">
                  A edição de parâmetros está desabilitada no modo de visualização. Altere diretamente na VPS.
                </p>
              </div>

            </div>
          ) : (
            <div className="flex justify-center py-10">
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          )}
        </div>
      </div>
    </>
  );
}
