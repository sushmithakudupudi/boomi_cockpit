import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Microscope, ChevronDown } from 'lucide-react';
import { api } from '../services/api';
import type { ExecutionRecord } from '../types/boomi';

// Shows the failure investigator's diagnosis for the open incident. The investigator only reads data
// from Boomi; nothing is run or changed by it.

interface Diagnosis {
  summary: string;
  failureKind: string;
  likelyCause: string;
  confidence: 'high' | 'medium' | 'low';
  evidence: string[];
  suggestedNextSteps: string[];
  caution?: string;
}

interface AgentAction {
  id: string;
  type: string;
  status: 'pending' | 'approved' | 'rejected' | 'executed' | 'failed' | 'expired';
  processName: string;
  atomName?: string;
  rationale?: string;
  decidedBy?: string;
  message?: string;
  params?: { targetVersion?: number; expectedCurrentVersion?: number; suspectVersion?: number };
}

interface PastIncident {
  executionId: string;
  processName: string;
  failedAt?: string;
  likelyCause: string;
  outcome: string;
  whatFixedIt?: string[] | null;
}

interface IncidentMemory {
  resolutions?: { kind: string; text: string; by: string; at: string }[];
  recoveredAt?: string | null;
  similar?: PastIncident[];
}

interface Investigation {
  executionId: string;
  status: 'running' | 'done' | 'error' | 'skipped';
  reason?: string;
  diagnosis?: Diagnosis;
  steps?: { tool: string; args: Record<string, unknown>; ok: boolean }[];
}

const CONFIDENCE_STYLE: Record<string, string> = {
  high: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  medium: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  low: 'bg-slate-700/60 text-slate-300 border-slate-600',
};

const TOOL_LABEL: Record<string, string> = {
  get_process_executions: 'Read execution history',
  get_component_revisions: 'Compared revisions',
  get_audit_log: 'Checked the audit log',
  get_components: 'Looked up components',
  get_deployments: 'Checked deployments',
};

const POLL_MS = 3000;

interface Props {
  execution: ExecutionRecord;
  onAskFollowUp: (prompt: string) => void;
}

export const InvestigationCard: React.FC<Props> = ({ execution, onAskFollowUp }) => {
  const [inv, setInv] = useState<Investigation | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSteps, setShowSteps] = useState(false);
  const [actions, setActions] = useState<AgentAction[]>([]);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [deciding, setDeciding] = useState(false);
  const [memory, setMemory] = useState<IncidentMemory | null>(null);
  const [fixText, setFixText] = useState('');
  const [fixOpen, setFixOpen] = useState(false);
  const [savingFix, setSavingFix] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const load = useCallback(async () => {
    const doc = (await api.getInvestigation(execution.id)) as Investigation | null;
    setInv(doc);
    setLoaded(true);
    if (doc?.status === 'done') {
      setActions((await api.listActions(execution.id)) as AgentAction[]);
      setMemory((await api.getIncident(execution.id)) as IncidentMemory | null);
    }
    return doc;
  }, [execution.id]);

  // Load when the incident changes, and poll while an investigation is running
  useEffect(() => {
    let cancelled = false;
    setInv(null);
    setActions([]);
    setMemory(null);
    setFixOpen(false);
    setFixText('');
    setConfirmingId(null);
    setLoaded(false);
    setError(null);
    const tick = async () => {
      const doc = await load();
      if (!cancelled && doc?.status === 'running') timer.current = setTimeout(tick, POLL_MS);
    };
    tick();
    return () => { cancelled = true; if (timer.current) clearTimeout(timer.current); };
  }, [load]);

  const start = async (force = false) => {
    setError(null);
    try {
      const doc = (await api.runInvestigation(execution.id, force)) as Investigation;
      setInv(doc);
      if (doc.status === 'running') {
        if (timer.current) clearTimeout(timer.current);
        const tick = async () => {
          const next = await load();
          if (next?.status === 'running') timer.current = setTimeout(tick, POLL_MS);
        };
        timer.current = setTimeout(tick, POLL_MS);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start the investigation.');
    }
  };

  const decide = async (action: AgentAction, decision: 'approve' | 'reject') => {
    setDeciding(true);
    setError(null);
    try {
      const updated = (await api.decideAction(action.id, decision)) as AgentAction;
      setActions((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
      setConfirmingId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The decision could not be saved.');
    } finally {
      setDeciding(false);
    }
  };

  const saveFix = async () => {
    setSavingFix(true);
    setError(null);
    try {
      const updated = (await api.recordFix(execution.id, fixText)) as IncidentMemory;
      setMemory((prev) => ({ ...(prev || {}), ...updated, similar: prev?.similar }));
      setFixText('');
      setFixOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.');
    } finally {
      setSavingFix(false);
    }
  };

  const d = inv?.diagnosis;

  return (
    <div className="rounded-2xl bg-boomi-card border border-boomi-cardBorder p-4 shadow-lg space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Microscope className="w-4 h-4 text-boomi-accent" />
          <h3 className="text-sm font-bold text-white">Failure investigator</h3>
          <span className="text-[10px] text-slate-500">read-only</span>
        </div>
        {inv?.status === 'done' && (
          <button onClick={() => start(true)} className="text-[11px] text-slate-400 hover:text-white cursor-pointer">Investigate again</button>
        )}
      </div>

      {!loaded && <p className="text-xs text-slate-500">Checking for a diagnosis…</p>}

      {loaded && !inv && (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-xs text-slate-400 flex-1 min-w-[220px]">
            Not investigated yet. The investigator reads the execution history, revisions and audit log to explain this failure. It changes nothing in Boomi.
          </p>
          <button onClick={() => start(false)} className="px-3 py-1.5 rounded-lg bg-purple-600/20 hover:bg-purple-600/30 text-purple-200 text-xs font-bold border border-purple-500/40 cursor-pointer">
            Investigate this failure
          </button>
        </div>
      )}

      {inv?.status === 'running' && (
        <div className="flex items-center gap-2 text-xs text-slate-300">
          <span className="w-3 h-3 border-2 border-purple-300/40 border-t-purple-300 rounded-full animate-spin" />
          Investigating… this usually takes 20 to 40 seconds.
          {inv.steps && inv.steps.length > 0 && <span className="text-slate-500">({inv.steps.length} steps so far)</span>}
        </div>
      )}

      {(inv?.status === 'skipped' || inv?.status === 'error') && (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-xs text-amber-300/90 flex-1 min-w-[220px]">{inv.reason || 'The investigation did not run.'}</p>
          <button onClick={() => start(true)} className="px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 text-xs cursor-pointer">Try again</button>
        </div>
      )}

      {inv?.status === 'done' && d && (
        <div className="space-y-3 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`px-2 py-0.5 rounded-md border text-[10px] font-bold uppercase tracking-wider ${CONFIDENCE_STYLE[d.confidence] || CONFIDENCE_STYLE.low}`}>
              {d.confidence} confidence
            </span>
            <span className="px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 text-[10px]">{d.failureKind}</span>
          </div>
          <p className="text-sm font-semibold text-white">{d.summary}</p>
          <p className="text-slate-300"><span className="text-slate-500">Likely cause: </span>{d.likelyCause}</p>
          {d.caution && <p className="text-amber-300/90">⚠️ {d.caution}</p>}

          {d.evidence.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-wider font-bold text-slate-500 mb-1">Evidence</div>
              <ul className="space-y-1 list-disc ml-4 text-slate-300">{d.evidence.map((e, i) => <li key={i}>{e}</li>)}</ul>
            </div>
          )}
          {d.suggestedNextSteps.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-wider font-bold text-slate-500 mb-1">Suggested next steps (for you to decide)</div>
              <ul className="space-y-1 list-disc ml-4 text-slate-300">{d.suggestedNextSteps.map((e, i) => <li key={i}>{e}</li>)}</ul>
            </div>
          )}

          {memory?.similar && memory.similar.length > 0 && (
            <div className="rounded-xl border border-sky-500/30 bg-sky-950/20 p-3 space-y-2">
              <div className="font-bold text-sky-200">Seen before</div>
              {memory.similar.map((p) => (
                <div key={p.executionId} className="text-slate-300">
                  <span className="text-white font-semibold">{p.processName}</span>
                  <span className="text-slate-500"> · {p.failedAt ? new Date(p.failedAt).toLocaleDateString() : 'earlier'} · </span>
                  <span className={p.outcome === 'fixed and recovered' ? 'text-emerald-300' : 'text-slate-400'}>{p.outcome}</span>
                  <p className="text-slate-400">Then: {p.likelyCause}</p>
                  {p.whatFixedIt && p.whatFixedIt.length > 0 && <p className="text-emerald-200/90">What fixed it: {p.whatFixedIt.join(' ')}</p>}
                </div>
              ))}
              <p className="text-[11px] text-slate-500">Past causes are hints, not proof. The evidence above is from this failure.</p>
            </div>
          )}

          {memory && (
            <div className="space-y-1">
              {(memory.resolutions || []).map((r, i) => (
                <p key={i} className="text-emerald-200/90">Recorded fix: {r.text} <span className="text-slate-500">({r.by})</span></p>
              ))}
              {memory.recoveredAt && <p className="text-emerald-300">✓ The process ran successfully again ({new Date(memory.recoveredAt).toLocaleString()}).</p>}
              {fixOpen ? (
                <div className="flex flex-col gap-2">
                  <textarea
                    value={fixText}
                    onChange={(e) => setFixText(e.target.value)}
                    rows={2}
                    maxLength={500}
                    placeholder="What fixed it? This is remembered for next time."
                    aria-label="What fixed it"
                    className="w-full bg-slate-950/60 border border-slate-800 focus:border-purple-500 rounded-lg px-2.5 py-1.5 text-slate-200 placeholder-slate-600 focus:outline-none resize-none"
                  />
                  <div className="flex gap-2">
                    <button onClick={saveFix} disabled={savingFix || !fixText.trim()}
                      className="px-3 py-1.5 rounded-lg bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/40 text-purple-100 font-bold cursor-pointer disabled:opacity-50">
                      {savingFix ? 'Saving…' : 'Save'}
                    </button>
                    <button onClick={() => { setFixOpen(false); setFixText(''); }} className="px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 cursor-pointer">Cancel</button>
                  </div>
                </div>
              ) : (
                <button onClick={() => setFixOpen(true)} className="text-slate-400 hover:text-white cursor-pointer">
                  {(memory.resolutions || []).length > 0 ? 'Add another note about the fix' : 'Record what fixed it'}
                </button>
              )}
            </div>
          )}

          {actions.map((a) => (
            <div key={a.id} className={`rounded-xl border p-3 space-y-2 ${a.status === 'pending' ? 'border-amber-500/40 bg-amber-950/20' : 'border-slate-700 bg-slate-900/60'}`}>
              {a.status === 'pending' ? (
                <>
                  <div className="font-bold text-amber-200">Proposed action: needs your approval</div>
                  {a.type === 'restore_revision' ? (
                    <>
                      <p className="text-slate-200">
                        Restore <strong className="text-white">{a.processName}</strong> to <strong className="text-white">revision {a.params?.targetVersion}</strong>.
                      </p>
                      {a.rationale && <p className="text-slate-400">Why: {a.rationale}</p>}
                      <p className="text-[11px] text-slate-500">
                        Nothing has changed yet. Approving saves a <em>new</em> revision with the content of revision {a.params?.targetVersion}, which undoes
                        the changes made in revisions {(a.params?.targetVersion ?? 0) + 1} to {a.params?.expectedCurrentVersion}. History is kept, and it does not deploy:
                        the running process stays as it is until you deploy the new revision.
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="text-slate-200">
                        Re-run <strong className="text-white">{a.processName}</strong>{a.atomName ? <> on <strong className="text-white">{a.atomName}</strong></> : null}.
                      </p>
                      {a.rationale && <p className="text-slate-400">Why: {a.rationale}</p>}
                      <p className="text-[11px] text-slate-500">Nothing has run. Approving starts the process once, for real. It can call external systems and change data.</p>
                    </>
                  )}
                  {confirmingId === a.id ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-amber-200">{a.type === 'restore_revision' ? 'Restore it now?' : 'Run it now?'}</span>
                      <button onClick={() => decide(a, 'approve')} disabled={deciding}
                        className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-bold cursor-pointer disabled:opacity-60">
                        {deciding ? 'Working…' : a.type === 'restore_revision' ? 'Yes, approve and restore' : 'Yes, approve and run'}
                      </button>
                      <button onClick={() => setConfirmingId(null)} disabled={deciding}
                        className="px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 cursor-pointer">Cancel</button>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <button onClick={() => setConfirmingId(a.id)}
                        className="px-3 py-1.5 rounded-lg bg-amber-600/20 hover:bg-amber-600/30 border border-amber-500/40 text-amber-100 font-bold cursor-pointer">Approve…</button>
                      <button onClick={() => decide(a, 'reject')} disabled={deciding}
                        className="px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 cursor-pointer">Dismiss</button>
                    </div>
                  )}
                </>
              ) : (
                <p className="text-slate-300">
                  Proposed {a.type === 'restore_revision' ? 'restore' : 're-run'} of <strong className="text-white">{a.processName}</strong>:{' '}
                  <span className={a.status === 'executed' ? 'text-emerald-300' : a.status === 'failed' ? 'text-rose-300' : 'text-slate-400'}>{a.status}</span>
                  {a.decidedBy && a.decidedBy !== 'system' ? <> by {a.decidedBy}</> : null}
                  {a.message ? <span className="text-slate-500"> ({a.message})</span> : null}
                </p>
              )}
            </div>
          ))}

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <button
              onClick={() => onAskFollowUp(`Summarize the investigation for ${execution.processName}. In plain language, cover the failure, the likely cause, the evidence gathered (including the investigation steps), how certain the conclusion is, and the recommended next checks. Clearly separate confirmed facts from hypotheses.`)}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-semibold cursor-pointer"
            >
              Summarize investigation
            </button>
            {inv.steps && inv.steps.length > 0 && (
              <button onClick={() => setShowSteps((v) => !v)} className="flex items-center gap-1 text-slate-400 hover:text-white cursor-pointer">
                How it investigated ({inv.steps.length} steps)
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showSteps ? 'rotate-180' : ''}`} />
              </button>
            )}
          </div>

          {showSteps && inv.steps && (
            <ol className="space-y-1 text-slate-400 list-decimal ml-4">
              {inv.steps.map((s, i) => (
                <li key={i}>{TOOL_LABEL[s.tool] || s.tool}{s.ok ? '' : ' (failed)'}</li>
              ))}
            </ol>
          )}
        </div>
      )}

      {error && <p className="text-xs text-rose-300">{error}</p>}
    </div>
  );
};
