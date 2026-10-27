import React, { useEffect, useMemo, useState } from 'react';
import { ArrowDownUp, ChevronRight, RefreshCw, Search, SlidersHorizontal, X } from 'lucide-react';
import { api, ApiError } from '../../services/api';
import type { ComponentFilters, ComponentListResponse, ComponentRevision, RevisionSource } from '../../types/revisions';
import { Avatar, EmptyState, ErrorState, SkeletonRows, TypeBadge } from './shared';
import { Select } from '../ui/Select';
import { DatePicker } from '../ui/DatePicker';
import { componentTypeLabel, formatDate, inputCls, relativeTime } from './utils';

interface Props {
  source: RevisionSource;
  onOpen: (component: ComponentRevision) => void;
}

type SortId = 'recent' | 'name' | 'version';

const EMPTY: ComponentFilters = { q: '', type: '', author: '', dateFrom: '', dateTo: '' };
const PAGE = 40;
const SORTS: { id: SortId; label: string }[] = [
  { id: 'recent', label: 'Recently modified' },
  { id: 'name', label: 'Name (A–Z)' },
  { id: 'version', label: 'Most revisions' },
];

export const ComponentBrowser: React.FC<Props> = ({ source, onOpen }) => {
  const [filters, setFilters] = useState<ComponentFilters>(EMPTY);
  const [debounced, setDebounced] = useState<ComponentFilters>(EMPTY);
  const [data, setData] = useState<ComponentListResponse | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState({ n: 0, force: false });
  const [showFilters, setShowFilters] = useState(false);
  const [sort, setSort] = useState<SortId>('recent');
  const [limit, setLimit] = useState(PAGE);

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
      .then((d) => {
        if (cancelled) return;
        setData(d);
        setLimit(PAGE);
      })
      .catch((e: ApiError) => !cancelled && setError(e))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [source, debounced, reload]);

  const set = (patch: Partial<ComponentFilters>) => setFilters((f) => ({ ...f, ...patch }));
  const hasFilters = Object.values(filters).some(Boolean);
  const advancedCount = [filters.author, filters.dateFrom, filters.dateTo].filter(Boolean).length;
  const facets = data?.facets;

  const sorted = useMemo(() => {
    const list = [...(data?.components ?? [])];
    if (sort === 'name') list.sort((a, b) => a.name.localeCompare(b.name));
    else if (sort === 'version') list.sort((a, b) => b.version - a.version);
    return list;
  }, [data, sort]);
  const shown = sorted.slice(0, limit);

  return (
    <div className="space-y-3">
      {/* Search + filters */}
      <div className="rounded-2xl bg-boomi-card border border-boomi-cardBorder p-3 space-y-3">
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              value={filters.q}
              onChange={(e) => set({ q: e.target.value })}
              placeholder="Search components by name or ID…"
              className={`${inputCls} w-full pl-9 pr-8 py-2.5 text-[13px]`}
              aria-label="Search components"
            />
            {filters.q && (
              <button onClick={() => set({ q: '' })} aria-label="Clear search" className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md text-slate-500 hover:text-white cursor-pointer">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <Select
              value={sort}
              onChange={setSort}
              options={SORTS.map((s) => ({ value: s.id, label: s.label }))}
              icon={ArrowDownUp}
              ariaLabel="Sort components"
              searchable={false}
              className="flex-1 sm:flex-none sm:w-52"
            />
            <button
              onClick={() => setShowFilters((v) => !v)}
              aria-expanded={showFilters}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-semibold transition cursor-pointer ${showFilters || advancedCount ? 'bg-sky-500/10 border-sky-500/40 text-sky-200' : 'bg-slate-900 border-slate-700 text-slate-300 hover:text-white'}`}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />Filters
              {advancedCount > 0 && <span className="px-1.5 rounded-full bg-sky-400/30 text-[10px]">{advancedCount}</span>}
            </button>
            <button
              onClick={() => setReload((r) => ({ n: r.n + 1, force: true }))}
              title="Reload from Boomi"
              aria-label="Reload from Boomi"
              className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-slate-300 hover:text-white transition cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Type chips */}
        {facets && facets.types.length > 1 && (
          <div className="flex gap-1.5 overflow-x-auto pb-0.5 -mx-1 px-1 [scrollbar-width:thin]">
            {['', ...facets.types].map((t) => {
              const active = filters.type === t;
              return (
                <button key={t || 'all'} onClick={() => set({ type: t })} aria-pressed={active}
                  className={`shrink-0 px-3 py-1 rounded-full border text-[11px] font-medium transition cursor-pointer ${active ? 'bg-boomi-accent/15 border-boomi-accent/60 text-white' : 'border-slate-700 text-slate-400 hover:text-white hover:border-slate-500'}`}>
                  {t ? componentTypeLabel(t) : 'All types'}
                </button>
              );
            })}
          </div>
        )}

        {showFilters && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-4 border-t border-boomi-cardBorder">
            <Select
              label="Modified by"
              value={filters.author}
              onChange={(author) => set({ author })}
              options={[{ value: '', label: 'Anyone' }, ...(facets?.authors ?? []).map((a) => ({ value: a, label: a }))]}
              clearValue=""
            />
            <DatePicker label="Modified from" value={filters.dateFrom} max={filters.dateTo || undefined} onChange={(dateFrom) => set({ dateFrom })} />
            <DatePicker label="Modified to" value={filters.dateTo} min={filters.dateFrom || undefined} onChange={(dateTo) => set({ dateTo })} />
          </div>
        )}
      </div>

      <div className="flex items-center justify-between px-1 text-xs text-slate-400 min-h-[24px]">
        <span>
          {data ? <><span className="text-white font-semibold">{data.components.length}</span> of {data.total} components</> : 'Loading components…'}
        </span>
        {hasFilters && (
          <button onClick={() => setFilters(EMPTY)} className="flex items-center gap-1 text-sky-300 hover:text-sky-200 cursor-pointer">
            <X className="w-3 h-3" />Clear filters
          </button>
        )}
      </div>

      {loading && !data ? (
        <SkeletonRows />
      ) : error ? (
        <ErrorState
          title={error.code === 'not_configured' ? 'Live Boomi access is not configured' : 'Could not load components'}
          message={error.message}
          onRetry={() => setReload((r) => ({ n: r.n + 1, force: false }))}
        />
      ) : data && data.components.length === 0 ? (
        <EmptyState title="No components match" message={hasFilters ? 'Try a different search or clear the filters.' : 'No components were returned from Boomi.'}>
          {hasFilters && <button onClick={() => setFilters(EMPTY)} className="text-xs text-sky-300 hover:text-sky-200 cursor-pointer">Clear filters</button>}
        </EmptyState>
      ) : (
        <div className={`rounded-2xl border border-boomi-cardBorder bg-boomi-card overflow-hidden transition-opacity ${loading ? 'opacity-60' : ''}`}>
          {/* Desktop header */}
          <div className="hidden xl:grid grid-cols-[minmax(0,1fr)_140px_90px_150px_minmax(0,180px)_24px] gap-4 px-4 py-2.5 text-[10px] uppercase tracking-wider font-bold text-slate-500 border-b border-boomi-cardBorder bg-slate-900/40">
            <span>Component</span><span>Type</span><span>Latest</span><span>Last modified</span><span>Modified by</span><span />
          </div>
          <ul className="divide-y divide-boomi-cardBorder/60">
            {shown.map((c) => (
              <li key={c.componentId ?? c.name}>
                <button
                  onClick={() => onOpen(c)}
                  className="group w-full text-left px-4 py-3 hover:bg-boomi-hover/50 focus-visible:bg-boomi-hover/50 focus:outline-none transition cursor-pointer
                    grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1.5
                    xl:grid-cols-[minmax(0,1fr)_140px_90px_150px_minmax(0,180px)_24px] xl:gap-4 xl:items-center"
                >
                  <div className="min-w-0">
                    <div className="text-[13px] font-semibold text-white truncate group-hover:text-sky-200 transition">{c.name}</div>
                    <div className="font-mono text-[10px] text-slate-500 truncate">{c.componentId}</div>
                  </div>
                  <div className="xl:hidden row-span-2 self-center"><ChevronRight className="w-4 h-4 text-slate-600" /></div>
                  {/* Mobile meta line */}
                  <div className="xl:hidden flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-400">
                    <TypeBadge type={c.type} />
                    <span className="font-mono text-sky-300">v{c.version}</span>
                    <span title={formatDate(c.modifiedDate)}>· {relativeTime(c.modifiedDate)}</span>
                  </div>
                  {/* Desktop columns */}
                  <div className="hidden xl:block"><TypeBadge type={c.type} /></div>
                  <div className="hidden xl:block font-mono text-xs text-sky-300">v{c.version}</div>
                  <div className="hidden xl:block text-xs text-slate-300" title={formatDate(c.modifiedDate)}>{relativeTime(c.modifiedDate)}</div>
                  <div className="hidden xl:flex items-center gap-2 min-w-0 text-xs text-slate-400">
                    <Avatar who={c.modifiedBy} /><span className="truncate">{c.modifiedBy ?? '—'}</span>
                  </div>
                  <ChevronRight className="hidden xl:block w-4 h-4 text-slate-600 group-hover:text-sky-300 group-hover:translate-x-0.5 transition" />
                </button>
              </li>
            ))}
          </ul>
          {sorted.length > limit && (
            <button onClick={() => setLimit((l) => l + PAGE)}
              className="w-full py-3 text-xs font-semibold text-sky-300 hover:text-sky-200 hover:bg-boomi-hover/40 border-t border-boomi-cardBorder transition cursor-pointer">
              Show more ({sorted.length - limit} remaining)
            </button>
          )}
        </div>
      )}
    </div>
  );
};
