import React, { useEffect, useRef, useState } from 'react';
import { Bell, AlertTriangle } from 'lucide-react';
import type { ExecutionRecord } from '../types/boomi';

interface Props {
  /** Open failures, newest first */
  failures: ExecutionRecord[];
  unreadIds: Set<string>;
  onOpenFailure: (exec: ExecutionRecord) => void;
  onMarkAllRead: () => void;
}

const timeAgo = (iso?: string): string => {
  const ms = Date.now() - new Date(iso || '').getTime();
  if (Number.isNaN(ms) || ms < 0) return 'just now';
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${Math.max(mins, 1)}m ago`;
  const hours = Math.floor(mins / 60);
  return hours < 48 ? `${hours}h ago` : `${Math.floor(hours / 24)}d ago`;
};

export const AlertsBell: React.FC<Props> = ({ failures, unreadIds, onOpenFailure, onMarkAllRead }) => {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const unread = failures.filter((f) => unreadIds.has(f.id)).length;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  return (
    <div className="relative" ref={wrapRef}>
      <button
        onClick={() => setOpen((o) => !o)}
        title="Alerts"
        aria-label={unread > 0 ? `Alerts, ${unread} unread` : 'Alerts'}
        aria-expanded={open}
        className="relative p-2 rounded-xl text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition cursor-pointer"
      >
        <Bell className="w-4 h-4" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1 rounded-full bg-rose-600 text-white text-[9px] font-bold flex items-center justify-center">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 max-w-[90vw] rounded-xl bg-boomi-card border border-boomi-cardBorder shadow-2xl z-50">
          <div className="flex items-center justify-between px-3 py-2 border-b border-slate-800">
            <span className="text-xs font-bold text-white">Failure alerts</span>
            <button
              onClick={onMarkAllRead}
              disabled={unread === 0}
              className="text-[11px] text-slate-400 hover:text-white disabled:opacity-40 cursor-pointer"
            >
              Mark all read
            </button>
          </div>

          {failures.length === 0 ? (
            <p className="px-3 py-6 text-xs text-slate-400 text-center">No open failures.</p>
          ) : (
            <ul className="max-h-80 overflow-y-auto divide-y divide-slate-800">
              {failures.slice(0, 10).map((f) => {
                const isUnread = unreadIds.has(f.id);
                return (
                  <li key={f.id}>
                    <button
                      onClick={() => { setOpen(false); onOpenFailure(f); }}
                      className={`w-full text-left px-3 py-2.5 hover:bg-slate-800/70 cursor-pointer ${isUnread ? 'bg-rose-950/20' : ''}`}
                    >
                      <div className="flex items-center gap-2">
                        <AlertTriangle className={`w-3.5 h-3.5 shrink-0 ${isUnread ? 'text-rose-400' : 'text-slate-500'}`} />
                        <span className="text-xs font-semibold text-slate-100 truncate">{f.processName}</span>
                        <span className="ml-auto text-[10px] text-slate-500 shrink-0">{timeAgo(f.startedAt)}</span>
                      </div>
                      <p className="mt-0.5 text-[11px] text-slate-400 line-clamp-2">{f.errorMessage || 'Execution failed'}</p>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
};
