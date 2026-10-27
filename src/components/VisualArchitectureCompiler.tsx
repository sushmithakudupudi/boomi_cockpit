import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  Copy,
  Check,
  RotateCcw,
  Plus,
  Trash2,
  ShieldCheck,
  CheckCircle2,
  Layers,
  ArrowRight,
  Download,
  Sliders,
  ChevronDown,
  Sparkles,
  Info,
  Terminal,
  Bot
} from 'lucide-react';
import confetti from 'canvas-confetti';
import type { Stage, BlueprintConfig } from '../types/compiler';
import {
  PRESET_BLUEPRINTS,
  createBlankConfig,
  generateGates,
  generateJobBreakdown,
  generateBoomiCompanionPrompt
} from '../services/boomiPromptEngine';
import { api } from '../services/api';
import { CATALOG_GROUPS, categorize, kindOf } from '../services/shapeCatalog';

interface Props {
  /** Backend id of the blueprint being edited; remount (key) to switch blueprints. */
  blueprintId: string;
  onShowToast?: (msg: string) => void;
  /** Called after the blueprint is saved, so lists and counts can refresh. */
  onSaved?: () => void;
  /** Called after the process was created in Boomi and the blueprint saved as sent. */
  onSent?: () => void;
}

export const VisualArchitectureCompiler: React.FC<Props> = ({ blueprintId: docId, onShowToast, onSaved, onSent }) => {
  const [selectedPresetId, setSelectedPresetId] = useState<string>('');
  const [blueprint, setBlueprint] = useState<BlueprintConfig>(() => createBlankConfig());
  const [businessRuleText, setBusinessRuleText] = useState<string>('');
  const [sentAt, setSentAt] = useState<string | null>(null);
  const [isCompiling, setIsCompiling] = useState<boolean>(false);
  const [copiedPrompt, setCopiedPrompt] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'prompt' | 'breakdown'>('prompt');
  const [expandedGateId, setExpandedGateId] = useState<string | null>(null);
  const [showAdvancedSettings, setShowAdvancedSettings] = useState<boolean>(false);
  
  // Build in Boomi: preview (dry run) first, then create after the user confirms
  type BuildPlan = Awaited<ReturnType<typeof api.buildBlueprint>>;
  const [processName, setProcessName] = useState<string>('');
  const [buildPlan, setBuildPlan] = useState<BuildPlan | null>(null);
  const [buildResult, setBuildResult] = useState<BuildPlan | null>(null);
  const [buildError, setBuildError] = useState<string | null>(null);
  const [buildBusy, setBuildBusy] = useState<boolean>(false);

  // Real-time AI generated prompt state from OpenAI
  const [aiGeneratedPrompt, setAiGeneratedPrompt] = useState<string | null>(null);
  const [promptSource, setPromptSource] = useState<'openai' | 'domain_engine'>('domain_engine');
  const [aiModelUsed, setAiModelUsed] = useState<string>('gpt-4o-mini');

  // Re-index stages (STEP 01, 02, ...) and derive each category from position and shape kind
  const normalizeStages = (stages: Stage[]): Stage[] => categorize(stages);

  // Load preset blueprint
  const handleSelectPreset = (presetId: string) => {
    const preset = PRESET_BLUEPRINTS.find(p => p.id === presetId);
    if (preset) {
      setSelectedPresetId(presetId);
      setBlueprint({
        ...preset.config,
        stages: normalizeStages(preset.config.stages)
      });
      setBusinessRuleText(preset.config.businessRule);
      setAiGeneratedPrompt(null);
      setPromptSource('domain_engine');
      if (onShowToast) onShowToast('Blueprint template loaded.');
    }
  };

  // Dynamic config matching current flow
  const currentConfig: BlueprintConfig = useMemo(() => {
    return {
      ...blueprint,
      stages: normalizeStages(blueprint.stages),
      businessRule: businessRuleText
    };
  }, [blueprint, businessRuleText]);

  // Restore the saved blueprint from the backend on load, then autosave every change
  const [restored, setRestored] = useState<boolean>(false);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const attempt = (triesLeft: number) => api.loadBlueprint(docId).then((result) => {
      if (cancelled) return;
      if (result.state === 'error') {
        // Backend unreachable: retry, and never autosave until we know what is stored
        if (triesLeft > 0) timer = setTimeout(() => attempt(triesLeft - 1), 2000);
        return;
      }
      const saved = result.state === 'ok' ? result.doc : null;
      if (saved && Array.isArray(saved.stages) && saved.stages.length >= 2) {
        const defaults = createBlankConfig();
        existsRef.current = true;
        setSelectedPresetId(saved.selectedPresetId || '');
        setBlueprint({
          blueprintId: saved.blueprintId || defaults.blueprintId,
          title: saved.title || defaults.title,
          settings: { ...defaults.settings, ...(saved.settings || {}) },
          businessRule: saved.businessRule || '',
          stages: normalizeStages(saved.stages as Stage[]),
        });
        setBusinessRuleText(saved.businessRule || '');
        setProcessName(saved.processName || '');
        setBuildResult(saved.buildResult || null);
        setSentAt(saved.sentAt || null);
      }
      setRestored(true);
    });
    attempt(10);
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docId]);

  // The document written to the backend. 'sent' once the process was created in Boomi.
  const buildDoc = (overrides: Record<string, unknown> = {}) => ({
    blueprintId: currentConfig.blueprintId,
    title: currentConfig.title,
    selectedPresetId,
    stages: currentConfig.stages,
    businessRule: currentConfig.businessRule,
    settings: currentConfig.settings,
    processName,
    status: buildResult ? 'sent' : 'draft',
    sentAt,
    buildResult,
    ...overrides,
  });

  // A new blueprint is only saved once the user changes something, so "+ New" never leaves empty drafts
  const existsRef = useRef<boolean>(false);
  const baselineRef = useRef<string | null>(null);
  const pendingRef = useRef<Record<string, unknown> | null>(null);

  const saveNow = (doc: Record<string, unknown>) => {
    pendingRef.current = null;
    existsRef.current = true;
    return api.saveBlueprint(docId, doc).then((ok) => { if (ok && onSaved) onSaved(); return ok; });
  };

  useEffect(() => {
    if (!restored) return; // never overwrite a saved blueprint with the defaults before it loads
    const doc = buildDoc();
    if (!existsRef.current) {
      const snapshot = JSON.stringify(doc);
      if (baselineRef.current === null) { baselineRef.current = snapshot; return; }
      if (snapshot === baselineRef.current) return;
    }
    pendingRef.current = doc;
    const timer = setTimeout(() => { saveNow(doc); }, 800);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restored, currentConfig, selectedPresetId, processName, buildResult, sentAt]);

  // Leaving the editor within the debounce window must not lose the last edit
  useEffect(() => () => {
    if (pendingRef.current) api.saveBlueprint(docId, pendingRef.current).then((ok) => { if (ok && onSaved) onSaved(); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fallback domain-engine prompt that updates dynamically with any stage/rule change
  const dynamicDomainPrompt = useMemo(() => {
    return generateBoomiCompanionPrompt(currentConfig);
  }, [currentConfig]);

  // The active prompt displayed in the viewer
  const displayedPrompt = aiGeneratedPrompt || dynamicDomainPrompt;
  const jobBreakdown = useMemo(() => generateJobBreakdown(currentConfig), [currentConfig]);
  const gates = useMemo(() => generateGates(currentConfig), [currentConfig]);
  const includedGateCount = gates.filter(g => g.included).length;
  const specGenerated = aiGeneratedPrompt !== null;

  // Compile with OpenAI via backend
  const handleGenerateCompanionSpec = async () => {
    setIsCompiling(true);
    let succeeded = false;
    try {
      const res = await api.generateBlueprintSpec({
        blueprintId: currentConfig.blueprintId,
        title: currentConfig.title,
        stages: currentConfig.stages,
        businessRule: businessRuleText,
        settings: currentConfig.settings,
      });

      if (res && res.prompt) {
        setAiGeneratedPrompt(res.prompt);
        setPromptSource(res.source as 'openai' | 'domain_engine');
        setAiModelUsed(res.modelUsed || 'gpt-4o-mini');
        succeeded = true;
        if (onShowToast) {
          onShowToast(
            res.source === 'openai'
              ? `✨ Boomi Companion spec synthesized by OpenAI (${res.modelUsed || 'gpt-4o-mini'})!`
              : '🚀 Boomi Companion spec compiled with the built-in rules engine.'
          );
        }
      } else {
        // Local fallback
        setAiGeneratedPrompt(dynamicDomainPrompt);
        setPromptSource('domain_engine');
        if (onShowToast) onShowToast('Backend returned no spec; using the local rules engine.');
      }
    } catch (e) {
      console.warn('Spec generation error:', e);
      setAiGeneratedPrompt(dynamicDomainPrompt);
      setPromptSource('domain_engine');
      if (onShowToast) onShowToast('Backend unavailable; spec generated locally.');
    } finally {
      setIsCompiling(false);
      if (succeeded) {
        confetti({
          particleCount: 80,
          spread: 60,
          origin: { y: 0.7 }
        });
      }
    }
  };

  // Stage changes
  const commitStages = (stages: Stage[]) => {
    setBlueprint(prev => ({ ...prev, stages: normalizeStages(stages) }));
    setAiGeneratedPrompt(null); // Invalidate cached prompt so it updates to live flow
  };

  const updateStage = (index: number, patch: Partial<Stage>) => {
    const next = [...blueprint.stages];
    next[index] = { ...next[index], ...patch };
    commitStages(next);
  };

  // Add a shape at the end of the canvas; reorder with the arrows to place it anywhere
  const handleAddCustomStage = () => {
    const newStage: Stage = {
      id: `stage-${Date.now()}`,
      stepNumber: '',
      category: 'MIDDLEWARE / SKILL',
      label: 'New shape',
      selectedShapeOrConnector: 'Message',
      subLabel: 'Custom step',
    };
    // Keep a trailing Stop / Return Documents last so new shapes land before the end of the flow
    const stages = blueprint.stages;
    const last = stages[stages.length - 1];
    if (last && kindOf(last.selectedShapeOrConnector) === 'end') {
      commitStages([...stages.slice(0, -1), newStage, last]);
    } else {
      commitStages([...stages, newStage]);
    }
  };

  const handleMoveStage = (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= blueprint.stages.length) return;
    const next = [...blueprint.stages];
    [next[index], next[target]] = [next[target], next[index]];
    commitStages(next);
  };

  // Remove stage: ensure at least 2 stages remain
  const handleRemoveStage = (id: string) => {
    if (blueprint.stages.length <= 2) {
      if (onShowToast) onShowToast('Keep at least two shapes on the canvas');
      return;
    }
    commitStages(blueprint.stages.filter(s => s.id !== id));
  };

  const buildRequest = (dryRun: boolean) => ({
    processName: processName.trim() || currentConfig.title.replace(/\s+/g, '_'),
    stages: currentConfig.stages,
    description: `Built from the Visual Architecture Compiler (${currentConfig.blueprintId})`,
    dryRun,
  });

  const handlePreviewBuild = async () => {
    setBuildBusy(true);
    setBuildError(null);
    setBuildResult(null);
    try {
      if (!processName.trim()) setProcessName(currentConfig.title.replace(/\s+/g, '_'));
      setBuildPlan(await api.buildBlueprint(buildRequest(true)));
    } catch (e) {
      setBuildError(e instanceof Error ? e.message : String(e));
    } finally {
      setBuildBusy(false);
    }
  };

  const handleConfirmBuild = async () => {
    setBuildBusy(true);
    setBuildError(null);
    try {
      const res = await api.buildBlueprint(buildRequest(false));
      const sentTime = new Date().toISOString();
      setBuildResult(res);
      setSentAt(sentTime);
      setBuildPlan(null);
      // Save as sent right away: the Sent tab opens next and unmounts this editor
      await saveNow(buildDoc({ status: 'sent', sentAt: sentTime, buildResult: res, processName: buildRequest(false).processName }));
      if (onShowToast) onShowToast(`Process "${res.name}" created in Boomi and moved to Sent.`);
      if (onSent) onSent();
    } catch (e) {
      setBuildError(e instanceof Error ? e.message : String(e));
    } finally {
      setBuildBusy(false);
    }
  };

  // Reset clears this blueprint back to a blank Start / Stop canvas, keeping its name and id
  const handleReset = () => {
    const blank = createBlankConfig();
    setSelectedPresetId('');
    setBlueprint(prev => ({ ...blank, blueprintId: prev.blueprintId, title: prev.title }));
    setBusinessRuleText('');
    setAiGeneratedPrompt(null);
    setPromptSource('domain_engine');
    if (onShowToast) onShowToast('Blueprint cleared.');
  };

  // Toggle architecture options
  const toggleSetting = (key: keyof BlueprintConfig['settings']) => {
    setBlueprint(prev => ({
      ...prev,
      settings: {
        ...prev.settings,
        [key]: !prev.settings[key]
      }
    }));
    setAiGeneratedPrompt(null);
  };

  const handleCopyPrompt = () => {
    navigator.clipboard.writeText(displayedPrompt);
    setCopiedPrompt(true);
    if (onShowToast) onShowToast('📋 Master Boomi Companion Prompt copied to clipboard!');
    setTimeout(() => setCopiedPrompt(false), 2500);
  };

  const handleExportJson = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(
      JSON.stringify(
        {
          schemaVersion: '1.0',
          generator: 'BoomiOps Visual Architecture Compiler',
          aiModel: promptSource === 'openai' ? aiModelUsed : 'Domain Rules Engine',
          source: promptSource,
          blueprintId: currentConfig.blueprintId,
          title: currentConfig.title,
          stages: currentConfig.stages,
          businessRule: currentConfig.businessRule,
          settings: currentConfig.settings,
          jobBreakdown: jobBreakdown,
          generatedCompanionPrompt: displayedPrompt
        },
        null,
        2
      )
    );
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `boomi_blueprint_${currentConfig.blueprintId}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    if (onShowToast) onShowToast('💾 Blueprint JSON exported successfully.');
  };

  return (
    <div className="space-y-6 pb-12 animate-fade-in text-slate-200">
      
      {/* Top Banner & Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-purple-500/10 border border-purple-500/30 text-[11px] font-bold tracking-wider uppercase text-purple-300">
              <Sparkles className="w-3 h-3 text-purple-400" />
              VISUAL ARCHITECTURE COMPILER
            </span>
            <span className="text-xs text-slate-500">•</span>
            <div className="flex items-center gap-1 text-xs text-slate-400">
              <span>Template:</span>
              <select
                value={selectedPresetId}
                onChange={(e) => handleSelectPreset(e.target.value)}
                className="bg-slate-900 border border-slate-700 rounded-md px-2 py-0.5 text-xs text-purple-300 focus:outline-none focus:border-purple-500 cursor-pointer"
              >
                <option value="" className="bg-slate-900 text-slate-200">Custom flow</option>
                {PRESET_BLUEPRINTS.map(p => (
                  <option key={p.id} value={p.id} className="bg-slate-900 text-slate-200">
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
            From whiteboard to <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-fuchsia-400">working blueprint.</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Describe the flow. Generate a dependency-ordered Companion execution spec.
          </p>
        </div>

        {/* Blueprint ID Badge and Reset */}
        <div className="flex items-center gap-2.5 shrink-0 self-start md:self-auto">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-900/90 border border-slate-700/80 text-xs font-mono text-slate-300">
            <span className="w-2 h-2 rounded-full bg-purple-400 animate-pulse" />
            <span className="text-slate-400 font-sans text-[11px]">{buildResult ? 'SENT' : 'DRAFT'}</span>
            <input
              type="text"
              value={blueprint.title}
              onChange={(e) => setBlueprint(prev => ({ ...prev, title: e.target.value }))}
              aria-label="Blueprint name"
              maxLength={60}
              className="w-44 bg-transparent border-b border-slate-700 focus:border-purple-500 text-purple-300 font-bold font-sans focus:outline-none"
            />
            <span className="text-slate-500 text-[10px]">{blueprint.blueprintId}</span>
          </div>

          <button
            onClick={handleReset}
            title="Reset Blueprint to Default"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800/90 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 text-xs font-semibold transition cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset</span>
          </button>
        </div>
      </div>

      {/* Green Handoff Success Alert Banner */}
      <div className={`rounded-xl px-4 py-3 flex items-center justify-between shadow-lg border ${
        specGenerated ? 'bg-emerald-950/40 border-emerald-500/40' : 'bg-slate-900/60 border-slate-700'
      }`}>
        <div className={`flex items-center gap-2.5 text-xs font-medium ${specGenerated ? 'text-emerald-300' : 'text-slate-300'}`}>
          {specGenerated
            ? <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            : <Info className="w-4 h-4 text-slate-400 shrink-0" />}
          <span>
            {specGenerated
              ? 'Companion spec generated. Review it before handing off to Companion.'
              : 'Live preview from your current blueprint. Click Generate Companion spec to compile it.'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {promptSource === 'openai' ? (
            <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
              OPENAI ({aiModelUsed})
            </span>
          ) : (
            <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-md bg-purple-500/20 text-purple-300 border border-purple-500/30">
              {specGenerated ? 'RULES ENGINE SPEC' : 'LIVE PREVIEW'}
            </span>
          )}
        </div>
      </div>

      {/* SECTION 01: DESIGN YOUR PLAN */}
      <section className="space-y-4 rounded-2xl bg-slate-900/60 border border-slate-800/80 p-5 sm:p-6 backdrop-blur-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-purple-400">
              01 / DESIGN YOUR PLAN
            </div>
            <h2 className="text-lg font-bold text-white mt-0.5">Integration blueprint</h2>
            <p className="text-xs text-slate-400">
              Choose each stage. Your flow is translated into a structured build plan.
            </p>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            <button
              onClick={() => setShowAdvancedSettings(!showAdvancedSettings)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 text-xs font-medium border border-slate-700 transition cursor-pointer"
            >
              <Sliders className="w-3.5 h-3.5 text-purple-400" />
              <span>{showAdvancedSettings ? 'Hide Safeguards' : 'Architecture Guardrails'}</span>
            </button>

            <button
              onClick={handleAddCustomStage}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 hover:text-purple-200 text-xs font-bold border border-purple-500/40 transition cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>ADD STAGE</span>
            </button>
          </div>
        </div>

        {/* Stage Cards Horizontal Pipeline - strictly sequential numbering STEP 01, STEP 02, STEP 03... */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3 pt-2">
          {blueprint.stages.map((stage, idx) => {
            const stepNum = `STEP ${String(idx + 1).padStart(2, '0')}`;
            const isSource = idx === 0;
            const isLast = idx === blueprint.stages.length - 1;

            return (
              <div
                key={stage.id}
                className="relative rounded-xl bg-slate-900/90 border border-slate-700/80 hover:border-purple-500/50 p-4 transition-all group flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between text-xs mb-2">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] font-bold tracking-wider text-slate-400">
                        {stepNum}
                      </span>
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    </div>

                    <div className="flex items-center gap-0.5 text-slate-500">
                      <button
                        onClick={() => handleMoveStage(idx, -1)}
                        disabled={isSource}
                        title="Move earlier"
                        aria-label="Move shape earlier"
                        className="px-1.5 py-0.5 rounded hover:bg-slate-800 hover:text-slate-200 disabled:opacity-30 cursor-pointer"
                      >
                        ←
                      </button>
                      <button
                        onClick={() => handleMoveStage(idx, 1)}
                        disabled={isLast}
                        title="Move later"
                        aria-label="Move shape later"
                        className="px-1.5 py-0.5 rounded hover:bg-slate-800 hover:text-slate-200 disabled:opacity-30 cursor-pointer"
                      >
                        →
                      </button>
                      <button
                        onClick={() => handleRemoveStage(stage.id)}
                        title="Remove shape"
                        aria-label="Remove shape"
                        className="hover:text-rose-400 transition cursor-pointer p-1 rounded hover:bg-slate-800"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                    {stage.category}
                  </div>
                  <input
                    type="text"
                    value={stage.label}
                    onChange={(e) => updateStage(idx, { label: e.target.value })}
                    aria-label={`${stepNum} shape name`}
                    placeholder="Shape name on the canvas"
                    maxLength={60}
                    className="w-full mb-2 bg-transparent border-b border-slate-700 focus:border-purple-500 text-sm font-bold text-white focus:outline-none py-0.5"
                  />

                  {/* Dropdown for shape / connector */}
                  <div className="relative">
                    <select
                      value={stage.selectedShapeOrConnector}
                      onChange={(e) => updateStage(idx, { selectedShapeOrConnector: e.target.value })}
                      aria-label={`${stepNum} shape type`}
                      className="w-full bg-slate-800/90 hover:bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs font-semibold text-slate-100 appearance-none focus:outline-none focus:border-purple-500 pr-8 cursor-pointer"
                    >
                      {CATALOG_GROUPS.map(g => (
                        <optgroup key={g.group} label={g.group} className="bg-slate-900 text-slate-400">
                          {g.entries.map(e => (
                            <option key={e.id} value={e.id} className="bg-slate-900 text-slate-200">
                              {e.label} ({e.tag})
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                    <ChevronDown className="w-4 h-4 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>

                  <textarea
                    value={stage.notes || ''}
                    onChange={(e) => updateStage(idx, { notes: e.target.value })}
                    aria-label={`${stepNum} configuration notes`}
                    placeholder="What it does, e.g. Base64 decode, GET AccountUserRole"
                    rows={2}
                    maxLength={200}
                    className="mt-2 w-full bg-slate-950/60 border border-slate-800 focus:border-purple-500 rounded-lg px-2.5 py-1.5 text-[11px] text-slate-200 placeholder-slate-600 focus:outline-none resize-none"
                  />
                </div>

                <div className="mt-3 pt-3 border-t border-slate-800 flex items-center justify-between text-[11px] text-slate-400">
                  <span className="flex items-center gap-1.5 text-purple-300/90 font-medium">
                    <span className="w-1.5 h-1.5 rounded-full bg-purple-400" />
                    {stage.subLabel || 'Configured shape'}
                  </span>
                  <span className="text-[10px] text-slate-500 font-mono">
                    {isSource ? 'START' : isLast ? 'END' : 'CANVAS STEP'}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Collapsible Architecture Guardrails Toggles */}
        {showAdvancedSettings && (
          <div className="mt-3 p-4 rounded-xl bg-slate-950/70 border border-purple-500/30 space-y-3 animate-fade-in">
            <div className="flex items-center gap-2 text-xs font-bold text-purple-300">
              <ShieldCheck className="w-4 h-4 text-purple-400" />
              <span>Boomi Companion Architecture Guardrails (Solving AI Generation Mistakes)</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 text-xs">
              <label className="flex items-center gap-2 p-2 rounded-lg bg-slate-900/80 border border-slate-800 cursor-pointer hover:border-slate-700">
                <input
                  type="checkbox"
                  checked={blueprint.settings.enableTryCatchBoundary}
                  onChange={() => toggleSetting('enableTryCatchBoundary')}
                  className="rounded text-purple-600 focus:ring-purple-500 bg-slate-800 border-slate-700"
                />
                <div>
                  <div className="font-semibold text-slate-200">Try/Catch Boundary</div>
                  <div className="text-[10px] text-slate-400">Enforce Catch All Errors + DLQ</div>
                </div>
              </label>

              <label className="flex items-center gap-2 p-2 rounded-lg bg-slate-900/80 border border-slate-800 cursor-pointer hover:border-slate-700">
                <input
                  type="checkbox"
                  checked={blueprint.settings.separateDPPvsDDP}
                  onChange={() => toggleSetting('separateDPPvsDDP')}
                  className="rounded text-purple-600 focus:ring-purple-500 bg-slate-800 border-slate-700"
                />
                <div>
                  <div className="font-semibold text-slate-200">DPP vs DDP Discipline</div>
                  <div className="text-[10px] text-slate-400">Never mix process & document scope</div>
                </div>
              </label>

              <label className="flex items-center gap-2 p-2 rounded-lg bg-slate-900/80 border border-slate-800 cursor-pointer hover:border-slate-700">
                <input
                  type="checkbox"
                  checked={blueprint.settings.enableDocumentSplitCombine}
                  onChange={() => toggleSetting('enableDocumentSplitCombine')}
                  className="rounded text-purple-600 focus:ring-purple-500 bg-slate-800 border-slate-700"
                />
                <div>
                  <div className="font-semibold text-slate-200">Data Process Splitting</div>
                  <div className="text-[10px] text-slate-400">Split JSON arrays to prevent poisoning</div>
                </div>
              </label>

              <label className="flex items-center gap-2 p-2 rounded-lg bg-slate-900/80 border border-slate-800 cursor-pointer hover:border-slate-700">
                <input
                  type="checkbox"
                  checked={blueprint.settings.enforceIdempotentUpsert}
                  onChange={() => toggleSetting('enforceIdempotentUpsert')}
                  className="rounded text-purple-600 focus:ring-purple-500 bg-slate-800 border-slate-700"
                />
                <div>
                  <div className="font-semibold text-slate-200">Idempotent Upsert</div>
                  <div className="text-[10px] text-slate-400">External ID matching to prevent dups</div>
                </div>
              </label>

              <label className="flex items-center gap-2 p-2 rounded-lg bg-slate-900/80 border border-slate-800 cursor-pointer hover:border-slate-700">
                <input
                  type="checkbox"
                  checked={blueprint.settings.enable3xExponentialRetry}
                  onChange={() => toggleSetting('enable3xExponentialRetry')}
                  className="rounded text-purple-600 focus:ring-purple-500 bg-slate-800 border-slate-700"
                />
                <div>
                  <div className="font-semibold text-slate-200">3x Exponential Retry</div>
                  <div className="text-[10px] text-slate-400">Network fault recovery</div>
                </div>
              </label>

              <label className="flex items-center gap-2 p-2 rounded-lg bg-slate-900/80 border border-slate-800 cursor-pointer hover:border-slate-700">
                <input
                  type="checkbox"
                  checked={blueprint.settings.deployInitialScheduleDisabled}
                  onChange={() => toggleSetting('deployInitialScheduleDisabled')}
                  className="rounded text-purple-600 focus:ring-purple-500 bg-slate-800 border-slate-700"
                />
                <div>
                  <div className="font-semibold text-slate-200">Disabled Schedule Guard</div>
                  <div className="text-[10px] text-slate-400">Safe sandbox rollout</div>
                </div>
              </label>
            </div>
          </div>
        )}

        {/* Business Rule Input Card */}
        <div className="rounded-xl bg-slate-950/80 border border-slate-800 p-3.5 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded-md bg-purple-500/20 text-purple-300 font-bold text-[10px] uppercase border border-purple-500/30">
                Business rule <span className="font-normal opacity-80">OPTIONAL</span>
              </span>
              <span className="text-slate-400 text-xs hidden sm:inline">
                Describe any filtering or validation logic in plain English
              </span>
            </div>
            <span className="text-[11px] font-mono text-purple-300/80">
              {businessRuleText.length}/250 · APPLIED
            </span>
          </div>

          <input
            type="text"
            value={businessRuleText}
            onChange={(e) => {
              setBusinessRuleText(e.target.value);
              setAiGeneratedPrompt(null); // Real-time prompt changes
            }}
            placeholder="e.g. Only send orders with status = approved. Normalize email to lowercase."
            maxLength={250}
            className="w-full bg-slate-900 border border-slate-700/80 rounded-lg px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 font-mono"
          />
        </div>

        {/* Action Row & Generate Button */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pt-2">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <Info className="w-4 h-4 text-slate-500 shrink-0" />
            <span>No platform changes happen from this screen.</span>
          </div>

          <button
            onClick={handleGenerateCompanionSpec}
            disabled={isCompiling}
            className="w-full sm:w-auto flex items-center justify-center gap-2.5 px-6 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 via-purple-500 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-xs shadow-lg shadow-purple-900/40 transition-all cursor-pointer disabled:opacity-60"
          >
            {isCompiling ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>Compiling with OpenAI ({aiModelUsed})...</span>
              </>
            ) : (
              <>
                <Bot className="w-4 h-4 text-purple-200" />
                <span>Generate Companion spec</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>
      </section>

      {/* SECTION 02: COMPILE & REVIEW */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-purple-400">
              02 / COMPILE & REVIEW
            </div>
            <h2 className="text-lg font-bold text-white mt-0.5">Execution plan</h2>
          </div>

          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-purple-500/15 border border-purple-500/30 text-[11px] font-semibold text-purple-300">
              <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse" />
              {specGenerated ? 'SPEC GENERATED' : 'LIVE PREVIEW'}
            </span>
          </div>
        </div>

        {/* Tab Buttons: Job breakdown vs Companion prompt */}
        <div className="flex items-center gap-2 border-b border-slate-800 pb-1">
          <button
            onClick={() => setActiveTab('prompt')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition cursor-pointer ${
              activeTab === 'prompt'
                ? 'bg-purple-600/20 text-purple-300 border border-purple-500/40'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Terminal className="w-3.5 h-3.5" />
            <span>Companion prompt</span>
          </button>

          <button
            onClick={() => setActiveTab('breakdown')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition cursor-pointer ${
              activeTab === 'breakdown'
                ? 'bg-purple-600/20 text-purple-300 border border-purple-500/40'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Job breakdown [{jobBreakdown.length}]</span>
          </button>
        </div>

        {/* Two-Column Review Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          
          {/* Left Column: Launch in Companion Agent (Width ~7 cols) */}
          <div className="lg:col-span-7 flex flex-col justify-between rounded-2xl bg-slate-900/90 border border-slate-800 p-5 shadow-xl">
            <div>
              <div className="flex items-start justify-between gap-3 mb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-purple-400" />
                      <span>Launch in Companion Agent</span>
                    </h3>
                    {promptSource === 'openai' ? (
                      <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        OpenAI {aiModelUsed}
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30 text-[10px] font-semibold">
                        Dynamic Spec
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Copy this bundle into your Companion-enabled agent after confirming supported skills and permissions.
                  </p>
                </div>

                <button
                  onClick={handleCopyPrompt}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border border-purple-500/40 text-xs font-bold transition shrink-0 cursor-pointer"
                >
                  {copiedPrompt ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="text-emerald-300">Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy prompt</span>
                    </>
                  )}
                </button>
              </div>

              {/* View Switch: Prompt View vs Breakdown View */}
              {activeTab === 'prompt' ? (
                <div className="relative rounded-xl bg-slate-950 border border-slate-800 p-4 font-mono text-[11px] leading-relaxed text-slate-300 max-h-[520px] overflow-y-auto selection:bg-purple-600 selection:text-white">
                  <pre className="whitespace-pre-wrap">{displayedPrompt}</pre>
                </div>
              ) : (
                <div className="space-y-3 max-h-[520px] overflow-y-auto pr-1">
                  {jobBreakdown.map((jb) => (
                    <div
                      key={jb.id}
                      className="rounded-xl bg-slate-950/70 border border-slate-800 p-3.5 space-y-1.5"
                    >
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-purple-300 font-mono text-[11px]">
                          {jb.name}
                        </span>
                        <span className="px-2 py-0.5 rounded bg-slate-800 text-[10px] text-slate-400">
                          {jb.componentType}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400">
                        Folder: <code className="text-slate-300 bg-slate-900 px-1 py-0.5 rounded">{jb.boomiFolder}</code>
                      </div>
                      <p className="text-xs text-slate-300">{jb.purpose}</p>
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {jb.shapesInvolved.map((shape, sIdx) => (
                          <span
                            key={sIdx}
                            className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-[10px] text-slate-400"
                          >
                            {shape}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Build in Boomi: preview, confirm, result */}
            {(buildPlan || buildResult || buildError) && (
              <div className="mt-4 rounded-xl bg-slate-950/80 border border-purple-500/30 p-4 space-y-3 text-xs">
                {buildPlan && (
                  <>
                    <div className="font-bold text-white">Create this process in Boomi?</div>
                    <label className="block text-slate-400">
                      Process name
                      <input
                        type="text"
                        value={processName}
                        onChange={(e) => setProcessName(e.target.value)}
                        aria-label="Boomi process name"
                        className="mt-1 w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-white font-mono focus:outline-none focus:border-purple-500"
                      />
                    </label>
                    <ol className="space-y-1">
                      {buildPlan.shapes.map((s, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <span className="text-slate-500 font-mono w-5 shrink-0">{i + 1}.</span>
                          <span className="text-slate-200">{s.label}</span>
                          <span className="text-[10px] font-mono text-slate-500">{s.call ? `${s.kind} · ${s.call}` : s.kind}</span>
                          {s.configure && (
                            <span title={s.reason} className="px-1.5 rounded bg-slate-700/60 text-slate-300 border border-slate-600 text-[10px] shrink-0">
                              configure in Boomi
                            </span>
                          )}
                          {s.placeholder && (
                            <span title={s.reason} className="px-1.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] shrink-0">
                              placeholder
                            </span>
                          )}
                        </li>
                      ))}
                    </ol>
                    {buildPlan.shapes.some(s => s.kind === 'connectoraction') && (
                      <p className="text-slate-400">
                        Connector shapes get a REST Client connection and one operation each, created first. The connection
                        has blank credentials: enter your Boomi API token in Boomi before running.
                      </p>
                    )}
                    {buildPlan.shapes.some(s => s.placeholder) && (
                      <p className="text-amber-300/90">
                        Placeholders are Message shapes in the right position. Maps, rules and other connectors need their
                        own components, so configure those shapes in Boomi.
                      </p>
                    )}
                    <div className="flex gap-2">
                      <button
                        onClick={handleConfirmBuild}
                        disabled={buildBusy || !processName.trim()}
                        className="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-bold disabled:opacity-60 cursor-pointer"
                      >
                        {buildBusy ? 'Creating…' : 'Confirm & create in Boomi'}
                      </button>
                      <button
                        onClick={() => setBuildPlan(null)}
                        className="px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                  </>
                )}
                {buildResult && (
                  <div className="space-y-1">
                    <div className="font-bold text-emerald-300">{buildResult.message}</div>
                    <div className="text-slate-300">Name: <code>{buildResult.name}</code></div>
                    <div className="text-slate-300">Component ID: <code>{buildResult.componentId}</code></div>
                    <div className="text-slate-300">Folder: <code>{buildResult.folder || 'default'}</code></div>
                    {(buildResult.components || []).map(c => (
                      <div key={c.id} className="text-slate-400">Also created ({c.type}): <code>{c.name}</code></div>
                    ))}
                    {buildResult.shapes.some(s => s.placeholder) && (
                      <div className="text-amber-300/90">
                        Configure in Boomi: {buildResult.shapes.filter(s => s.placeholder).map(s => s.label).join(', ')}
                      </div>
                    )}
                  </div>
                )}
                {buildError && <div className="text-rose-300">Build failed: {buildError}</div>}
              </div>
            )}

            {/* Bottom Footer of Left Box */}
            <div className="mt-4 pt-4 border-t border-slate-800 flex items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2">
                <button
                  onClick={handleExportJson}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold border border-slate-700 transition cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5 text-purple-400" />
                  <span>Export .json</span>
                </button>
                <button
                  onClick={handlePreviewBuild}
                  disabled={buildBusy}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-600/20 hover:bg-purple-600/30 text-purple-200 text-xs font-bold border border-purple-500/40 transition cursor-pointer disabled:opacity-60"
                >
                  <Layers className="w-3.5 h-3.5" />
                  <span>{buildBusy && !buildPlan ? 'Planning…' : 'Build in Boomi'}</span>
                </button>
              </div>

              <span className="text-[11px] text-slate-500">
                You confirm the shape list before anything is created.
              </span>
            </div>
          </div>

          {/* Right Column: Compiler Status & 15-Gate Dependency Order */}
          <div className="lg:col-span-5 rounded-2xl bg-slate-900/90 border border-slate-800 p-5 shadow-xl flex flex-col justify-between">
            <div className="space-y-4">
              
              {/* Header with READY badge */}
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-white">Compiler status</h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {specGenerated ? (promptSource === 'openai' ? 'AI generated plan' : 'Rules engine plan') : 'Live preview plan'}
                  </p>
                </div>
                <span className={`px-2.5 py-0.5 rounded-md text-[11px] font-bold border ${
                  specGenerated
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                    : 'bg-slate-800 text-slate-400 border-slate-700'
                }`}>
                  {specGenerated ? 'READY' : 'DRAFT'}
                </span>
              </div>

              {/* Metric Cards (COMPONENTS, GATES, STAGES) */}
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-xl bg-slate-950/80 border border-slate-800 p-2.5">
                  <div className="text-[10px] uppercase font-bold text-slate-500">COMPONENTS</div>
                  <div className="text-lg font-extrabold text-white">{String(jobBreakdown.length).padStart(2, '0')}</div>
                </div>
                <div className="rounded-xl bg-slate-950/80 border border-slate-800 p-2.5">
                  <div className="text-[10px] uppercase font-bold text-slate-500">GATES</div>
                  <div className="text-lg font-extrabold text-purple-300">{includedGateCount}</div>
                </div>
                <div className="rounded-xl bg-slate-950/80 border border-slate-800 p-2.5">
                  <div className="text-[10px] uppercase font-bold text-slate-500">STAGES</div>
                  <div className="text-lg font-extrabold text-white">
                    {String(blueprint.stages.length).padStart(2, '0')}
                  </div>
                </div>
              </div>

              {/* Dependency Order Timeline */}
              <div>
                <div className="flex items-center justify-between text-xs font-bold text-slate-400 mb-2">
                  <span className="tracking-wider uppercase text-[11px]">DEPENDENCY ORDER</span>
                  <span className="text-purple-300 font-mono text-[11px]">{includedGateCount} / {gates.length} GATES</span>
                </div>

                <div className="space-y-1.5 max-h-[380px] overflow-y-auto pr-1">
                  {gates.map((gate) => {
                    const isExpanded = expandedGateId === gate.id;

                    return (
                      <div
                        key={gate.id}
                        onClick={() => setExpandedGateId(isExpanded ? null : gate.id)}
                        className={`p-2 rounded-xl border text-xs transition cursor-pointer ${
                          !gate.included ? 'opacity-50 ' : ''}${
                          isExpanded
                            ? 'bg-purple-950/30 border-purple-500/40'
                            : 'bg-slate-950/50 border-slate-800/80 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span className="w-5 h-5 rounded-md bg-purple-500/20 border border-purple-500/40 text-[10px] font-bold text-purple-300 flex items-center justify-center shrink-0">
                              {gate.stepNum}
                            </span>
                            <span className="font-semibold text-slate-200 truncate text-[11px]">
                              {gate.title}
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className="text-[9px] text-slate-500 hidden sm:inline font-mono">
                              {gate.namespace}
                            </span>
                            {gate.included
                              ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                              : <span className="text-[9px] font-mono text-slate-500 shrink-0">OFF</span>}
                          </div>
                        </div>

                        {/* Expanded details */}
                        {isExpanded && (
                          <div className="mt-2 pt-2 border-t border-purple-500/20 text-[11px] text-slate-300 space-y-1 animate-fade-in">
                            <p>{gate.description}</p>
                            <div className="flex flex-wrap gap-1 pt-1">
                              {gate.boomiArtifacts.map((art, aIdx) => (
                                <span
                                  key={aIdx}
                                  className="px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-300 text-[10px] border border-purple-500/20"
                                >
                                  {art}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Human approval gate Card at bottom */}
            <div className="mt-4 p-3 rounded-xl bg-purple-950/30 border border-purple-500/30 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-purple-500/20 text-purple-300 shrink-0">
                <ShieldCheck className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="text-xs font-bold text-white">Human approval gate</div>
                <div className="text-[11px] text-slate-400 leading-tight">
                  Review all generated specs before creating or deploying platform assets.
                </div>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* Footer bar */}
      <div className="flex items-center justify-between text-[11px] text-slate-500 border-t border-slate-800/80 pt-4">
        <span>BOOMI OPS COCKPIT // VISUAL ARCHITECTURE COMPILER</span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-emerald-400" />
          <span>
            {specGenerated && promptSource === 'openai' ? `OpenAI (${aiModelUsed})` : 'Local rules engine'} • No platform changes made
          </span>
        </span>
      </div>

    </div>
  );
};
