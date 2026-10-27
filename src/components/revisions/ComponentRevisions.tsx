import React, { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, GitCompareArrows, Loader2 } from 'lucide-react';
import { api, ApiError } from '../../services/api';
import type { ComparisonResult, ComponentRevision, RevisionSource } from '../../types/revisions';
import { DiffView } from './DiffView';
import { EmptyState, ErrorState, SourceBanner, Spinner } from './shared';
import { formatDate, inputCls } from './utils';

interface Props {
  source: RevisionSource;
  component: ComponentRevision;
  onBack: () => void;
}

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

  const runCompare = useCallback(
    async (unchanged: boolean) => {
      if (from === null || to === null) return;
      setComparing(true);
      setCompareError(null);
      try {
        setResult(await api.compareRevisions(source, component.componentId, from, to, unchanged));
      } catch (e) {
        setResult(null);
        setCompareError(e as ApiError);
      } finally {
        setComparing(false);
      }
    },
    [source, component.componentId, from, to]
  );

  const pick = (v: number, which: 'from' | 'to') => {
    (which === 'from' ? setFrom : setTo)(v);
    setResult(null);
    setCompareError(null);
  };

  const canCompare = from !== null && to !== null && from !== to;

  return (
    <div className="space-y-5">
      <SourceBanner source={source} />
      <div className="flex items-center gap-3">
        <button onClick={onBack} title="Back to components" className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700/80 transition cursor-pointer group">
          <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-0.5" />
        </button>
        <div className="min-w-0">
          <h2 className="text-base font-bold text-white truncate">{component.name}</h2>
          <p className="text-[11px] text-slate-500 font-mono truncate">{component.componentId} · {component.type}</p>
        </div>
      </div>

      {!revisions && !error ? (
        <Spinner label="Loading revision history…" />
      ) : error ? (
        <ErrorState title="Could not load revision history" message={error.message} onRetry={() => setReload((n) => n + 1)} />
      ) : revisions && (
        <>
          <div className="rounded-2xl border border-boomi-cardBorder bg-boomi-card overflow-x-auto">
            <table className="w-full text-xs min-w-[640px]">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-wider text-slate-500 border-b border-boomi-cardBorder">
                  <th className="px-4 py-3 font-bold">Revision</th>
                  <th className="px-4 py-3 font-bold">Timestamp</th>
                  <th className="px-4 py-3 font-bold">Author</th>
                  <th className="px-4 py-3 font-bold">Notes</th>
                  <th className="px-4 py-3 font-bold text-center">Compare</th>
                </tr>
              </thead>
              <tbody>
                {revisions.map((r) => (
                  <tr key={r.version} className={`border-b border-boomi-cardBorder/60 last:border-0 ${r.version === from || r.version === to ? 'bg-boomi-hover/40' : ''}`}>
                    <td className="px-4 py-3 font-mono text-sky-300 whitespace-nowrap">
                      v{r.version}
                      {r.currentVersion && <span className="ml-2 px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 text-[9px] font-bold uppercase font-sans">Current</span>}
                    </td>
                    <td className="px-4 py-3 text-slate-300 whitespace-nowrap">{formatDate(r.modifiedDate)}</td>
                    <td className="px-4 py-3 text-slate-400">{r.modifiedBy ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-400 max-w-[280px] truncate" title={r.description ?? undefined}>{r.description ?? <span className="text-slate-600">No notes available</span>}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-center gap-1.5">
                        {(['from', 'to'] as const).map((w) => {
                          const active = (w === 'from' ? from : to) === r.version;
                          return (
                            <button key={w} onClick={() => pick(r.version, w)} aria-pressed={active}
                              className={`px-2 py-0.5 rounded-md border text-[10px] font-bold transition cursor-pointer ${active
                                ? (w === 'from' ? 'bg-rose-500/20 text-rose-200 border-rose-500/50' : 'bg-emerald-500/20 text-emerald-200 border-emerald-500/50')
                                : 'border-slate-700 text-slate-500 hover:text-slate-200 hover:border-slate-500'}`}>
                              {w === 'from' ? 'Base' : 'Target'}
                            </button>
                          );
                        })}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-slate-500">
            Boomi exposes only the component description as revision notes; per-revision commit comments are not available through the API.
          </p>

          {revisions.length < 2 ? (
            <EmptyState title="Only one revision available" message="Comparison needs a second revision of this component. Details of the single revision are shown above." />
          ) : (
            <div className="flex flex-col sm:flex-row sm:items-end gap-3 p-3.5 rounded-2xl bg-boomi-card border border-boomi-cardBorder">
              {(['from', 'to'] as const).map((w) => (
                <label key={w} className="flex-1 text-[10px] uppercase tracking-wider font-bold text-slate-500">
                  {w === 'from' ? 'Previous revision (base)' : 'Comparison revision (target)'}
                  <select value={(w === 'from' ? from : to) ?? ''} onChange={(e) => pick(Number(e.target.value), w)} className={`${inputCls} w-full mt-1 normal-case tracking-normal font-normal`}>
                    {revisions.map((r) => <option key={r.version} value={r.version}>v{r.version} · {formatDate(r.modifiedDate)} · {r.modifiedBy ?? 'unknown'}</option>)}
                  </select>
                </label>
              ))}
              <button
                onClick={() => runCompare(includeUnchanged)}
                disabled={!canCompare || comparing}
                className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-boomi-blue to-boomi-accent hover:from-blue-600 hover:to-sky-400 text-white font-bold text-xs shadow-lg shadow-sky-950 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {comparing ? <Loader2 className="w-4 h-4 animate-spin" /> : <GitCompareArrows className="w-4 h-4" />}
                Compare Revisions
              </button>
            </div>
          )}
          {revisions.length >= 2 && from === to && <p className="text-[11px] text-amber-300">Select two different revisions to compare.</p>}

          {comparing && !result ? <Spinner label="Fetching revision definitions and comparing…" /> : null}
          {compareError && <ErrorState title="Comparison failed" message={compareError.message} onRetry={() => runCompare(includeUnchanged)} />}
          {result && (
            <DiffView
              result={result}
              includeUnchanged={includeUnchanged}
              onToggleUnchanged={(v) => { setIncludeUnchanged(v); runCompare(v); }}
            />
          )}
        </>
      )}
    </div>
  );
};
