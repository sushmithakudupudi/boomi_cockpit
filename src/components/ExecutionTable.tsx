import React, { useState } from 'react';
import type { ExecutionRecord, ExecutionStatus } from '../types/boomi';
import { 
  Bot, 
  GitBranch, 
  RotateCw, 
  CheckCircle2, 
  AlertTriangle, 
  Eye,
  Search
} from 'lucide-react';

interface ExecutionTableProps {
  executions: ExecutionRecord[];
  onSelectExecution: (exec: ExecutionRecord) => void;
  onOpenFlow: (exec: ExecutionRecord) => void;
  onQuickReprocess: (exec: ExecutionRecord) => void;
}

export const ExecutionTable: React.FC<ExecutionTableProps> = ({
  executions,
  onSelectExecution,
  onOpenFlow,
  onQuickReprocess,
}) => {
  const [filter, setFilter] = useState<'ALL' | ExecutionStatus>('ALL');
  const [search, setSearch] = useState('');

  const filteredExecutions = executions.filter((item) => {
    const matchesFilter = filter === 'ALL' || item.status === filter;
    const matchesSearch = 
      item.processName.toLowerCase().includes(search.toLowerCase()) ||
      item.id.toLowerCase().includes(search.toLowerCase()) ||
      item.atomName.toLowerCase().includes(search.toLowerCase()) ||
      (item.errorMessage && item.errorMessage.toLowerCase().includes(search.toLowerCase()));
    return matchesFilter && matchesSearch;
  });

  const getStatusBadge = (status: ExecutionStatus, reprocessed?: boolean) => {
    if (reprocessed) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> Auto-Healed
        </span>
      );
    }

    switch (status) {
      case 'SUCCESS':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
            <CheckCircle2 className="w-3.5 h-3.5" /> Success
          </span>
        );
      case 'ERROR':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-500/15 text-rose-400 border border-rose-500/30">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-pulse" /> Error
          </span>
        );
      case 'WARNING':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30">
            <AlertTriangle className="w-3.5 h-3.5" /> Warning
          </span>
        );
      case 'IN_PROGRESS':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-sky-500/15 text-sky-400 border border-sky-500/30">
            <RotateCw className="w-3.5 h-3.5 animate-spin" /> Running
          </span>
        );
    }
  };

  return (
    <div className="bg-boomi-card rounded-2xl border border-boomi-cardBorder shadow-xl overflow-hidden">
      {/* Table Header & Filters */}
      <div className="p-4 sm:p-5 border-b border-boomi-cardBorder flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <span>Process Reporting Live Feed</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700">
              {filteredExecutions.length} Executions
            </span>
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Real-time telemetry and error triage from Boomi AtomSphere API
          </p>
        </div>

        {/* Filter & Search */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input 
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search executions..."
              className="pl-8 pr-3 py-1 text-xs rounded-lg bg-slate-900 border border-slate-700 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-boomi-accent"
            />
          </div>

          <div className="flex items-center gap-1.5">
            {(['ALL', 'ERROR', 'WARNING', 'SUCCESS'] as const).map((status) => (
              <button
                key={status}
                onClick={() => setFilter(status)}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
                  filter === status
                    ? 'bg-boomi-blue text-white shadow-md shadow-blue-500/20'
                    : 'bg-slate-900/80 text-slate-400 hover:text-slate-200 border border-slate-800'
                }`}
              >
                {status === 'ALL' ? 'All' : status}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Table Body */}
      <div className="lg:overflow-x-auto">
        <table className="block lg:table w-full text-left text-xs">
          <thead className="hidden lg:table-header-group bg-slate-900/70 text-slate-400 font-semibold uppercase tracking-wider text-[10px] border-b border-boomi-cardBorder">
            <tr>
              <th className="py-3.5 px-4">Process Name & ID</th>
              <th className="py-3.5 px-4">Status</th>
              <th className="py-3.5 px-4">Atom / Environment</th>
              <th className="py-3.5 px-4">Documents</th>
              <th className="py-3.5 px-4">Duration</th>
              <th className="py-3.5 px-4">Started</th>
              <th className="py-3.5 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="block lg:table-row-group divide-y divide-slate-800/60">
            {filteredExecutions.map((exec) => {
              const isError = exec.status === 'ERROR' && !exec.reprocessed;

              return (
                <tr 
                  key={exec.id} 
                  className={`grid grid-cols-2 xs:grid-cols-4 gap-x-3 gap-y-2 p-4 lg:p-0 lg:table-row transition-colors hover:bg-slate-800/40 ${
                    isError ? 'bg-rose-950/10' : ''
                  }`}
                >
                  {/* Process Name */}
                  <td className="col-span-2 xs:col-span-3 lg:py-3.5 lg:px-4 min-w-0">
                    <div className="flex flex-col min-w-0">
                      <span className="font-semibold text-slate-200 text-xs">
                        {exec.processName}
                      </span>
                      <span className="text-[11px] font-mono text-slate-500 break-all">
                        {exec.id}
                      </span>
                      {exec.errorMessage && (
                        <span className="text-[11px] text-rose-300 mt-1 line-clamp-1 max-w-sm">
                          {exec.errorMessage}
                        </span>
                      )}
                    </div>
                  </td>

                  {/* Status Badge */}
                  <td className="col-span-2 xs:col-span-1 row-start-1 xs:row-start-auto justify-self-start xs:justify-self-end lg:justify-self-auto lg:py-3.5 lg:px-4 whitespace-nowrap">
                    {getStatusBadge(exec.status, exec.reprocessed)}
                  </td>

                  {/* Atom */}
                  <td className="col-span-2 xs:col-span-1 lg:py-3.5 lg:px-4 lg:whitespace-nowrap min-w-0">
                    <span className="lg:hidden block text-[9px] font-bold uppercase tracking-wider text-slate-500 mb-0.5">Atom</span>
                    <div className="flex flex-col min-w-0">
                      <span className="text-slate-300 font-medium truncate">{exec.atomName}</span>
                      <span className="text-[10px] text-slate-500">{exec.environment}</span>
                    </div>
                  </td>

                  {/* Docs in/out */}
                  <td className="lg:py-3.5 lg:px-4 whitespace-nowrap font-mono text-slate-300">
                    <span className="lg:hidden block text-[9px] font-bold uppercase tracking-wider text-slate-500 mb-0.5">Documents</span>
                    <span className="text-slate-400">{exec.inboundDocs}</span> in / 
                    <span className={isError ? "text-rose-400 font-bold ml-1" : "text-slate-300 ml-1"}>
                      {exec.outboundDocs}
                    </span> out
                  </td>

                  {/* Duration */}
                  <td className="lg:py-3.5 lg:px-4 whitespace-nowrap font-mono text-slate-400">
                    <span className="lg:hidden block text-[9px] font-bold uppercase tracking-wider text-slate-500 mb-0.5">Duration</span>
                    {(exec.durationMs / 1000).toFixed(2)}s
                  </td>

                  {/* Timestamp */}
                  <td className="lg:py-3.5 lg:px-4 whitespace-nowrap text-slate-400 text-[11px]">
                    <span className="lg:hidden block text-[9px] font-bold uppercase tracking-wider text-slate-500 mb-0.5">Started</span>
                    {new Date(exec.startedAt).toLocaleTimeString()}
                  </td>

                  {/* Action Buttons */}
                  <td className="col-span-2 xs:col-span-4 lg:py-3.5 lg:px-4 lg:text-right whitespace-nowrap">
                    <div className="flex items-center justify-start lg:justify-end gap-2">
                      {isError ? (
                        <button
                          onClick={() => onSelectExecution(exec)}
                          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-gradient-to-r from-boomi-blue to-sky-500 hover:from-blue-600 hover:to-sky-400 text-white font-semibold text-xs shadow-md shadow-sky-950 transition cursor-pointer"
                        >
                          <Bot className="w-3.5 h-3.5" />
                          <span>Triage with Companion</span>
                        </button>
                      ) : (
                        <button
                          onClick={() => onSelectExecution(exec)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition cursor-pointer"
                          title="Inspect Execution Details"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                      )}

                      <button
                        onClick={() => onOpenFlow(exec)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-boomi-accent hover:bg-slate-800 transition cursor-pointer"
                        title="View Process Topology Flow"
                      >
                        <GitBranch className="w-4 h-4" />
                      </button>

                      {isError && (
                        <button
                          onClick={() => onQuickReprocess(exec)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-400 hover:bg-slate-800 transition cursor-pointer"
                          title="Reprocess Document"
                        >
                          <RotateCw className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
