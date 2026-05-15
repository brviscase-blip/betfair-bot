import { Settings2, X, Percent, DollarSign, Save } from 'lucide-react';
import type { Config } from '../types/api';
import { useEffect, useState } from 'react';
import { api } from '../services/api';

interface ConfigPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ConfigPanel({ isOpen, onClose }: ConfigPanelProps) {
  const [config, setConfig] = useState<Config | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      api.getConfig().then(setConfig);
    }
  }, [isOpen]);

  const handleSave = async (updatedConfig: Config) => {
    setIsSaving(true);
    await api.updateConfig(updatedConfig);
    setIsSaving(false);
  };

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
                
                <div className="bg-background border border-border/50 rounded-lg p-4">
                  <label className="text-sm font-medium mb-1.5 block">Stop Loss (R$)</label>
                  <input 
                    type="number"
                    value={config.stopLoss}
                    onChange={e => setConfig({...config, stopLoss: parseFloat(e.target.value)})}
                    className="w-full bg-surface-hover border border-border rounded px-3 py-1.5 font-mono"
                  />
                </div>

                <div className="bg-background border border-border/50 rounded-lg p-4">
                  <label className="text-sm font-medium mb-1.5 block">Stop Gain (R$)</label>
                  <input 
                    type="number"
                    value={config.stopGain}
                    onChange={e => setConfig({...config, stopGain: parseFloat(e.target.value)})}
                    className="w-full bg-surface-hover border border-border rounded px-3 py-1.5 font-mono"
                  />
                </div>

                <div className="bg-background border border-border/50 rounded-lg p-4">
                  <label className="text-sm font-medium mb-1.5 block">Meta Mensal (R$)</label>
                  <input 
                    type="number"
                    value={config.metaMensal}
                    onChange={e => setConfig({...config, metaMensal: parseFloat(e.target.value)})}
                    className="w-full bg-surface-hover border border-border rounded px-3 py-1.5 font-mono"
                  />
                </div>
              </div>

              <button
                onClick={() => handleSave(config)}
                disabled={isSaving}
                className="w-full bg-primary text-surface font-bold py-3 rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                {isSaving ? 'Salvando...' : <><Save className="w-4 h-4" /> Salvar Configurações</>}
              </button>
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
