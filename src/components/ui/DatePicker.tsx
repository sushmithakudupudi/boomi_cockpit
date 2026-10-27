import React, { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CalendarDays, ChevronLeft, ChevronRight, X } from 'lucide-react';

interface Props {
  /** ISO date "YYYY-MM-DD", or '' for none (same format as a native date input). */
  value: string;
  onChange: (value: string) => void;
  /** Floating label on the border. */
  label: string;
  min?: string;
  max?: string;
  className?: string;
}

const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const POPUP_W = 288;

const pad = (n: number) => String(n).padStart(2, '0');
const toIso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromIso = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  return y && m && d ? new Date(y, m - 1, d) : null;
};
const display = (s: string) => {
  const d = fromIso(s);
  return d ? `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()}` : '';
};

/** Date field with the app's outlined style and a rounded calendar popover (the native picker can't be styled). */
export const DatePicker: React.FC<Props> = ({ value, onChange, label, min, max, className = '' }) => {
  const id = useId();
  const fieldRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState(() => {
    const d = fromIso(value) ?? new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [pos, setPos] = useState<{ left: number; top?: number; bottom?: number }>({ left: 0 });

  const place = useCallback(() => {
    const r = fieldRef.current?.getBoundingClientRect();
    if (!r) return;
    const width = Math.min(POPUP_W, window.innerWidth - 16);
    const anchorRight = r.left + r.width / 2 > window.innerWidth / 2;
    const left = Math.max(8, Math.min(anchorRight ? r.right - width : r.left, window.innerWidth - width - 8));
    const below = window.innerHeight - r.bottom - 8;
    setPos(below < 330 && r.top > below ? { left, bottom: window.innerHeight - r.top + 6 } : { left, top: r.bottom + 6 });
  }, []);

  const show = () => {
    const d = fromIso(value) ?? new Date();
    setView(new Date(d.getFullYear(), d.getMonth(), 1));
    place();
    setOpen(true);
  };

  useLayoutEffect(() => {
    if (!open) return;
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); };
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!fieldRef.current?.contains(t) && !popRef.current?.contains(t)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); fieldRef.current?.focus(); } };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const pick = (iso: string) => { onChange(iso); setOpen(false); fieldRef.current?.focus(); };
  const allowed = (iso: string) => (!min || iso >= min) && (!max || iso <= max);
  const todayIso = toIso(new Date());

  // 6 weeks starting on the Monday on/before the 1st of the month.
  const first = new Date(view.getFullYear(), view.getMonth(), 1);
  const start = new Date(first);
  start.setDate(1 - ((first.getDay() + 6) % 7));
  const days = Array.from({ length: 42 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d; });
  const monthTitle = view.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const shiftMonth = (n: number) => setView((v) => new Date(v.getFullYear(), v.getMonth() + n, 1));

  const popup = open && createPortal(
    <div
      ref={popRef}
      id={id}
      role="dialog"
      aria-label={`${label} calendar`}
      style={{ position: 'fixed', left: pos.left, top: pos.top, bottom: pos.bottom, width: Math.min(POPUP_W, window.innerWidth - 16) }}
      className="z-[70] p-3 rounded-2xl bg-boomi-card border border-boomi-cardBorder shadow-2xl shadow-black/30 animate-fade-in"
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-semibold text-white pl-1">{monthTitle}</span>
        <div className="flex gap-1">
          <button type="button" onClick={() => shiftMonth(-1)} aria-label="Previous month" className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"><ChevronLeft className="w-4 h-4" /></button>
          <button type="button" onClick={() => shiftMonth(1)} aria-label="Next month" className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"><ChevronRight className="w-4 h-4" /></button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-0.5 text-center">
        {WEEKDAYS.map((d) => <div key={d} className="py-1 text-[11px] font-semibold text-slate-500">{d}</div>)}
        {days.map((d) => {
          const iso = toIso(d);
          const inMonth = d.getMonth() === view.getMonth();
          const isSel = iso === value;
          const isToday = iso === todayIso;
          const ok = allowed(iso);
          return (
            <button
              key={iso}
              type="button"
              disabled={!ok}
              onClick={() => pick(iso)}
              aria-label={d.toLocaleDateString(undefined, { dateStyle: 'full' })}
              aria-pressed={isSel}
              className={`h-8 rounded-lg text-[13px] transition-colors ${
                isSel ? 'bg-boomi-blue text-white font-semibold'
                  : !ok ? 'text-slate-700 cursor-not-allowed'
                  : `${inMonth ? 'text-slate-200' : 'text-slate-500'} hover:bg-slate-800 cursor-pointer ${isToday ? 'ring-1 ring-inset ring-boomi-accent text-boomi-accent font-semibold' : ''}`}`}
            >
              {d.getDate()}
            </button>
          );
        })}
      </div>
      <div className="flex items-center justify-between mt-2 pt-2 border-t border-boomi-cardBorder">
        <button type="button" onClick={() => pick('')} className="px-2 py-1 rounded-lg text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer">Clear</button>
        <button type="button" disabled={!allowed(todayIso)} onClick={() => pick(todayIso)} className="px-2 py-1 rounded-lg text-xs font-semibold text-boomi-accent hover:bg-slate-800 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed">Today</button>
      </div>
    </div>,
    document.body,
  );

  return (
    <div className={`relative min-w-0 ${className}`}>
      <button
        ref={fieldRef}
        type="button"
        onClick={() => (open ? setOpen(false) : show())}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-label={`${label}${value ? `: ${display(value)}` : ''}`}
        className={`relative w-full flex items-center gap-2 px-3 py-2.5 text-[13px] text-left rounded-xl border bg-boomi-card transition cursor-pointer ${
          open ? 'border-boomi-accent ring-2 ring-boomi-accent/20' : 'border-slate-700 hover:border-slate-500'}`}
      >
        <span className={`absolute left-2.5 top-0 -translate-y-1/2 px-1.5 bg-boomi-card text-[11px] font-medium leading-4 pointer-events-none ${open ? 'text-boomi-accent' : 'text-slate-400'}`}>
          {label}
        </span>
        <span className={`flex-1 min-w-0 truncate ${value ? 'text-slate-100' : 'text-slate-500'}`}>{value ? display(value) : 'dd-mm-yyyy'}</span>
        {value && (
          <span
            role="button"
            tabIndex={0}
            aria-label={`Clear ${label}`}
            onClick={(e) => { e.stopPropagation(); onChange(''); }}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); onChange(''); } }}
            className="p-0.5 rounded-md text-slate-400 hover:text-white hover:bg-slate-800"
          >
            <X className="w-3.5 h-3.5" />
          </span>
        )}
        <CalendarDays className={`w-4 h-4 shrink-0 ${open ? 'text-boomi-accent' : 'text-slate-400'}`} />
      </button>
      {popup}
    </div>
  );
};
