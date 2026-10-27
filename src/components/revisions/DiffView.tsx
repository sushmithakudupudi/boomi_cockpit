import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronRight, ChevronsDownUp, ChevronsUpDown, Info, Map as MapIcon, Minus, Pencil, Plus, Search, Settings2, Shapes, X } from 'lucide-react';
import type { ChangeCategory, ChangeEntry, ChangeType, ComparisonResult, ComponentRef, FieldChange } from '../../types/revisions';
import { EmptyState, SourceBanner } from './shared';
import { componentTypeLabel, fieldHint, fieldLabel, GUID_RE, inputCls, isLongText, wordDiff } from './utils';
import { useElementWidth } from '../../hooks/useElementWidth';

type TabId = 'all' | ChangeCategory;

const TABS: { id: TabId; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'map', label: 'Maps' },
  { id: 'setprops', label: 'Set Properties' },
  { id: 'other', label: 'Other' },
];

const TYPE_STYLE: Record<ChangeType, { label: string; badge: string; dot: string; icon: React.ElementType }> = {
  added: { label: 'Added', badge: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40', dot: 'bg-emerald-400', icon: Plus },
  removed: { label: 'Removed', badge: 'bg-rose-500/15 text-rose-300 border-rose-500/40', dot: 'bg-rose-400', icon: Minus },
  modified: { label: 'Modified', badge: 'bg-amber-500/15 text-amber-300 border-amber-500/40', dot: 'bg-amber-400', icon: Pencil },
  unchanged: { label: 'Unchanged', badge: 'bg-slate-700/40 text-slate-400 border-slate-600', dot: 'bg-slate-500', icon: Info },
};

const SCOPE_LABEL: Record<string, string> = {
  shape: 'Shape', mapping: 'Field mapping', function: 'Map function', property: 'Property',
  connection: 'Connection', config: 'Settings', metadata: 'Component details',
};

const RefsContext = createContext<Record<string, ComponentRef>>({});

/** Lets long identifiers like RedTeam_Gateway_Request_JSON_Profile wrap after _ . - instead of mid-word. */
const breakable = (name: string) =>
  name.split(/(?<=[_.-])/).map((part, i) => <React.Fragment key={i}>{i > 0 && <wbr />}{part}</React.Fragment>);
/** Bumped by "Expand all" / "Collapse all"; rows follow the latest command. */
const ExpandContext = createContext<{ open: boolean; n: number }>({ open: false, n: 0 });

/** Renders a value with any component ids replaced by the component's name. */
const Value: React.FC<{ v: unknown }> = ({ v }) => {
  const refs = useContext(RefsContext);
  if (v === null || v === undefined || v === '') return <em className="text-slate-600 not-italic">—</em>;
  const s = String(v);
  const parts: React.ReactNode[] = [];
  let last = 0;
  for (const m of s.matchAll(GUID_RE)) {
    const id = m[0];
    const ref = refs[id.toLowerCase()];
    if (m.index! > last) parts.push(s.slice(last, m.index));
    parts.push(ref ? (
      <span key={m.index} title={`${componentTypeLabel(ref.type)} · ${id}`}
        className="inline px-1.5 py-px rounded-md bg-sky-500/10 border border-sky-500/30 text-sky-200 font-sans not-italic break-words [box-decoration-break:clone] [-webkit-box-decoration-break:clone] leading-relaxed">
        {breakable(ref.name)}<span className="ml-1 text-[9px] text-sky-400/80 uppercase tracking-wide whitespace-nowrap">{componentTypeLabel(ref.type)}</span>
      </span>
    ) : (
      <span key={m.index} title="Component not found in this account" className="text-slate-400">{id}</span>
    ));
    last = m.index! + id.length;
  }
  if (last < s.length) parts.push(s.slice(last));
  return <>{parts}</>;
};

const TextDiff: React.FC<{ a: string; b: string }> = ({ a, b }) => {
  const parts = useMemo(() => wordDiff(a, b), [a, b]);
  return (
    <pre className="whitespace-pre-wrap break-words text-[11px] leading-relaxed text-slate-300 max-h-80 overflow-auto bg-slate-950/60 rounded-lg p-2.5 border border-slate-800">
      {parts.map((p, i) =>
        p.kind === 'same' ? <span key={i}>{p.text}</span>
          : p.kind === 'add' ? <ins key={i} className="no-underline bg-emerald-500/25 text-emerald-200 rounded-sm">{p.text}</ins>
            : <del key={i} className="bg-rose-500/25 text-rose-200 rounded-sm">{p.text}</del>
      )}
    </pre>
  );
};

/** Field-by-field before/after. A three-column grid on wide screens, stacked on phones. */
const FieldChanges: React.FC<{ fields: FieldChange[] }> = ({ fields }) => (
  <div className="rounded-xl border border-slate-800 overflow-hidden">
    <div className="hidden sm:grid grid-cols-[minmax(0,28%)_minmax(0,1fr)_minmax(0,1fr)] text-[10px] uppercase tracking-wider font-bold text-slate-500 bg-slate-900/70">
      <span className="px-3 py-2">Field</span><span className="px-3 py-2 text-rose-300/80">Before</span><span className="px-3 py-2 text-emerald-300/80">After</span>
    </div>
    {fields.map((f) => {
      const label = fieldLabel(f.field);
      const long = f.old && f.new && !f.masked && (isLongText(f.old) || isLongText(f.new));
      return (
        <div key={f.field} className="grid grid-cols-1 sm:grid-cols-[minmax(0,28%)_minmax(0,1fr)_minmax(0,1fr)] border-t border-slate-800 first:border-t-0 sm:first:border-t text-[11px]">
          <div className="px-3 pt-2 sm:py-2" title={fieldHint(f.field) ?? f.field}>
            <div className="font-semibold text-slate-200">{label}{fieldHint(f.field) && <Info className="inline w-3 h-3 ml-1 -mt-0.5 text-slate-500" aria-label="More info" />}</div>
            {label !== f.field && <div className="text-[9px] text-slate-600 font-mono break-all">{f.field}</div>}
          </div>
          {long ? (
            <div className="px-3 py-2 sm:col-span-2"><TextDiff a={f.old!} b={f.new!} /></div>
          ) : (
            <>
              <div className="px-3 py-1 sm:py-2 font-mono text-rose-300 break-words min-w-0">
                <span className="sm:hidden text-[9px] font-sans font-bold uppercase text-slate-600 mr-1.5">Before</span>
                {f.old === null ? <em className="text-slate-600">absent</em> : <Value v={f.old} />}
              </div>
              <div className="px-3 pb-2 pt-1 sm:py-2 font-mono text-emerald-300 break-words min-w-0">
                <span className="sm:hidden text-[9px] font-sans font-bold uppercase text-slate-600 mr-1.5">After</span>
                {f.new === null ? <em className="text-slate-600">absent</em> : <Value v={f.new} />}
                {f.masked && <span className="ml-2 text-[9px] text-slate-500 font-sans">value hidden — change detected</span>}
              </div>
            </>
          )}
        </div>
      );
    })}
  </div>
);

const ConfigPanel: React.FC<{ title: string; data: Record<string, unknown> | null; changed: Set<string>; tone: 'old' | 'new' }> = ({ title, data, changed, tone }) => (
  <div className="min-w-0 rounded-xl border border-slate-800 bg-slate-950/60">
    <div className={`px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider border-b border-slate-800 ${tone === 'old' ? 'text-rose-300' : 'text-emerald-300'}`}>{title}</div>
    {data && Object.keys(data).length ? (
      <dl className="p-2 space-y-0.5 text-[11px] max-h-72 overflow-auto">
        {Object.entries(data).map(([k, v]) => (
          <div key={k} className={`grid grid-cols-[minmax(0,40%)_minmax(0,1fr)] gap-2 px-1.5 py-1 rounded ${changed.has(k) ? (tone === 'old' ? 'bg-rose-500/15' : 'bg-emerald-500/15') : ''}`}>
            <dt className="text-slate-400 break-words" title={fieldHint(k) ?? k}>{fieldLabel(k)}{fieldHint(k) && <Info className="inline w-3 h-3 ml-1 -mt-0.5 text-slate-500" aria-label="More info" />}</dt>
            <dd className="text-slate-200 font-mono [overflow-wrap:anywhere] leading-relaxed min-w-0"><Value v={v} /></dd>
          </div>
        ))}
      </dl>
    ) : (
      <div className="p-3 text-[11px] text-slate-500 italic">Not present in this revision</div>
    )}
  </div>
);

const ChangeRow: React.FC<{ change: ChangeEntry }> = ({ change: c }) => {
  const expand = useContext(ExpandContext);
  const [open, setOpen] = useState(expand.open);
  useEffect(() => {
    if (expand.n) setOpen(expand.open);
  }, [expand]);
  const style = TYPE_STYLE[c.changeType];
  const changed = useMemo(() => new Set(c.fieldChanges.map((f) => f.field)), [c.fieldChanges]);
  const Icon = style.icon;
  const preview = c.fieldChanges.length === 1 && !isLongText(c.fieldChanges[0].old) && !isLongText(c.fieldChanges[0].new) ? c.fieldChanges[0] : null;
  return (
    <div className="border-t border-boomi-cardBorder/60 first:border-t-0">
      <button onClick={() => setOpen(!open)} aria-expanded={open} className="w-full flex items-start sm:items-center gap-2.5 sm:gap-3 px-3 sm:px-4 py-2.5 text-left hover:bg-boomi-hover/40 transition cursor-pointer">
        {open ? <ChevronDown className="w-3.5 h-3.5 text-slate-500 shrink-0 mt-1 sm:mt-0" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-500 shrink-0 mt-1 sm:mt-0" />}
        <span className={`flex items-center justify-center gap-1 w-7 h-6 sm:w-[84px] rounded-full border text-[10px] font-bold shrink-0 ${style.badge}`} title={style.label}>
          <Icon className="w-3 h-3" /><span className="hidden sm:inline">{style.label}</span>
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-xs font-medium text-white line-clamp-2 sm:truncate">{c.title}</div>
          <div className="text-[10px] text-slate-500 line-clamp-2 sm:truncate mt-0.5">
            {SCOPE_LABEL[c.scope] ?? c.scope}
            {preview && <> · {fieldLabel(preview.field)}: <span className="text-rose-300"><Value v={preview.old} /></span> → <span className="text-emerald-300"><Value v={preview.new} /></span></>}
            {!preview && c.fieldChanges.length > 1 && <> · {c.fieldChanges.length} fields changed</>}
          </div>
        </div>
        {c.ambiguous && <span title={c.ambiguous} className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-violet-500/15 text-violet-300 border border-violet-500/40 text-[10px] font-bold shrink-0"><AlertTriangle className="w-3 h-3" /><span className="hidden sm:inline">Review</span></span>}
      </button>

      {open && (
        <div className="px-3 sm:px-4 pb-4 pt-1 space-y-3 bg-slate-950/20">
          {c.ambiguous && <p className="text-[11px] text-violet-200 bg-violet-950/30 border border-violet-500/30 rounded-lg px-3 py-2">{c.ambiguous}</p>}
          {c.fieldChanges.length > 0 && <FieldChanges fields={c.fieldChanges} />}
          {(c.old || c.new) && (
            <details open={c.fieldChanges.length === 0}>
              <summary className="text-[10px] uppercase tracking-wider font-bold text-slate-500 cursor-pointer hover:text-slate-300 select-none">Full configuration</summary>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
                <ConfigPanel title="Before" data={c.old} changed={changed} tone="old" />
                <ConfigPanel title="After" data={c.new} changed={changed} tone="new" />
              </div>
            </details>
          )}
        </div>
      )}
    </div>
  );
};

interface Group {
  key: string;
  kind: 'shape' | 'map' | 'component';
  title: string;
  subtitle: string;
  badge: string | null;
  changes: ChangeEntry[];
}

const groupChanges = (changes: ChangeEntry[], componentName: string, kind: string): Group[] => {
  const groups = new Map<string, Group>();
  for (const c of changes) {
    let g: Omit<Group, 'changes'>;
    if (c.source) {
      g = { key: `map:${c.source.componentId}:${c.source.shapeId}`, kind: 'map', title: c.source.name, badge: 'Map component',
        subtitle: `Map revisions ${c.source.versions}` };
    } else if (c.shapeId) {
      g = { key: `shape:${c.shapeId}`, kind: 'shape', title: c.shapeName ?? c.shapeId, badge: c.shapeTypeLabel,
        subtitle: `Shape ${c.shapeId}` };
    } else {
      g = { key: 'component', kind: 'component', title: kind === 'process' ? 'Process settings' : `${componentName} settings`, badge: null,
        subtitle: 'Component-level configuration' };
    }
    if (!groups.has(g.key)) groups.set(g.key, { ...g, changes: [] });
    groups.get(g.key)!.changes.push(c);
  }
  return [...groups.values()];
};

const GROUP_ICON = { shape: Shapes, map: MapIcon, component: Settings2 };

const GroupCard: React.FC<{ group: Group }> = ({ group: g }) => {
  const Icon = GROUP_ICON[g.kind];
  const counts = (['added', 'modified', 'removed'] as ChangeType[]).map((t) => [t, g.changes.filter((c) => c.changeType === t).length] as const).filter(([, n]) => n);
  return (
    <section className="rounded-2xl border border-boomi-cardBorder bg-boomi-card overflow-hidden">
      <header className="flex items-center gap-3 px-3 sm:px-4 py-3 bg-slate-900/50 border-b border-boomi-cardBorder">
        <div className="hidden sm:block p-1.5 rounded-lg bg-slate-800 border border-slate-700"><Icon className="w-4 h-4 text-boomi-accent" /></div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0">
            <h3 className="text-sm font-semibold text-white break-words min-w-0">{g.title}</h3>
            {g.badge && <span className="px-1.5 py-0.5 rounded-md bg-slate-800 border border-slate-700 text-[10px] text-slate-300 shrink-0">{g.badge}</span>}
          </div>
          <div className="text-[10px] text-slate-500 font-mono truncate">{g.subtitle}</div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {counts.map(([t, n]) => (
            <span key={t} title={TYPE_STYLE[t].label} className="flex items-center gap-1 text-[10px] text-slate-400">
              <span className={`w-1.5 h-1.5 rounded-full ${TYPE_STYLE[t].dot}`} />{n}
            </span>
          ))}
        </div>
      </header>
      <div>{g.changes.map((c) => <ChangeRow key={c.id} change={c} />)}</div>
    </section>
  );
};

const matches = (c: ChangeEntry, q: string) =>
  [c.title, c.shapeName, c.shapeTypeLabel, c.source?.name, ...c.fieldChanges.flatMap((f) => [fieldLabel(f.field), f.old, f.new])]
    .some((s) => s && s.toLowerCase().includes(q));

interface Props {
  result: ComparisonResult;
  includeUnchanged: boolean;
  onToggleUnchanged: (v: boolean) => void;
}

export const DiffView: React.FC<Props> = ({ result, includeUnchanged, onToggleUnchanged }) => {
  const [tab, setTab] = useState<TabId>('all');
  const [types, setTypes] = useState<Record<ChangeType, boolean>>({ added: true, modified: true, removed: true, unchanged: true });
  const [query, setQuery] = useState('');
  const [expand, setExpand] = useState({ open: false, n: 0 });
  const [rootRef, rootWidth] = useElementWidth<HTMLDivElement>();
  const { summary } = result;

  const counts = (id: TabId) => (id === 'all' ? summary.total : summary.byCategory[id].total);
  const q = query.trim().toLowerCase();
  const visible = result.changes.filter((c) => (tab === 'all' || c.category === tab) && types[c.changeType] && (!q || matches(c, q)));
  const groups = useMemo(() => groupChanges(visible, result.componentName, result.kind), [visible, result.componentName, result.kind]);
  const toggle = (t: ChangeType) => setTypes((s) => ({ ...s, [t]: !s[t] }));
  const shapesTouched = new Set(result.changes.filter((c) => c.shapeId && !c.source && c.changeType !== 'unchanged').map((c) => c.shapeId)).size;

  const cards: { type: ChangeType | null; label: string; value: number; cls: string }[] = [
    { type: 'added', label: 'Added', value: summary.added, cls: 'text-emerald-300' },
    { type: 'modified', label: 'Modified', value: summary.modified, cls: 'text-amber-300' },
    { type: 'removed', label: 'Removed', value: summary.removed, cls: 'text-rose-300' },
    { type: null, label: 'Shapes affected', value: shapesTouched, cls: 'text-sky-300' },
  ];

  return (
    <RefsContext.Provider value={result.references ?? {}}>
      <ExpandContext.Provider value={expand}>
        <div ref={rootRef} className="space-y-3">
          <SourceBanner source={result.source} />

          {result.warnings.map((w) => (
            <div key={w} className="flex items-start gap-2 text-[11px] text-sky-200 bg-sky-950/30 border border-sky-500/30 rounded-xl px-3 py-2">
              <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-sky-400" /><span>{w}</span>
            </div>
          ))}

          {/* Summary: the change-type cards double as filters */}
          <div className={`grid gap-2 ${rootWidth >= 520 ? 'grid-cols-4' : 'grid-cols-2'}`}>
            {cards.map((c) => {
              const off = c.type !== null && !types[c.type];
              const Tag = c.type ? 'button' : 'div';
              return (
                <Tag key={c.label} {...(c.type ? { onClick: () => toggle(c.type!), 'aria-pressed': !off, title: off ? `Show ${c.label.toLowerCase()}` : `Hide ${c.label.toLowerCase()}` } : {})}
                  className={`text-left rounded-xl bg-boomi-card border px-3.5 py-2.5 transition ${c.type ? 'cursor-pointer hover:border-slate-500' : ''} ${off ? 'border-slate-800 opacity-40' : 'border-boomi-cardBorder'}`}>
                  <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">{c.label}</div>
                  <div className={`text-xl sm:text-2xl font-bold ${c.cls}`}>{c.value}</div>
                </Tag>
              );
            })}
          </div>

          {/* Toolbar */}
          <div className="flex flex-wrap items-center gap-2">
            <div role="tablist" className="flex max-w-full gap-1 p-1 rounded-xl bg-slate-900/80 border border-slate-800 overflow-x-auto [scrollbar-width:none]">
              {TABS.map((t) => (
                <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}
                  className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition cursor-pointer ${tab === t.id ? 'bg-slate-800 text-white font-semibold' : 'text-slate-400 hover:text-slate-200'}`}>
                  {t.label}
                  <span className={`text-[10px] px-1.5 rounded-full font-bold ${tab === t.id ? 'bg-sky-400/25 text-sky-200' : 'bg-slate-800 text-slate-500'}`}>{counts(t.id)}</span>
                </button>
              ))}
            </div>
            <div className="flex grow basis-[260px] gap-2 min-w-0">
              <div className="relative flex-1 min-w-0">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find a shape, field or value…" aria-label="Filter changes"
                  className={`${inputCls} w-full pl-8 pr-7`} />
                {query && (
                  <button onClick={() => setQuery('')} aria-label="Clear" className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1 text-slate-500 hover:text-white cursor-pointer"><X className="w-3 h-3" /></button>
                )}
              </div>
              <button onClick={() => setExpand((e) => ({ open: !e.open, n: e.n + 1 }))}
                title={expand.open ? 'Collapse all' : 'Expand all'}
                className="flex items-center gap-1.5 px-3 rounded-xl bg-slate-900 border border-slate-700 text-xs text-slate-300 hover:text-white transition cursor-pointer shrink-0 whitespace-nowrap">
                {expand.open ? <ChevronsDownUp className="w-3.5 h-3.5" /> : <ChevronsUpDown className="w-3.5 h-3.5" />}
                <span className="hidden sm:inline">{expand.open ? 'Collapse all' : 'Expand all'}</span>
              </button>
            </div>
          </div>
          <label className="flex items-center gap-1.5 w-fit text-[11px] text-slate-400 cursor-pointer">
            <input type="checkbox" checked={includeUnchanged} onChange={(e) => onToggleUnchanged(e.target.checked)} className="accent-sky-500" />
            Also show unchanged items
          </label>

          {summary.total === 0 && !includeUnchanged ? (
            <EmptyState title="No differences" message="These two revisions have the same configuration. Canvas positions and XML formatting are ignored." />
          ) : groups.length === 0 ? (
            <EmptyState title="Nothing matches" message="No changes match the current tab, filters or search." />
          ) : (
            <div className="space-y-3">
              {groups.map((g) => <GroupCard key={g.key} group={g} />)}
            </div>
          )}
        </div>
      </ExpandContext.Provider>
    </RefsContext.Provider>
  );
};
