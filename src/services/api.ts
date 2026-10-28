import type { ExecutionRecord, AtomHealth, CompanionMessage } from '../types/boomi';
import type {
  ComponentFilters,
  ComponentListResponse,
  ComponentRevision,
  ComparisonResult,
  RevisionSource,
  RevisionStatus,
} from '../types/revisions';
import { mockExecutions, mockAtoms, initialProcessNodes, initialProcessEdges } from '../data/mockData';

const BASE_URL = '/api';

export interface BoomiFolder {
  id: string;
  name: string;
  fullPath: string;
  parentId: string;
}

/** Error carrying the backend's code/message so the UI can explain exactly what failed. */
export class ApiError extends Error {
  code: string;
  status: number;
  constructor(message: string, code = 'error', status = 0) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

// Revision and documentation endpoints never fall back to mock data: failures must reach the UI.
async function strictRequest<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, init);
  } catch {
    throw new ApiError('The BoomiOps backend is unreachable. Start it with `npm run backend` and retry.', 'backend_unreachable');
  }
  if (!res.ok) throw await errorFromResponse(res);
  return res.json();
}

async function errorFromResponse(res: Response): Promise<ApiError> {
  let detail: unknown;
  try {
    detail = (await res.json()).detail;
  } catch {
    /* non-JSON error body */
  }
  // Our routes always send {code, message}; FastAPI's plain "Not Found" means the running backend lacks the route
  if (res.status === 404 && typeof detail === 'string') {
    return new ApiError(
      'The running backend does not have this feature yet. It is probably running older code: stop it (Ctrl+C) and start it again with `npm run backend`.',
      'backend_outdated',
      404
    );
  }
  const d = (detail ?? {}) as { code?: string; message?: string };
  return new ApiError(d.message || `Request failed (HTTP ${res.status}).`, d.code || 'error', res.status);
}

const revisionRequest = <T,>(path: string, init?: RequestInit) => strictRequest<T>(`/revisions${path}`, init);

export interface ProcessDoc {
  source: RevisionSource;
  componentId: string;
  version: number;
  processName: string;
  markdown: string;
  summary: string;
  componentType: string;
  mermaid: string;
  steps: { id: string; label: string; type: string; typeName: string }[];
  aiSummary: boolean;
  modelUsed: string;
  generatedAt: string;
}

export interface StatsData {
  totalExecutions: number;
  successCount: number;
  failedCount: number;
  autoHealedCount: number;
  warningCount: number;
  inProgressCount: number;
  successRatePercent: number;
  avgLatencyMs: number;
  estimatedMttrReductionMinutes: number;
}

export const api = {
  // 0. Health Check
  async checkHealth(): Promise<boolean> {
    try {
      const res = await fetch(`${BASE_URL}/health`);
      return res.ok;
    } catch {
      return false;
    }
  },

  // 1. Fetch Executions
  // refresh=true makes the backend pull fresh records from Boomi first (throttled server-side)
  async fetchExecutions(refresh = false): Promise<ExecutionRecord[]> {
    try {
      const res = await fetch(`${BASE_URL}/executions${refresh ? '?refresh=true' : ''}`);
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      return await res.json();
    } catch (err) {
      console.warn('Backend /api/executions unreachable, falling back to mock data:', err);
      return mockExecutions;
    }
  },

  // Live executions only: null when the backend is unreachable (never mock data), so polling can skip a failed tick
  async fetchExecutionsLive(refresh = true): Promise<ExecutionRecord[] | null> {
    try {
      const res = await fetch(`${BASE_URL}/executions${refresh ? '?refresh=true' : ''}`);
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  },

  // Failure investigator: read a saved diagnosis (null when none yet) or start one (it only reads data)
  async getInvestigation(executionId: string): Promise<Record<string, any> | null> {
    try {
      const res = await fetch(`${BASE_URL}/investigations/${encodeURIComponent(executionId)}`);
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  },

  async runInvestigation(executionId: string, force = false): Promise<Record<string, any>> {
    const res = await fetch(`${BASE_URL}/investigations/${encodeURIComponent(executionId)}/run${force ? '?force=true' : ''}`, { method: 'POST' });
    if (!res.ok) {
      const detail = await res.json().then((j) => j.detail).catch(() => '');
      throw new Error(typeof detail === 'string' && detail ? detail : `Could not start the investigation (HTTP ${res.status}).`);
    }
    return await res.json();
  },

  // Actions the AI agent proposed. Nothing runs until a person approves one.
  async listActions(executionId: string): Promise<Record<string, any>[]> {
    try {
      const res = await fetch(`${BASE_URL}/actions?executionId=${encodeURIComponent(executionId)}`);
      return res.ok ? await res.json() : [];
    } catch {
      return [];
    }
  },

  async decideAction(actionId: string, decision: 'approve' | 'reject'): Promise<Record<string, any>> {
    const res = await fetch(`${BASE_URL}/actions/${encodeURIComponent(actionId)}/${decision}`, { method: 'POST' });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const d = body.detail;
      throw new Error(typeof d === 'string' ? d : d?.message || `Could not ${decision} the action (HTTP ${res.status}).`);
    }
    return await res.json();
  },

  // Incident memory: the remembered incident for a failure (with similar earlier ones), and recording what fixed it
  async getIncident(executionId: string): Promise<Record<string, any> | null> {
    try {
      const res = await fetch(`${BASE_URL}/incidents/${encodeURIComponent(executionId)}`);
      return res.ok ? await res.json() : null;
    } catch {
      return null;
    }
  },

  async recordFix(executionId: string, note: string): Promise<Record<string, any>> {
    const res = await fetch(`${BASE_URL}/incidents/${encodeURIComponent(executionId)}/resolve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const d = body.detail;
      throw new Error(typeof d === 'string' ? d : d?.message || `Could not save (HTTP ${res.status}).`);
    }
    return await res.json();
  },

  // 2. Fetch Single Execution Detail
  async fetchExecutionById(id: string): Promise<ExecutionRecord | null> {
    try {
      const res = await fetch(`${BASE_URL}/executions/${id}`);
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      return await res.json();
    } catch (err) {
      console.warn(`Backend /api/executions/${id} unreachable, using fallback:`, err);
      return mockExecutions.find((e) => e.id === id) || null;
    }
  },

  // 3. Fetch Atoms
  async fetchAtoms(): Promise<AtomHealth[]> {
    try {
      const res = await fetch(`${BASE_URL}/atoms`);
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      return await res.json();
    } catch (err) {
      console.warn('Backend /api/atoms unreachable, using fallback:', err);
      return mockAtoms;
    }
  },

  // 4. Fetch Stats
  async fetchStats(): Promise<StatsData | null> {
    try {
      const res = await fetch(`${BASE_URL}/stats`);
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      return await res.json();
    } catch (err) {
      console.warn('Backend /api/stats unreachable:', err);
      return null;
    }
  },

  // 5. Ask Boomi Companion Chat
  async askCompanionChat(
    prompt: string,
    executionId?: string,
    context?: Record<string, any>
  ): Promise<CompanionMessage> {
    try {
      const res = await fetch(`${BASE_URL}/companion/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, executionId, context }),
      });
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      const data = await res.json();
      return data.message;
    } catch (err) {
      console.warn('Backend /api/companion/chat unreachable:', err);
      return {
        id: `comp-${Date.now()}`,
        sender: 'companion',
        text: 'Keystone AI could not reach its chat service, so I could not check your request or current account data. Please try again when the connection is restored.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
    }
  },

  // 6. AI Triage Execution
  async triageExecution(executionId: string) {
    try {
      const res = await fetch(`${BASE_URL}/companion/triage/${executionId}`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      return await res.json();
    } catch (err) {
      console.warn(`Backend /api/companion/triage/${executionId} unreachable:`, err);
      return null;
    }
  },

  // 7. Reprocess Document (Autonomous Self-Healing)
  async reprocessExecution(executionId: string, patchedPayload?: string) {
    let res: Response;
    try {
      res = await fetch(`${BASE_URL}/reprocess`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ executionId, patchedPayload }),
      });
    } catch {
      throw new Error('The backend is not reachable, so nothing was reprocessed.');
    }
    if (!res.ok) {
      const detail = await res.json().then((j) => j.detail).catch(() => '');
      throw new Error(typeof detail === 'string' && detail ? detail : `Reprocess failed (HTTP ${res.status}).`);
    }
    return await res.json();
  },

  // Run a deployed process once. The backend refuses unless confirm is true.
  async rerunProcess(processId: string, atomName?: string): Promise<{ message: string; atomName: string; requestId?: string }> {
    let res: Response;
    try {
      res = await fetch(`${BASE_URL}/processes/${encodeURIComponent(processId)}/rerun`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: true, atomName }),
      });
    } catch {
      throw new Error('The backend is not reachable, so the process was not started.');
    }
    if (!res.ok) {
      const detail = await res.json().then((j) => j.detail).catch(() => '');
      throw new Error(typeof detail === 'string' && detail ? detail : `Could not start the process (HTTP ${res.status}).`);
    }
    return await res.json();
  },

  // 8. Reset Demo State
  async resetDemoScenario() {
    try {
      const res = await fetch(`${BASE_URL}/reset`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      return await res.json();
    } catch (err) {
      console.warn('Backend /api/reset unreachable:', err);
      return { message: 'Demo reset locally.' };
    }
  },

  // 9. Fetch Process Topology
  async fetchTopology(processId: string) {
    try {
      const res = await fetch(`${BASE_URL}/topology/${processId}`);
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      return await res.json();
    } catch (err) {
      console.warn(`Backend /api/topology/${processId} unreachable, using fallback:`, err);
      return {
        processId,
        processName: 'SAP_to_Salesforce_Order_Sync',
        nodes: initialProcessNodes,
        edges: initialProcessEdges,
      };
    }
  },

  // 10. Build Process in Boomi via Component API
  async buildProcess(processName: string, description?: string, folderId?: string) {
    const res = await fetch(`${BASE_URL}/companion/build-process`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ processName, description, folderId }),
    });
    if (!res.ok) throw new Error(`HTTP error ${res.status}`);
    return await res.json();
  },

  // 11. Revision History (read-only; throws ApiError, never returns mock data)
  fetchRevisionStatus: () => revisionRequest<RevisionStatus>('/status'),

  fetchRevisionComponents(source: RevisionSource, f: ComponentFilters, refresh = false) {
    const p = new URLSearchParams({ source, q: f.q, type: f.type, author: f.author, dateFrom: f.dateFrom, dateTo: f.dateTo });
    if (refresh) p.set('refresh', 'true');
    return revisionRequest<ComponentListResponse>(`/components?${p}`);
  },

  fetchComponentRevisions: (source: RevisionSource, componentId: string) =>
    revisionRequest<{ revisions: ComponentRevision[] }>(`/components/${encodeURIComponent(componentId)}/revisions?source=${source}`),

  compareRevisions: (source: RevisionSource, componentId: string, fromVersion: number, toVersion: number, includeUnchanged: boolean) =>
    revisionRequest<ComparisonResult>(
      `/components/${encodeURIComponent(componentId)}/compare?source=${source}&fromVersion=${fromVersion}&toVersion=${toVersion}&includeUnchanged=${includeUnchanged}`
    ),

  compareUploadedXml: (leftXml: string, rightXml: string, leftLabel: string, rightLabel: string, includeUnchanged: boolean) =>
    revisionRequest<ComparisonResult>('/compare-xml', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ leftXml, rightXml, leftLabel, rightLabel, includeUnchanged }),
    }),

  // AI Docs for one component revision (throws ApiError, never returns mock data)
  generateProcessDoc: (source: RevisionSource, componentId: string, version: number) =>
    strictRequest<ProcessDoc>(`/process-docs/${encodeURIComponent(componentId)}?${new URLSearchParams({ source, version: String(version) })}`),

  // Fetches the Word/PDF file and hands it to the browser as a download
  async downloadProcessDoc(source: RevisionSource, componentId: string, version: number, format: 'docx' | 'pdf') {
    const p = new URLSearchParams({ source, version: String(version), format });
    let res: Response;
    try {
      res = await fetch(`${BASE_URL}/process-docs/${encodeURIComponent(componentId)}/export?${p}`);
    } catch {
      throw new ApiError('The BoomiOps backend is unreachable. Start it with `npm run backend` and retry.', 'backend_unreachable');
    }
    if (!res.ok) throw await errorFromResponse(res);
    const name = res.headers.get('Content-Disposition')?.match(/filename="([^"]+)"/)?.[1] ?? `process_v${version}.${format}`;
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  },

  // Build (or dry-run) a Boomi process from Architecture Compiler stages
  async buildBlueprint(req: {
    processName: string;
    stages: any[];
    description?: string;
    folderId?: string;
    dryRun?: boolean;
  }): Promise<{
    dryRun: boolean;
    shapes: { label: string; kind: string; placeholder: boolean; reason: string; call?: string; configure?: boolean }[];
    components?: { type: string; name: string; id: string }[];
    componentId: string;
    name: string;
    folder: string;
    message: string;
  }> {
    const res = await fetch(`${BASE_URL}/companion/build-blueprint`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });
    if (!res.ok) {
      const detail = await res.json().then(j => j.detail).catch(() => '');
      throw new Error(detail || `HTTP error ${res.status}`);
    }
    return await res.json();
  },

  // Boomi folders that ArchForge can build into: the build folder and everything below it
  async listBoomiFolders(): Promise<BoomiFolder[]> {
    const res = await fetch(`${BASE_URL}/companion/boomi-folders`);
    if (!res.ok) {
      const detail = await res.json().then(j => j.detail).catch(() => '');
      throw new Error(detail || `HTTP error ${res.status}`);
    }
    return await res.json();
  },

  async createBoomiFolder(name: string, parentId: string): Promise<BoomiFolder> {
    const res = await fetch(`${BASE_URL}/companion/boomi-folders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, parentId }),
    });
    if (!res.ok) {
      const detail = await res.json().then(j => (typeof j.detail === 'string' ? j.detail : j.detail?.message)).catch(() => '');
      throw new Error(detail || `HTTP error ${res.status}`);
    }
    return await res.json();
  },

  // Saved Architecture Compiler blueprint (backend file store). Returns null when none is saved or the backend is down.
  // 'missing' (404) means nothing saved yet; 'error' means the backend could not be reached or failed.
  // Callers must not overwrite saved data on 'error'.
  async loadBlueprint(id: string): Promise<
    { state: 'ok'; doc: Record<string, any> } | { state: 'missing' } | { state: 'error' }
  > {
    try {
      const res = await fetch(`${BASE_URL}/companion/blueprints/${id}`);
      if (res.status === 404) return { state: 'missing' };
      if (!res.ok) return { state: 'error' };
      return { state: 'ok', doc: await res.json() };
    } catch {
      return { state: 'error' };
    }
  },

  // All saved blueprints (drafts and sent), newest first. null when the backend is unreachable.
  async listBlueprints(): Promise<Record<string, any>[] | null> {
    try {
      const res = await fetch(`${BASE_URL}/companion/blueprints`);
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  },

  async deleteBlueprint(id: string): Promise<boolean> {
    try {
      const res = await fetch(`${BASE_URL}/companion/blueprints/${id}`, { method: 'DELETE' });
      return res.ok;
    } catch {
      return false;
    }
  },

  async restoreBlueprint(id: string): Promise<boolean> {
    try {
      const res = await fetch(`${BASE_URL}/companion/blueprints/${id}/restore`, { method: 'POST' });
      return res.ok;
    } catch {
      return false;
    }
  },

  async saveBlueprint(id: string, doc: Record<string, any>): Promise<boolean> {
    try {
      const res = await fetch(`${BASE_URL}/companion/blueprints/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(doc),
      });
      return res.ok;
    } catch {
      return false;
    }
  },

  // 11. Generate Boomi Companion Spec with OpenAI
  async generateBlueprintSpec(req: {
    blueprintId: string;
    title?: string;
    stages: any[];
    businessRule?: string;
    settings?: Record<string, any>;
  }): Promise<{ prompt: string; source: string; modelUsed: string } | null> {
    try {
      const res = await fetch(`${BASE_URL}/companion/generate-spec`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req),
      });
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      return await res.json();
    } catch (err) {
      console.warn('Backend /api/companion/generate-spec unreachable, using fallback generator:', err);
      return null;
    }
  },
};
