import React from 'react';
import { 
  Bot, 
  Server, 
  ChevronRight,
  Search, 
  RefreshCw,
  Cpu,
  Wand2
} from 'lucide-react';
import type { AtomHealth, ExecutionRecord } from '../types/boomi';
import { AlertsBell } from './AlertsBell';
import { mockAtoms } from '../data/mockData';

interface NavbarProps {
  onToggleCompanion: () => void;
  companionUnreadCount: number;
  isBackendConnected?: boolean;
  atom?: AtomHealth;
  onRefresh?: () => void;
  sectionLabel: string;
  pageLabel: string;
  activeModule?: string;
  onSelectModule?: (mod: 'healing' | 'compiler') => void;
  failures?: ExecutionRecord[];
  unreadFailureIds?: Set<string>;
  onOpenFailure?: (exec: ExecutionRecord) => void;
  onMarkAllRead?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  onToggleCompanion,
  companionUnreadCount,
  isBackendConnected = false,
  atom,
  onRefresh,
  sectionLabel,
  pageLabel,
  activeModule,
  onSelectModule,
  failures = [],
  unreadFailureIds = new Set<string>(),
  onOpenFailure = () => {},
  onMarkAllRead = () => {},
}) => {
  const currentAtom = atom || mockAtoms[0];
  const isOnline = currentAtom.status === 'ONLINE';

  return (
    <header className="sticky top-0 z-30 w-full bg-boomi-dark/95 border-b border-boomi-cardBorder backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
        
        {/* Breadcrumb: current module / page */}
        <div className="flex items-center gap-2 min-w-0 text-xs">
          <span className="text-slate-500 font-medium">{sectionLabel}</span>
          <ChevronRight className="w-3.5 h-3.5 text-slate-600 shrink-0" />
          <span className="text-white font-bold truncate">{pageLabel}</span>
        </div>

        {/* Center: Live Atom Environment Health & API Connection Badge */}
        <div className="hidden lg:flex items-center gap-3 px-3 py-1.5 rounded-xl bg-slate-900/80 border border-slate-800 text-xs">
          <div className="flex items-center gap-2">
            <Server className={`w-3.5 h-3.5 ${isOnline ? 'text-emerald-400' : 'text-amber-400'}`} />
            <span className="text-slate-300 font-medium truncate max-w-[160px]" title={currentAtom.name}>
              {currentAtom.name}
            </span>
          </div>
          <span className="h-3 w-[1px] bg-slate-700" />
          <div className="flex items-center gap-1.5 text-slate-400">
            <Cpu className="w-3.5 h-3.5 text-sky-400" />
            <span>Heap: <strong className="text-slate-200">{currentAtom.heapUsagePercent || 38}%</strong></span>
          </div>
          <span className="h-3 w-[1px] bg-slate-700" />
          <span className={`flex items-center gap-1 font-semibold text-[11px] ${isOnline ? 'text-emerald-400' : 'text-amber-400'}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-emerald-400 animate-ping' : 'bg-amber-400'}`} />
            {currentAtom.status}
          </span>
          <span className="h-3 w-[1px] bg-slate-700" />
          <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-bold ${
            isBackendConnected 
              ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30' 
              : 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${isBackendConnected ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
            <span>FastAPI: {isBackendConnected ? 'CONNECTED' : 'STANDALONE'}</span>
          </div>
        </div>

        {/* Right Action Icons & Boomi Companion CTA */}
        <div className="flex items-center gap-3">
          <div className="relative hidden lg:block">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input 
              type="text" 
              placeholder="Filter processes, components, error codes..."
              className="w-64 pl-9 pr-3 py-1.5 text-xs rounded-xl bg-slate-900 border border-slate-700/80 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-boomi-accent focus:ring-1 focus:ring-boomi-accent transition"
            />
          </div>

          <button 
            onClick={onRefresh}
            title="Refresh Process Reporting & Atom Status"
            className="p-2 rounded-xl text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition cursor-pointer"
          >
            <RefreshCw className="w-4 h-4" />
          </button>

          <AlertsBell
            failures={failures}
            unreadIds={unreadFailureIds}
            onOpenFailure={onOpenFailure}
            onMarkAllRead={onMarkAllRead}
          />

          {/* ConnectCraft Toggle Button */}
          {onSelectModule && (
            <button
              onClick={() => onSelectModule(activeModule === 'compiler' ? 'healing' : 'compiler')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer border ${
                activeModule === 'compiler'
                  ? 'bg-purple-600 text-white border-purple-400 shadow-lg shadow-purple-900/40'
                  : 'bg-purple-950/40 text-purple-300 border-purple-500/30 hover:bg-purple-900/50'
              }`}
              title="Toggle ConnectCraft"
            >
              <Wand2 className="w-3.5 h-3.5 text-purple-300" />
              <span className="hidden sm:inline">AI Compiler</span>
            </button>
          )}

          {/* Boomi Companion Pill Button */}
          <button
            onClick={onToggleCompanion}
            className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-boomi-blue to-sky-500 hover:from-blue-600 hover:to-sky-400 text-white text-xs font-semibold shadow-lg shadow-sky-500/25 border border-sky-400/40 transition-all cursor-pointer"
          >
            <Bot className="w-4 h-4" />
            <span>Boomi Companion</span>
            {companionUnreadCount > 0 && (
              <span className="w-5 h-5 rounded-full bg-rose-600 text-white text-[10px] font-bold flex items-center justify-center">
                {companionUnreadCount}
              </span>
            )}
          </button>
        </div>

      </div>
    </header>
  );
};
