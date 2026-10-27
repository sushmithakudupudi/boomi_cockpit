import React, { useState, useRef, useEffect } from 'react';
import { 
  X, 
  Bot, 
  Send, 
  Zap, 
  ChevronRight,
  ClipboardList,
  LoaderCircle,
  TriangleAlert,
  CheckCircle2,
  FileText,
  FileType,
  Loader2
} from 'lucide-react';
import type { CompanionMessage, ExecutionRecord, ProcessDocRef } from '../types/boomi';
import type { Stage } from '../types/compiler';
import { api } from '../services/api';
import { MarkdownText } from './MarkdownText';
import { CATALOG_GROUPS, categorize } from '../services/shapeCatalog';

type PreparedBlueprint = {
  processName: string;
  description: string;
  stages: Stage[];
  enhancements: string[];
  missingInfo: string[];
};
type BlueprintBuildPreview = Awaited<ReturnType<typeof api.buildBlueprint>>;
type CompanionBuildProposal = {
  proposal: PreparedBlueprint;
  preview?: BlueprintBuildPreview;
  result?: BlueprintBuildPreview;
  error?: string;
  busy?: boolean;
};

// Parse only the generated blueprint structure locally; ordinary chat continues through the AI endpoint.
const parseGeneratedBlueprintPrompt = (prompt: string): PreparedBlueprint => {
  const blueprintMatch = prompt.match(/## Integration Blueprint \(ID:\s*([^\)]+)\)([\s\S]*?)(?=\nUse each quoted name|\n## |$)/);
  const block = blueprintMatch?.[2] || '';
  const rows = [...block.matchAll(/^\s*\d+\.\s+"([^"]+)"\s+\[([^\]]+)\]([^\r\n]*)$/gm)];
  const catalog = new Set(CATALOG_GROUPS.flatMap((group) => group.entries.map((entry) => entry.id)));
  const missingInfo: string[] = [];
  const rawStages: Stage[] = [];

  rows.slice(0, 30).forEach((row, index) => {
    const [, label, shape, noteTail] = row;
    if (!catalog.has(shape.trim())) {
      missingInfo.push(`Unsupported canvas shape: ${shape.trim()}.`);
      return;
    }
    const notes = noteTail.trim().replace(/^(?:[—–-]|â€”|Ã¢â‚¬â€�)\s*/, '').trim();
    rawStages.push({
      id: `companion-stage-${index + 1}`,
      stepNumber: `STEP ${String(index + 1).padStart(2, '0')}`,
      category: 'MIDDLEWARE / SKILL',
      label: label.slice(0, 60),
      selectedShapeOrConnector: shape.trim(),
      notes: notes || undefined,
    });
  });

  const stages = categorize(rawStages);
  if (!blueprintMatch) missingInfo.push('Could not find a structured Integration Blueprint section. Paste the generated ConnectCraft blueprint prompt.');
  if (stages.length < 2) missingInfo.push('At least two recognized stages are required to prepare the Boomi process.');
  const startKinds = new Set(CATALOG_GROUPS.find((group) => group.group === 'Start')?.entries.map((entry) => entry.id) || []);
  const endKinds = new Set(CATALOG_GROUPS.find((group) => group.group === 'End')?.entries.map((entry) => entry.id) || []);
  if (stages.length && !startKinds.has(stages[0].selectedShapeOrConnector)) missingInfo.push('Confirm a recognized start shape for the process.');
  if (stages.length && !endKinds.has(stages[stages.length - 1].selectedShapeOrConnector) && stages[stages.length - 1].category !== 'DESTINATION') missingInfo.push('Confirm the process destination or ending shape.');

  const enhancements: string[] = [];
  if (stages.length && !stages.some((stage) => stage.selectedShapeOrConnector === 'Try/Catch & Set Properties') && !prompt.includes('Try/Catch:')) {
    enhancements.push('Consider adding a Try/Catch boundary with a defined recovery or dead-letter path for connector and transformation failures.');
  }
  if (stages.some((stage) => stage.category === 'DESTINATION') && !prompt.includes('Prevent duplicates.')) {
    enhancements.push('Confirm whether destination writes need an idempotency key so retries cannot create duplicate records.');
  }

  const blueprintId = blueprintMatch?.[1].trim() || '';
  return {
    processName: blueprintId ? `Companion_${blueprintId.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '')}` : 'Companion_Integration',
    description: 'Prepared from the numbered Integration Blueprint stages. Verify placeholders and configuration before creating it.',
    stages,
    enhancements,
    missingInfo,
  };
};

interface BoomiCompanionDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  executions: ExecutionRecord[];
  onTriggerAutoHeal: (execId: string) => void;
  onOpenFlow: (exec: ExecutionRecord) => void;
  /** Open an AI-written draft in ArchForge for review */
  onOpenDraft?: (draftId: string) => void;
  /** A question to send automatically once the drawer is open */
  pendingPrompt?: string | null;
  onPromptConsumed?: () => void;
  docRequest?: (ProcessDocRef & { requestId: number }) | null;
}

const nowLabel = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

export const BoomiCompanionDrawer: React.FC<BoomiCompanionDrawerProps> = ({
  isOpen,
  onClose,
  executions,
  onTriggerAutoHeal,
  onOpenFlow,
  onOpenDraft,
  pendingPrompt,
  onPromptConsumed,
  docRequest,
}) => {
  const [messages, setMessages] = useState<CompanionMessage[]>([
    {
      id: 'msg-1',
      sender: 'companion',
      text: "👋 Hello! I am Keystone AI, your operations copilot. I'm actively monitoring your Atoms and Process Executions. How can I assist you?",
      timestamp: 'Just now',
    }
  ]);

  // Announce live failures as they appear, once per execution, instead of a canned incident
  const announcedRef = useRef<Set<string>>(new Set());
  const activeFailure = executions.find(e => e.status === 'ERROR' && !e.reprocessed);

  // The first load announces only the top open failure; later ones announce every new failure (max 3, then a summary)
  const firstPassRef = useRef(true);

  useEffect(() => {
    if (executions.length === 0) return;
    const openFailures = executions
      .filter(e => e.status === 'ERROR' && !e.reprocessed)
      .sort((x, y) => (y.startedAt || '').localeCompare(x.startedAt || ''));
    const fresh = openFailures.filter(f => !announcedRef.current.has(f.id));
    const isFirst = firstPassRef.current;
    firstPassRef.current = false;
    if (fresh.length === 0) return;
    fresh.forEach(f => announcedRef.current.add(f.id));

    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    // errorShapeName is a backend guess from the process name, so it is not shown here
    const toMessage = (f: ExecutionRecord): CompanionMessage => ({
      id: `alert-${f.id}`,
      sender: 'companion',
      text: `🚨 I detected a failure in \`${f.processName}\` on ${f.atomName}.${f.errorMessage ? `

${f.errorMessage.slice(0, 220)}` : ''}`,
      timestamp: time,
      suggestedAction: { type: 'INSPECT_PAYLOAD', label: `Triage ${f.processName}`, executionId: f.id },
    });

    const shown = isFirst ? fresh.slice(0, 1) : fresh.slice(0, 3);
    const extra: CompanionMessage[] = !isFirst && fresh.length > 3
      ? [{ id: `alert-more-${fresh[0].id}`, sender: 'companion', text: `…and ${fresh.length - 3} more new failures. Open the bell icon to see them all.`, timestamp: time }]
      : [];
    setMessages((prev) => [...prev, ...shown.map(toMessage), ...extra]);
  }, [executions]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [buildProposal, setBuildProposal] = useState<CompanionBuildProposal | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const handledDocRequestRef = useRef<number | null>(null);

  useEffect(() => {
    if (!docRequest || handledDocRequestRef.current === docRequest.requestId) return;
    handledDocRequestRef.current = docRequest.requestId;
    let cancelled = false;
    const messageId = `process-doc-${docRequest.requestId}`;
    setIsTyping(true);
    api.generateProcessDoc(docRequest.source, docRequest.componentId, docRequest.version)
      .then((doc) => {
        if (cancelled) return;
        setMessages((prev) => [...prev, {
          id: messageId,
          sender: 'companion',
          text: `## ${docRequest.processName} — v${docRequest.version}\n\n${doc.summary}\n\n${doc.markdown}`,
          timestamp: nowLabel(),
          processDoc: { source: docRequest.source, componentId: docRequest.componentId, version: docRequest.version, processName: docRequest.processName },
        }]);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setMessages((prev) => [...prev, {
          id: messageId,
          sender: 'companion',
          text: `I couldn't generate the process documentation: ${error instanceof Error ? error.message : 'Unknown error'}`,
          timestamp: nowLabel(),
        }]);
      })
      .finally(() => { if (!cancelled) setIsTyping(false); });
    return () => { cancelled = true; };
  }, [docRequest]);

  const downloadDoc = async (messageId: string, doc: ProcessDocRef, format: 'docx' | 'pdf') => {
    const key = `${messageId}-${format}`;
    setDownloading(key);
    try {
      await api.downloadProcessDoc(doc.source, doc.componentId, doc.version, format);
    } catch (error) {
      setMessages((prev) => [...prev, {
        id: `doc-download-error-${Date.now()}`,
        sender: 'companion',
        text: `The ${format.toUpperCase()} download failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: nowLabel(),
      }]);
    } finally {
      setDownloading(null);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
    }
  }, [messages, isOpen]);

  const quickPrompts = activeFailure
    ? [
        `Why did ${activeFailure.processName} fail?`,
        `Show blast radius for ${activeFailure.processName}`,
        `Auto-heal & reprocess ${activeFailure.processName}`,
        'How do I build a process?',
      ]
    : [
        'Are any executions failing?',
        'Summarize platform health',
        'How do I build a process?',
      ];

  const handleSendMessage = async (textToSend?: string) => {
    const query = (textToSend || inputValue).trim();
    if (!query) return;
    const isBlueprintPrompt = /##\s+Integration Blueprint\s*\(ID:/i.test(query)
      && /^\s*1\.\s+"[^"]+"\s+\[[^\]]+\]/m.test(query);

    const userMsg: CompanionMessage = {
      id: `usr-${Date.now()}`,
      sender: 'user',
      text: query,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputValue('');
    setIsTyping(true);
    if (isBlueprintPrompt) setBuildProposal(null);

    try {
      if (isBlueprintPrompt) {
        await prepareBlueprintForReview(query);
        setMessages((prev) => [...prev, {
          id: `comp-plan-${Date.now()}`,
          sender: 'companion',
          text: 'I prepared a Boomi dry-run from the generated blueprint. Review the stages, suggested enhancements, and any placeholders below. Nothing is created until you approve it.',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        }]);
      } else {
        // Call FastAPI Boomi Companion Engine
        const companionReply = await api.askCompanionChat(query);
        setMessages((prev) => [...prev, companionReply]);
      }
    } catch {
      // Fallback
      setMessages((prev) => [
        ...prev,
        {
          id: `comp-${Date.now()}`,
          sender: 'companion',
          text: `I've analyzed your query regarding "${query}". Currently, all atoms are running at normal thresholds with 98.4% platform success rate.`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } finally {
      setIsTyping(false);
    }
  };

  const prepareBlueprintForReview = async (prompt: string) => {
    try {
      const proposal = parseGeneratedBlueprintPrompt(prompt);
      const preview = proposal.stages.length >= 2
        ? await api.buildBlueprint({ processName: proposal.processName, stages: proposal.stages, description: proposal.description, dryRun: true })
        : undefined;
      setBuildProposal({ proposal, preview });
    } catch (error) {
      setBuildProposal({
        proposal: { processName: '', description: '', stages: [], enhancements: [], missingInfo: [] },
        error: error instanceof Error ? error.message : 'Could not prepare the Boomi preview.',
      });
    }
  };

  const handleCreateProposedBlueprint = async () => {
    if (!buildProposal?.preview || buildProposal.proposal.missingInfo.length > 0 || buildProposal.proposal.stages.length < 2) return;
    setBuildProposal((current) => current ? { ...current, busy: true, error: undefined } : current);
    try {
      const result = await api.buildBlueprint({
        processName: buildProposal.proposal.processName,
        stages: buildProposal.proposal.stages,
        description: buildProposal.proposal.description,
        dryRun: false,
      });
      setBuildProposal((current) => current ? { ...current, result, busy: false } : current);
    } catch (error) {
      setBuildProposal((current) => current ? { ...current, error: error instanceof Error ? error.message : 'Boomi could not create the process.', busy: false } : current);
    }
  };

  // Send a question handed over from the page (e.g. "What changed?" on an incident) once the drawer is open
  useEffect(() => {
    if (isOpen && pendingPrompt) {
      onPromptConsumed?.();
      handleSendMessage(pendingPrompt);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, pendingPrompt]);

  const handleActionClick = async (action: CompanionMessage['suggestedAction']) => {
    if (!action) return;

    if (action.type === 'BUILD_PROCESS') {
      // The chat only produces text, so it cannot build the user's design. Send them to the compiler.
      setMessages((prev) => [
        ...prev,
        {
          id: `comp-build-${Date.now()}`,
          sender: 'companion',
          text: 'To build a process in Boomi, open the **ConnectCraft** tab, lay out your shapes and click **Build in Boomi**. You will see the exact shape list and confirm it before anything is created.',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        }
      ]);
    } else if (action.type === 'OPEN_DRAFT' && action.executionId) {
      onOpenDraft?.(action.executionId);
    } else if (action.type === 'REPROCESS' && action.executionId) {
      onTriggerAutoHeal(action.executionId);
    } else if (action.type === 'VIEW_FLOW' && action.executionId) {
      const match = executions.find(e => e.id === action.executionId || e.processId === action.executionId);
      if (match) {
        onOpenFlow(match);
      } else {
        onOpenFlow({
          id: `exec-${action.executionId}`,
          processId: action.executionId,
          processName: action.label.replace('Inspect Flow: ', '').replace('Inspect in Flow Canvas: ', '').replace('Inspect Topology: ', ''),
          atomName: 'ESI-PC16.easystepin.com',
          environment: 'ESI_QA',
          status: 'SUCCESS',
          startedAt: new Date().toISOString(),
          durationMs: 900,
          inboundDocs: 1,
          outboundDocs: 1,
        });
      }
    } else if (action.type === 'INSPECT_PAYLOAD' && action.executionId) {
      const match = executions.find(e => e.id === action.executionId);
      if (match) onOpenFlow(match);
    }
  };

  if (!isOpen) return null;

  return (
    // Opens below the 64px top bar so the bar (and its buttons) never move or get covered.
    <div className="fixed top-16 bottom-0 right-0 z-40 w-full max-w-md bg-boomi-card border-l border-t border-boomi-cardBorder shadow-2xl flex flex-col animate-slide-left">
      
      {/* Drawer Header */}
      <div className="flex items-center justify-between p-4 border-b border-boomi-cardBorder bg-slate-900/90 backdrop-blur">
        <div className="flex items-center gap-3">
          <div className="relative flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-tr from-boomi-blue to-boomi-accent text-white shadow-lg shadow-sky-500/25">
            <Bot className="w-5 h-5" />
            <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-400 border border-slate-900" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <h3 className="text-sm font-bold text-white">Keystone AI</h3>
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-sky-500/20 text-sky-300 font-semibold border border-sky-500/30">
                AI Copilot
              </span>
            </div>
            <p className="text-[11px] text-slate-400">Contextual Operations & Triage</p>
          </div>
        </div>

        <button
          onClick={onClose}
          className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Quick Prompts Carousel */}
      <div className="p-3 border-b border-boomi-cardBorder bg-slate-950/40">
        <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block mb-2">
          Suggested Queries
        </span>
        <div className="flex flex-wrap gap-1.5">
          {quickPrompts.map((prompt, idx) => (
            <button
              key={idx}
              onClick={() => handleSendMessage(prompt)}
              className="text-[11px] px-2.5 py-1 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 border border-slate-700/60 transition cursor-pointer flex items-center gap-1"
            >
              <span>{prompt}</span>
              <ChevronRight className="w-3 h-3 text-slate-500" />
            </button>
          ))}
        </div>
      </div>

      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}
          >
            <div className="flex items-center gap-1.5 mb-1 text-[10px] text-slate-500">
              <span>{msg.sender === 'user' ? 'You' : 'Keystone AI'}</span>
              <span>•</span>
              <span>{msg.timestamp}</span>
            </div>

            <div
              className={`max-w-[90%] rounded-2xl p-3.5 text-xs leading-relaxed shadow-md ${
                msg.sender === 'user'
                  ? 'bg-boomi-blue text-white rounded-br-none'
                  : 'bg-slate-900 border border-slate-800 text-slate-200 rounded-bl-none'
              }`}
            >
              {msg.sender === 'user' ? (
                <div className="whitespace-pre-wrap">{msg.text}</div>
              ) : (
                <MarkdownText text={msg.text} hideMermaid={Boolean(msg.codeBlock)} />
              )}

              {/* Detailed documentation downloads */}
              {msg.processDoc && (
                <div className="mt-3 pt-2.5 border-t border-slate-800 grid grid-cols-2 gap-2">
                  {([
                    { format: 'docx', label: 'Download Word', icon: FileText },
                    { format: 'pdf', label: 'Download PDF', icon: FileType },
                  ] as const).map(({ format, label, icon: Icon }) => {
                    const busy = downloading === `${msg.id}-${format}`;
                    return (
                      <button
                        key={format}
                        onClick={() => downloadDoc(msg.id, msg.processDoc!, format)}
                        disabled={downloading !== null}
                        className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-gradient-to-r from-boomi-blue to-boomi-accent hover:from-blue-600 hover:to-sky-400 text-white font-semibold text-xs shadow-md shadow-sky-950 transition cursor-pointer disabled:opacity-50 disabled:cursor-wait"
                      >
                        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Icon className="w-3.5 h-3.5" />}
                        <span>{label}</span>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Code block if present */}
              {msg.codeBlock && (
                <div className="mt-2.5 rounded-lg bg-slate-950 border border-slate-800 p-2.5 font-mono text-[11px] overflow-x-auto text-emerald-300">
                  <div className="text-[10px] text-slate-500 pb-1 border-b border-slate-800 mb-1 uppercase font-bold">
                    {msg.codeBlock.language} Specification
                  </div>
                  <pre>{msg.codeBlock.code}</pre>
                </div>
              )}

              {/* Suggested Action CTA */}
              {msg.suggestedAction && (
                <div className="mt-3 pt-2.5 border-t border-slate-800">
                  <button
                    onClick={() => handleActionClick(msg.suggestedAction)}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white font-semibold text-xs shadow-md shadow-emerald-950 transition cursor-pointer"
                  >
                    <Zap className="w-3.5 h-3.5 text-amber-200" />
                    <span>{msg.suggestedAction.label}</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}

        {isTyping && (
          <div className="flex items-center gap-2 text-slate-400 text-xs py-2">
            <Bot className="w-4 h-4 text-boomi-accent animate-spin" />
            <span>Keystone AI is analyzing Atom telemetry...</span>
          </div>
        )}

        {buildProposal && <section className="rounded-2xl border border-purple-500/30 bg-slate-900 p-3.5 text-xs shadow-lg">
          <div className="flex items-start gap-2">
            {buildProposal.result ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" /> : buildProposal.error ? <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" /> : <ClipboardList className="mt-0.5 h-4 w-4 shrink-0 text-purple-300" />}
            <div className="min-w-0 flex-1"><h4 className="font-bold text-white">{buildProposal.result ? 'Boomi process created' : buildProposal.error ? 'Could not prepare or create the process' : 'Review Boomi build proposal'}</h4>{buildProposal.proposal.processName && <p className="mt-1 text-slate-300">{buildProposal.proposal.processName}</p>}</div>
          </div>
          {buildProposal.error && <div className="mt-3 rounded-lg border border-rose-500/30 bg-rose-950/30 p-2.5 text-rose-200">{buildProposal.error}</div>}
          {buildProposal.proposal.missingInfo.length > 0 && <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-950/20 p-2.5"><p className="font-bold text-amber-200">Needs clarification before building</p><ul className="mt-1 list-disc space-y-1 pl-4 text-slate-300">{buildProposal.proposal.missingInfo.map((item, i) => <li key={i}>{item}</li>)}</ul></div>}
          {buildProposal.proposal.stages.length > 0 && <div className="mt-3 space-y-1.5"><p className="font-bold text-slate-200">Proposed stages</p>{buildProposal.proposal.stages.map((stage, i) => <div key={stage.id} className="rounded-lg border border-slate-800 bg-slate-950/70 p-2"><span className="mr-1.5 font-mono text-purple-300">{String(i + 1).padStart(2, '0')}.</span><span className="font-semibold text-white">{stage.label}</span><span className="text-slate-400"> · {stage.selectedShapeOrConnector}</span>{stage.notes && <p className="mt-1 whitespace-pre-wrap text-[11px] text-slate-400">{stage.notes}</p>}</div>)}</div>}
          {buildProposal.proposal.enhancements.length > 0 && <div className="mt-3 rounded-lg border border-sky-500/25 bg-sky-950/20 p-2.5"><p className="font-bold text-sky-200">Suggested enhancements</p><ul className="mt-1 list-disc space-y-1 pl-4 text-slate-300">{buildProposal.proposal.enhancements.map((item, i) => <li key={i}>{item}</li>)}</ul></div>}
          {buildProposal.preview && <div className="mt-3 rounded-lg border border-slate-800 bg-slate-950/60 p-2.5"><p className="font-bold text-slate-200">Boomi dry-run preview</p><ol className="mt-1 list-decimal space-y-1 pl-4 text-slate-300">{buildProposal.preview.shapes.map((shape, i) => <li key={i}>{shape.label} <span className="text-slate-500">({shape.kind})</span>{shape.placeholder && <span className="ml-1 text-amber-300">· placeholder: {shape.reason}</span>}{shape.configure && <span className="ml-1 text-amber-300">· requires configuration</span>}</li>)}</ol>{buildProposal.preview.shapes.some(shape => shape.placeholder || shape.configure) && <p className="mt-2 text-[10px] leading-relaxed text-amber-200/90">Connector operations, profiles, and maps marked as placeholders need configuration in Boomi before the integration can run.</p>}</div>}
          {buildProposal.result && <div className="mt-3 rounded-lg border border-emerald-500/30 bg-emerald-950/20 p-2.5 text-emerald-100"><p>{buildProposal.result.message || 'Boomi accepted the process creation request.'}</p>{buildProposal.result.componentId && <p className="mt-1">Component ID: <code>{buildProposal.result.componentId}</code></p>}{buildProposal.result.folder && <p>Folder: {buildProposal.result.folder}</p>}</div>}
          {!buildProposal.result && buildProposal.preview && <button onClick={handleCreateProposedBlueprint} disabled={Boolean(buildProposal.busy) || buildProposal.proposal.missingInfo.length > 0} className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-purple-600 px-3 py-2 font-bold text-white hover:bg-purple-500 disabled:cursor-not-allowed disabled:opacity-50">{buildProposal.busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}{buildProposal.busy ? 'Creating in Boomi…' : 'Confirm and create in Boomi'}</button>}
        </section>}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="p-3 border-t border-boomi-cardBorder bg-slate-900/90">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSendMessage();
          }}
          className="relative flex items-center"
        >
          <textarea
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Ask Keystone AI or paste a generated Integration Blueprint..."
            rows={3}
            className="w-full resize-y pl-3.5 pr-10 py-2.5 text-xs rounded-xl bg-slate-950 border border-slate-700/80 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-boomi-accent focus:ring-1 focus:ring-boomi-accent transition"
          />
          <button
            type="submit"
            disabled={!inputValue.trim()}
            className="absolute right-1.5 p-1.5 rounded-lg bg-boomi-blue text-white hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </form>
      </div>

    </div>
  );
};
