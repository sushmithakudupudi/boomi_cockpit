import React, { useState } from 'react';
import { FileEdit, Send, Trash2, Copy, Pencil, Layers } from 'lucide-react';

export interface BlueprintRecord {
  id: string;
  blueprintId: string;
  title: string;
  status?: string;
  stages: { label: string; selectedShapeOrConnector: string }[];
  processName?: string;
  sentAt?: string | null;
  updatedAt?: string;
  buildResult?: {
    name?: string;
    componentId?: string;
    folder?: string;
    components?: { type: string; name: string }[];
  } | null;
}

interface Props {
  kind: 'draft' | 'sent';
  records: BlueprintRecord[];
  onOpen: (record: BlueprintRecord) => void;
  onDelete: (record: BlueprintRecord) => void;
  onDuplicate: (record: BlueprintRecord) => void;
  onNew: () => void;
}

const formatTime = (iso?: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
};

export const CompilerRecordsPage: React.FC<Props> = ({ kind, records, onOpen, onDelete, onDuplicate, onNew }) => {
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const isDraft = kind === 'draft';
  const Icon = isDraft ? FileEdit : Send;

  return (
    <div className="space-y-5 pb-12 animate-fade-in text-slate-200">
      <div className="flex items-center justify-between gap-3 pb-3 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-purple-500/15 border border-purple-500/30 text-purple-300">
            <Icon className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-extrabold text-white">{isDraft ? 'Draft blueprints' : 'Sent to Boomi'}</h1>
            <p className="text-xs text-slate-400">
              {isDraft
                ? 'Saved designs that have not been sent to Boomi yet. Open one to keep working.'
                : 'Blueprints that were created as processes in Boomi. They are kept here as a record.'}
            </p>
          </div>
        </div>
        <button
          onClick={onNew}
          className="px-3 py-1.5 rounded-lg bg-purple-600/20 hover:bg-purple-600/30 text-purple-200 text-xs font-bold border border-purple-500/40 cursor-pointer"
        >
          + New blueprint
        </button>
      </div>

      {records.length === 0 ? (
        <div className="text-center py-20 rounded-2xl border border-dashed border-slate-700 bg-slate-900/40">
          <p className="text-sm font-bold text-white">{isDraft ? 'No drafts yet' : 'Nothing sent yet'}</p>
          <p className="text-xs text-slate-400 mt-1">
            {isDraft
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
                    {isDraft ? r.title || 'Untitled blueprint' : r.buildResult?.name || r.processName || r.title}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    {isDraft ? `Updated ${formatTime(r.updatedAt)}` : `Sent ${formatTime(r.sentAt || r.updatedAt)}`}
                    {' · '}
                    {r.stages.length} shapes
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {isDraft ? (
                    <button
                      onClick={() => onOpen(r)}
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-purple-600/20 hover:bg-purple-600/30 text-purple-200 text-xs font-bold border border-purple-500/40 cursor-pointer"
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
                  {confirmId === r.id ? (
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
                  )}
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
    </div>
  );
};
