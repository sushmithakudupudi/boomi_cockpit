import React, { useMemo, useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronRight, Info, Minus, Pencil, Plus } from 'lucide-react';
import type { ChangeCategory, ChangeEntry, ChangeType, ComparisonResult } from '../../types/revisions';
import { EmptyState, SourceBanner } from './shared';
import { formatDate } from './utils';

type TabId = 'all' | ChangeCategory;

const TABS: { id: TabId; label: string }[] = [
  { id: 'all', label: 'All Changes' },
  { id: 'map', label: 'Map Changes' },
  { id: 'setprops', label: 'Set Properties Changes' },
  { id: 'other', label: 'Other Changes' },
];

const TYPE_STYLE: Record<ChangeType, { label: string; badge: string; icon: React.ElementType }> = {
  added: { label: 'Added', badge: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40', icon: Plus },
  removed: { label: 'Removed', badge: 'bg-rose-500/15 text-rose-300 border-rose-500/40', icon: Minus },
  modified: { label: 'Modified', badge: 'bg-amber-500/15 text-amber-300 border-amber-500/40', icon: Pencil },
  unchanged: { label: 'Unchanged', badge: 'bg-slate-700/40 text-slate-400 border-slate-600', icon: Info },
};

const SCOPE_LABEL: Record<string, string> = {
  shape: 'Shape', mapping: 'Field mapping', function: 'Map function', property: 'Property',
  connection: 'Connection', config: 'Settings', metadata: 'Component',
};

const ConfigPanel: React.FC<{ title: string; data: Record<string, unknown> | null; changed: Set<string>; tone: 'old' | 'new' }> = ({ title, data, changed, tone }) => (
  <div className="min-w-0 rounded-xl border border-slate-800 bg-slate-950/60">
    <div className={`px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider border-b border-slate-800 ${tone === 'old' ? 'text-rose-300' : 'text-emerald-300'}`}>{title}</div>
    {data && Object.keys(data).length ? (
      <dl className="p-2 space-y-0.5 font-mono text-[11px] max-h-72 overflow-auto">
        {Object.entries(data).map(([k, v]) => (
          <div key={k} className={`flex gap-2 px-1.5 py-0.5 rounded ${changed.has(k) ? (tone === 'old' ? 'bg-rose-500/15' : 'bg-emerald-500/15') : ''}`}>
            <dt className="text-slate-500 shrink-0 max-w-[45%] break-all">{k}</dt>
            <dd className="text-slate-200 break-all">{v === null || v === undefined ? '—' : String(v)}</dd>
          </div>
        ))}
      </dl>
    ) : (
      <div className="p-3 text-[11px] text-slate-500 italic">Not present</div>
    )}
  </div>
);

const ChangeRow: React.FC<{ change: ChangeEntry }> = ({ change: c }) => {
  const [open, setOpen] = useState(false);
  const style = TYPE_STYLE[c.changeType];
  const changed = useMemo(() => new Set(c.fieldChanges.map((f) => f.field)), [c.fieldChanges]);
  const Icon = style.icon;
  return (
    <div className="rounded-xl border border-boomi-cardBorder bg-boomi-card overflow-hidden">
      <button onClick={() => setOpen(!open)} aria-expanded={open} className="w-full flex items-center gap-3 px-3.5 py-3 text-left hover:bg-boomi-hover/50 transition cursor-pointer">
        {open ? <ChevronDown className="w-4 h-4 text-slate-500 shrink-0" /> : <ChevronRight className="w-4 h-4 text-slate-500 shrink-0" />}
        <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-bold shrink-0 ${style.badge}`}>
          <Icon className="w-3 h-3" />{style.label}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold text-white truncate">{c.title}</div>
          <div className="text-[10px] text-slate-500 truncate">
            {SCOPE_LABEL[c.scope] ?? c.scope}
            {c.shapeId && <> · shape <span className="font-mono text-slate-400">{c.shapeId}</span>{c.shapeName && c.shapeName !== c.shapeId ? ` (${c.shapeName})` : ''}</>}
            {c.source && <> · Map component <span className="text-slate-400">{c.source.name}</span> {c.source.versions}</>}
          </div>
        </div>
        {c.ambiguous && <span title={c.ambiguous} className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-violet-500/15 text-violet-300 border border-violet-500/40 text-[10px] font-bold shrink-0"><AlertTriangle className="w-3 h-3" />Ambiguous</span>}
      </button>

      {open && (
        <div className="px-3.5 pb-3.5 space-y-3 border-t border-boomi-cardBorder/60 pt-3">
          {c.ambiguous && <p className="text-[11px] text-violet-200 bg-violet-950/30 border border-violet-500/30 rounded-lg px-3 py-2">{c.ambiguous}</p>}
          {c.fieldChanges.length > 0 && (
            <div className="overflow-x-auto rounded-xl border border-slate-800">
              <table className="w-full text-[11px] font-mono min-w-[480px]">
                <thead><tr className="text-left text-[10px] uppercase tracking-wider text-slate-500 bg-slate-900/70"><th className="px-3 py-1.5">Field</th><th className="px-3 py-1.5">Old</th><th className="px-3 py-1.5">New</th></tr></thead>
                <tbody>
                  {c.fieldChanges.map((f) => (
                    <tr key={f.field} className="border-t border-slate-800 align-top">
                      <td className="px-3 py-1.5 text-slate-400 break-all">{f.field}</td>
                      <td className="px-3 py-1.5 text-rose-300 break-all">{f.old ?? <em className="text-slate-600">absent</em>}</td>
                      <td className="px-3 py-1.5 text-emerald-300 break-all">
                        {f.new ?? <em className="text-slate-600">absent</em>}
                        {f.masked && <span className="ml-2 text-[9px] text-slate-500 not-italic">value hidden — change detected</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <ConfigPanel title="Old configuration" data={c.old} changed={changed} tone="old" />
            <ConfigPanel title="New configuration" data={c.new} changed={changed} tone="new" />
          </div>
        </div>
      )}
    </div>
  );
};

interface Props {
  result: ComparisonResult;
  includeUnchanged: boolean;
  onToggleUnchanged: (v: boolean) => void;
}

export const DiffView: React.FC<Props> = ({ result, includeUnchanged, onToggleUnchanged }) => {
  const [tab, setTab] = useState<TabId>('all');
  const [types, setTypes] = useState<Record<ChangeType, boolean>>({ added: true, modified: true, removed: true, unchanged: true });
  const { summary } = result;

  const counts = (id: TabId) => (id === 'all' ? summary.total : summary.byCategory[id].total);
  const visible = result.changes.filter((c) => (tab === 'all' || c.category === tab) && types[c.changeType]);
  const toggle = (t: ChangeType) => setTypes((s) => ({ ...s, [t]: !s[t] }));

  const cards: { label: string; value: number; cls: string }[] = [
    { label: 'Total changes', value: summary.total, cls: 'text-white' },
    { label: 'Added', value: summary.added, cls: 'text-emerald-300' },
    { label: 'Modified', value: summary.modified, cls: 'text-amber-300' },
    { label: 'Removed', value: summary.removed, cls: 'text-rose-300' },
    { label: 'Ambiguous', value: summary.ambiguous, cls: 'text-violet-300' },
  ];

  return (
    <div className="space-y-4">
      <SourceBanner source={result.source} />

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400">
        <span className="font-semibold text-white">{result.componentName}</span>
        <span>
          <span className="font-mono text-rose-300">v{result.left.version}</span>
          {result.left.modifiedDate && <> · {formatDate(result.left.modifiedDate)}</>}
          <span className="mx-2 text-slate-600">→</span>
          <span className="font-mono text-emerald-300">v{result.right.version}</span>
          {result.right.modifiedDate && <> · {formatDate(result.right.modifiedDate)}</>}
        </span>
      </div>

      {result.warnings.map((w) => (
        <div key={w} className="flex items-start gap-2 text-[11px] text-sky-200 bg-sky-950/30 border border-sky-500/30 rounded-xl px-3 py-2">
          <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-sky-400" /><span>{w}</span>
        </div>
      ))}

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
        {cards.map((c) => (
          <div key={c.label} className="rounded-xl bg-boomi-card border border-boomi-cardBorder px-3.5 py-3">
            <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">{c.label}</div>
            <div className={`text-2xl font-bold mt-0.5 ${c.cls}`}>{c.value}</div>
          </div>
        ))}
      </div>

      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div role="tablist" className="flex flex-wrap gap-1 p-1 rounded-xl bg-slate-900/80 border border-slate-800 w-fit">
          {TABS.map((t) => (
            <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition cursor-pointer ${tab === t.id ? 'bg-slate-800 text-white font-semibold' : 'text-slate-400 hover:text-slate-200'}`}>
              {t.label}
              <span className={`text-[10px] px-1.5 rounded-full font-bold ${tab === t.id ? 'bg-sky-400/25 text-sky-200' : 'bg-slate-800 text-slate-500'}`}>{counts(t.id)}</span>
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {(['added', 'modified', 'removed'] as ChangeType[]).map((t) => (
            <button key={t} onClick={() => toggle(t)} aria-pressed={types[t]}
              className={`px-2.5 py-1 rounded-full border text-[10px] font-bold transition cursor-pointer ${types[t] ? TYPE_STYLE[t].badge : 'border-slate-700 text-slate-600'}`}>
              {TYPE_STYLE[t].label}
            </button>
          ))}
          <label className="flex items-center gap-1.5 ml-2 text-[11px] text-slate-400 cursor-pointer">
            <input type="checkbox" checked={includeUnchanged} onChange={(e) => onToggleUnchanged(e.target.checked)} className="accent-sky-500" />
            Show unchanged
          </label>
        </div>
      </div>

      {summary.total === 0 && !includeUnchanged ? (
        <EmptyState title="No differences found" message="These revisions have identical configuration. Layout, coordinates and XML formatting differences are ignored." />
      ) : visible.length === 0 ? (
        <EmptyState title="Nothing to show" message="No changes match the selected tab and filters." />
      ) : (
        <div className="space-y-2">{visible.map((c) => <ChangeRow key={c.id} change={c} />)}</div>
      )}
    </div>
  );
};
