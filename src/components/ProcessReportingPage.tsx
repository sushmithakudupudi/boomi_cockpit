import React from 'react';
import type { ExecutionRecord } from '../types/boomi';
import { ExecutionTable } from './ExecutionTable';
import { HeartPulse, RefreshCw, Layers } from 'lucide-react';
import { PageHeader } from './PageHeader';

interface ProcessReportingPageProps {
  executions: ExecutionRecord[];
  onSelectExecution: (exec: ExecutionRecord) => void;
  onOpenFlow: (exec: ExecutionRecord) => void;
  onQuickReprocess: (exec: ExecutionRecord) => void;
  onBackToCockpit: () => void;
  onRefresh: () => void;
  atomName?: string;
}

export const ProcessReportingPage: React.FC<ProcessReportingPageProps> = ({
  executions,
  onSelectExecution,
  onOpenFlow,
  onQuickReprocess,
  onBackToCockpit,
  onRefresh,
  atomName = 'ESI-PC16.easystepin.com',
}) => {
  const errorCount = executions.filter(e => e.status === 'ERROR' && !e.reprocessed).length;
  const successCount = executions.filter(e => e.status === 'SUCCESS' || e.reprocessed).length;
  const warningCount = executions.filter(e => e.status === 'WARNING').length;

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        icon={HeartPulse}
        title="HealIQ"
        description={<>Process reporting · every execution from the Boomi AtomSphere API on <span className="text-slate-300 font-medium">{atomName}</span></>}
        actions={
          <>
            <button
              onClick={onBackToCockpit}
              title="Return to Live Cockpit"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 text-xs font-semibold border border-slate-700 transition cursor-pointer"
            >
              <Layers className="w-3.5 h-3.5 text-sky-400" />
              <span>Live Cockpit</span>
            </button>
            <button
              onClick={onRefresh}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 text-xs font-semibold border border-slate-700 transition cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Refresh</span>
            </button>
          </>
        }
      />

      {/* Summary Stat Pills */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 flex items-center justify-between">
          <div>
            <div className="text-[11px] text-slate-400 font-semibold">Total Executions</div>
            <div className="text-xl font-bold text-white mt-0.5">{executions.length}</div>
          </div>
          <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-300">All Time</span>
        </div>

        <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 flex items-center justify-between">
          <div>
            <div className="text-[11px] text-emerald-400 font-semibold">Successful Runs</div>
            <div className="text-xl font-bold text-emerald-300 mt-0.5">{successCount}</div>
          </div>
          <span className="w-2 h-2 rounded-full bg-emerald-400" />
        </div>

        <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 flex items-center justify-between">
          <div>
            <div className="text-[11px] text-rose-400 font-semibold">Active Incidents</div>
            <div className="text-xl font-bold text-rose-300 mt-0.5">{errorCount}</div>
          </div>
          <span className="w-2 h-2 rounded-full bg-rose-400 animate-pulse" />
        </div>

        <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 flex items-center justify-between">
          <div>
            <div className="text-[11px] text-amber-400 font-semibold">Warnings / Discarded</div>
            <div className="text-xl font-bold text-amber-300 mt-0.5">{warningCount}</div>
          </div>
          <span className="w-2 h-2 rounded-full bg-amber-400" />
        </div>
      </div>

      {/* Full Executions Table */}
      <ExecutionTable
        executions={executions}
        onSelectExecution={onSelectExecution}
        onOpenFlow={(exec) => {
          onOpenFlow(exec);
          onBackToCockpit();
        }}
        onQuickReprocess={onQuickReprocess}
      />
    </div>
  );
};
