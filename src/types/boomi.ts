export type ExecutionStatus = 'SUCCESS' | 'ERROR' | 'WARNING' | 'IN_PROGRESS';

export interface DocumentPayload {
  documentId: string;
  sizeBytes: number;
  format: 'JSON' | 'XML' | 'EDI' | 'CSV';
  rawContent: string;
  fixedContent?: string;
  diffSummary?: string;
}

export interface ExecutionRecord {
  id: string;
  processId: string;
  processName: string;
  atomName: string;
  environment: string;
  status: ExecutionStatus;
  startedAt: string;
  durationMs: number;
  inboundDocs: number;
  outboundDocs: number;
  errorMessage?: string;
  errorShapeName?: string;
  errorShapeType?: string;
  payload?: DocumentPayload;
  companionAnalysis?: {
    rootCause: string;
    impactSeverity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
    suggestedAction: string;
    autoHealAvailable: boolean;
    confidenceScore: number;
    blastRadiusCount: number;
  };
  reprocessed?: boolean;
}

export interface BoomiNodeData extends Record<string, unknown> {
  title: string;
  subtitle: string;
  type: 'start' | 'dataprocess' | 'businessrules' | 'map' | 'connector' | 'branch' | 'exception' | 'stop';
  status: 'idle' | 'success' | 'error' | 'running';
  icon: string;
  system: string;
  docsIn: number;
  docsOut: number;
  details: string;
  errorMessage?: string;
  isErrorPoint?: boolean;
}

export interface CompanionMessage {
  id: string;
  sender: 'user' | 'companion';
  text: string;
  timestamp: string;
  suggestedAction?: {
    type: 'REPROCESS' | 'VIEW_FLOW' | 'INSPECT_PAYLOAD' | 'EXPORT_DOCS' | 'BUILD_PROCESS';
    label: string;
    executionId?: string;
    data?: any;
  };
  codeBlock?: {
    language: string;
    code: string;
  };
  // AI Docs summary of one process revision, with Word/PDF downloads
  processDoc?: ProcessDocRef;
}

export interface AtomHealth {
  id: string;
  name: string;
  type: 'Molecule' | 'Cloud' | 'Local Atom';
  status: 'ONLINE' | 'DEGRADED' | 'OFFLINE';
  version: string;
  heapUsagePercent: number;
  activeExecutions: number;
  queuedExecutions: number;
}

export interface ProcessDocRef {
  source: 'live' | 'sample';
  componentId: string;
  version: number;
  processName: string;
}
