import React from 'react';
import { AlertTriangle, FlaskConical, Inbox, Loader2, RefreshCw } from 'lucide-react';
import type { ResultSource } from '../../types/revisions';
import { componentTypeLabel, initials, typeTone } from './utils';

export const Spinner: React.FC<{ label: string }> = ({ label }) => (
  <div className="flex items-center justify-center gap-2.5 py-16 text-xs text-slate-400">
    <Loader2 className="w-4 h-4 animate-spin text-boomi-accent" />
    <span>{label}</span>
  </div>
);

export const SkeletonRows: React.FC<{ rows?: number }> = ({ rows = 6 }) => (
  <div className="rounded-2xl border border-boomi-cardBorder bg-boomi-card divide-y divide-boomi-cardBorder/60" aria-busy="true" aria-label="Loading">
    {Array.from({ length: rows }, (_, i) => (
      <div key={i} className="flex items-center gap-4 px-4 py-3.5 animate-pulse">
        <div className="w-8 h-8 rounded-lg bg-slate-800" />
        <div className="flex-1 space-y-2">
          <div className="h-3 rounded bg-slate-800" style={{ width: `${40 + ((i * 17) % 35)}%` }} />
          <div className="h-2 rounded bg-slate-800/70 w-1/4" />
        </div>
        <div className="hidden sm:block h-5 w-20 rounded-full bg-slate-800" />
      </div>
    ))}
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

export const EmptyState: React.FC<{ title: string; message: string; children?: React.ReactNode }> = ({ title, message, children }) => (
  <div className="flex flex-col items-center text-center py-14 px-4 rounded-2xl border border-dashed border-slate-700 bg-slate-900/40">
    <Inbox className="w-6 h-6 text-slate-600 mb-2" />
    <h3 className="text-sm font-bold text-white">{title}</h3>
    <p className="text-xs text-slate-400 mt-1 max-w-md">{message}</p>
    {children && <div className="mt-3">{children}</div>}
  </div>
);

export const TypeBadge: React.FC<{ type: string; className?: string }> = ({ type, className = '' }) => (
  <span title={type} className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-semibold whitespace-nowrap ${typeTone(type)} ${className}`}>
    {componentTypeLabel(type)}
  </span>
);

export const Avatar: React.FC<{ who: string | null | undefined; size?: 'sm' | 'md' }> = ({ who, size = 'sm' }) => (
  <span title={who ?? 'Unknown'}
    className={`inline-flex items-center justify-center shrink-0 rounded-full bg-gradient-to-br from-slate-700 to-slate-800 border border-slate-600 text-slate-200 font-bold ${size === 'sm' ? 'w-6 h-6 text-[9px]' : 'w-8 h-8 text-[10px]'}`}>
    {initials(who)}
  </span>
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
