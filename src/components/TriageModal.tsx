import React, { useState } from 'react';
import type { ExecutionRecord } from '../types/boomi';
import { 
  X, 
  Bot, 
  Sparkles, 
  CheckCircle2, 
  FileCode2, 
  Activity, 
  Zap, 
  ShieldAlert,
  ArrowRight
} from 'lucide-react';
import confetti from 'canvas-confetti';

interface TriageModalProps {
  execution: ExecutionRecord | null;
  onClose: () => void;
  onAutoHeal: (execId: string) => void;
}

export const TriageModal: React.FC<TriageModalProps> = ({
  execution,
  onClose,
  onAutoHeal,
}) => {
  const [activeTab, setActiveTab] = useState<'DIAGNOSIS' | 'DIFF' | 'STACKTRACE'>('DIAGNOSIS');
  const [isHealing, setIsHealing] = useState(false);

  if (!execution) return null;

  const analysis = execution.companionAnalysis;
  const payload = execution.payload;

  const handleApplyFix = () => {
    setIsHealing(true);
    setTimeout(() => {
      // Fire confetti
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 }
      });
      setIsHealing(false);
      onAutoHeal(execution.id);
    }, 1200);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-4xl max-h-[90vh] bg-boomi-card border border-boomi-cardBorder rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        
        {/* Modal Header */}
        <div className="flex items-center justify-between p-5 border-b border-boomi-cardBorder bg-slate-900/80">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-gradient-to-tr from-boomi-blue to-boomi-accent text-white shadow-lg shadow-sky-500/20">
              <Bot className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white">Boomi Companion Incident Triage</h3>
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-rose-500/15 text-rose-400 border border-rose-500/30 font-semibold">
                  {execution.status}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Process: <span className="font-semibold text-slate-200">{execution.processName}</span> ({execution.id})
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center px-5 border-b border-boomi-cardBorder bg-slate-900/40 text-xs font-semibold gap-6">
          <button
            onClick={() => setActiveTab('DIAGNOSIS')}
            className={`py-3 border-b-2 flex items-center gap-2 transition cursor-pointer ${
              activeTab === 'DIAGNOSIS'
                ? 'border-boomi-accent text-boomi-accent'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Sparkles className="w-4 h-4" />
            <span>AI Root Cause & Remediation</span>
          </button>

          {payload && (
            <button
              onClick={() => setActiveTab('DIFF')}
              className={`py-3 border-b-2 flex items-center gap-2 transition cursor-pointer ${
                activeTab === 'DIFF'
                  ? 'border-boomi-accent text-boomi-accent'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <FileCode2 className="w-4 h-4" />
              <span>Payload Inspector & Diff</span>
              {payload.fixedContent && (
                <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-1.5 py-0.2 rounded border border-emerald-500/30">
                  Patch Ready
                </span>
              )}
            </button>
          )}

          <button
            onClick={() => setActiveTab('STACKTRACE')}
            className={`py-3 border-b-2 flex items-center gap-2 transition cursor-pointer ${
              activeTab === 'STACKTRACE'
                ? 'border-boomi-accent text-boomi-accent'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Activity className="w-4 h-4" />
            <span>Raw Atom Log</span>
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          
          {/* TAB 1: DIAGNOSIS */}
          {activeTab === 'DIAGNOSIS' && (
            <div className="space-y-5">
              {/* AI Key Insights Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800">
                  <span className="text-[11px] text-slate-400">Error Component</span>
                  <p className="text-xs font-semibold text-slate-200 mt-0.5 truncate">
                    {execution.errorShapeName || 'Map Component'}
                  </p>
                </div>
                <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800">
                  <span className="text-[11px] text-slate-400">AI Confidence Score</span>
                  <p className="text-xs font-semibold text-emerald-400 mt-0.5 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    {analysis ? `${analysis.confidenceScore}%` : '95.0%'}
                  </p>
                </div>
                <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800">
                  <span className="text-[11px] text-slate-400">Blast Radius Impact</span>
                  <p className="text-xs font-semibold text-amber-400 mt-0.5 flex items-center gap-1">
                    <ShieldAlert className="w-3.5 h-3.5" />
                    {analysis ? `${analysis.blastRadiusCount} Downstream Flows` : '1 Process'}
                  </p>
                </div>
              </div>

              {/* Root Cause Box */}
              <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800">
                <div className="flex items-center gap-2 text-xs font-bold text-sky-300 mb-2">
                  <Sparkles className="w-4 h-4 text-boomi-accent" />
                  <span>Boomi Companion Root Cause Explanation</span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  {analysis?.rootCause || execution.errorMessage}
                </p>
              </div>

              {/* Suggested Remediation */}
              <div className="p-4 rounded-xl bg-emerald-950/20 border border-emerald-500/30">
                <div className="flex items-center gap-2 text-xs font-bold text-emerald-300 mb-2">
                  <Zap className="w-4 h-4 text-emerald-400" />
                  <span>Recommended Remediation Plan</span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  {analysis?.suggestedAction || 'Reprocess failed document after correcting source format.'}
                </p>
                {payload?.diffSummary && (
                  <div className="mt-3 p-2.5 rounded-lg bg-emerald-900/20 border border-emerald-500/20 text-[11px] text-emerald-200 font-mono">
                    <strong>Auto-Patch Diff:</strong> {payload.diffSummary}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: PAYLOAD DIFF */}
          {activeTab === 'DIFF' && payload && (
            <div className="space-y-4">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Document ID: <strong className="text-slate-200">{payload.documentId}</strong></span>
                <span>Format: <strong className="text-slate-200">{payload.format}</strong> ({payload.sizeBytes} bytes)</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Left: Raw Faulty Document */}
                <div className="flex flex-col rounded-xl border border-rose-500/30 bg-rose-950/10 overflow-hidden">
                  <div className="px-3.5 py-2 bg-rose-950/30 border-b border-rose-500/20 text-xs font-semibold text-rose-300 flex items-center justify-between">
                    <span>Original Document (Failed)</span>
                    <span className="text-[10px] text-rose-400">Schema Violation</span>
                  </div>
                  <pre className="p-3.5 text-[11px] font-mono text-rose-200/90 overflow-x-auto max-h-80">
                    {payload.rawContent}
                  </pre>
                </div>

                {/* Right: Companion Fixed Document */}
                <div className="flex flex-col rounded-xl border border-emerald-500/40 bg-emerald-950/10 overflow-hidden">
                  <div className="px-3.5 py-2 bg-emerald-950/30 border-b border-emerald-500/20 text-xs font-semibold text-emerald-300 flex items-center justify-between">
                    <span>Companion Repaired Document</span>
                    <span className="text-[10px] text-emerald-400">Validated</span>
                  </div>
                  <pre className="p-3.5 text-[11px] font-mono text-emerald-200/90 overflow-x-auto max-h-80">
                    {payload.fixedContent || payload.rawContent}
                  </pre>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: STACKTRACE */}
          {activeTab === 'STACKTRACE' && (
            <div className="space-y-2">
              <span className="text-xs font-semibold text-slate-400">Atom Process Execution Log</span>
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-[11px] font-mono text-slate-300 overflow-x-auto max-h-80 leading-relaxed">
                <div>[2026-10-21 15:28:10.102 UTC] INFO  StartShape: Inbound IDoc ORDERS05 received from SAP Gateway.</div>
                <div>[2026-10-21 15:28:10.450 UTC] INFO  DataProcess: Split 1 document into 1 logical batch.</div>
                <div>[2026-10-21 15:28:11.200 UTC] INFO  BusinessRules: Rule #1 (Credit Check) evaluated to TRUE.</div>
                <div className="text-rose-400 font-bold">[2026-10-21 15:28:13.522 UTC] ERROR BoomiMap: Mapping exception thrown on target field [BillingPostalCode]</div>
                <div className="text-rose-300 pl-4">{execution.errorMessage}</div>
                <div className="text-slate-500 pl-4">at com.boomi.transform.map.MapEngine.execute(MapEngine.java:412)</div>
                <div className="text-slate-500 pl-4">at com.boomi.process.shape.MapShape.execute(MapShape.java:189)</div>
                <div className="text-slate-500 pl-4">at com.boomi.process.engine.ExecutionEngine.run(ExecutionEngine.java:894)</div>
                <div className="text-amber-400">[2026-10-21 15:28:13.530 UTC] WARN  ExceptionShape: Document routed to dead-letter error queue.</div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer Actions */}
        <div className="flex items-center justify-between p-4 border-t border-boomi-cardBorder bg-slate-900/90">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white transition cursor-pointer"
          >
            Close
          </button>

          {analysis?.autoHealAvailable && !execution.reprocessed && (
            <button
              onClick={handleApplyFix}
              disabled={isHealing}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white font-bold text-xs shadow-lg shadow-emerald-950 transition-all cursor-pointer disabled:opacity-50"
            >
              {isHealing ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Reprocessing via Boomi AtomSphere API...</span>
                </>
              ) : (
                <>
                  <Zap className="w-4 h-4 text-amber-200" />
                  <span>Execute Self-Healing & Reprocess</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </>
              )}
            </button>
          )}

          {execution.reprocessed && (
            <span className="flex items-center gap-1.5 text-xs text-emerald-400 font-bold bg-emerald-500/10 px-3 py-1.5 rounded-lg border border-emerald-500/30">
              <CheckCircle2 className="w-4 h-4" /> Process Already Auto-Healed
            </span>
          )}
        </div>

      </div>
    </div>
  );
};
