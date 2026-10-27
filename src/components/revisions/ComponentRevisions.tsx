import React, { useEffect, useState } from 'react';
import { ArrowLeft, ArrowLeftRight, Check, Copy, GitCompareArrows, History, Loader2 } from 'lucide-react';
import { api, ApiError } from '../../services/api';
import type { ComparisonResult, ComponentRevision, RevisionSource } from '../../types/revisions';
import { DiffView } from './DiffView';
import { Avatar, EmptyState, ErrorState, SourceBanner, Spinner, TypeBadge } from './shared';
import { formatDate, inputCls, relativeTime } from './utils';

interface Props {
  source: RevisionSource;
  component: ComponentRevision;
  onBack: () => void;
}

const revLabel = (r: ComponentRevision) => `v${r.version} · ${relativeTime(r.modifiedDate)} · ${r.modifiedBy ?? 'unknown'}`;

const CopyId: React.FC<{ id: string }> = ({ id }) => {
  const [done, setDone] = useState(false);
  return (
    <button
      onClick={() => navigator.clipboard?.writeText(id).then(() => { setDone(true); setTimeout(() => setDone(false), 1200); })}
      title="Copy component ID"
      className="inline-flex items-center gap-1 min-w-0 max-w-full font-mono text-[10px] text-slate-500 hover:text-slate-300 cursor-pointer"
    >
      <span className="truncate">{id}</span>
      {done ? <Check className="w-3 h-3 text-emerald-400 shrink-0" /> : <Copy className="w-3 h-3 shrink-0" />}
    </button>
  );
};

export const ComponentRevisions: React.FC<Props> = ({ source, component, onBack }) => {
  const [revisions, setRevisions] = useState<ComponentRevision[] | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [from, setFrom] = useState<number | null>(null);
  const [to, setTo] = useState<number | null>(null);
  const [result, setResult] = useState<ComparisonResult | null>(null);
  const [comparing, setComparing] = useState(false);
  const [compareError, setCompareError] = useState<ApiError | null>(null);
  const [includeUnchanged, setIncludeUnchanged] = useState(false);
  const [reload, setReload] = useState(0);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setRevisions(null);
    setError(null);
    api
      .fetchComponentRevisions(source, component.componentId)
      .then(({ revisions: r }) => {
        if (cancelled) return;
        setRevisions(r);
        setTo(r[0]?.version ?? null);
        setFrom(r[1]?.version ?? null);
      })
      .catch((e: ApiError) => !cancelled && setError(e));
    return () => {
      cancelled = true;
    };
  }, [source, component.componentId, reload]);

  // Compare automatically whenever the selected pair changes.
  useEffect(() => {
    if (from === null || to === null || from === to) {
      setResult(null);
      return;
    }
    let cancelled = false;
    setComparing(true);
    setCompareError(null);
    api
      .compareRevisions(source, component.componentId, from, to, includeUnchanged)
      .then((r) => !cancelled && setResult(r))
      .catch((e: ApiError) => {
        if (cancelled) return;
        setResult(null);
        setCompareError(e);
      })
      .finally(() => !cancelled && setComparing(false));
    return () => {
      cancelled = true;
    };
  }, [source, component.componentId, from, to, includeUnchanged, retry]);

  const swap = () => {
    setFrom(to);
    setTo(from);
  };

  const presets = revisions && revisions.length > 2 ? [
    { label: 'Latest vs previous', from: revisions[1].version, to: revisions[0].version },
    { label: 'Latest vs first', from: revisions[revisions.length - 1].version, to: revisions[0].version },
  ] : [];

  return (
    <div className="space-y-4">
      <SourceBanner source={source} />

      {/* Component header */}
      <div className="flex items-start gap-3 p-4 rounded-2xl bg-boomi-card border border-boomi-cardBorder">
        <button onClick={onBack} title="Back to components" aria-label="Back to components"
          className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700/80 transition cursor-pointer group shrink-0">
          <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-0.5" />
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-bold text-white break-all">{component.name}</h2>
            <TypeBadge type={component.type} />
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-[11px] text-slate-400 min-w-0">
            <CopyId id={component.componentId} />
            {revisions && <span className="flex items-center gap-1"><History className="w-3 h-3" />{revisions.length} revision{revisions.length === 1 ? '' : 's'}</span>}
            {component.folderName && <span className="truncate">Folder: {component.folderName}</span>}
          </div>
        </div>
      </div>

      {!revisions && !error ? (
        <Spinner label="Loading revision history…" />
      ) : error ? (
        <ErrorState title="Could not load revision history" message={error.message} onRetry={() => setReload((n) => n + 1)} />
      ) : revisions && (
        <>
          {/* Compare bar */}
          {revisions.length >= 2 && (
            <div className="p-3 rounded-2xl bg-boomi-card border border-boomi-cardBorder space-y-2.5">
              <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] gap-2 items-end">
                {(['from', 'to'] as const).map((w, i) => (
                  <React.Fragment key={w}>
                    {i === 1 && (
                      <button onClick={swap} title="Swap base and target" aria-label="Swap base and target"
                        className="justify-self-center p-2 rounded-xl bg-slate-900 border border-slate-700 text-slate-400 hover:text-white hover:border-slate-500 transition cursor-pointer rotate-90 md:rotate-0">
                        <ArrowLeftRight className="w-4 h-4" />
                      </button>
                    )}
                    <label className="block min-w-0 text-[10px] uppercase tracking-wider font-bold space-y-1">
                      <span className={w === 'from' ? 'text-rose-300' : 'text-emerald-300'}>{w === 'from' ? 'Base (compare from)' : 'Target (compare to)'}</span>
                      <select value={(w === 'from' ? from : to) ?? ''} onChange={(e) => (w === 'from' ? setFrom : setTo)(Number(e.target.value))}
                        className={`${inputCls} w-full normal-case tracking-normal font-normal ${w === 'from' ? 'border-rose-500/40' : 'border-emerald-500/40'}`}>
                        {revisions.map((r) => <option key={r.version} value={r.version}>{revLabel(r)}</option>)}
                      </select>
                    </label>
                  </React.Fragment>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                {presets.map((p) => {
                  const active = p.from === from && p.to === to;
                  return (
                    <button key={p.label} onClick={() => { setFrom(p.from); setTo(p.to); }}
                      className={`px-2.5 py-1 rounded-full border transition cursor-pointer ${active ? 'bg-boomi-accent/15 border-boomi-accent/60 text-white' : 'border-slate-700 text-slate-400 hover:text-white'}`}>
                      {p.label}
                    </button>
                  );
                })}
                <span className="ml-auto flex items-center gap-1.5 text-slate-500">
                  {comparing ? <><Loader2 className="w-3.5 h-3.5 animate-spin text-boomi-accent" />Comparing…</>
                    : from === to ? <span className="text-amber-300">Pick two different revisions</span>
                      : <><GitCompareArrows className="w-3.5 h-3.5" />Updates automatically</>}
                </span>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 xl:grid-cols-[280px_minmax(0,1fr)] gap-4 items-start">
            {/* Timeline */}
            <aside className="rounded-2xl bg-boomi-card border border-boomi-cardBorder xl:sticky xl:top-4">
              <div className="flex items-center justify-between px-4 py-3 border-b border-boomi-cardBorder">
                <h3 className="text-xs font-bold text-white">Revision timeline</h3>
                <span className="text-[10px] text-slate-500">newest first</span>
              </div>
              <ol className="p-2 max-h-[320px] xl:max-h-[calc(100vh-10rem)] overflow-y-auto">
                {revisions.map((r, idx) => {
                  const isFrom = r.version === from, isTo = r.version === to;
                  return (
                    <li key={r.version} className="relative pl-6">
                      {idx < revisions.length - 1 && <span className="absolute left-[11px] top-5 -bottom-1 w-px bg-slate-700/70" />}
                      <span className={`absolute left-[6px] top-[14px] w-[11px] h-[11px] rounded-full border-2 ${isTo ? 'bg-emerald-400 border-emerald-300' : isFrom ? 'bg-rose-400 border-rose-300' : 'bg-slate-900 border-slate-600'}`} />
                      <div className={`rounded-xl px-2.5 py-2 mb-1 transition ${isFrom || isTo ? 'bg-boomi-hover/50' : 'hover:bg-boomi-hover/30'}`}>
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="font-mono text-xs font-bold text-sky-300">v{r.version}</span>
                            {r.currentVersion && <span className="px-1.5 py-px rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 text-[9px] font-bold uppercase">Current</span>}
                          </div>
                          {revisions.length >= 2 && (
                            <div className="flex gap-1 shrink-0">
                              {(['from', 'to'] as const).map((w) => {
                                const active = w === 'from' ? isFrom : isTo;
                                return (
                                  <button key={w} onClick={() => (w === 'from' ? setFrom : setTo)(r.version)} aria-pressed={active}
                                    title={w === 'from' ? 'Use as base' : 'Use as target'}
                                    className={`w-6 h-6 rounded-md border text-[10px] font-bold transition cursor-pointer ${active
                                      ? (w === 'from' ? 'bg-rose-500/25 text-rose-200 border-rose-500/60' : 'bg-emerald-500/25 text-emerald-200 border-emerald-500/60')
                                      : 'border-slate-700 text-slate-500 hover:text-white hover:border-slate-500'}`}>
                                    {w === 'from' ? 'B' : 'T'}
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 mt-1 text-[11px] text-slate-400 min-w-0">
                          <Avatar who={r.modifiedBy} />
                          <span className="truncate">{r.modifiedBy ?? 'Unknown'}</span>
                        </div>
                        <div className="text-[10px] text-slate-500 mt-0.5">{formatDate(r.modifiedDate)}</div>
                        {r.description && <p className="text-[10px] text-slate-400 mt-1 line-clamp-2" title={r.description}>{r.description}</p>}
                      </div>
                    </li>
                  );
                })}
              </ol>
              {revisions.length >= 2 && (
                <p className="px-4 py-2.5 border-t border-boomi-cardBorder text-[10px] text-slate-500">
                  <span className="text-rose-300 font-bold">B</span> sets the base, <span className="text-emerald-300 font-bold">T</span> sets the target.
                </p>
              )}
            </aside>

            {/* Comparison */}
            <div className="min-w-0">
              {revisions.length < 2 ? (
                <EmptyState title="Only one revision so far" message="Once this component is saved again in Boomi, you can compare its revisions here." />
              ) : compareError ? (
                <ErrorState title="Comparison failed" message={compareError.message} onRetry={() => setRetry((n) => n + 1)} />
              ) : result ? (
                <div className={`transition-opacity ${comparing ? 'opacity-50 pointer-events-none' : ''}`}>
                  <DiffView result={result} includeUnchanged={includeUnchanged} onToggleUnchanged={setIncludeUnchanged} />
                </div>
              ) : comparing ? (
                <Spinner label="Fetching both revisions and comparing…" />
              ) : null}
            </div>
          </div>
        </>
      )}
    </div>
  );
};
