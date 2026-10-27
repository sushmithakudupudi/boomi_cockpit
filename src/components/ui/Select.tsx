import React, { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, X } from 'lucide-react';

export interface SelectOption<V extends string | number = string> {
  value: V;
  label: string;
  /** Options with the same group are listed under a group heading. */
  group?: string;
  /** Secondary text shown on the right of the option. */
  hint?: string;
}

interface Props<V extends string | number> {
  value: V;
  onChange: (value: V) => void;
  options: SelectOption<V>[];
  /** Floating label on the border (outlined style). */
  label?: string;
  /** Accessible name when there is no visible label. */
  ariaLabel?: string;
  placeholder?: string;
  /** Show a clear (✕) button that resets to this value. */
  clearValue?: V;
  /** Type-to-filter. Defaults to on when there are more than 7 options. */
  searchable?: boolean;
  /** Icon shown at the start of the field. */
  icon?: React.ElementType;
  /** Accent for the label and border (e.g. Base = rose, Target = emerald). */
  tone?: 'default' | 'rose' | 'emerald';
  size?: 'sm' | 'md';
  disabled?: boolean;
  className?: string;
}

const TONE = {
  default: { border: 'border-slate-700', focus: 'border-boomi-accent ring-2 ring-boomi-accent/20', label: 'text-slate-400', openLabel: 'text-boomi-accent' },
  rose: { border: 'border-rose-500/50', focus: 'border-rose-400 ring-2 ring-rose-400/20', label: 'text-rose-300', openLabel: 'text-rose-300' },
  emerald: { border: 'border-emerald-500/50', focus: 'border-emerald-400 ring-2 ring-emerald-400/20', label: 'text-emerald-300', openLabel: 'text-emerald-300' },
};

const LIST_MAX = 280;
const LIST_MIN_WIDTH = 300;

/** Dropdown used across the app: outlined field with floating label, clear button, filterable rounded list. */
export function Select<V extends string | number>({
  value, onChange, options, label, ariaLabel, placeholder = 'Select…', clearValue, searchable,
  icon: Icon, tone = 'default', size = 'md', disabled, className = '',
}: Props<V>) {
  const id = useId();
  const fieldRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [pos, setPos] = useState<{ left: number; width: number; top?: number; bottom?: number; maxHeight: number }>({ left: 0, width: 0, maxHeight: LIST_MAX });

  const canSearch = searchable ?? options.length > 7;
  const typing = open && canSearch;
  const selected = options.find((o) => o.value === value);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? options.filter((o) => `${o.label} ${o.hint ?? ''} ${o.group ?? ''}`.toLowerCase().includes(q)) : options;
  }, [options, query]);

  const place = useCallback(() => {
    const r = fieldRef.current?.getBoundingClientRect();
    if (!r) return;
    const below = window.innerHeight - r.bottom - 8;
    const above = r.top - 8;
    const up = below < 220 && above > below; // open upwards near the bottom of the screen
    const maxHeight = Math.min(LIST_MAX, up ? above : below) - 6;
    const width = Math.min(Math.max(r.width, LIST_MIN_WIDTH), window.innerWidth - 16);
    const anchorRight = width > r.width && r.left + r.width / 2 > window.innerWidth / 2;
    const left = Math.max(8, Math.min(anchorRight ? r.right - width : r.left, window.innerWidth - width - 8));
    setPos(up
      ? { left, width, bottom: window.innerHeight - r.top + 6, maxHeight }
      : { left, width, top: r.bottom + 6, maxHeight });
  }, []);

  const openList = () => {
    if (disabled) return;
    setQuery('');
    setActive(Math.max(0, options.findIndex((o) => o.value === value)));
    place();
    setOpen(true);
  };
  const close = () => { setOpen(false); setQuery(''); };
  const choose = (o: SelectOption<V>) => { onChange(o.value); close(); inputRef.current?.blur(); };

  useLayoutEffect(() => {
    if (!open) return;
    place();
    const onMove = () => place();
    window.addEventListener('resize', onMove);
    window.addEventListener('scroll', onMove, true);
    return () => { window.removeEventListener('resize', onMove); window.removeEventListener('scroll', onMove, true); };
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!fieldRef.current?.contains(t) && !listRef.current?.contains(t)) close();
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  // Keep the highlighted option in view while using the keyboard.
  useEffect(() => {
    if (open) listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ')) {
      if (e.key === ' ' && canSearch) return;
      e.preventDefault(); openList(); return;
    }
    if (!open) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(filtered.length - 1, i + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(0, i - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); if (filtered[active]) choose(filtered[active]); }
    else if (e.key === 'Escape') { e.preventDefault(); close(); }
    else if (e.key === 'Tab') close();
  };

  const t = TONE[tone];
  const pad = size === 'sm' ? 'py-2 text-xs' : 'py-2.5 text-[13px]';
  const showClear = clearValue !== undefined && value !== clearValue && !disabled;

  let lastGroup: string | undefined;
  const list = open && createPortal(
    <ul
      ref={listRef}
      id={`${id}-list`}
      role="listbox"
      aria-label={label || ariaLabel}
      style={{ position: 'fixed', left: pos.left, width: pos.width, top: pos.top, bottom: pos.bottom, maxHeight: pos.maxHeight }}
      className="z-[70] overflow-y-auto overscroll-contain p-1.5 rounded-xl bg-boomi-card border border-boomi-cardBorder shadow-2xl shadow-black/30 animate-fade-in"
    >
      {filtered.length === 0 && <li className="px-3 py-2.5 text-xs text-slate-500">No matches</li>}
      {filtered.map((o, i) => {
        const heading = o.group && o.group !== lastGroup ? o.group : null;
        lastGroup = o.group;
        const isSel = o.value === value;
        return (
          <React.Fragment key={String(o.value)}>
            {heading && <li role="presentation" className="px-3 pt-2.5 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">{heading}</li>}
            <li
              role="option"
              aria-selected={isSel}
              data-index={i}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => { e.preventDefault(); choose(o); }}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-[13px] cursor-pointer transition-colors ${
                i === active ? 'bg-slate-800 text-white' : 'text-slate-300'} ${isSel ? 'font-semibold text-boomi-accent' : ''}`}
            >
              <span className="flex-1 min-w-0 truncate" title={o.label}>{o.label}</span>
              {o.hint && <span className="shrink-0 text-[10px] text-slate-500">{o.hint}</span>}
              {isSel && <Check className="w-3.5 h-3.5 shrink-0 text-boomi-accent" />}
            </li>
          </React.Fragment>
        );
      })}
    </ul>,
    document.body,
  );

  return (
    <div className={`relative min-w-0 ${className}`}>
      <div
        ref={fieldRef}
        onMouseDown={(e) => { if (e.target === inputRef.current && open) return; e.preventDefault(); open ? close() : openList(); inputRef.current?.focus(); }}
        className={`relative flex items-center gap-2 px-3 ${pad} rounded-xl border bg-boomi-card transition ${open ? t.focus : `${t.border} hover:border-slate-500`} ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
      >
        {label && (
          <span
            className={`absolute left-2.5 top-0 -translate-y-1/2 px-1.5 bg-boomi-card text-[11px] font-medium leading-4 pointer-events-none ${open ? t.openLabel : t.label}`}
          >
            {label}
          </span>
        )}
        {Icon && <Icon className="w-3.5 h-3.5 shrink-0 text-slate-500" />}
        {!typing && (
          <span className={`flex-1 min-w-0 truncate ${selected ? 'text-slate-100' : 'text-slate-500'}`} title={selected?.label}>
            {selected?.label ?? placeholder}
          </span>
        )}
        <input
          ref={inputRef}
          role="combobox"
          aria-expanded={open}
          aria-controls={`${id}-list`}
          aria-autocomplete={canSearch ? 'list' : 'none'}
          aria-label={label || ariaLabel}
          readOnly={!canSearch || !open}
          disabled={disabled}
          value={typing ? query : selected?.label ?? ''}
          placeholder={typing ? (selected?.label || 'Type to filter…') : placeholder}
          onChange={(e) => { setQuery(e.target.value); setActive(0); }}
          onKeyDown={onKeyDown}
          className={typing
            ? 'flex-1 min-w-0 bg-transparent text-slate-100 placeholder:text-slate-500 focus:outline-none cursor-text'
            : 'absolute inset-0 w-full h-full opacity-0 cursor-pointer'}
        />
        {showClear && (
          <button
            type="button"
            aria-label={`Clear ${label || ariaLabel || 'selection'}`}
            onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); onChange(clearValue as V); close(); }}
            className="relative z-10 shrink-0 p-0.5 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
        <ChevronDown className={`w-4 h-4 shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </div>
      {list}
    </div>
  );
}
