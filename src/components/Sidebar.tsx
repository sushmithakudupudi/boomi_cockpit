import React, { useState } from 'react';
import {
  HeartPulse,
  GitCompareArrows,
  LayoutDashboard,
  ListFilter,
  ChevronDown,
  PanelLeftClose,
  PanelLeftOpen,
  Wand2,
  Plus,
  FileEdit,
  Send,
  Trash2
} from 'lucide-react';
import type { AtomHealth } from '../types/boomi';

export type AppModule = 'healing' | 'compiler' | 'revisions';
export type HealingTab = 'cockpit' | 'reporting';
export type CompilerView = 'editor' | 'draft' | 'sent' | 'deleted';

interface SidebarProps {
  activeModule: AppModule;
  onModuleChange: (module: AppModule) => void;
  activeTab: HealingTab;
  onTabChange: (tab: HealingTab) => void;
  compilerView: CompilerView;
  onCompilerView: (view: CompilerView) => void;
  draftCount?: number;
  sentCount?: number;
  deletedCount?: number;
  healingAlertCount?: number;
  executionsCount?: number;
  atom?: AtomHealth;
  /** Small screens: the sidebar is an off-canvas drawer shown only while this is true. */
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
}

const COLLAPSE_KEY = 'boomiops.sidebarCollapsed';

const readCollapsed = () => {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === '1';
  } catch {
    return false;
  }
};

// Hover label shown next to icons when the sidebar is collapsed
const Tooltip: React.FC<{ label: string; show: boolean }> = ({ label, show }) =>
  show ? (
    <span className="pointer-events-none absolute left-full ml-3 top-1/2 -translate-y-1/2 z-50 whitespace-nowrap px-2.5 py-1 rounded-lg bg-slate-800 border border-slate-700 text-[11px] font-semibold text-slate-100 shadow-xl opacity-0 group-hover:opacity-100 transition-opacity">
      {label}
    </span>
  ) : null;

export const Sidebar: React.FC<SidebarProps> = ({
  activeModule,
  onModuleChange,
  activeTab,
  onTabChange,
  compilerView,
  onCompilerView,
  draftCount = 0,
  sentCount = 0,
  deletedCount = 0,
  healingAlertCount = 0,
  executionsCount = 0,
  mobileOpen = false,
  onCloseMobile,
}) => {
  const [collapsedPref, setCollapsedPref] = useState(readCollapsed);
  // The drawer on small screens always shows full labels.
  const isCollapsed = collapsedPref && !mobileOpen;
  const [isHealingOpen, setIsHealingOpen] = useState(true);
  const [isCompilerOpen, setIsCompilerOpen] = useState(true);

  const toggleCollapsed = () => {
    const next = !collapsedPref;
    setCollapsedPref(next);
    try {
      localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0');
    } catch {
      /* storage unavailable */
    }
  };

  const subItems: { id: HealingTab; label: string; icon: React.ElementType; count?: number }[] = [
    { id: 'cockpit', label: 'Live Cockpit', icon: LayoutDashboard },
    { id: 'reporting', label: 'Process Reporting', icon: ListFilter, count: executionsCount },
  ];

  const moduleButton = (
    id: AppModule,
    label: string,
    hint: string,
    Icon: React.ElementType,
    extra?: React.ReactNode
  ) => {
    const isActive = activeModule === id;
    return (
      <button
        onClick={() => {
          onModuleChange(id);
          if (id === 'healing') setIsHealingOpen(isActive ? !isHealingOpen : true);
          if (id === 'compiler') setIsCompilerOpen(isActive ? !isCompilerOpen : true);
        }}
        className={`group relative w-full flex items-center gap-3 rounded-xl transition cursor-pointer ${
          isCollapsed ? 'justify-center p-2.5' : 'px-3 py-2.5'
        } ${
          isActive
            ? 'bg-gradient-to-r from-boomi-blue/25 to-transparent text-white'
            : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/70'
        }`}
      >
        {isActive && <span className="absolute left-0 top-2 bottom-2 w-1 rounded-r bg-boomi-accent" />}
        <span
          className={`relative flex items-center justify-center w-8 h-8 rounded-lg shrink-0 transition ${
            isActive ? 'bg-boomi-blue/30 text-boomi-accent' : 'bg-slate-800/80 group-hover:bg-slate-700/80'
          }`}
        >
          <Icon className="w-4 h-4" />
          {isCollapsed && id === 'healing' && healingAlertCount > 0 && (
            <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-rose-600 text-white text-[9px] font-bold flex items-center justify-center border-2 border-boomi-dark">
              {healingAlertCount}
            </span>
          )}
        </span>
        {!isCollapsed && (
          <>
            <div className="flex-1 min-w-0 text-left">
              <div className="text-xs font-semibold truncate">{label}</div>
              <div className="text-[10px] text-slate-500 truncate">{hint}</div>
            </div>
            {extra}
          </>
        )}
        <Tooltip label={label} show={isCollapsed} />
      </button>
    );
  };

  return (
    <>
    {mobileOpen && <div className="md:hidden fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" onClick={onCloseMobile} aria-hidden="true" />}
    <aside
      className={`fixed md:sticky inset-y-0 left-0 md:top-0 z-50 md:z-auto h-screen shrink-0 flex flex-col bg-boomi-dark border-r border-boomi-cardBorder md:border-r-0 transition-[width,transform] duration-200 w-64 ${
        collapsedPref ? 'md:w-[72px]' : 'md:w-64'
      } ${mobileOpen ? 'translate-x-0 shadow-2xl shadow-black/60' : '-translate-x-full'} md:translate-x-0`}
    >
      {/* Brand */}
      <div className={`h-16 flex items-center gap-3 ${isCollapsed ? 'justify-center' : 'px-4'}`}>
        <div className="relative flex items-center justify-center w-9 h-9 p-0.5 rounded-xl bg-[#ffffff] border border-boomi-cardBorder shadow-sm shrink-0">
          <img src="/esi-logo.png" alt="ESI" className="w-full h-full object-contain" />
        </div>
        {!isCollapsed && (
          <div className="min-w-0">
            <div className="text-sm font-bold tracking-tight text-white">BoomiOps</div>
            <div className="text-[10px] text-slate-500 truncate">Companion Cockpit</div>
          </div>
        )}
      </div>

      {/* Navigation (picking a page closes the drawer on small screens) */}
      <nav
        className={`flex-1 p-3 space-y-1 ${isCollapsed ? '' : 'overflow-y-auto overflow-x-hidden'}`}
        onClick={(e) => { if ((e.target as HTMLElement).closest('button')) onCloseMobile?.(); }}
      >
 

        {moduleButton(
          'compiler',
          'ArchForge',
          'Blueprint & Spec Prompt',
          Wand2,
          <ChevronDown
            className={`w-3.5 h-3.5 text-slate-500 transition-transform ${
              isCompilerOpen && activeModule === 'compiler' ? '' : '-rotate-90'
            }`}
          />
        )}

        {/* Compiler sub-pages: new blueprint, drafts, and blueprints already sent to Boomi */}
        {activeModule === 'compiler' && isCompilerOpen && (
          <div className={isCollapsed ? 'space-y-1 pt-1' : 'ml-7 pl-3 border-l border-slate-800 space-y-0.5 py-1'}>
            {([
              { id: 'editor', label: 'New', icon: Plus, count: undefined },
              { id: 'draft', label: 'Draft', icon: FileEdit, count: draftCount },
              { id: 'sent', label: 'Sent', icon: Send, count: sentCount },
              { id: 'deleted', label: 'Deleted Item(s)', icon: Trash2, count: deletedCount },
            ] as { id: CompilerView; label: string; icon: React.ElementType; count?: number }[]).map(({ id, label, icon: Icon, count }) => {
              const isActive = compilerView === id;
              return (
                <button
                  key={id}
                  onClick={() => onCompilerView(id)}
                  className={`group relative w-full flex items-center gap-2.5 rounded-lg text-xs transition cursor-pointer ${
                    isCollapsed ? 'justify-center p-2' : 'px-2.5 py-1.5'
                  } ${
                    isActive
                      ? 'bg-slate-800 text-white font-semibold'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                  }`}
                >
                  <Icon className={`w-3.5 h-3.5 shrink-0 ${isActive ? 'text-boomi-accent' : ''}`} />
                  {!isCollapsed && (
                    <>
                      <span className="flex-1 text-left truncate">{label}</span>
                      {count !== undefined && (
                        <span className={`text-[10px] px-1.5 rounded-full font-bold ${
                          isActive ? 'bg-sky-400/25 text-sky-200' : 'bg-slate-800 text-slate-500'
                        }`}>
                          {count}
                        </span>
                      )}
                    </>
                  )}
                  <Tooltip label={label} show={isCollapsed} />
                </button>
              );
            })}
          </div>
        )}

        {moduleButton(
          'healing',
          'HealIQ',
          'Triage & auto-reprocess',
          HeartPulse,
          <div className="flex items-center gap-1.5">
            {healingAlertCount > 0 && (
              <span className="min-w-5 h-5 px-1 rounded-full bg-rose-600 text-white text-[10px] font-bold flex items-center justify-center">
                {healingAlertCount}
              </span>
            )}
            <ChevronDown
              className={`w-3.5 h-3.5 text-slate-500 transition-transform ${
                isHealingOpen && activeModule === 'healing' ? '' : '-rotate-90'
              }`}
            />
          </div>
        )}

        {/* Healing sub-pages */}
        {activeModule === 'healing' && isHealingOpen && (
          <div className={isCollapsed ? 'space-y-1 pt-1' : 'ml-7 pl-3 border-l border-slate-800 space-y-0.5 py-1'}>
            {subItems.map(({ id, label, icon: Icon, count }) => {
              const isActive = activeTab === id;
              return (
                <button
                  key={id}
                  onClick={() => onTabChange(id)}
                  className={`group relative w-full flex items-center gap-2.5 rounded-lg text-xs transition cursor-pointer ${
                    isCollapsed ? 'justify-center p-2' : 'px-2.5 py-1.5'
                  } ${
                    isActive
                      ? 'bg-slate-800 text-white font-semibold'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                  }`}
                >
                  <Icon className={`w-3.5 h-3.5 shrink-0 ${isActive ? 'text-boomi-accent' : ''}`} />
                  {!isCollapsed && (
                    <>
                      <span className="flex-1 text-left truncate">{label}</span>
                      {count !== undefined && (
                        <span className={`text-[10px] px-1.5 rounded-full font-bold ${
                          isActive ? 'bg-sky-400/25 text-sky-200' : 'bg-slate-800 text-slate-500'
                        }`}>
                          {count}
                        </span>
                      )}
                    </>
                  )}
                  <Tooltip label={label} show={isCollapsed} />
                </button>
              );
            })}
          </div>
        )}

        {moduleButton('revisions', 'ChangeLens', 'Browse & compare versions', GitCompareArrows)}
      </nav>

      {/* Footer: collapse */}
      <div className="p-3">
        <button
          onClick={toggleCollapsed}
          title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className={`hidden md:flex w-full items-center gap-2 rounded-xl text-slate-400 hover:text-slate-100 hover:bg-slate-800 text-xs transition cursor-pointer ${
            isCollapsed ? 'justify-center p-2' : 'px-3 py-2'
          }`}
        >
          {isCollapsed ? (
            <PanelLeftOpen className="w-4 h-4" />
          ) : (
            <>
              <PanelLeftClose className="w-4 h-4" />
              <span>Collapse</span>
            </>
          )}
        </button>
      </div>
    </aside>
    </>
  );
};
