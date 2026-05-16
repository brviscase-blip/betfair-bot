import { useEffect, useRef } from 'react';
import type { LogEntry } from '../types/api';
import { Terminal, CheckCircle2, AlertCircle, Info, AlertTriangle } from 'lucide-react';
import { cn } from '../lib/utils';
import { format } from 'date-fns';

interface SystemLogProps {
  logs: LogEntry[];
}

export function SystemLog({ logs }: SystemLogProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [logs]);

  const getIcon = (type: LogEntry['type']) => {
    switch (type) {
      case 'success': return <CheckCircle2 className="w-3.5 h-3.5 text-success flex-shrink-0" />;
      case 'error': return <AlertCircle className="w-3.5 h-3.5 text-error flex-shrink-0" />;
      case 'warn': return <AlertTriangle className="w-3.5 h-3.5 text-warning flex-shrink-0" />;
      case 'info': return <Info className="w-3.5 h-3.5 text-primary flex-shrink-0" />;
    }
  };

  const getTextColor = (type: LogEntry['type']) => {
    switch (type) {
      case 'success': return 'text-success/90';
      case 'error': return 'text-error/90';
      case 'warn': return 'text-warning/90';
      case 'info': return 'text-text-secondary';
    }
  };

  return (
    <div className="bg-[#050914] border border-border rounded-xl flex flex-col overflow-hidden h-[300px]">
      <div className="bg-surface/50 border-b border-border/50 px-4 py-2 flex items-center gap-2">
        <Terminal className="w-4 h-4 text-text-muted" />
        <span className="text-xs font-mono font-medium text-text-secondary tracking-wider uppercase">System Log</span>
      </div>
      
      <div 
        ref={containerRef}
        className="flex-1 overflow-y-auto p-4 space-y-1 scroll-smooth"
      >
        {logs.slice().reverse().map((log, i) => (
          <div key={i} className="flex items-start gap-2 text-[13px] font-mono hover:bg-white/5 py-0.5 rounded px-1 transition-colors">
            <span className="text-text-muted/50 flex-shrink-0">
              [{format(new Date(log.timestamp), 'HH:mm:ss')}]
            </span>
            {getIcon(log.type)}
            <span className={cn(getTextColor(log.type))}>
              {log.msg}
            </span>
          </div>
        ))}
        {logs.length === 0 && (
          <p className="text-text-muted font-mono text-sm text-center mt-4">Aguardando eventos...</p>
        )}
      </div>
    </div>
  );
}
