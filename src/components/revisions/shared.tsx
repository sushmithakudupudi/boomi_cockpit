import React from 'react';
import { AlertTriangle, FlaskConical, Loader2, RefreshCw } from 'lucide-react';
import type { ResultSource } from '../../types/revisions';

export const Spinner: React.FC<{ label: string }> = ({ label }) => (
  <div className="flex items-center justify-center gap-2.5 py-16 text-xs text-slate-400">
    <Loader2 className="w-4 h-4 animate-spin text-boomi-accent" />
    <span>{label}</span>
  </div>
);

export const ErrorState: React.FC<{
  title: string;
  message: string;
  onRetry?: () => void;
  action?: { label: string; onClick: () => void };
}> = ({ title, message, onRetry, action }) => (
  <div className="flex flex-col items-center text-center gap-2 py-12 px-4 rounded-2xl border border-rose-500/30 bg-rose-950/20">
    <AlertTriangle className="w-6 h-6 text-rose-400" />
    <h3 className="text-sm font-bold text-white">{title}</h3>
    <p className="text-xs text-slate-300 max-w-xl">{message}</p>
    <div className="flex items-center gap-2 mt-2">
      {onRetry && (
        <button onClick={onRetry} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition cursor-pointer">
          <RefreshCw className="w-3.5 h-3.5" /> Retry
        </button>
      )}
      {action && (
        <button onClick={action.onClick} className="px-3 py-1.5 rounded-xl bg-boomi-blue/30 hover:bg-boomi-blue/50 text-sky-200 text-xs font-semibold border border-boomi-blue/50 transition cursor-pointer">
          {action.label}
        </button>
      )}
    </div>
  </div>
);

export const EmptyState: React.FC<{ title: string; message: string }> = ({ title, message }) => (
  <div className="flex flex-col items-center text-center py-14 rounded-2xl border border-dashed border-slate-700 bg-slate-900/40">
    <h3 className="text-sm font-bold text-white">{title}</h3>
    <p className="text-xs text-slate-400 mt-1 max-w-md">{message}</p>
  </div>
);

/** Always shown when the data on screen is not live Boomi data. */
export const SourceBanner: React.FC<{ source: ResultSource }> = ({ source }) =>
  source === 'live' ? null : (
    <div className="flex items-start gap-2.5 px-3.5 py-2.5 rounded-xl bg-amber-950/30 border border-amber-500/40 text-xs text-amber-200">
      <FlaskConical className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
      <span>
        {source === 'sample' ? (
          <><strong>Sample fixtures</strong> — these components and revisions are built-in test data, not from your Boomi account.</>
        ) : (
          <><strong>Uploaded XML</strong> — comparing files you supplied; nothing was retrieved from Boomi.</>
        )}
      </span>
    </div>
  );
