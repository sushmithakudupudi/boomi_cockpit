import React, { useState } from 'react';
import { FileCode2, GitCompareArrows, Loader2 } from 'lucide-react';
import { api, ApiError } from '../../services/api';
import type { ComparisonResult } from '../../types/revisions';
import { DiffView } from './DiffView';
import { ErrorState, SourceBanner } from './shared';

interface Slot {
  name: string;
  xml: string;
}

const FilePicker: React.FC<{ label: string; slot: Slot | null; onPick: (s: Slot) => void }> = ({ label, slot, onPick }) => (
  <label className="flex-1 flex items-center gap-3 px-3.5 py-3 rounded-xl border border-dashed border-slate-600 hover:border-boomi-accent bg-slate-900/50 cursor-pointer transition">
    <FileCode2 className="w-5 h-5 text-boomi-accent shrink-0" />
    <div className="min-w-0">
      <div className="text-[10px] uppercase tracking-wider font-bold text-slate-500">{label}</div>
      <div className="text-xs text-slate-200 truncate">{slot ? slot.name : 'Choose component XML file…'}</div>
    </div>
    <input
      type="file"
      accept=".xml,text/xml,application/xml"
      className="sr-only"
      onChange={async (e) => {
        const f = e.target.files?.[0];
        if (f) onPick({ name: f.name, xml: await f.text() });
      }}
    />
  </label>
);

export const UploadCompare: React.FC = () => {
  const [left, setLeft] = useState<Slot | null>(null);
  const [right, setRight] = useState<Slot | null>(null);
  const [result, setResult] = useState<ComparisonResult | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(false);
  const [includeUnchanged, setIncludeUnchanged] = useState(false);

  const run = async (unchanged: boolean) => {
    if (!left || !right) return;
    setLoading(true);
    setError(null);
    try {
      setResult(await api.compareUploadedXml(left.xml, right.xml, left.name, right.name, unchanged));
    } catch (e) {
      setResult(null);
      setError(e as ApiError);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-5">
      <SourceBanner source="upload" />
      <p className="text-xs text-slate-400">
        Use this when historical definitions can't be read from Boomi. Export two revisions of the same component as XML and compare them here.
      </p>
      <div className="flex flex-col sm:flex-row gap-3">
        <FilePicker label="Base revision XML" slot={left} onPick={(s) => { setLeft(s); setResult(null); }} />
        <FilePicker label="Target revision XML" slot={right} onPick={(s) => { setRight(s); setResult(null); }} />
        <button
          onClick={() => run(includeUnchanged)}
          disabled={!left || !right || loading}
          className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-boomi-blue to-boomi-accent text-white font-bold text-xs shadow-lg shadow-sky-950 transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <GitCompareArrows className="w-4 h-4" />}
          Compare
        </button>
      </div>
      {error && <ErrorState title="Comparison failed" message={error.message} onRetry={() => run(includeUnchanged)} />}
      {result && (
        <DiffView result={result} includeUnchanged={includeUnchanged} onToggleUnchanged={(v) => { setIncludeUnchanged(v); run(v); }} />
      )}
    </div>
  );
};
