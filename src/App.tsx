import { useState, useEffect } from 'react';
import { Navbar } from './components/Navbar';
import { Sidebar, PLACEHOLDER_MODULES, type AppModule, type HealingTab, type CompilerView } from './components/Sidebar';
import { CompilerRecordsPage, type BlueprintRecord } from './components/CompilerRecordsPage';
import { StatsOverview } from './components/StatsOverview';
import { ProcessFlowGraph } from './components/ProcessFlowGraph';
import { LiveProcessFeed } from './components/LiveProcessFeed';
import { ProcessReportingPage } from './components/ProcessReportingPage';
import { RevisionHistoryPage } from './components/revisions/RevisionHistoryPage';
import { TriageModal } from './components/TriageModal';
import { BoomiCompanionDrawer } from './components/BoomiCompanionDrawer';
import { FailureHistory } from './components/FailureHistory';
import { InvestigationCard } from './components/InvestigationCard';
import { FailureAlertsToggle } from './components/FailureAlertsToggle';
import { VisualArchitectureCompiler } from './components/VisualArchitectureCompiler';
import { api } from './services/api';
import type { ExecutionRecord, AtomHealth, ProcessDocRef } from './types/boomi';
import { 
  Sparkles, 
  RotateCcw, 
  Layers, 
  CheckCircle2, 
  AlertTriangle
} from 'lucide-react';
import confetti from 'canvas-confetti';

const READ_FAILURES_KEY = 'boomiops.readFailureIds';
const EXECUTION_POLL_MS = 30000;

const newBlueprintId = () => `bp-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export function App() {
  const [activeModule, setActiveModule] = useState<AppModule>('compiler');
  // ConnectCraft editor and saved item views
  const [compilerView, setCompilerView] = useState<CompilerView>('editor');
  const [blueprintId, setBlueprintId] = useState<string | null>(null);
  const [records, setRecords] = useState<BlueprintRecord[]>([]);
  const [activeTab, setActiveTab] = useState<HealingTab>('cockpit');
  const activePlaceholder = PLACEHOLDER_MODULES.find(m => m.id === activeModule);
  const [executions, setExecutions] = useState<ExecutionRecord[]>([]);
  // Failures the user has already seen in the bell. null until the first load sets a baseline,
  // so failures that existed before today do not all show up as new.
  const [readFailureIds, setReadFailureIds] = useState<Set<string> | null>(() => {
    try {
      const raw = localStorage.getItem(READ_FAILURES_KEY);
      return raw ? new Set<string>(JSON.parse(raw)) : null;
    } catch {
      return null;
    }
  });
  const [selectedExecution, setSelectedExecution] = useState<ExecutionRecord | null>(null);
  const [isCompanionOpen, setIsCompanionOpen] = useState(false);
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  // A question to send to the Companion as soon as the drawer opens (e.g. "What changed?" on an incident)
  // Re-run: nothing starts until the user confirms in the dialog
  const [rerunTarget, setRerunTarget] = useState<ExecutionRecord | null>(null);
  const [rerunBusy, setRerunBusy] = useState(false);
  const [companionPrompt, setCompanionPrompt] = useState<string | null>(null);
  // Revision picked via "AI Docs" in Revision History; the Companion summarizes it
  const [docRequest, setDocRequest] = useState<(ProcessDocRef & { requestId: number }) | null>(null);
  const [isReprocessed, setIsReprocessed] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isBackendConnected, setIsBackendConnected] = useState(false);
  const [atoms, setAtoms] = useState<AtomHealth[]>([]);
  
  // Real process selection for Flow Chart
  const [selectedProcessId, setSelectedProcessId] = useState<string>('94348d68-6d4e-4679-90be-a35219a02116');
  const [selectedProcessName, setSelectedProcessName] = useState<string>('Modbus_Read_Test_Process');

  const refreshRecords = async (): Promise<BlueprintRecord[] | null> => {
    const list = (await api.listBlueprints()) as BlueprintRecord[] | null;
    if (list) setRecords(list);
    return list;
  };

  // Resume the most recent draft on start, or begin a fresh one
  useEffect(() => {
    refreshRecords().then((list) => {
      const latestDraft = list?.find((r) => r.status !== 'sent' && !r.deletedAt);
      setBlueprintId(latestDraft?.id ?? newBlueprintId());
    });
  }, []);

  const activeRecords = records.filter((r) => !r.deletedAt);
  const deleted = records.filter((r) => !!r.deletedAt);
  const drafts = activeRecords.filter((r) => r.status !== 'sent');
  const sent = activeRecords.filter((r) => r.status === 'sent');

  const handleCompilerView = (view: CompilerView) => {
    setActiveModule('compiler');
    if (view === 'editor') {
      setBlueprintId(newBlueprintId()); // "+ New" always starts a fresh blueprint
    }
    setCompilerView(view);
    refreshRecords();
  };

  // A draft the AI wrote from a chat description: load it in ArchForge for review
  const handleOpenAiDraft = async (draftId: string) => {
    await refreshRecords();
    setBlueprintId(draftId);
    setCompilerView('editor');
    setActiveModule('compiler');
    setIsCompanionOpen(false);
  };

  const handleOpenDraft = (record: BlueprintRecord) => {
    setBlueprintId(record.id);
    setCompilerView('editor');
  };

  const handleDeleteRecord = async (record: BlueprintRecord) => {
    // Confirmation happens in the records list; window.confirm is blocked in some embedded browsers
    const ok = await api.deleteBlueprint(record.id);
    if (!ok) {
      showToast('Could not delete. Is the backend running?');
      return;
    }
    if (record.id === blueprintId) setBlueprintId(newBlueprintId());
    await refreshRecords();
    showToast(record.status === 'sent' ? 'Moved to Deleted. The process in Boomi is not deleted.' : 'Draft moved to Deleted.');
  };

  const handleRestoreRecord = async (record: BlueprintRecord) => {
    const ok = await api.restoreBlueprint(record.id);
    if (!ok) { showToast('Could not restore item.'); return; }
    await refreshRecords();
    showToast('Item restored.');
  };

  const handleDuplicate = async (record: BlueprintRecord) => {
    const id = newBlueprintId();
    const { id: _oldId, updatedAt: _u, ...rest } = record as BlueprintRecord & Record<string, unknown>;
    void _oldId; void _u;
    await api.saveBlueprint(id, {
      ...rest,
      title: `${record.title || 'Blueprint'} (copy)`,
      status: 'draft',
      sentAt: null,
      buildResult: null,
      processName: '',
    });
    await refreshRecords();
    setBlueprintId(id);
    setCompilerView('editor');
    showToast('Copied to a new draft.');
  };

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  // Load real executions and atoms from Boomi platform
  const loadData = async () => {
    const isHealthy = await api.checkHealth();
    setIsBackendConnected(isHealthy);
    if (isHealthy) {
      const [data, atomsData] = await Promise.all([
        api.fetchExecutions(),
        api.fetchAtoms()
      ]);
      if (data && data.length > 0) {
        setExecutions(data);
        const errTarget = data.find(e => e.status === 'ERROR') || data[0];
        if (errTarget && errTarget.processId) {
          setSelectedProcessId(errTarget.processId);
          setSelectedProcessName(errTarget.processName);
        }
      }
      if (atomsData && atomsData.length > 0) {
        setAtoms(atomsData);
      }
    }
  };

  useEffect(() => {
    let isMounted = true;
    loadData();

    const interval = setInterval(async () => {
      const isHealthy = await api.checkHealth();
      if (isMounted) setIsBackendConnected(isHealthy);
      if (isMounted && isHealthy) {
        const atomsData = await api.fetchAtoms();
        if (atomsData && atomsData.length > 0) setAtoms(atomsData);
      }
    }, 6000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  // Keep executions live: pull fresh data from Boomi every 30s while the page is visible
  useEffect(() => {
    let mounted = true;
    const refresh = async () => {
      if (document.hidden) return;
      const data = await api.fetchExecutionsLive(true);
      if (!mounted || !data) return;
      setExecutions((prev) => (JSON.stringify(prev) === JSON.stringify(data) ? prev : data));
    };
    const timer = setInterval(refresh, EXECUTION_POLL_MS);
    const onVisible = () => { if (!document.hidden) refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      mounted = false;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  // A clicked browser notification opens the Companion: new window via ?openCompanion=1, open tab via a message
  useEffect(() => {
    const openCompanion = () => {
      setActiveModule('healing');
      setActiveTab('cockpit');
      setIsCompanionOpen(true);
    };
    if (new URLSearchParams(window.location.search).has('openCompanion')) {
      openCompanion();
      window.history.replaceState(null, '', window.location.pathname);
    }
    const onMessage = (e: MessageEvent) => { if (e.data?.type === 'open-companion') openCompanion(); };
    navigator.serviceWorker?.addEventListener('message', onMessage);
    return () => navigator.serviceWorker?.removeEventListener('message', onMessage);
  }, []);

  // Reprocess document via Boomi AtomSphere API
  const handleAutoHeal = async (execId: string) => {
    try {
      await api.reprocessExecution(execId);
    } catch (e) {
      // Boomi did not accept it (or the backend is down): leave the incident open and say why
      showToast(`⚠️ ${e instanceof Error ? e.message : 'Reprocess failed.'}`);
      return;
    }

    setExecutions((prev) =>
      prev.map((item) => {
        if (item.id === execId) {
          return {
            ...item,
            status: 'SUCCESS',
            reprocessed: true,
            errorMessage: undefined,
            outboundDocs: 1,
            durationMs: 1150,
          };
        }
        return item;
      })
    );

    setIsReprocessed(true);
    setSelectedExecution(null);
    confetti({
      particleCount: 100,
      spread: 70,
      origin: { y: 0.6 }
    });
    showToast('⚡ Boomi accepted the reprocess request. Confirm the result in Boomi.');
  };

  const handleConfirmRerun = async () => {
    if (!rerunTarget) return;
    setRerunBusy(true);
    try {
      const res = await api.rerunProcess(rerunTarget.processId, rerunTarget.atomName);
      showToast(`▶️ ${res.message}`);
      setRerunTarget(null);
      // Pull the new execution from Boomi once it has had time to run
      setTimeout(() => { handleResetDemo(); }, 12000);
    } catch (e) {
      showToast(`⚠️ ${e instanceof Error ? e.message : 'Could not start the process.'}`);
    } finally {
      setRerunBusy(false);
    }
  };

  const handleResetDemo = async () => {
    try {
      await api.resetDemoScenario();
      await loadData();
    } catch (e) {
      console.warn("Reset error:", e);
    }
    setIsReprocessed(false);
    showToast('🔄 Refreshed live telemetry directly from Dell Boomi AtomSphere.');
  };

  // Find active failure if any exists in real executions
  const activeErrorExec = executions.find(e => e.status === 'ERROR' && !e.reprocessed);
  // Most recent failure on record, from real Boomi execution data
  const lastFailure = executions
    .filter(e => e.status === 'ERROR' || e.errorMessage)
    .sort((a, b) => (b.startedAt || '').localeCompare(a.startedAt || ''))[0];
  // Open failures, newest first, for the bell
  const openFailures = executions
    .filter(e => e.status === 'ERROR' && !e.reprocessed)
    .sort((a, b) => (b.startedAt || '').localeCompare(a.startedAt || ''));

  const persistRead = (ids: Set<string>) => {
    setReadFailureIds(ids);
    try { localStorage.setItem(READ_FAILURES_KEY, JSON.stringify([...ids].slice(-500))); } catch { /* storage unavailable */ }
  };

  // First load: everything already failing counts as seen, so only new failures raise the bell
  useEffect(() => {
    if (readFailureIds === null && executions.length > 0) {
      persistRead(new Set(openFailures.map(f => f.id)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [executions, readFailureIds]);

  const unreadFailureIds = new Set(
    openFailures.filter(f => readFailureIds !== null && !readFailureIds.has(f.id)).map(f => f.id)
  );

  const handleMarkAllRead = () => persistRead(new Set([...(readFailureIds || []), ...openFailures.map(f => f.id)]));

  const handleOpenFailure = (exec: ExecutionRecord) => {
    persistRead(new Set([...(readFailureIds || []), exec.id]));
    setActiveModule('healing');
    setActiveTab('cockpit');
    setSelectedProcessId(exec.processId);
    setSelectedProcessName(exec.processName);
    setSelectedExecution(exec);
  };

  const failedCount = executions.filter(e => e.status === 'ERROR' && !e.reprocessed).length;
  const autoHealedCount = executions.filter(e => e.reprocessed).length + (isReprocessed ? 1 : 0);

  return (
    <div className="min-h-screen bg-boomi-navy text-slate-100 flex font-sans selection:bg-boomi-blue selection:text-white">

      {/* Vertical Module Navigation */}
      <Sidebar
        activeModule={activeModule}
        onModuleChange={setActiveModule}
        activeTab={activeTab}
        onTabChange={(tab) => {
          setActiveModule('healing');
          setActiveTab(tab);
        }}
        compilerView={compilerView}
        onCompilerView={handleCompilerView}
        draftCount={drafts.length}
        sentCount={sent.length}
        deletedCount={deleted.length}
        healingAlertCount={failedCount}
        executionsCount={executions.length}
        atom={atoms[0]}
        mobileOpen={isMobileNavOpen}
        onCloseMobile={() => setIsMobileNavOpen(false)}
      />

      {/* On wide screens the Companion drawer docks beside the page instead of covering it */}
      <div className={`flex-1 min-w-0 flex flex-col transition-[margin] duration-200 ${isCompanionOpen ? 'lg:mr-[28rem]' : ''}`}>
      
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-20 right-6 z-50 flex items-center gap-2.5 px-4 py-3 rounded-xl bg-slate-900 border border-emerald-500/50 shadow-2xl text-xs font-semibold text-emerald-300 animate-slide-left">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Top Navbar with Tab Switcher */}
      <Navbar 
        onToggleCompanion={() => setIsCompanionOpen(!isCompanionOpen)}
        onOpenNav={() => setIsMobileNavOpen(true)}
        companionUnreadCount={failedCount}
        isBackendConnected={isBackendConnected}
        atom={atoms[0]}
        onRefresh={handleResetDemo}
        failures={openFailures}
        unreadFailureIds={unreadFailureIds}
        onOpenFailure={handleOpenFailure}
        onMarkAllRead={handleMarkAllRead}
        sectionLabel={
          activeModule === 'compiler' ? 'ArchForge'
            : activeModule === 'revisions' ? 'RevIQ'
            : (activePlaceholder?.label ?? 'HealIQ')
        }
        pageLabel={
          activeModule === 'healing'
            ? (activeTab === 'cockpit' ? 'Live Cockpit' : 'Process Reporting')
            : activeModule === 'compiler'
              ? (compilerView === 'draft' ? 'Draft' : compilerView === 'sent' ? 'Sent' : compilerView === 'deleted' ? 'Deleted' : 'New')
              : activeModule === 'revisions' ? 'RevIQ' : 'Overview'
        }
      />

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        
        {activeModule === 'compiler' ? (
          compilerView === 'editor' ? (
            blueprintId && (
              <VisualArchitectureCompiler
                key={blueprintId}
                blueprintId={blueprintId}
                onShowToast={showToast}
                onSaved={refreshRecords}
                onSent={() => {
                  refreshRecords();
                  setCompilerView('sent');
                  setBlueprintId(newBlueprintId());
                }}
              />
            )
          ) : (
            <CompilerRecordsPage
              kind={compilerView}
              records={compilerView === 'draft' ? drafts : compilerView === 'sent' ? sent : deleted}
              onOpen={handleOpenDraft}
              onDelete={handleDeleteRecord}
              onDuplicate={handleDuplicate}
              onRestore={handleRestoreRecord}
              onNew={() => handleCompilerView('editor')}
            />
          )
        ) : activePlaceholder ? (
          /* Placeholder page for modules not built yet */
          <div className="flex flex-col items-center justify-center text-center py-32 rounded-2xl border border-dashed border-slate-700 bg-slate-900/40">
            <div className="p-3 rounded-xl bg-boomi-blue/20 border border-boomi-blue/40 text-boomi-accent mb-3">
              <activePlaceholder.icon className="w-6 h-6" />
            </div>
            <h2 className="text-sm font-bold text-white">{activePlaceholder.label}</h2>
            <p className="text-xs text-slate-400 mt-1">This section is coming soon.</p>
          </div>
        ) : activeModule === 'revisions' ? (
          <RevisionHistoryPage
            onAiDocs={(source, component, rev) => {
              setDocRequest({ source, componentId: component.componentId, version: rev.version, processName: component.name, requestId: Date.now() });
              setIsCompanionOpen(true);
            }}
          />
        ) : activeTab === 'cockpit' ? (
          <>
            {/* Banner Alert for real active error from Boomi platform */}
            {activeErrorExec ? (
              <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-rose-950/60 via-slate-900/90 to-boomi-dark border border-rose-500/40 p-4 sm:p-5 shadow-xl flex flex-col xl:flex-row items-start xl:items-center justify-between gap-4">
                <div className="flex items-start sm:items-center gap-3.5 min-w-0 w-full xl:w-auto xl:flex-1">
                  <div className="p-3 rounded-xl bg-rose-500/20 border border-rose-500/30 text-rose-400 shrink-0">
                    <AlertTriangle className="w-5 h-5 animate-pulse" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-sm font-bold text-white break-words min-w-0">Active Integration Incident: {activeErrorExec.processName}</h2>
                      <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30">
                        P1 Critical
                      </span>
                    </div>
                    <p className="text-xs text-slate-300 mt-1 max-w-2xl font-mono line-clamp-2 sm:truncate break-all sm:break-normal">
                      {activeErrorExec.errorMessage || "Process execution reported errors in Dell Boomi AtomSphere."}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 w-full xl:w-auto xl:shrink-0">
                  <button
                    onClick={() => {
                      setSelectedExecution(activeErrorExec);
                      setSelectedProcessId(activeErrorExec.processId);
                      setSelectedProcessName(activeErrorExec.processName);
                    }}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-boomi-blue to-boomi-accent hover:from-blue-600 hover:to-sky-400 text-white font-bold text-xs shadow-lg shadow-sky-950 transition-all cursor-pointer"
                  >
                    <Sparkles className="w-4 h-4 text-amber-200" />
                    <span>Triage with Companion</span>
                  </button>
                  <button
                    onClick={() => {
                      setCompanionPrompt(`What changed in ${activeErrorExec.processName} recently, and who changed it?`);
                      setIsCompanionOpen(true);
                    }}
                    title="Ask the Companion to compare the latest revisions of this process"
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs border border-slate-700 transition-all cursor-pointer"
                  >
                    <span>What changed?</span>
                  </button>
                  <button
                    onClick={() => setRerunTarget(activeErrorExec)}
                    title="Run this process once on its Atom (asks for confirmation)"
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs border border-slate-700 transition-all cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Re-run process</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="rounded-2xl bg-gradient-to-r from-emerald-950/50 via-slate-900/80 to-boomi-dark border border-emerald-500/40 p-4 shadow-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="p-2.5 rounded-xl bg-emerald-500/20 border border-emerald-500/30 text-emerald-400">
                    <CheckCircle2 className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-white">All Production Pipelines Fully Operational</h2>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Runtime Atom: <strong className="text-slate-200">{atoms[0]?.name || "ESI-PC16.easystepin.com"}</strong> is ONLINE with 0 active execution errors.
                    </p>
                  </div>
                </div>

                <button
                  onClick={handleResetDemo}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold border border-slate-700 transition cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Refresh Boomi Feed</span>
                </button>
              </div>
            )}

            {/* Section 1: KPI Stats Overview */}
            <StatsOverview
              totalExecutions={executions.length}
              failedCount={failedCount}
              autoHealedCount={autoHealedCount}
              atomCount={atoms.length || 1}
              lastFailure={lastFailure}
            />

            {/* Read-only diagnosis of the open incident */}
            {activeErrorExec && (
              <InvestigationCard
                execution={activeErrorExec}
                onAskFollowUp={(prompt) => { setCompanionPrompt(prompt); setIsCompanionOpen(true); }}
              />
            )}

            {/* Browser alerts for new failures, delivered even when the page is closed */}
            <FailureAlertsToggle onShowToast={showToast} />

            {/* Failure history from real execution records */}
            <FailureHistory
              executions={executions}
              onSelectProcess={(exec) => {
                setSelectedProcessId(exec.processId);
                setSelectedProcessName(exec.processName);
                showToast(`Loaded live Boomi canvas for: ${exec.processName}`);
              }}
            />

            {/* Section 2: Real Interactive Process Topology (Takes directly from Boomi XML) */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Layers className="w-4 h-4 text-boomi-accent" />
                  <h3 className="text-sm font-bold text-white">
                    Live Integration Topology: <span className="text-sky-300">{selectedProcessName}</span>
                  </h3>
                </div>
                <span className="text-xs text-slate-400">
                  Shapes & connections rendered directly from Dell Boomi AtomSphere Component XML
                </span>
              </div>

              <ProcessFlowGraph
                onTriageClick={() => {
                  if (activeErrorExec) setSelectedExecution(activeErrorExec);
                }}
                isReprocessed={isReprocessed}
                onSimulateHeal={() => {
                  if (activeErrorExec) handleAutoHeal(activeErrorExec.id);
                }}
                onReset={handleResetDemo}
                processId={selectedProcessId}
                processName={selectedProcessName}
              />
            </div>

            {/* Section 3: Live Process Reporting (Distinct Active Processes) */}
            <LiveProcessFeed
              executions={executions}
              onSelectExecution={(exec) => {
                setSelectedExecution(exec);
                setSelectedProcessId(exec.processId);
                setSelectedProcessName(exec.processName);
              }}
              onOpenFlow={(exec) => {
                setSelectedProcessId(exec.processId);
                setSelectedProcessName(exec.processName);
                showToast(`Loaded live Boomi canvas for: ${exec.processName}`);
              }}
              onViewAllExecutions={() => setActiveTab('reporting')}
              selectedProcessId={selectedProcessId}
            />
          </>
        ) : (
          /* Separate Page: Full Process Reporting with All Executions */
          <ProcessReportingPage
            executions={executions}
            onSelectExecution={(exec) => {
              setSelectedExecution(exec);
              setSelectedProcessId(exec.processId);
              setSelectedProcessName(exec.processName);
            }}
            onOpenFlow={(exec) => {
              setSelectedProcessId(exec.processId);
              setSelectedProcessName(exec.processName);
              setActiveTab('cockpit');
              showToast(`Loaded live Boomi canvas for: ${exec.processName}`);
            }}
            onQuickReprocess={(exec) => {
              handleAutoHeal(exec.id);
            }}
            onBackToCockpit={() => setActiveTab('cockpit')}
            onRefresh={handleResetDemo}
            atomName={atoms[0]?.name}
          />
        )}

      </main>

      {/* Footer */}
      <footer className="w-full border-t border-boomi-cardBorder bg-boomi-dark/60 py-4 text-center text-xs text-slate-500">
        <p>BoomiOps Cockpit • Connected to Dell Boomi AtomSphere Account: trainingsainikhilbadathal-WEUHDR</p>
      </footer>
      </div>

      {/* Re-run confirmation: this really executes the process */}
      {rerunTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4" role="dialog" aria-modal="true" aria-label="Confirm re-run">
          <div className="w-full max-w-md rounded-2xl bg-boomi-card border border-amber-500/40 shadow-2xl p-5 space-y-3">
            <div className="flex items-center gap-2 text-amber-300 font-bold text-sm">
              <AlertTriangle className="w-4 h-4" />
              <span>Run this process now?</span>
            </div>
            <p className="text-xs text-slate-300">
              This starts <strong className="text-white">{rerunTarget.processName}</strong> on <strong className="text-white">{rerunTarget.atomName}</strong> right now.
              It runs the real integration, so it can call external systems, send or change data, and generate load.
            </p>
            {/chaos|load|fuzz/i.test(rerunTarget.processName) && (
              <p className="text-xs text-amber-200/90">
                The name suggests a load or chaos test. Running it again will generate traffic and may trigger the same failures.
              </p>
            )}
            <p className="text-[11px] text-slate-500">Boomi must have the process deployed. The same process can only be started once a minute from here.</p>
            <div className="flex justify-end gap-2 pt-1">
              <button
                onClick={() => setRerunTarget(null)}
                disabled={rerunBusy}
                className="px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 text-xs cursor-pointer disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmRerun}
                disabled={rerunBusy}
                className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold cursor-pointer disabled:opacity-60"
              >
                {rerunBusy ? 'Starting…' : 'Run process'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Incident Triage Modal */}
      <TriageModal
        execution={selectedExecution}
        onClose={() => setSelectedExecution(null)}
        onAutoHeal={handleAutoHeal}
      />

      {/* Boomi Companion Conversational Drawer */}
      <BoomiCompanionDrawer
        isOpen={isCompanionOpen}
        onClose={() => setIsCompanionOpen(false)}
        onOpenDraft={handleOpenAiDraft}
        pendingPrompt={companionPrompt}
        onPromptConsumed={() => setCompanionPrompt(null)}
        executions={executions}
        docRequest={docRequest}
        onTriggerAutoHeal={handleAutoHeal}
        onOpenFlow={(exec) => {
          setSelectedExecution(exec);
          setSelectedProcessId(exec.processId);
          setSelectedProcessName(exec.processName);
          setIsCompanionOpen(false);
        }}
      />

    </div>
  );
}

export default App;
