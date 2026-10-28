import React, { useState } from 'react';
import { TriangleAlert, RotateCcw, Sparkles, LoaderCircle, CheckCircle2 } from 'lucide-react';
import type { ExecutionRecord } from '../types/boomi';
import { InvestigationCard } from './InvestigationCard';

// A failed execution shown inside the chat: the error, and what you can do about it, with no popups.
// Anything that runs asks "are you sure?" right here in the message.

export interface ActionOutcome {
  ok: boolean;
  message: string;
}

interface Props {
  execution: ExecutionRecord;
  onReprocess: (executionId: string) => Promise<ActionOutcome>;
  onRerun: (execution: ExecutionRecord) => Promise<ActionOutcome>;
  onAskFollowUp: (prompt: string) => void;
}

type Pending = 'reprocess' | 'rerun' | null;

const timeAgo = (iso?: string): string => {
  const ms = Date.now() - new Date(iso || '').getTime();
  if (Number.isNaN(ms) || ms < 0) return 'just now';
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${Math.max(mins, 1)}m ago`;
  const hours = Math.floor(mins / 60);
  return hours < 48 ? `${hours}h ago` : `${Math.floor(hours / 24)}d ago`;
};

export const ChatTriageCard: React.FC<Props> = ({ execution, onReprocess, onRerun, onAskFollowUp }) => {
  const [pending, setPending] = useState<Pending>(null);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<{ kind: 'reprocess' | 'rerun'; result: ActionOutcome } | null>(null);
  const [showCause, setShowCause] = useState(false);

  const run = async (kind: 'reprocess' | 'rerun') => {
    setBusy(true);
    try {
      const result = kind === 'reprocess' ? await onReprocess(execution.id) : await onRerun(execution);
      setOutcome({ kind, result });
    } catch (e) {
      setOutcome({ kind, result: { ok: false, message: e instanceof Error ? e.message : 'That did not work.' } });
    } finally {
      setBusy(false);
      setPending(null);
    }
  };

  const looksLikeLoadJob = /chaos|load|fuzz|stress/i.test(execution.processName);

  return (
    <div className="space-y-3 text-xs">
      <div className="flex items-start gap-2">
        <TriangleAlert className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
        <div className="min-w-0">
          <div className="font-bold text-white break-words">{execution.processName}</div>
          <div className="text-slate-400">{execution.atomName} · failed {timeAgo(execution.startedAt)}</div>
        </div>
      </div>

      <div className="rounded-lg border border-rose-500/30 bg-rose-950/30 p-2.5 font-mono text-[11px] text-rose-100 max-h-40 overflow-y-auto whitespace-pre-wrap break-words">
        {execution.errorMessage || 'No error message was reported for this execution.'}
      </div>

      {outcome && (
        <div className={`flex items-start gap-2 rounded-lg border p-2.5 ${outcome.result.ok ? 'border-emerald-500/30 bg-emerald-950/20 text-emerald-100' : 'border-amber-500/30 bg-amber-950/20 text-amber-100'}`}>
          {outcome.result.ok ? <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400 mt-0.5" /> : <TriangleAlert className="w-4 h-4 shrink-0 text-amber-400 mt-0.5" />}
          <p className="break-words">{outcome.result.message}</p>
        </div>
      )}

      {pending ? (
        <div className="rounded-lg border border-amber-500/30 bg-amber-950/20 p-2.5 space-y-2">
          <p className="text-amber-100">
            {pending === 'reprocess'
              ? <>Reprocess the failed documents of <strong className="text-white">{execution.processName}</strong>? Boomi replays them through the process.</>
              : <>Start <strong className="text-white">{execution.processName}</strong> on <strong className="text-white">{execution.atomName}</strong> now? It runs the real integration, so it can call external systems and change data.</>}
          </p>
          {pending === 'rerun' && looksLikeLoadJob && (
            <p className="text-amber-200/90">The name suggests a load or chaos test, so running it again will generate traffic and may fail the same way.</p>
          )}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => run(pending)}
              disabled={busy}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-bold cursor-pointer disabled:opacity-60"
            >
              {busy && <LoaderCircle className="w-3.5 h-3.5 animate-spin" />}
              {busy ? 'Working…' : pending === 'reprocess' ? 'Yes, reprocess' : 'Yes, run it'}
            </button>
            <button onClick={() => setPending(null)} disabled={busy} className="px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 cursor-pointer">
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => { setOutcome(null); setPending('reprocess'); }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-pink-500/20 hover:bg-pink-500/30 text-pink-200 font-bold border border-pink-500/40 transition cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reprocess</span>
          </button>
          <button
            onClick={() => { setOutcome(null); setPending('rerun'); }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold border border-slate-700 transition cursor-pointer"
          >
            <span>Re-run process</span>
          </button>
          <button
            onClick={() => setShowCause((v) => !v)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold border border-slate-700 transition cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5 text-pink-300" />
            <span>{showCause ? 'Hide the cause' : 'Find the cause'}</span>
          </button>
        </div>
      )}

      <p className="text-[11px] text-slate-500">Reprocess replays the documents that failed. Re-run starts a brand-new run of the process.</p>

      {showCause && <InvestigationCard execution={execution} onAskFollowUp={onAskFollowUp} />}
    </div>
  );
};
