import React, { useEffect, useRef, useState } from 'react';
import { 
  Search, 
  RefreshCw,
  LogOut,
  Menu,
  Moon,
  Sun,
  Wand2
} from 'lucide-react';
import type { AtomHealth, ExecutionRecord } from '../types/boomi';
import { AlertsBell } from './AlertsBell';
import { KeystoneLogo } from './KeystoneLogo';
import { useElementWidth } from '../hooks/useElementWidth';
import { useTheme, type Theme } from '../hooks/useTheme';
import { useAuth } from './auth/AuthContext';

const UserMenu: React.FC = () => {
  const { user, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!user) return null;
  const name = user.fullName || user.email.split('@')[0];
  const initials = name.split(/[\s._-]+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase() || '?';

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((v) => !v)} aria-haspopup="menu" aria-expanded={open} aria-label="Account menu" title={user.email}
        className="relative flex items-center justify-center w-8 h-8 rounded-full bg-gradient-to-br from-slate-700 to-slate-800 border border-slate-600 text-[11px] font-bold text-slate-100 hover:border-boomi-accent transition cursor-pointer">
        {initials}
        <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-400 border-2 border-boomi-dark" title="Online" aria-hidden="true" />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 mt-2 w-64 rounded-2xl bg-boomi-card border border-boomi-cardBorder shadow-2xl shadow-black/40 p-2 z-50">
          <div className="px-3 py-2.5">
            <div className="text-sm font-semibold text-white truncate">{name}</div>
            <div className="text-xs text-slate-400 truncate">{user.email}</div>
            <div className="flex items-center gap-1.5 mt-1 text-[11px] text-emerald-400"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />Online</div>
            <span className="inline-block mt-1.5 px-2 py-0.5 rounded-full bg-sky-500/10 border border-sky-500/30 text-[10px] font-bold uppercase tracking-wide text-sky-300">{user.role}</span>
          </div>
          <div className="h-px bg-boomi-cardBorder my-1" />
          <button role="menuitem" disabled={busy} onClick={async () => { setBusy(true); await signOut(); }}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-slate-300 hover:text-white hover:bg-slate-800 transition cursor-pointer disabled:opacity-60">
            <LogOut className="w-4 h-4" />{busy ? 'Signing out…' : 'Sign out'}
          </button>
        </div>
      )}
    </div>
  );
};

export const ThemeSwitch: React.FC = () => {
  const { theme, setTheme } = useTheme();
  const options: { id: Theme; label: string; icon: React.ElementType }[] = [
    { id: 'light', label: 'Light mode', icon: Sun },
    { id: 'dark', label: 'Dark mode', icon: Moon },
  ];
  return (
    <div role="radiogroup" aria-label="Colour theme" className="flex items-center p-0.5 rounded-xl bg-slate-900/80 border border-slate-800">
      {options.map(({ id, label, icon: Icon }) => (
        <button key={id} role="radio" aria-checked={theme === id} aria-label={label} title={label} onClick={() => setTheme(id)}
          className={`p-1.5 rounded-lg transition cursor-pointer ${theme === id ? 'bg-slate-800 text-boomi-accent shadow-sm' : 'text-slate-500 hover:text-slate-200'}`}>
          <Icon className="w-3.5 h-3.5" />
        </button>
      ))}
    </div>
  );
};

interface NavbarProps {
  onToggleCompanion: () => void;
  companionUnreadCount: number;
  isBackendConnected?: boolean;
  atom?: AtomHealth;
  onRefresh?: () => void;
  activeModule?: string;
  onSelectModule?: (mod: 'healing' | 'compiler') => void;
  failures?: ExecutionRecord[];
  unreadFailureIds?: Set<string>;
  onOpenFailure?: (exec: ExecutionRecord) => void;
  onMarkAllRead?: () => void;
  /** Opens the module menu on small screens, where the sidebar is hidden. */
  onOpenNav?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  onToggleCompanion,
  onRefresh,
  activeModule,
  onSelectModule,
  failures = [],
  unreadFailureIds = new Set<string>(),
  onOpenFailure = () => {},
  onMarkAllRead = () => {},
  onOpenNav,
}) => {
  const [barRef, barWidth] = useElementWidth<HTMLElement>();

  return (
    <header ref={barRef} className="sticky top-0 z-[45] w-full bg-boomi-dark">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-2 sm:gap-4">
        
        {/* Left: menu button on small screens (each page shows its own module heading) */}
        <div className="flex flex-1 basis-0 items-center gap-2 min-w-0 text-xs">
          {onOpenNav && (
            <button onClick={onOpenNav} aria-label="Open menu" className="md:hidden -ml-1 p-2 rounded-xl text-slate-300 hover:text-white hover:bg-slate-800 transition cursor-pointer shrink-0">
              <Menu className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Center: search (left and right columns share the remaining width equally, so this stays centred) */}
        <div className={`relative w-full max-w-sm 2xl:max-w-md ${barWidth >= 1000 ? 'block' : 'hidden'}`}>
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Filter processes, components, error codes..."
            className="w-full pl-9 pr-3 py-2 text-xs rounded-xl bg-slate-900 border border-slate-700/80 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-boomi-accent focus:ring-1 focus:ring-boomi-accent transition"
          />
        </div>

        {/* Right Action Icons & Boomi Companion CTA */}
        <div className="flex flex-1 basis-0 justify-end items-center gap-1 sm:gap-3">
          <ThemeSwitch />

          <button 
            onClick={onRefresh}
            title="Refresh Process Reporting & Atom Status"
            className="hidden xs:block p-2 rounded-xl text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition cursor-pointer"
          >
            <RefreshCw className="w-4 h-4" />
          </button>

          <div className="hidden xs:block">
            <AlertsBell
              failures={failures}
              unreadIds={unreadFailureIds}
              onOpenFailure={onOpenFailure}
              onMarkAllRead={onMarkAllRead}
            />
          </div>

          {/* ConnectCraft Toggle Button */}
          {onSelectModule && (
            <button
              onClick={() => onSelectModule(activeModule === 'compiler' ? 'healing' : 'compiler')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer border ${
                activeModule === 'compiler'
                  ? 'bg-purple-600 text-white border-purple-400 shadow-lg shadow-purple-900/40'
                  : 'bg-purple-950/40 text-purple-300 border-purple-500/30 hover:bg-purple-900/50'
              }`}
              title="Toggle ArchForge"
            >
              <Wand2 className="w-3.5 h-3.5 text-purple-300" />
              <span className="hidden sm:inline">AI Compiler</span>
            </button>
          )}

          {/* Boomi Companion Pill Button */}
          <button
            onClick={onToggleCompanion}
            aria-label="Keystone AI"
            title="Keystone AI"
            className="relative flex items-center justify-center w-9 h-9 rounded-xl hover:bg-slate-500/15 transition-all cursor-pointer"
          >
            <KeystoneLogo className="w-7 h-7" />
          </button>

          <UserMenu />
        </div>

      </div>
    </header>
  );
};
