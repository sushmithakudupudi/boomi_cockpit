import type { ExecutionRecord, AtomHealth, CompanionMessage } from '../types/boomi';
import { mockExecutions, mockAtoms, initialProcessNodes, initialProcessEdges } from '../data/mockData';

const BASE_URL = '/api';

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
  async fetchExecutions(): Promise<ExecutionRecord[]> {
    try {
      const res = await fetch(`${BASE_URL}/executions`);
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      return await res.json();
    } catch (err) {
      console.warn('Backend /api/executions unreachable, falling back to mock data:', err);
      return mockExecutions;
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
    try {
      const res = await fetch(`${BASE_URL}/reprocess`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ executionId, patchedPayload }),
      });
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      return await res.json();
    } catch (err) {
      console.warn(`Backend /api/reprocess unreachable, simulating locally:`, err);
      return {
        success: true,
        executionId,
        status: 'SUCCESS',
        message: `Boomi Companion successfully repaired payload and reprocessed ${executionId}.`,
      };
    }
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
};
