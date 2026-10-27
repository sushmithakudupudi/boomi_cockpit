import React, { useMemo } from 'react';
import { History } from 'lucide-react';
import type { ExecutionRecord } from '../types/boomi';

// Failure history built only from real execution records: failures per day, by error type, and by process.

const DAYS = 7;

const classify = (msg?: string): string => {
  const m = (msg || '').toLowerCase();
  if (/429|too many requests|rate limit|request_limit/.test(m)) return 'Rate limit (429)';
  if (/timeout|timed out/.test(m)) return 'Timeout';
  if (/401|403|unauthori|forbidden|credential|authentication/.test(m)) return 'Authentication';
  if (/50\d|service unavailable|bad gateway|gateway/.test(m)) return 'Server error (5xx)';
  if (/parse|invalid|schema|malformed|xml|json|edi/.test(m)) return 'Data / format';
  if (/connect|refused|unreachable|dns|socket/.test(m)) return 'Connectivity';
  return 'Other';
};

const dayKey = (d: Date) => d.toISOString().slice(0, 10);

interface Props {
  executions: ExecutionRecord[];
  onSelectProcess?: (exec: ExecutionRecord) => void;
}

export const FailureHistory: React.FC<Props> = ({ executions, onSelectProcess }) => {
  const data = useMemo(() => {
    const failures = executions.filter((e) => e.status === 'ERROR');

    const today = new Date();
    const days: { key: string; label: string; count: number }[] = [];
    for (let i = DAYS - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setUTCDate(d.getUTCDate() - i);
      days.push({ key: dayKey(d), label: d.toLocaleDateString([], { weekday: 'short' }), count: 0 });
    }
    failures.forEach((f) => {
      const day = days.find((d) => d.key === (f.startedAt || '').slice(0, 10));
      if (day) day.count += 1;
    });

    const types = new Map<string, number>();
    const processes = new Map<string, { count: number; last: string; sample: ExecutionRecord }>();
    failures.forEach((f) => {
      const t = classify(f.errorMessage);
      types.set(t, (types.get(t) || 0) + 1);
      const p = processes.get(f.processName);
      if (!p) processes.set(f.processName, { count: 1, last: f.startedAt, sample: f });
      else {
        p.count += 1;
        if ((f.startedAt || '') > p.last) { p.last = f.startedAt; p.sample = f; }
      }
    });

    return {
      total: failures.length,
      days,
      maxDay: Math.max(1, ...days.map((d) => d.count)),
      types: [...types.entries()].sort((a, b) => b[1] - a[1]),
      processes: [...processes.entries()].sort((a, b) => b[1].count - a[1].count),
    };
  }, [executions]);

  return (
    <div className="rounded-2xl bg-boomi-card border border-boomi-cardBorder p-4 shadow-lg space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <History className="w-4 h-4 text-boomi-accent" />
          <h3 className="text-sm font-bold text-white">Failure history</h3>
        </div>
        <span className="text-[11px] text-slate-400">{data.total} failed execution{data.total === 1 ? '' : 's'} on record</span>
      </div>

      {data.total === 0 ? (
        <p className="text-xs text-slate-400">No failed executions on record.</p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Failures per day */}
          <div>
            <div className="text-[11px] uppercase tracking-wider font-bold text-slate-500 mb-2">Last {DAYS} days</div>
            <div className="flex items-end gap-1.5 h-20">
              {data.days.map((d) => (
                <div key={d.key} className="flex-1 flex flex-col items-center justify-end gap-1" title={`${d.key}: ${d.count} failed`}>
                  <span className="text-[10px] text-slate-400">{d.count || ''}</span>
                  <div
                    className={`w-full rounded-t ${d.count ? 'bg-rose-500/70' : 'bg-slate-800'}`}
                    style={{ height: `${Math.max(3, (d.count / data.maxDay) * 52)}px` }}
                  />
                  <span className="text-[10px] text-slate-500">{d.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* By error type */}
          <div>
            <div className="text-[11px] uppercase tracking-wider font-bold text-slate-500 mb-2">By error type</div>
            <ul className="space-y-1.5">
              {data.types.map(([type, count]) => (
                <li key={type} className="text-xs">
                  <div className="flex justify-between text-slate-300">
                    <span>{type}</span>
                    <span className="font-mono text-slate-400">{count}</span>
                  </div>
                  <div className="h-1 rounded bg-slate-800 mt-0.5">
                    <div className="h-1 rounded bg-amber-400/70" style={{ width: `${(count / data.total) * 100}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          </div>

          {/* By process */}
          <div>
            <div className="text-[11px] uppercase tracking-wider font-bold text-slate-500 mb-2">By process</div>
            <ul className="space-y-1.5">
              {data.processes.slice(0, 5).map(([name, info]) => (
                <li key={name}>
                  <button
                    onClick={() => onSelectProcess?.(info.sample)}
                    className="w-full flex justify-between gap-2 text-xs text-slate-300 hover:text-white cursor-pointer text-left"
                    title="Open this process in the topology view"
                  >
                    <span className="truncate">{name}</span>
                    <span className="font-mono text-slate-400 shrink-0">{info.count}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
};
