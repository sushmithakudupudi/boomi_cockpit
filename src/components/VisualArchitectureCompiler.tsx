import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  Copy,
  Check,
  RotateCcw,
  FolderOpen,
  FolderPlus,
  Plus,
  Trash2,
  ShieldCheck,
  CheckCircle2,
  Layers,
  ArrowRight,
  Download,
  Sliders,
  Sparkles,
  Wand2,
  Info,
  Bot
} from 'lucide-react';
import type { Stage, BlueprintConfig } from '../types/compiler';
import {
  PRESET_BLUEPRINTS,
  createBlankConfig,
  generateJobBreakdown,
  generateBoomiCompanionPrompt
} from '../services/boomiPromptEngine';
import { api, type BoomiFolder } from '../services/api';
import { PageHeader } from './PageHeader';
import { Select, type SelectOption } from './ui/Select';
import { CATALOG_GROUPS, categorize, entryOf, kindOf } from '../services/shapeCatalog';

// Shape catalog as grouped dropdown options (built once), limited by position on the canvas:
// the first card only offers Start shapes and listeners, the last card only End shapes,
// and the cards in between offer process shapes and connectors.
const optionsFor = (groups: string[]): SelectOption[] => CATALOG_GROUPS
  .filter((g) => groups.includes(g.group))
  .flatMap((g) => g.entries.map((e) => ({ value: e.id, label: e.label, hint: e.tag, group: g.group })));
const FIRST_OPTIONS = optionsFor(['Start']);
const MIDDLE_OPTIONS = optionsFor(['Shapes', 'Connectors']);
const LAST_OPTIONS = optionsFor(['End']);
const ALL_OPTIONS = optionsFor(CATALOG_GROUPS.map((g) => g.group));
// Shapes on a branch path: process shapes, connectors and an optional end; no nested branches
const PATH_OPTIONS = optionsFor(['Shapes', 'Connectors', 'End']).filter((o) => o.value !== 'Branch');
// Steps inside a Process Call's sub-process: no nested calls or branches. It ends at Return Documents
// unless the user ends it with Stop or Return Documents themselves.
const SUBPROCESS_OPTIONS = optionsFor(['Shapes', 'Connectors', 'End']).filter((o) => o.value !== 'Branch' && o.value !== 'Process Call');

/** Options for a card; a shape that no longer fits its position (e.g. after a move) stays listed so it still shows. */
const shapeOptionsFor = (isFirst: boolean, isLast: boolean, current: string): SelectOption[] => {
  const base = isFirst ? FIRST_OPTIONS : isLast ? LAST_OPTIONS : MIDDLE_OPTIONS;
  if (base.some((o) => o.value === current)) return base;
  const extra = ALL_OPTIONS.find((o) => o.value === current);
  return extra ? [{ ...extra, group: 'Current (move or change it)' }, ...base] : base;
};

// Boomi's Branch step takes 2 to 25 paths
const MIN_BRANCHES = 2;
const MAX_BRANCHES = 25;
const branchCount = (stage: Stage) => stage.branches ?? MIN_BRANCHES;
/** Shapes on branch path `b` (2..N) of a Branch stage. */
const pathOf = (stage: Stage, b: number): Stage[] => stage.branchPaths?.[b - 2] ?? [];
/** Last step of a sub-process when it ends the sub-process without returning documents (Stop, Exception, ...). */
const subprocessEnd = (stage?: Stage): Stage | undefined => {
  const last = stage?.subprocessSteps?.[stage.subprocessSteps.length - 1];
  return last && kindOf(last.selectedShapeOrConnector) === 'end' && last.selectedShapeOrConnector !== 'Return Documents' ? last : undefined;
};
/** A Process Call whose sub-process returns nothing can close the flow on its own. */
const endsInSubprocess = (stage?: Stage) => stage?.selectedShapeOrConnector === 'Process Call' && !!subprocessEnd(stage);

/** A row of small step cards (a branch path or a sub-process): add, rename, retype and remove steps. */
const StepRow: React.FC<{
  title: string;
  steps: Stage[];
  options: SelectOption[];
  /** Shown before the first step, e.g. the sub-process's start. */
  lead?: string;
  /** What the row ends with in Boomi when the last step is not an end shape. */
  tail: string;
  onChange: (steps: Stage[]) => void;
}> = ({ title, steps, options, lead, tail, onChange }) => {
  const update = (k: number, patch: Partial<Stage>) => onChange(steps.map((s, i) => (i === k ? { ...s, ...patch } : s)));
  // Picking a shape renames it, unless the user typed their own name
  const retype = (k: number, shapeId: string) => {
    const step = steps[k];
    const prev = entryOf(step.selectedShapeOrConnector);
    const next = entryOf(shapeId);
    const label = step.label.trim();
    const keepLabel = label && label !== prev?.label && label !== step.selectedShapeOrConnector;
    update(k, { selectedShapeOrConnector: shapeId, label: keepLabel || !next ? step.label : next.label, subLabel: next?.tag });
  };
  const add = () => {
    const entry = entryOf('Message');
    onChange([...steps, {
      id: `stage-${Date.now()}`,
      stepNumber: '',
      category: 'MIDDLEWARE / SKILL',
      label: entry?.label ?? 'Message',
      selectedShapeOrConnector: 'Message',
      subLabel: entry?.tag,
    }]);
  };
  const ended = steps.length > 0 && kindOf(steps[steps.length - 1].selectedShapeOrConnector) === 'end';

  return (
    <div className="flex items-start gap-2 overflow-x-auto pb-1">
      <span className="shrink-0 mt-2 w-14 text-[11px] font-bold text-sky-300">{title}</span>
      {lead && <span className="shrink-0 mt-2 text-[11px] text-slate-500">{lead}</span>}
      {steps.map((step, k) => (
        <div key={step.id} className="shrink-0 w-52 rounded-lg bg-slate-900/90 border border-slate-700/80 p-2 space-y-1.5">
          <div className="flex items-center gap-1">
            <input
              type="text"
              value={step.label}
              onChange={(e) => update(k, { label: e.target.value })}
              aria-label={`${title} step ${k + 1} name`}
              maxLength={60}
              className="min-w-0 flex-1 bg-transparent border-b border-slate-700 focus:border-sky-500 text-xs font-bold text-white focus:outline-none py-0.5"
            />
            <button
              onClick={() => onChange(steps.filter((_, i) => i !== k))}
              title="Remove step"
              aria-label={`Remove ${title} step ${k + 1}`}
              className="shrink-0 p-1 rounded text-slate-500 hover:text-rose-400 hover:bg-slate-800 cursor-pointer"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
          <Select
            ariaLabel={`${title} step ${k + 1} type`}
            value={step.selectedShapeOrConnector}
            onChange={(v) => retype(k, v)}
            options={options}
            searchable
            size="sm"
          />
          <input
            type="text"
            value={step.notes || ''}
            onChange={(e) => update(k, { notes: e.target.value })}
            aria-label={`${title} step ${k + 1} notes`}
            placeholder="What it does"
            maxLength={200}
            className="w-full bg-slate-950/60 border border-slate-800 focus:border-sky-500 rounded-md px-2 py-1 text-[11px] text-slate-200 placeholder-slate-600 focus:outline-none"
          />
        </div>
      ))}
      {!ended && (
        <button
          onClick={add}
          className="shrink-0 mt-1 flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-dashed border-slate-600 text-[11px] font-semibold text-sky-300 hover:border-sky-500 hover:bg-sky-500/10 cursor-pointer"
        >
          <Plus className="w-3 h-3" /> Add step
        </button>
      )}
      {!ended && <span className="shrink-0 mt-2 text-[11px] text-slate-500">→ {tail}</span>}
    </div>
  );
};

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
  // Drafts written by the AI keep their origin and assumptions, so the review banner survives edits
  const [draftMeta, setDraftMeta] = useState<{ origin: string | null; assumptions: string[] }>({ origin: null, assumptions: [] });
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [isCompiling, setIsCompiling] = useState<boolean>(false);
  const [copiedPrompt, setCopiedPrompt] = useState<boolean>(false);
  const [showAdvancedSettings, setShowAdvancedSettings] = useState<boolean>(false);
  
  // Build in Boomi: preview (dry run) first, then create after the user confirms
  type BuildPlan = Awaited<ReturnType<typeof api.buildBlueprint>>;
  const [processName, setProcessName] = useState<string>('');
  // Boomi folder for the build ('' = the root build folder) and the folders that can be picked
  const [folderId, setFolderId] = useState<string>('');
  const [folders, setFolders] = useState<BoomiFolder[] | null>(null);
  const [folderError, setFolderError] = useState<string | null>(null);
  const [newFolderName, setNewFolderName] = useState<string | null>(null);
  const [folderBusy, setFolderBusy] = useState<boolean>(false);
  const [buildPlan, setBuildPlan] = useState<BuildPlan | null>(null);
  const [buildResult, setBuildResult] = useState<BuildPlan | null>(null);
  const [buildError, setBuildError] = useState<string | null>(null);
  const [buildBusy, setBuildBusy] = useState<boolean>(false);

  // Real-time AI generated prompt state from OpenAI
  const [aiGeneratedPrompt, setAiGeneratedPrompt] = useState<string | null>(null);
  const [promptSource, setPromptSource] = useState<'openai' | 'domain_engine'>('domain_engine');
  const [aiModelUsed, setAiModelUsed] = useState<string>('gpt-4o-mini');

  // Re-index stages (STEP 01, 02, ...) and derive each category from position and shape kind.
  // The flow always opens with a Start shape and closes with Stop / Return Documents (or a Process Call whose
  // sub-process ends at Stop); add them if missing.
  const normalizeStages = (stages: Stage[]): Stage[] => {
    const next = [...stages];
    if (!next.length || kindOf(next[0].selectedShapeOrConnector) !== 'start') {
      next.unshift({ id: `stage-start-${Date.now()}`, stepNumber: '', category: 'SOURCE SYSTEM', label: 'Start', selectedShapeOrConnector: 'Start - No Data', subLabel: 'Scheduled / manual run' });
    }
    const last = next[next.length - 1];
    if (next.length < 2 || (kindOf(last.selectedShapeOrConnector) !== 'end' && !endsInSubprocess(last))) {
      next.push({ id: `stage-end-${Date.now()}`, stepNumber: '', category: 'END SHAPE', label: 'Stop', selectedShapeOrConnector: 'Stop', subLabel: 'End and continue' });
    }
    return categorize(next);
  };

  // Load preset blueprint
  const handleSelectPreset = (presetId: string) => {
    // "Custom flow" starts a blank Start / Stop canvas to build your own flow, keeping this blueprint's id
    if (!presetId) {
      const blank = createBlankConfig();
      setSelectedPresetId('');
      setBlueprint(prev => ({ ...blank, blueprintId: prev.blueprintId }));
      setBusinessRuleText('');
      setAiGeneratedPrompt(null);
      setPromptSource('domain_engine');
      if (onShowToast) onShowToast('Custom flow started. Add your own stages.');
      return;
    }
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
        setFolderId(saved.folderId || '');
        setBuildResult(saved.buildResult || null);
        setSentAt(saved.sentAt || null);
        setDraftMeta({ origin: saved.origin || null, assumptions: Array.isArray(saved.assumptions) ? saved.assumptions : [] });
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
    folderId: folderId || null,
    status: buildResult ? 'sent' : 'draft',
    sentAt,
    buildResult,
    origin: draftMeta.origin,
    assumptions: draftMeta.assumptions,
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
  }, [restored, currentConfig, selectedPresetId, processName, folderId, buildResult, sentAt]);

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
  const specGenerated = aiGeneratedPrompt !== null;

  // Compile with OpenAI via backend
  const reviewRef = useRef<HTMLElement>(null);
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
        if (onShowToast) onShowToast('Companion spec ready. Review it below.');
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
      // Bring the generated spec into view instead of celebrating
      if (succeeded) setTimeout(() => reviewRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
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

  // Picking a shape renames the card and its tagline, unless the user already typed their own
  const handleShapeChange = (index: number, shapeId: string) => {
    const stage = blueprint.stages[index];
    const prev = entryOf(stage.selectedShapeOrConnector);
    const next = entryOf(shapeId);
    const patch: Partial<Stage> = { selectedShapeOrConnector: shapeId };
    const label = stage.label.trim();
    if (next && (!label || label === 'New shape' || label === prev?.label || label === stage.selectedShapeOrConnector)) {
      patch.label = next.label;
    }
    if (next && (!stage.subLabel || stage.subLabel === 'Custom step' || stage.subLabel === prev?.tag)) {
      patch.subLabel = next.tag;
    }
    updateStage(index, patch);
  };

  // Add a shape just before the end shape; reorder with the arrows to place it anywhere in between
  const handleAddCustomStage = () => {
    const newStage: Stage = {
      id: `stage-${Date.now()}`,
      stepNumber: '',
      category: 'MIDDLEWARE / SKILL',
      label: 'New shape',
      selectedShapeOrConnector: 'Message',
      subLabel: 'Custom step',
    };
    // The last card is always the end shape, so new shapes land right before it
    const stages = blueprint.stages;
    commitStages([...stages.slice(0, -1), newStage, stages[stages.length - 1]]);
  };

  // Every folder in the Boomi account, for choosing where the process is created
  const loadFolders = async () => {
    setFolderError(null);
    try {
      setFolders(await api.listBoomiFolders());
    } catch (e) {
      setFolderError((e as Error).message || 'Could not load Boomi folders.');
    }
  };

  useEffect(() => { loadFolders(); }, []);

  // With no folder chosen, builds go to the main folder (the first top-level one)
  const defaultFolderId = folders?.find((f) => !f.parentId)?.id ?? folders?.[0]?.id ?? '';
  const folderPath = (id: string) => folders?.find((f) => f.id === (id || defaultFolderId))?.fullPath ?? '';

  // New folder inside the selected one (or the main folder), then selected for the build
  const handleCreateFolder = async () => {
    const name = (newFolderName || '').trim();
    if (!name || !folders?.length) return;
    setFolderBusy(true);
    setFolderError(null);
    try {
      const created = await api.createBoomiFolder(name, folderId || defaultFolderId);
      setFolders([...folders, created].sort((a, b) => a.fullPath.toLowerCase().localeCompare(b.fullPath.toLowerCase())));
      setFolderId(created.id);
      setNewFolderName(null);
      if (onShowToast) onShowToast(`Folder "${created.name}" created in Boomi.`);
    } catch (e) {
      setFolderError((e as Error).message || 'Could not create the folder.');
    } finally {
      setFolderBusy(false);
    }
  };

  // Only the cards between Start and the end shape move, and never into the first or last slot
  // Shapes on a Branch's paths 2..N. Path 1 is the main flow; each other path ends at a Stop in Boomi.
  const setPath = (index: number, b: number, path: Stage[]) => {
    const stage = blueprint.stages[index];
    const paths = Array.from({ length: Math.max(branchCount(stage) - 1, b - 1) }, (_, i) => stage.branchPaths?.[i] ?? []);
    paths[b - 2] = path;
    updateStage(index, { branchPaths: paths });
  };

  const handleMoveStage = (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (index <= 0 || index >= blueprint.stages.length - 1) return;
    if (target <= 0 || target >= blueprint.stages.length - 1) return;
    const next = [...blueprint.stages];
    [next[index], next[target]] = [next[target], next[index]];
    commitStages(next);
  };

  // Remove stage: ensure at least 2 stages remain
  const handleRemoveStage = (id: string) => {
    const index = blueprint.stages.findIndex(s => s.id === id);
    const isLastCard = index === blueprint.stages.length - 1;
    // The end card may go only when the Process Call before it already ends the flow (its sub-process stops)
    if (index <= 0 || (isLastCard && !endsInSubprocess(blueprint.stages[index - 1]))) {
      if (onShowToast) onShowToast('The Start and end shapes stay. Change them with the dropdown instead.');
      return;
    }
    commitStages(blueprint.stages.filter(s => s.id !== id));
  };

  const buildRequest = (dryRun: boolean) => ({
    processName: processName.trim() || currentConfig.title.replace(/\s+/g, '_'),
    folderId: folderId || undefined,
    stages: currentConfig.stages,
    description: `Built with ArchForge (${currentConfig.blueprintId})`,
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
          generator: 'BoomiOps ArchForge',
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
      
      {/* Header: same pattern as the other modules (icon tile, module name, one-line description) */}
      <PageHeader
        icon={Wand2}
        title="ArchForge"
        description="Describe the flow and generate a dependency-ordered Companion execution spec."
      />

      {/* Blueprint toolbar: name and status, template, reset */}
      <div className="flex flex-wrap items-center gap-2.5 p-3 rounded-2xl bg-boomi-card border border-boomi-cardBorder">
        <div className="flex items-center gap-2 min-w-[220px] flex-1 px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 focus-within:border-boomi-accent transition">
          <span className={`w-2 h-2 rounded-full shrink-0 ${buildResult ? 'bg-emerald-400' : 'bg-boomi-accent animate-pulse'}`} />
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 shrink-0">{buildResult ? 'Sent' : 'Draft'}</span>
          <input
            type="text"
            value={blueprint.title}
            onChange={(e) => setBlueprint(prev => ({ ...prev, title: e.target.value }))}
            aria-label="Blueprint name"
            maxLength={60}
            className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-white placeholder:text-slate-500 focus:outline-none"
          />
          <span className="hidden sm:inline text-[10px] font-mono text-slate-500 shrink-0">{blueprint.blueprintId}</span>
        </div>

        <Select
          label="Template"
          value={selectedPresetId}
          onChange={handleSelectPreset}
          options={[{ value: '', label: 'Custom flow' }, ...PRESET_BLUEPRINTS.map((p) => ({ value: p.id, label: p.name }))]}
          className="w-full sm:w-64"
        />

        {/* Boomi folder that Build in Boomi creates the process in; + New folder creates one inside it */}
        <div className="flex items-center gap-1.5 w-full lg:w-auto">
          <Select
            label="Boomi folder"
            icon={FolderOpen}
            value={folders ? (folderId || defaultFolderId) : ''}
            onChange={(v) => setFolderId(v === defaultFolderId ? '' : v)}
            options={folders
              ? folders.map((f) => ({ value: f.id, label: f.fullPath.split('/').join(' / ') }))
              : [{ value: '', label: folderError ? 'Folders unavailable' : 'Loading folders…' }]}
            searchable
            disabled={!folders}
            className="min-w-0 flex-1 lg:w-72"
          />
          <button
            type="button"
            onClick={() => (folders ? setNewFolderName(newFolderName === null ? '' : null) : loadFolders())}
            title={folders ? 'Create a folder inside the selected one' : 'Load folders again'}
            className="shrink-0 flex items-center gap-1 px-3 py-2.5 rounded-xl border border-slate-700 text-xs font-semibold text-sky-300 hover:border-sky-500 hover:bg-sky-500/10 cursor-pointer"
          >
            {folders ? <><FolderPlus className="w-4 h-4" /> New folder</> : <><RotateCcw className="w-3.5 h-3.5" /> Retry</>}
          </button>
        </div>

        {newFolderName !== null && folders && (
          <div className="w-full flex flex-wrap items-center gap-2 text-xs">
            <span className="text-slate-400">New folder inside <span className="font-mono text-slate-200">{folderPath(folderId)}</span>:</span>
            <input
              type="text"
              autoFocus
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleCreateFolder(); if (e.key === 'Escape') setNewFolderName(null); }}
              placeholder="Folder name"
              aria-label="New folder name"
              maxLength={80}
              className="w-56 bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white focus:outline-none focus:border-sky-500"
            />
            <button
              type="button"
              onClick={handleCreateFolder}
              disabled={folderBusy || !newFolderName.trim() || newFolderName.includes('/')}
              className="px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-bold disabled:opacity-60 cursor-pointer"
            >
              {folderBusy ? 'Creating…' : 'Create'}
            </button>
            <button type="button" onClick={() => setNewFolderName(null)} className="px-2 py-1.5 text-slate-400 hover:text-white cursor-pointer">
              Cancel
            </button>
          </div>
        )}
        {folderError && <div className="w-full text-xs text-rose-300">{folderError}</div>}

      </div>

      {/* Shown for drafts the AI wrote from a chat description: the user reviews before anything is built */}
      {draftMeta.origin === 'ai-designer' && !buildResult && !bannerDismissed && (
        <div className="rounded-xl bg-sky-950/30 border border-sky-500/40 px-4 py-3 text-xs text-sky-100 space-y-1.5">
          <div className="flex items-start justify-between gap-3">
            <div className="font-bold">Drafted by AI from your description. Review every shape before building.</div>
            <button onClick={() => setBannerDismissed(true)} className="text-sky-300 hover:text-white cursor-pointer shrink-0" aria-label="Dismiss">Dismiss</button>
          </div>
          <p className="text-sky-200/80">Nothing has been created in Boomi. Check the shapes and notes, then use Build in Boomi, which shows the exact shape list and asks you to confirm.</p>
          {draftMeta.assumptions.length > 0 && (
            <ul className="list-disc ml-4 text-sky-200/80">
              {draftMeta.assumptions.map((a, i) => <li key={i}>Assumption: {a}</li>)}
            </ul>
          )}
        </div>
      )}

      {/* Shown once a spec has been generated */}
      {specGenerated && (
        <div className="rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-2 border bg-emerald-950/40 border-emerald-500/40">
          <div className="flex items-center gap-2.5 text-xs font-medium text-emerald-300">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>Companion spec generated. Review it before handing off to Companion.</span>
          </div>
          {promptSource === 'openai' ? (
            <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
              OPENAI ({aiModelUsed})
            </span>
          ) : (
            <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-md bg-sky-500/20 text-sky-300 border border-sky-500/30">
              RULES ENGINE SPEC
            </span>
          )}
        </div>
      )}

      {/* SECTION 01: DESIGN YOUR PLAN */}
      <section className="space-y-4 rounded-2xl bg-slate-900/60 border border-slate-800/80 p-5 sm:p-6 backdrop-blur-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-sky-400">
              01 / DESIGN YOUR PLAN
            </div>
            <h2 className="text-lg font-bold text-white mt-0.5">Integration blueprint</h2>
            <p className="text-xs text-slate-400">
              Choose each stage. Your flow is translated into a structured build plan.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
           

            <button
              onClick={() => setShowAdvancedSettings(!showAdvancedSettings)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 text-xs font-medium border border-slate-700 transition cursor-pointer"
            >
              <Sliders className="w-3.5 h-3.5 text-sky-400" />
              <span>{showAdvancedSettings ? 'Hide Safeguards' : 'Architecture Guardrails'}</span>
            </button>

            <button
              onClick={handleAddCustomStage}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-600/20 hover:bg-sky-600/30 text-sky-300 hover:text-sky-200 text-xs font-bold border border-sky-500/40 transition cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>ADD STAGE</span>
            </button>
             <button
              onClick={handleReset}
              title="Reset the stages to the default Start → End flow"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-medium border border-slate-700 transition cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset</span>
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
                className="relative rounded-xl bg-slate-900/90 border border-slate-700/80 hover:border-sky-500/50 p-4 transition-all group flex flex-col justify-between"
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
                        disabled={idx <= 1 || isLast}
                        title="Move earlier"
                        aria-label="Move shape earlier"
                        className="px-1.5 py-0.5 rounded hover:bg-slate-800 hover:text-slate-200 disabled:opacity-30 cursor-pointer"
                      >
                        ←
                      </button>
                      <button
                        onClick={() => handleMoveStage(idx, 1)}
                        disabled={isSource || idx >= blueprint.stages.length - 2}
                        title="Move later"
                        aria-label="Move shape later"
                        className="px-1.5 py-0.5 rounded hover:bg-slate-800 hover:text-slate-200 disabled:opacity-30 cursor-pointer"
                      >
                        →
                      </button>
                      <button
                        onClick={() => handleRemoveStage(stage.id)}
                        disabled={isSource || (isLast && !endsInSubprocess(blueprint.stages[idx - 1]))}
                        title={isSource || (isLast && !endsInSubprocess(blueprint.stages[idx - 1]))
                          ? 'Start and end shapes stay; change them with the dropdown'
                          : isLast ? 'Remove the end shape: the Process Call before it ends the flow' : 'Remove shape'}
                        aria-label="Remove shape"
                        className="hover:text-rose-400 transition cursor-pointer p-1 rounded hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-slate-500"
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
                    className="w-full mb-2 bg-transparent border-b border-slate-700 focus:border-sky-500 text-sm font-bold text-white focus:outline-none py-0.5"
                  />

                  {/* Dropdown for shape / connector */}
                  <Select
                    ariaLabel={`${stepNum} shape type`}
                    value={stage.selectedShapeOrConnector}
                    onChange={(v) => handleShapeChange(idx, v)}
                    options={shapeOptionsFor(isSource, isLast, stage.selectedShapeOrConnector)}
                    searchable
                    size="sm"
                  />

                  {/* Boomi allows 2 to 25 branches; branch 1 continues the flow, the others end at their own Stop */}
                  {stage.selectedShapeOrConnector === 'Branch' && (
                    <div className="mt-2 flex items-center justify-between gap-2 rounded-lg bg-slate-950/60 border border-slate-800 px-2.5 py-1.5">
                      <span className="text-[11px] font-semibold text-slate-400">Branches</span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => updateStage(idx, { branches: Math.max(MIN_BRANCHES, branchCount(stage) - 1) })}
                          disabled={branchCount(stage) <= MIN_BRANCHES}
                          aria-label="Fewer branches"
                          className="w-6 h-6 rounded-md text-slate-300 hover:bg-slate-800 disabled:opacity-30 cursor-pointer"
                        >
                          −
                        </button>
                        <input
                          type="number"
                          min={MIN_BRANCHES}
                          max={MAX_BRANCHES}
                          value={branchCount(stage)}
                          onChange={(e) => {
                            const n = parseInt(e.target.value, 10);
                            if (!Number.isNaN(n)) updateStage(idx, { branches: Math.min(MAX_BRANCHES, Math.max(MIN_BRANCHES, n)) });
                          }}
                          aria-label={`${stepNum} number of branches`}
                          className="w-10 bg-transparent text-center text-xs font-bold text-white focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
                        />
                        <button
                          type="button"
                          onClick={() => updateStage(idx, { branches: Math.min(MAX_BRANCHES, branchCount(stage) + 1) })}
                          disabled={branchCount(stage) >= MAX_BRANCHES}
                          aria-label="More branches"
                          className="w-6 h-6 rounded-md text-slate-300 hover:bg-slate-800 disabled:opacity-30 cursor-pointer"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  )}

                  <textarea
                    value={stage.notes || ''}
                    onChange={(e) => updateStage(idx, { notes: e.target.value })}
                    aria-label={`${stepNum} configuration notes`}
                    placeholder="What it does, e.g. Base64 decode, GET AccountUserRole"
                    rows={2}
                    maxLength={200}
                    className="mt-2 w-full bg-slate-950/60 border border-slate-800 focus:border-sky-500 rounded-lg px-2.5 py-1.5 text-[11px] text-slate-200 placeholder-slate-600 focus:outline-none resize-none"
                  />
                </div>

                <div className="mt-3 pt-3 border-t border-slate-800 flex items-center justify-between text-[11px] text-slate-400">
                  <span className="flex items-center gap-1.5 text-sky-300/90 font-medium">
                    <span className="w-1.5 h-1.5 rounded-full bg-sky-400" />
                    {stage.subLabel || 'Configured shape'}
                  </span>
                  <span
                    title={isSource ? 'First shape in the flow' : isLast ? 'Last shape in the flow' : 'Intermediate step on the canvas'}
                    className={`shrink-0 px-2 py-0.5 rounded-full border text-[10px] font-semibold ${
                      isSource ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                        : isLast ? 'bg-rose-500/10 text-rose-300 border-rose-500/30'
                        : 'bg-slate-800 text-slate-400 border-slate-700'}`}
                  >
                    {isSource ? 'Start' : isLast ? 'End' : 'Step'}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Shapes on each Branch's other paths; path 1 is the main flow above */}
        {blueprint.stages.map((stage, idx) => stage.selectedShapeOrConnector !== 'Branch' ? null : (
          <div key={`paths-${stage.id}`} className="rounded-xl bg-slate-950/60 border border-slate-800 p-3.5 space-y-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div className="text-xs font-bold text-slate-200">
                STEP {String(idx + 1).padStart(2, '0')} · {stage.label || 'Branch'} paths
              </div>
              <div className="text-[11px] text-slate-500">
                Path 1 continues with the cards above. Each other path ends at a Stop unless you end it yourself.
              </div>
            </div>
            {Array.from({ length: branchCount(stage) - 1 }, (_, i) => i + 2).map((b) => (
              <StepRow
                key={b}
                title={`Path ${b}`}
                steps={pathOf(stage, b)}
                options={PATH_OPTIONS}
                tail="Stop"
                onChange={(path) => setPath(idx, b, path)}
              />
            ))}
          </div>
        ))}

        {/* Steps inside each Process Call's sub-process: Data Passthrough start -> these steps -> Return Documents */}
        {blueprint.stages.map((stage, idx) => stage.selectedShapeOrConnector !== 'Process Call' ? null : (
          <div key={`sub-${stage.id}`} className="rounded-xl bg-slate-950/60 border border-slate-800 p-3.5 space-y-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div className="text-xs font-bold text-slate-200">
                STEP {String(idx + 1).padStart(2, '0')} · {stage.label || 'Process Call'} sub-process
              </div>
              <div className="text-[11px] text-slate-500">
                Built as its own process and linked to this Process Call. Its documents return to the next card.
              </div>
            </div>
            <StepRow
              title="Steps"
              lead="Data Passthrough →"
              steps={stage.subprocessSteps ?? []}
              options={SUBPROCESS_OPTIONS}
              tail="Return Documents"
              onChange={(steps) => updateStage(idx, { subprocessSteps: steps })}
            />
            {endsInSubprocess(stage) && (
              <p className="text-[11px] text-amber-300">
                This sub-process ends at {subprocessEnd(stage)?.label || 'Stop'}, so it returns nothing and the cards after this Process Call won't run.
                {idx === blueprint.stages.length - 2 ? ' You can delete the end card after it.' : ''} Delete that step to return documents again.
              </p>
            )}
          </div>
        ))}

        {/* Collapsible Architecture Guardrails Toggles */}
        {showAdvancedSettings && (
          <div className="mt-3 p-4 rounded-xl bg-slate-950/70 border border-sky-500/30 space-y-3 animate-fade-in">
            <div className="flex items-center gap-2 text-xs font-bold text-sky-300">
              <ShieldCheck className="w-4 h-4 text-sky-400" />
              <span>Boomi Companion Architecture Guardrails (Solving AI Generation Mistakes)</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 text-xs">
              <label className="flex items-center gap-2 p-2 rounded-lg bg-slate-900/80 border border-slate-800 cursor-pointer hover:border-slate-700">
                <input
                  type="checkbox"
                  checked={blueprint.settings.enableTryCatchBoundary}
                  onChange={() => toggleSetting('enableTryCatchBoundary')}
                  className="rounded text-sky-600 focus:ring-sky-500 bg-slate-800 border-slate-700"
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
                  className="rounded text-sky-600 focus:ring-sky-500 bg-slate-800 border-slate-700"
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
                  className="rounded text-sky-600 focus:ring-sky-500 bg-slate-800 border-slate-700"
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
                  className="rounded text-sky-600 focus:ring-sky-500 bg-slate-800 border-slate-700"
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
                  className="rounded text-sky-600 focus:ring-sky-500 bg-slate-800 border-slate-700"
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
                  className="rounded text-sky-600 focus:ring-sky-500 bg-slate-800 border-slate-700"
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
              <span className="px-2 py-0.5 rounded-md bg-sky-500/20 text-sky-300 font-bold text-[10px] uppercase border border-sky-500/30">
                Business rule <span className="font-normal opacity-80">OPTIONAL</span>
              </span>
              <span className="text-slate-400 text-xs hidden sm:inline">
                Describe any filtering or validation logic in plain English
              </span>
            </div>
            <span className="text-[11px] font-mono text-sky-300/80">
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
            className="w-full bg-slate-900 border border-slate-700/80 rounded-lg px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500 font-mono"
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
            className="w-full sm:w-auto flex items-center justify-center gap-2.5 px-6 py-2.5 rounded-xl bg-gradient-to-r from-boomi-blue to-boomi-accent hover:from-blue-600 hover:to-sky-400 text-white font-bold text-xs shadow-lg shadow-sky-900/30 transition-all cursor-pointer disabled:opacity-60"
          >
            {isCompiling ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>Generating spec…</span>
              </>
            ) : (
              <>
                <Bot className="w-4 h-4 text-sky-200" />
                <span>Generate Companion spec</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>
      </section>

      {/* SECTION 02: COMPILE & REVIEW */}
      <section ref={reviewRef} className="space-y-4 scroll-mt-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-sky-400">
              02 / COMPILE & REVIEW
            </div>
            <h2 className="text-lg font-bold text-white mt-0.5">Execution plan</h2>
          </div>

          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-sky-500/15 border border-sky-500/30 text-[11px] font-semibold text-sky-300">
              <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-pulse" />
              {specGenerated ? 'SPEC GENERATED' : 'LIVE PREVIEW'}
            </span>
          </div>
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
                      <Sparkles className="w-4 h-4 text-sky-400" />
                      <span>Launch in Companion Agent</span>
                    </h3>
                    {promptSource === 'openai' ? (
                      <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        OpenAI {aiModelUsed}
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full bg-sky-500/20 text-sky-300 border border-sky-500/30 text-[10px] font-semibold">
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
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-600/20 hover:bg-sky-600/30 text-sky-300 border border-sky-500/40 text-xs font-bold transition shrink-0 cursor-pointer"
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

              <div className="relative rounded-xl bg-slate-950 border border-slate-800 p-4 font-mono text-[11px] leading-relaxed text-slate-300 max-h-[520px] overflow-y-auto selection:bg-sky-600 selection:text-white">
                <pre className="whitespace-pre-wrap">{displayedPrompt}</pre>
              </div>
            </div>

            {/* Build in Boomi: preview, confirm, result */}
            {(buildPlan || buildResult || buildError) && (
              <div className="mt-4 rounded-xl bg-slate-950/80 border border-sky-500/30 p-4 space-y-3 text-xs">
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
                        className="mt-1 w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-white font-mono focus:outline-none focus:border-sky-500"
                      />
                    </label>
                    <div className="text-slate-400">
                      Folder in Boomi: <span className="text-slate-200 font-mono">{folderPath(folderId) || 'loading…'}</span>
                      <span className="text-slate-500"> (change it in the toolbar at the top)</span>
                    </div>
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
                        Placeholders are Message shapes in the right position. Steps Boomi can't build from here yet need
                        configuring in Boomi.
                      </p>
                    )}
                    <div className="flex gap-2">
                      <button
                        onClick={handleConfirmBuild}
                        disabled={buildBusy || !processName.trim()}
                        className="px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-bold disabled:opacity-60 cursor-pointer"
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
                  <Download className="w-3.5 h-3.5 text-sky-400" />
                  <span>Export .json</span>
                </button>
                <button
                  onClick={handlePreviewBuild}
                  disabled={buildBusy}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-600/20 hover:bg-sky-600/30 text-sky-200 text-xs font-bold border border-sky-500/40 transition cursor-pointer disabled:opacity-60"
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

          {/* Right Column: Job Breakdown */}
          <div className="lg:col-span-5 rounded-2xl bg-slate-900/90 border border-slate-800 p-5 shadow-xl flex flex-col min-h-0">
            <div className="flex items-start justify-between gap-3 border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-sm font-bold text-white">Job breakdown</h3>
                <p className="mt-0.5 text-xs text-slate-400">Plan items derived from the saved blueprint stages.</p>
              </div>
              <span className="shrink-0 rounded-md border border-sky-500/30 bg-sky-500/10 px-2 py-1 text-[10px] font-bold text-sky-300">{jobBreakdown.length} ITEMS</span>
            </div>
            <div className="mt-3 space-y-2.5 overflow-y-auto pr-1 lg:max-h-[720px]">
              {jobBreakdown.map((item, index) => (
                <article key={item.id} className="rounded-xl border border-slate-800 bg-slate-950/70 p-3.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 items-start gap-2">
                      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-sky-500/40 bg-sky-500/15 text-[10px] font-bold text-sky-300">{String(index + 1).padStart(2, '0')}</span>
                      <span className="text-xs font-bold text-white">{item.name}</span>
                    </div>
                    <span className="shrink-0 rounded bg-slate-800 px-2 py-0.5 text-[9px] text-slate-400">{item.componentType}</span>
                  </div>
                  <p className="mt-2 text-[11px] leading-relaxed text-slate-300">{item.purpose}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {item.shapesInvolved.map((shape, shapeIndex) => <span key={shapeIndex} className="rounded border border-slate-800 bg-slate-900 px-2 py-0.5 text-[10px] text-slate-400">{shape}</span>)}
                  </div>
                  <p className="mt-2 text-[10px] text-slate-500">Folder: {item.boomiFolder}</p>
                </article>
              ))}
            </div>
            <p className="mt-3 border-t border-slate-800 pt-3 text-[10px] leading-relaxed text-slate-500">Planning view only. Separate profiles, maps, connections, and supporting components are listed only when specified by the blueprint.</p>
          </div>
        </div>
      </section>

      {/* Footer bar */}
      <div className="flex items-center justify-between text-[11px] text-slate-500 border-t border-slate-800/80 pt-4">
        <span>BOOMIOPS COCKPIT // ARCHFORGE</span>
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
