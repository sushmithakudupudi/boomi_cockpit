import React, { useEffect, useState } from 'react';
import { ChevronRight, RefreshCw, Search } from 'lucide-react';
import { api, ApiError } from '../../services/api';
import type { ComponentFilters, ComponentListResponse, ComponentRevision, RevisionSource } from '../../types/revisions';
import { EmptyState, ErrorState, Spinner } from './shared';
import { formatDate, inputCls } from './utils';

interface Props {
  source: RevisionSource;
  onOpen: (component: ComponentRevision) => void;
  onUseSample: () => void;
}

const EMPTY: ComponentFilters = { q: '', type: '', author: '', dateFrom: '', dateTo: '' };

export const ComponentBrowser: React.FC<Props> = ({ source, onOpen, onUseSample }) => {
  const [filters, setFilters] = useState<ComponentFilters>(EMPTY);
  const [debounced, setDebounced] = useState<ComponentFilters>(EMPTY);
  const [data, setData] = useState<ComponentListResponse | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState({ n: 0, force: false });

  useEffect(() => {
    const t = setTimeout(() => setDebounced(filters), 250);
    return () => clearTimeout(t);
  }, [filters]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .fetchRevisionComponents(source, debounced, reload.force)
      .then((d) => !cancelled && setData(d))
      .catch((e: ApiError) => !cancelled && setError(e))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [source, debounced, reload]);

  const set = (patch: Partial<ComponentFilters>) => setFilters((f) => ({ ...f, ...patch }));
  const hasFilters = Object.values(filters).some(Boolean);
  const facets = data?.facets;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2.5 p-3 rounded-2xl bg-boomi-card border border-boomi-cardBorder">
        <div className="relative lg:col-span-2">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
          <input
            value={filters.q}
            onChange={(e) => set({ q: e.target.value })}
            placeholder="Search by component name or ID"
            className={`${inputCls} w-full pl-9`}
          />
        </div>
        <select value={filters.type} onChange={(e) => set({ type: e.target.value })} className={inputCls} aria-label="Component type">
          <option value="">All types</option>
          {facets?.types.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={filters.author} onChange={(e) => set({ author: e.target.value })} className={inputCls} aria-label="Last modified by">
          <option value="">Any author</option>
          {facets?.authors.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <input type="date" value={filters.dateFrom} max={filters.dateTo || undefined} onChange={(e) => set({ dateFrom: e.target.value })} className={inputCls} aria-label="Modified from" />
        <input type="date" value={filters.dateTo} min={filters.dateFrom || undefined} onChange={(e) => set({ dateTo: e.target.value })} className={inputCls} aria-label="Modified to" />
      </div>

      <div className="flex items-center justify-between text-xs text-slate-400">
        <span>
          {data ? `${data.components.length} of ${data.total} components` : 'Components'}
          {hasFilters && (
            <button onClick={() => setFilters(EMPTY)} className="ml-3 text-sky-300 hover:text-sky-200 cursor-pointer">Clear filters</button>
          )}
        </span>
        <button
          onClick={() => setReload((r) => ({ n: r.n + 1, force: true }))}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 cursor-pointer"
        >
          <RefreshCw className="w-3 h-3" /> Refresh
        </button>
      </div>

      {loading && !data ? (
        <Spinner label="Loading components…" />
      ) : error ? (
        <ErrorState
          title={error.code === 'not_configured' ? 'Live Boomi access is not configured' : 'Could not load components'}
          message={error.message}
          onRetry={() => setReload((r) => ({ n: r.n + 1, force: false }))}
          action={source === 'live' ? { label: 'Explore with sample fixtures', onClick: onUseSample } : undefined}
        />
      ) : data && data.components.length === 0 ? (
        <EmptyState title="No components match" message={hasFilters ? 'Adjust or clear the filters to see more components.' : 'No components were returned.'} />
      ) : (
        <div className={`rounded-2xl border border-boomi-cardBorder bg-boomi-card overflow-x-auto transition-opacity ${loading ? 'opacity-60' : ''}`}>
          <table className="w-full text-xs min-w-[720px]">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wider text-slate-500 border-b border-boomi-cardBorder">
                <th className="px-4 py-3 font-bold">Component</th>
                <th className="px-4 py-3 font-bold">Type</th>
                <th className="px-4 py-3 font-bold">Latest rev.</th>
                <th className="px-4 py-3 font-bold">Last modified</th>
                <th className="px-4 py-3 font-bold">By</th>
                <th className="px-2 py-3" />
              </tr>
            </thead>
            <tbody>
              {data?.components.map((c) => (
                <tr
                  key={c.componentId ?? c.name}
                  onClick={() => onOpen(c)}
                  className="border-b border-boomi-cardBorder/60 last:border-0 hover:bg-boomi-hover/60 cursor-pointer transition"
                >
                  <td className="px-4 py-3 max-w-[320px]">
                    <div className="font-semibold text-white truncate">{c.name}</div>
                    <div className="font-mono text-[10px] text-slate-500 truncate">{c.componentId}</div>
                  </td>
                  <td className="px-4 py-3"><span className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700 text-[10px] font-semibold">{c.type}</span></td>
                  <td className="px-4 py-3 font-mono text-sky-300">v{c.version}</td>
                  <td className="px-4 py-3 text-slate-300 whitespace-nowrap">{formatDate(c.modifiedDate)}</td>
                  <td className="px-4 py-3 text-slate-400 truncate max-w-[200px]">{c.modifiedBy ?? '—'}</td>
                  <td className="px-2 py-3 text-slate-500"><ChevronRight className="w-4 h-4" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
