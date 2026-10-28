import React, { useMemo, useState } from 'react';
import { History } from 'lucide-react';
import type { ExecutionRecord } from '../types/boomi';

type RangeKey = '1h' | '5h' | '12h' | 'day' | 'yesterday' | 'week' | '2weeks' | 'month' | 'lastMonth' | '3months' | 'year';
const RANGES: { key: RangeKey; label: string }[] = [
  { key: '1h', label: 'Last hour' }, { key: '5h', label: 'Last 5 hours' }, { key: '12h', label: 'Last 12 hours' },
  { key: 'day', label: 'Last 24 hours' }, { key: 'yesterday', label: 'Yesterday' }, { key: 'week', label: 'Last 7 days' },
  { key: '2weeks', label: 'Last 2 weeks' }, { key: 'month', label: 'Last 30 days' }, { key: 'lastMonth', label: 'Last month' },
  { key: '3months', label: 'Last 3 months' }, { key: 'year', label: 'Last year' },
];

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

const getWindow = (range: RangeKey, now: Date) => {
  const start = new Date(now);
  const end = new Date(now);
  if (range === 'yesterday') {
    start.setHours(0, 0, 0, 0); start.setDate(start.getDate() - 1);
    end.setTime(start.getTime()); end.setDate(end.getDate() + 1);
    return { start, end, bucket: 'hour' as const };
  }
  if (range === 'lastMonth') {
    start.setDate(1); start.setHours(0, 0, 0, 0); start.setMonth(start.getMonth() - 1);
    end.setDate(1); end.setHours(0, 0, 0, 0);
    return { start, end, bucket: 'day' as const };
  }
  const hours: Partial<Record<RangeKey, number>> = { '1h': 1, '5h': 5, '12h': 12, day: 24 };
  if (hours[range]) {
    start.setTime(now.getTime() - hours[range]! * 60 * 60 * 1000);
    return { start, end, bucket: 'hour' as const };
  }
  const days: Partial<Record<RangeKey, number>> = { week: 7, '2weeks': 14, month: 30, '3months': 90, year: 365 };
  start.setTime(now.getTime() - days[range]! * 24 * 60 * 60 * 1000);
  return { start, end, bucket: range === 'year' ? 'month' as const : range === '3months' ? 'week' as const : 'day' as const };
};

interface Props {
  executions: ExecutionRecord[];
  onSelectProcess?: (exec: ExecutionRecord) => void;
}

export const FailureHistory: React.FC<Props> = ({ executions, onSelectProcess }) => {
  const [range, setRange] = useState<RangeKey>('week');
  const data = useMemo(() => {
    const now = new Date();
    const window = getWindow(range, now);
    const failures = executions.filter((e) => {
      if (e.status !== 'ERROR' || !e.startedAt) return false;
      const time = new Date(e.startedAt).getTime();
      return Number.isFinite(time) && time >= window.start.getTime() && time < window.end.getTime();
    });
    const buckets = new Map<string, { key: string; label: string; count: number }>();
    const cursor = new Date(window.start);
    if (window.bucket === 'hour') {
      cursor.setMinutes(0, 0, 0);
      while (cursor < window.end) {
        const key = cursor.toISOString().slice(0, 13);
        buckets.set(key, { key, label: cursor.toLocaleTimeString([], { hour: 'numeric' }), count: 0 });
        cursor.setHours(cursor.getHours() + 1);
      }
    } else if (window.bucket === 'day') {
      cursor.setHours(0, 0, 0, 0);
      while (cursor < window.end) {
        const key = dayKey(cursor);
        buckets.set(key, { key, label: cursor.toLocaleDateString([], { month: 'short', day: 'numeric' }), count: 0 });
        cursor.setDate(cursor.getDate() + 1);
      }
    } else if (window.bucket === 'week') {
      cursor.setHours(0, 0, 0, 0);
      cursor.setDate(cursor.getDate() - cursor.getDay());
      while (cursor < window.end) {
        const key = `${cursor.getFullYear()}-${cursor.getMonth()}-${cursor.getDate()}`;
        buckets.set(key, { key, label: cursor.toLocaleDateString([], { month: 'short', day: 'numeric' }), count: 0 });
        cursor.setDate(cursor.getDate() + 7);
      }
    } else {
      cursor.setDate(1); cursor.setHours(0, 0, 0, 0);
      while (cursor < window.end) {
        const key = `${cursor.getFullYear()}-${cursor.getMonth()}`;
        buckets.set(key, { key, label: cursor.toLocaleDateString([], { month: 'short' }), count: 0 });
        cursor.setMonth(cursor.getMonth() + 1);
      }
    }
    failures.forEach((f) => {
      const date = new Date(f.startedAt);
      const key = window.bucket === 'hour' ? date.toISOString().slice(0, 13)
        : window.bucket === 'day' ? dayKey(date)
          : window.bucket === 'week' ? (() => { const d = new Date(date); d.setDate(d.getDate() - d.getDay()); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; })()
            : `${date.getFullYear()}-${date.getMonth()}`;
      const bucket = buckets.get(key);
      if (bucket) bucket.count += 1;
    });
    const chart = [...buckets.values()];
    const labelCount = Math.min(7, chart.length);
    const axisLabels = Array.from({ length: labelCount }, (_, i) => chart[Math.round(i * (chart.length - 1) / Math.max(1, labelCount - 1))]);

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
      chart,
      axisLabels,
      maxDay: Math.max(1, ...chart.map((d) => d.count)),
      types: [...types.entries()].sort((a, b) => b[1] - a[1]),
      processes: [...processes.entries()].sort((a, b) => b[1].count - a[1].count),
    };
  }, [executions, range]);
  return (
    <div className="rounded-2xl bg-boomi-card border border-boomi-cardBorder p-4 shadow-lg space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <History className="w-4 h-4 text-boomi-accent" />
          <h3 className="text-sm font-bold text-white">Failure history</h3>
        </div>
        <label className="flex items-center gap-2 text-[11px] text-slate-400">
          <span>Time range</span>
          <select aria-label="Failure history time range" value={range} onChange={(e) => setRange(e.target.value as RangeKey)} className="rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-slate-200 focus:border-sky-500 focus:outline-none">
            {RANGES.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
          </select>
        </label>
      </div>

      {data.total === 0 ? (
        <p className="text-xs text-slate-400">No failed executions in this time range.</p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Failures per day */}
          <div>
            <div className="text-[11px] uppercase tracking-wider font-bold text-slate-500 mb-2">{RANGES.find((item) => item.key === range)?.label}</div>
            <div className="flex h-14 items-end gap-1.5">
              {data.chart.map((d) => (
                <div key={d.key} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1" title={`${d.key}: ${d.count} failed`}>
                  <span className="text-[10px] text-slate-400">{d.count || ''}</span>
                  <div
                    className={`w-full rounded-t ${d.count ? 'bg-rose-500/70' : 'bg-slate-800'}`}
                    style={{ height: `${Math.max(3, (d.count / data.maxDay) * 36)}px` }}
                  />
                </div>
              ))}
            </div>
            <div className="mt-1 grid gap-1" style={{ gridTemplateColumns: `repeat(${data.axisLabels.length}, minmax(0, 1fr))` }}>
              {data.axisLabels.map((d) => <span key={d.key} className="overflow-hidden whitespace-nowrap text-center text-[9px] leading-3 text-slate-500" title={d.label}>{d.label}</span>)}
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
