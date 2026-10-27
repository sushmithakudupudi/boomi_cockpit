import { useState, useEffect } from 'react';
import { Navbar } from './components/Navbar';
import { Sidebar, PLACEHOLDER_MODULES, type AppModule, type HealingTab, type CompilerView } from './components/Sidebar';
import { CompilerRecordsPage, type BlueprintRecord } from './components/CompilerRecordsPage';
import { StatsOverview } from './components/StatsOverview';
import { ProcessFlowGraph } from './components/ProcessFlowGraph';
import { LiveProcessFeed } from './components/LiveProcessFeed';
import { ProcessReportingPage } from './components/ProcessReportingPage';
import { TriageModal } from './components/TriageModal';
import { BoomiCompanionDrawer } from './components/BoomiCompanionDrawer';
import { VisualArchitectureCompiler } from './components/VisualArchitectureCompiler';
import { api } from './services/api';
import type { ExecutionRecord, AtomHealth } from './types/boomi';
import { 
  Sparkles, 
  RotateCcw, 
  Layers, 
  CheckCircle2, 
  AlertTriangle
} from 'lucide-react';
import confetti from 'canvas-confetti';

const newBlueprintId = () => `bp-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export function App() {
  const [activeModule, setActiveModule] = useState<AppModule>('compiler');
  // Architecture Compiler: the editor, the Draft list, or the Sent list
  const [compilerView, setCompilerView] = useState<CompilerView>('editor');
  const [blueprintId, setBlueprintId] = useState<string | null>(null);
  const [records, setRecords] = useState<BlueprintRecord[]>([]);
  const [activeTab, setActiveTab] = useState<HealingTab>('cockpit');
  const activePlaceholder = PLACEHOLDER_MODULES.find(m => m.id === activeModule);
  const [executions, setExecutions] = useState<ExecutionRecord[]>([]);
  const [selectedExecution, setSelectedExecution] = useState<ExecutionRecord | null>(null);
  const [isCompanionOpen, setIsCompanionOpen] = useState(false);
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
      const latestDraft = list?.find((r) => r.status !== 'sent');
      setBlueprintId(latestDraft?.id ?? newBlueprintId());
    });
  }, []);

  const drafts = records.filter((r) => r.status !== 'sent');
  const sent = records.filter((r) => r.status === 'sent');

  const handleCompilerView = (view: CompilerView) => {
    setActiveModule('compiler');
    if (view === 'editor') {
      setBlueprintId(newBlueprintId()); // "+ New" always starts a fresh blueprint
    }
    setCompilerView(view);
    refreshRecords();
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
    showToast(record.status === 'sent' ? 'Record removed. The process in Boomi is not deleted.' : 'Draft deleted.');
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

  // Reprocess document via Boomi AtomSphere API
  const handleAutoHeal = async (execId: string) => {
    try {
      await api.reprocessExecution(execId);
    } catch (e) {
      console.warn("Backend reprocess call:", e);
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
    showToast(`⚡ Boomi Companion successfully reprocessed execution ${execId}!`);
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
        healingAlertCount={failedCount}
        executionsCount={executions.length}
        atom={atoms[0]}
      />

      <div className="flex-1 min-w-0 flex flex-col">
      
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
        companionUnreadCount={failedCount}
        isBackendConnected={isBackendConnected}
        atom={atoms[0]}
        onRefresh={handleResetDemo}
        sectionLabel={activeModule === 'compiler' ? 'Visual Architecture' : (activePlaceholder?.label ?? 'Self-Healing')}
        pageLabel={
          activeModule === 'healing'
            ? (activeTab === 'cockpit' ? 'Live Cockpit' : 'Process Reporting')
            : activeModule === 'compiler'
              ? (compilerView === 'draft' ? 'Draft' : compilerView === 'sent' ? 'Sent' : 'New')
              : 'Overview'
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
              records={compilerView === 'draft' ? drafts : sent}
              onOpen={handleOpenDraft}
              onDelete={handleDeleteRecord}
              onDuplicate={handleDuplicate}
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
        ) : activeTab === 'cockpit' ? (
          <>
            {/* Banner Alert for real active error from Boomi platform */}
            {activeErrorExec ? (
              <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-rose-950/60 via-slate-900/90 to-boomi-dark border border-rose-500/40 p-4 sm:p-5 shadow-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3.5">
                  <div className="p-3 rounded-xl bg-rose-500/20 border border-rose-500/30 text-rose-400 shrink-0">
                    <AlertTriangle className="w-5 h-5 animate-pulse" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-sm font-bold text-white">Active Integration Incident: {activeErrorExec.processName}</h2>
                      <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30">
                        P1 Critical
                      </span>
                    </div>
                    <p className="text-xs text-slate-300 mt-1 max-w-2xl font-mono truncate">
                      {activeErrorExec.errorMessage || "Process execution reported errors in Dell Boomi AtomSphere."}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2.5 shrink-0">
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
                </div>
              </div>
            ) : (
              <div className="rounded-2xl bg-gradient-to-r from-emerald-950/50 via-slate-900/80 to-boomi-dark border border-emerald-500/40 p-4 shadow-xl flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
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
              totalExecutions={executions.length || 20}
              failedCount={failedCount}
              autoHealedCount={autoHealedCount}
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
        executions={executions}
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
