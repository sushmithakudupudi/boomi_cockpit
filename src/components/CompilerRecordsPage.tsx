import React, { useMemo, useState } from 'react';
import { FileEdit, Send, Trash2, Copy, Pencil, Layers, RotateCcw, Eye, X, Check, Terminal, Clipboard } from 'lucide-react';
import type { BlueprintConfig, Stage } from '../types/compiler';
import { createBlankConfig, generateBoomiCompanionPrompt, generateGates, generateJobBreakdown } from '../services/boomiPromptEngine';

export interface BlueprintRecord {
  id: string;
  blueprintId: string;
  title: string;
  status?: string;
  stages: { label: string; selectedShapeOrConnector: string; category?: string; notes?: string; subLabel?: string; badgeText?: string; details?: Record<string, unknown> }[];
  businessRule?: string;
  settings?: Record<string, unknown>;
  processName?: string;
  sentAt?: string | null;
  updatedAt?: string;
  deletedAt?: string | null;
  buildResult?: {
    name?: string;
    componentId?: string;
    folder?: string;
    components?: { type: string; name: string }[];
  } | null;
}

interface Props {
  kind: 'draft' | 'sent' | 'deleted';
  records: BlueprintRecord[];
  onOpen: (record: BlueprintRecord) => void;
  onDelete: (record: BlueprintRecord) => void;
  onDuplicate: (record: BlueprintRecord) => void;
  onRestore: (record: BlueprintRecord) => void;
  onNew: () => void;
}

const formatTime = (iso?: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
};

const retentionDaysLeft = (deletedAt?: string | null) => {
  const deletedTime = deletedAt ? new Date(deletedAt).getTime() : NaN;
  return Number.isFinite(deletedTime)
    ? Math.max(0, Math.ceil((30 * 86400000 - (Date.now() - deletedTime)) / 86400000))
    : 0;
};

export const CompilerRecordsPage: React.FC<Props> = ({ kind, records, onOpen, onDelete, onDuplicate, onRestore, onNew }) => {
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [viewRecord, setViewRecord] = useState<BlueprintRecord | null>(null);
  const [copiedDeletedPrompt, setCopiedDeletedPrompt] = useState(false);
  const isDraft = kind === 'draft';
  const isDeleted = kind === 'deleted';
  const Icon = isDeleted ? Trash2 : isDraft ? FileEdit : Send;

  const deletedBlueprint = useMemo<BlueprintConfig | null>(() => {
    if (!viewRecord) return null;
    const defaults = createBlankConfig();
    return {
      blueprintId: viewRecord.blueprintId || defaults.blueprintId,
      title: viewRecord.title || defaults.title,
      stages: (viewRecord.stages || []) as Stage[],
      businessRule: viewRecord.businessRule || '',
      settings: { ...defaults.settings, ...((viewRecord.settings || {}) as Partial<BlueprintConfig['settings']>) },
    };
  }, [viewRecord]);
  const deletedPrompt = useMemo(() => deletedBlueprint ? generateBoomiCompanionPrompt(deletedBlueprint) : '', [deletedBlueprint]);
  const deletedJobs = useMemo(() => deletedBlueprint ? generateJobBreakdown(deletedBlueprint) : [], [deletedBlueprint]);
  const deletedGates = useMemo(() => deletedBlueprint ? generateGates(deletedBlueprint).filter((gate) => gate.included) : [], [deletedBlueprint]);

  const copyDeletedPrompt = async () => {
    try {
      await navigator.clipboard.writeText(deletedPrompt);
      setCopiedDeletedPrompt(true);
      setTimeout(() => setCopiedDeletedPrompt(false), 2200);
    } catch {
      setCopiedDeletedPrompt(false);
    }
  };

  return (
    <div className="space-y-5 pb-12 animate-fade-in text-slate-200">
      <div className="flex items-center justify-between gap-3 pb-3 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-sky-500/15 border border-sky-500/30 text-sky-300">
            <Icon className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-extrabold text-white">{isDeleted ? 'Deleted items' : isDraft ? 'Draft blueprints' : 'Sent to Boomi'}</h1>
            <p className="text-xs text-slate-400">
              {isDeleted ? 'Deleted drafts and sent blueprints are kept for 30 days, then permanently removed.' : isDraft
                ? 'Saved designs that have not been sent to Boomi yet. Open one to keep working.'
                : 'Blueprints that were created as processes in Boomi. They are kept here as a record.'}
            </p>
          </div>
        </div>
        <button
          onClick={onNew}
          className="px-3 py-1.5 rounded-lg bg-sky-600/20 hover:bg-sky-600/30 text-sky-200 text-xs font-bold border border-sky-500/40 cursor-pointer"
        >
          + New blueprint
        </button>
      </div>

      {records.length === 0 ? (
        <div className="text-center py-20 rounded-2xl border border-dashed border-slate-700 bg-slate-900/40">
          <p className="text-sm font-bold text-white">{isDeleted ? 'No deleted items' : isDraft ? 'No drafts yet' : 'Nothing sent yet'}</p>
          <p className="text-xs text-slate-400 mt-1">
            {isDeleted ? 'Deleted items will appear here for 30 days.' : isDraft
              ? 'Click + New and your work is saved here automatically.'
              : 'When you click Build in Boomi and confirm, the blueprint moves here.'}
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {records.map((r) => (
            <li key={r.id} className="rounded-xl bg-slate-900/80 border border-slate-800 p-4 space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-bold text-white truncate">
                    {isDraft || isDeleted ? r.title || r.buildResult?.name || r.processName || 'Untitled blueprint' : r.buildResult?.name || r.processName || r.title}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    {isDeleted ? `Deleted ${formatTime(r.deletedAt)} · ${retentionDaysLeft(r.deletedAt)} days left` : isDraft ? `Updated ${formatTime(r.updatedAt)}` : `Sent ${formatTime(r.sentAt || r.updatedAt)}`}
                    {' · '}
                    {r.stages.length} shapes
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {isDeleted ? (
                    <>
                      <button onClick={() => setViewRecord(r)} title="View deleted item" aria-label="View deleted item" className="p-1.5 rounded-lg text-slate-400 hover:text-sky-300 hover:bg-slate-800 cursor-pointer"><Eye className="w-4 h-4" /></button>
                      <button onClick={() => onRestore(r)} className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-600/20 text-emerald-200 text-xs font-bold border border-emerald-500/40 cursor-pointer"><RotateCcw className="w-3.5 h-3.5" /> Restore</button>
                    </>
                  ) : isDraft ? (
                    <button
                      onClick={() => onOpen(r)}
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-sky-600/20 hover:bg-sky-600/30 text-sky-200 text-xs font-bold border border-sky-500/40 cursor-pointer"
                    >
                      <Pencil className="w-3.5 h-3.5" /> Open
                    </button>
                  ) : (
                    <button
                      onClick={() => onDuplicate(r)}
                      title="Start a new draft from this blueprint"
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 cursor-pointer"
                    >
                      <Copy className="w-3.5 h-3.5" /> Copy to new draft
                    </button>
                  )}
                  {!isDeleted && (confirmId === r.id ? (
                    <>
                      <button
                        onClick={() => { setConfirmId(null); onDelete(r); }}
                        className="px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold cursor-pointer"
                      >
                        {isDraft ? 'Delete' : 'Remove'}
                      </button>
                      <button
                        onClick={() => setConfirmId(null)}
                        className="px-2.5 py-1 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 text-xs cursor-pointer"
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => setConfirmId(r.id)}
                      title={isDraft ? 'Delete draft' : 'Remove from this list (the Boomi process stays in Boomi)'}
                      aria-label={isDraft ? 'Delete draft' : 'Remove record'}
                      className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-slate-800 cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-slate-500" />
                {r.stages.map((s, i) => (
                  <span key={i} className="px-1.5 py-0.5 rounded bg-slate-950 border border-slate-800 text-[10px] text-slate-400">
                    {s.label || s.selectedShapeOrConnector}
                  </span>
                ))}
              </div>

              {!isDraft && r.buildResult && (
                <div className="text-[11px] text-slate-400 space-y-0.5 pt-1 border-t border-slate-800">
                  <div>Component ID: <code className="text-slate-300">{r.buildResult.componentId}</code></div>
                  <div>Folder: <code className="text-slate-300">{r.buildResult.folder || 'default'}</code></div>
                  {(r.buildResult.components || []).map((c, i) => (
                    <div key={i}>Also created ({c.type}): <code className="text-slate-300">{c.name}</code></div>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {isDeleted && viewRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4" onClick={() => setViewRecord(null)}>
          <section role="dialog" aria-modal="true" aria-labelledby="deleted-item-title" onClick={(event) => event.stopPropagation()} className="w-full max-w-3xl max-h-[85vh] overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl">
            <header className="sticky top-0 flex items-start justify-between gap-4 border-b border-slate-800 bg-slate-900 p-5">
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Read-only deleted item</p>
                <h2 id="deleted-item-title" className="mt-1 truncate text-lg font-bold text-white">{viewRecord.title || viewRecord.buildResult?.name || viewRecord.processName || 'Untitled blueprint'}</h2>
                <p className="mt-1 text-xs text-slate-400">{viewRecord.status === 'sent' ? 'Sent item' : 'Draft'} · {retentionDaysLeft(viewRecord.deletedAt)} days left</p>
              </div>
              <button onClick={() => setViewRecord(null)} aria-label="Close view" className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white"><X className="h-4 w-4" /></button>
            </header>
            <div className="space-y-5 p-5">
              <section className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-sky-400">01 / DESIGN YOUR PLAN</p>
                    <h3 className="mt-0.5 text-base font-bold text-white">Integration blueprint</h3>
                    <p className="mt-1 text-xs text-slate-400">Read-only snapshot of the saved stages and configuration.</p>
                  </div>
                  <span className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-[10px] font-bold text-slate-300">{viewRecord.blueprintId}</span>
                </div>
                <div className="grid grid-cols-1 gap-3 pt-2 sm:grid-cols-2">
                  {viewRecord.stages.map((stage, index) => {
                    const isSource = index === 0;
                    const isLast = index === viewRecord.stages.length - 1;
                    return <article key={`${viewRecord.id}-${index}`} className={`flex min-h-[250px] flex-col justify-between rounded-xl border p-4 ${isSource ? 'border-sky-500/60 bg-slate-900/90' : 'border-slate-700/80 bg-slate-900/90'}`}>
                      <div>
                        <div className="mb-3 flex items-center justify-between text-xs">
                          <div className="flex items-center gap-1.5"><span className="text-[11px] font-bold tracking-wider text-slate-400">STEP {String(index + 1).padStart(2, '0')}</span><Check className="h-3.5 w-3.5 text-emerald-400" /></div>
                          <span className="text-[10px] font-mono text-slate-500">{stage.badgeText || ''}</span>
                        </div>
                        <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">{stage.category}</div>
                        <h4 className="mb-2 border-b border-slate-700 pb-1 text-sm font-bold text-white">{stage.label || stage.selectedShapeOrConnector}</h4>
                        <div className="rounded-lg border border-slate-700 bg-slate-800/90 px-3 py-2 text-xs font-semibold text-slate-100">{stage.selectedShapeOrConnector}{stage.subLabel ? ` (${stage.subLabel})` : ''}</div>
                        <div className="mt-2 min-h-[52px] whitespace-pre-wrap rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-[11px] text-slate-300">{stage.notes || <span className="text-slate-600">No configuration notes</span>}</div>
                        {stage.details && Object.keys(stage.details).length > 0 && <pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded-lg border border-slate-800 bg-slate-950/50 p-2 text-[10px] text-slate-500">{JSON.stringify(stage.details, null, 2)}</pre>}
                      </div>
                      <div className="mt-3 flex items-center justify-between border-t border-slate-800 pt-3 text-[11px] text-slate-400"><span className="flex items-center gap-1.5 font-medium text-sky-300/90"><span className="h-1.5 w-1.5 rounded-full bg-sky-400" />{stage.subLabel || 'Configured shape'}</span><span className="text-[10px] font-mono text-slate-500">{isSource ? 'START' : isLast ? 'END' : 'CANVAS STEP'}</span></div>
                    </article>;
                  })}
                </div>
              {viewRecord.businessRule && <section><h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-400">Business rule</h3><p className="whitespace-pre-wrap rounded-xl border border-slate-800 bg-slate-950/60 p-3 text-sm text-slate-300">{viewRecord.businessRule}</p></section>}
              {viewRecord.settings && <section><h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-400">Blueprint settings</h3><dl className="grid gap-2 sm:grid-cols-2">{Object.entries(viewRecord.settings).map(([name, value]) => <div key={name} className="rounded-lg border border-slate-800 bg-slate-950/60 p-3"><dt className="text-xs text-slate-400">{name.replace(/([A-Z])/g, ' $1')}</dt><dd className="mt-1 text-xs font-semibold text-slate-200">{String(value)}</dd></div>)}</dl></section>}
              </section>
              <section className="space-y-3 rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
                <div className="flex items-center justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-wider text-sky-400">02 / COMPILE &amp; REVIEW</p><h3 className="mt-0.5 text-base font-bold text-white">Execution plan</h3></div><span className="rounded-full border border-slate-700 bg-slate-800 px-2.5 py-1 text-[10px] font-bold text-slate-300">READ-ONLY PREVIEW</span></div>
                <div className="grid gap-2 sm:grid-cols-3">
                  <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-3 text-center"><div className="text-[10px] font-bold uppercase text-slate-500">Plan items</div><div className="text-lg font-extrabold text-white">{deletedJobs.length}</div></div>
                  <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-3 text-center"><div className="text-[10px] font-bold uppercase text-slate-500">Included gates</div><div className="text-lg font-extrabold text-sky-300">{deletedGates.length}</div></div>
                  <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-3 text-center"><div className="text-[10px] font-bold uppercase text-slate-500">Stages</div><div className="text-lg font-extrabold text-white">{viewRecord.stages.length}</div></div>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3"><div className="flex items-center justify-between gap-3"><div><h4 className="text-xs font-bold text-white">Compiler status</h4><p className="mt-1 text-[11px] text-slate-400">Prompt and execution plan reconstructed from this saved blueprint with the local rules engine.</p></div><span className="rounded-md border border-sky-500/30 bg-sky-500/10 px-2 py-1 text-[10px] font-bold text-sky-300">PREVIEW</span></div></div>
                <div className="space-y-2">{deletedJobs.map((job, index) => <article key={job.id} className="rounded-xl border border-slate-800 bg-slate-950/70 p-3"><div className="flex flex-wrap items-center justify-between gap-2"><span className="font-mono text-xs font-bold text-sky-300">{String(index + 1).padStart(2, '0')} · {job.name}</span><span className="rounded bg-slate-800 px-2 py-0.5 text-[10px] text-slate-400">{job.componentType}</span></div><p className="mt-1 text-xs text-slate-300">{job.purpose}</p><div className="mt-2 flex flex-wrap gap-1.5">{job.shapesInvolved.map((shape, shapeIndex) => <span key={shapeIndex} className="rounded border border-slate-800 bg-slate-900 px-2 py-0.5 text-[10px] text-slate-400">{shape}</span>)}</div><p className="mt-1 text-[11px] text-slate-500">Folder: {job.boomiFolder}</p></article>)}</div>
                <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3"><div className="mb-2 flex items-center justify-between gap-3"><h4 className="flex items-center gap-2 text-xs font-bold text-white"><Terminal className="h-3.5 w-3.5 text-sky-400" /> Companion prompt</h4><button onClick={copyDeletedPrompt} className="flex items-center gap-1.5 rounded-lg border border-sky-500/40 bg-sky-600/20 px-2.5 py-1.5 text-[11px] font-bold text-sky-200 hover:bg-sky-600/30">{copiedDeletedPrompt ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Clipboard className="h-3.5 w-3.5" />}{copiedDeletedPrompt ? 'Copied' : 'Copy prompt'}</button></div><pre className="max-h-72 overflow-y-auto whitespace-pre-wrap break-words rounded-lg bg-slate-950 p-3 font-mono text-[11px] leading-relaxed text-slate-300">{deletedPrompt}</pre></div>
              </section>
              {viewRecord.buildResult && <section><h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-400">Boomi process details</h3><div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 text-xs text-slate-300">{viewRecord.buildResult.name && <p>Name: {viewRecord.buildResult.name}</p>}{viewRecord.buildResult.componentId && <p>Component ID: {viewRecord.buildResult.componentId}</p>}<p>Folder: {viewRecord.buildResult.folder || 'default'}</p></div></section>}
            </div>
            <footer className="flex justify-end gap-2 border-t border-slate-800 p-4"><button onClick={() => setViewRecord(null)} className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-200">Close</button><button onClick={() => { onRestore(viewRecord); setViewRecord(null); }} className="flex items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-600/20 px-3 py-2 text-xs font-bold text-emerald-200"><RotateCcw className="h-3.5 w-3.5" /> Restore item</button></footer>
          </section>
        </div>
      )}
    </div>
  );
};
