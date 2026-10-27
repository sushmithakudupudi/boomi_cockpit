import React from 'react';
import type { ExecutionRecord, ExecutionStatus } from '../types/boomi';
import { 
  Activity, 
  CheckCircle2, 
  AlertTriangle, 
  RotateCw, 
  ArrowRight,
  Sparkles,
  Layers,
  Clock
} from 'lucide-react';

interface LiveProcessFeedProps {
  executions: ExecutionRecord[];
  onSelectExecution: (exec: ExecutionRecord) => void;
  onOpenFlow: (exec: ExecutionRecord) => void;
  onViewAllExecutions: () => void;
  selectedProcessId?: string;
}

export const LiveProcessFeed: React.FC<LiveProcessFeedProps> = ({
  executions,
  onSelectExecution,
  onOpenFlow,
  onViewAllExecutions,
  selectedProcessId,
}) => {
  // Extract distinct processes from the latest executions so we don't repeat the same process 50 times
  const distinctProcessMap = new Map<string, ExecutionRecord>();
  for (const exec of executions) {
    if (!distinctProcessMap.has(exec.processName)) {
      distinctProcessMap.set(exec.processName, exec);
    }
  }
  const liveProcesses = Array.from(distinctProcessMap.values());

  const getStatusBadge = (status: ExecutionStatus, reprocessed?: boolean) => {
    if (reprocessed) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> Resolved
        </span>
      );
    }

    switch (status) {
      case 'SUCCESS':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
            <CheckCircle2 className="w-3.5 h-3.5" /> Healthy
          </span>
        );
      case 'ERROR':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-rose-500/15 text-rose-400 border border-rose-500/30">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-pulse" /> Incident
          </span>
        );
      case 'WARNING':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30">
            <AlertTriangle className="w-3.5 h-3.5" /> Warning
          </span>
        );
      case 'IN_PROGRESS':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-sky-500/15 text-sky-400 border border-sky-500/30">
            <RotateCw className="w-3.5 h-3.5 animate-spin" /> Running
          </span>
        );
    }
  };

  const formatTime = (isoString: string) => {
    try {
      const date = new Date(isoString);
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch {
      return isoString;
    }
  };

  return (
    <div className="bg-boomi-card rounded-2xl border border-boomi-cardBorder shadow-xl overflow-hidden">
      {/* Header */}
      <div className="p-4 sm:p-5 border-b border-boomi-cardBorder flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-boomi-blue/15 border border-boomi-blue/30 text-boomi-accent">
            <Activity className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-white">Live Process Reporting</h3>
              <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full bg-sky-500/15 text-sky-300 border border-sky-500/30">
                {liveProcesses.length} Active Processes
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Live status & error triage for integration processes reporting on the Atom runtime
            </p>
          </div>
        </div>

        {/* View All Executions CTA */}
        <button
          onClick={onViewAllExecutions}
          className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-sky-400 hover:text-sky-300 text-xs font-semibold border border-slate-700/80 hover:border-sky-500/40 transition cursor-pointer shadow-sm group"
        >
          <span>View All {executions.length} Executions</span>
          <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
        </button>
      </div>

      {/* Grid of Distinct Live Reporting Processes */}
      <div className="divide-y divide-slate-800/60">
        {liveProcesses.map((exec) => {
          const isError = exec.status === 'ERROR' && !exec.reprocessed;
          const isSelected = selectedProcessId === exec.processId;

          return (
            <div 
              key={exec.processName} 
              className={`p-4 sm:px-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-colors hover:bg-slate-800/30 ${
                isSelected ? 'bg-sky-950/20 border-l-2 border-boomi-accent' : isError ? 'bg-rose-950/15' : ''
              }`}
            >
              {/* Process Info */}
              <div className="flex items-start gap-3.5 min-w-0">
                <div className="pt-0.5">
                  {getStatusBadge(exec.status, exec.reprocessed)}
                </div>

                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-slate-100 text-xs sm:text-sm truncate">
                      {exec.processName}
                    </span>
                    <span className="text-[10px] font-mono text-slate-500 bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
                      ID: {exec.processId.slice(0, 8)}...
                    </span>
                  </div>

                  {exec.errorMessage ? (
                    <p className="text-xs text-rose-300 font-mono mt-1 line-clamp-1">
                      {exec.errorMessage}
                    </p>
                  ) : (
                    <p className="text-xs text-slate-400 mt-1">
                      Operating normally on atom <span className="text-slate-300 font-medium">{exec.atomName}</span> ({exec.environment})
                    </p>
                  )}

                  <div className="flex items-center gap-4 mt-2 text-[11px] text-slate-400">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3 text-slate-500" />
                      Last run: <strong className="text-slate-300">{formatTime(exec.startedAt)}</strong>
                    </span>
                    <span>•</span>
                    <span>Docs: <strong className="text-slate-300">{exec.inboundDocs} in / {exec.outboundDocs} out</strong></span>
                    <span>•</span>
                    <span>Duration: <strong className="text-slate-300">{(exec.durationMs / 1000).toFixed(2)}s</strong></span>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                {isError && (
                  <button
                    onClick={() => onSelectExecution(exec)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 font-semibold text-xs border border-rose-500/30 transition cursor-pointer"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-rose-300" />
                    <span>Triage Error</span>
                  </button>
                )}

                <button
                  onClick={() => onOpenFlow(exec)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition cursor-pointer ${
                    isSelected 
                      ? 'bg-boomi-blue text-white border-blue-400 shadow-md shadow-blue-500/20' 
                      : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border-slate-700/80 hover:text-white'
                  }`}
                >
                  <Layers className="w-3.5 h-3.5 text-sky-400" />
                  <span>{isSelected ? 'Canvas Active' : 'Inspect Canvas'}</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer Banner */}
      <div className="p-3.5 bg-slate-900/90 border-t border-boomi-cardBorder flex items-center justify-between text-xs text-slate-400 px-5">
        <span>Showing distinct active processes. 50 raw execution records logged.</span>
        <button
          onClick={onViewAllExecutions}
          className="text-sky-400 hover:text-sky-300 font-semibold flex items-center gap-1 transition"
        >
          <span>Open Full Process Reporting Page</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
