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

// Revision endpoints never fall back to mock data: failures must reach the UI.
async function revisionRequest<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}/revisions${path}`, init);
  } catch {
    throw new ApiError('The BoomiOps backend is unreachable. Start it with `npm run backend` and retry.', 'backend_unreachable');
  }
  if (!res.ok) {
    let detail: { code?: string; message?: string } = {};
    try {
      detail = (await res.json()).detail ?? {};
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(detail.message || `Request failed (HTTP ${res.status}).`, detail.code || 'error', res.status);
  }
  return res.json();
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
      console.warn('Backend /api/companion/chat unreachable, generating fallback response:', err);
      return {
        id: `comp-${Date.now()}`,
        sender: 'companion',
        text: `🔍 **Boomi Companion:** I've analyzed your request: "${prompt}". Currently processing telemetry across Atoms.`,
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

  // Build (or dry-run) a Boomi process from Architecture Compiler stages
  async buildBlueprint(req: {
    processName: string;
    stages: any[];
    description?: string;
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
