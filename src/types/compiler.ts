export type StageCategory = 
  | 'SOURCE SYSTEM' 
  | 'MIDDLEWARE / SKILL' 
  | 'DESTINATION' 
  | 'VALIDATION & FILTER'
  | 'ERROR HANDLING'
  | 'END SHAPE';

export interface Stage {
  id: string;
  stepNumber: string; // e.g. "STEP 01"
  category: StageCategory;
  label: string; // e.g. "Incoming event", "Process & enrich", "Deliver result"
  selectedShapeOrConnector: string; // e.g. "REST API", "Map & transform", "Salesforce"
  subLabel?: string; // e.g. "JSON / payload", "+ Add custom step", "Target connector"
  badgeText?: string; // e.g. "FILTER", "ROUTE" between stages
  notes?: string; // what this shape must do, e.g. "Base64 decode the payload"
  branches?: number; // Branch shape only: number of paths, 2-25 (Boomi's limit)
  branchPaths?: Stage[][]; // Branch shape only: shapes on paths 2..N (path 1 is the main flow)
  subprocessSteps?: Stage[]; // Process Call only: steps between the sub-process's start and Return Documents
  details?: {
    connectorType?: string;
    action?: string; // GET, POST, UPSERT, QUERY, LISTEN
    profileType?: 'JSON' | 'XML' | 'Database' | 'FlatFile';
    objectName?: string;
    dppVariables?: string[];
    ddpVariables?: string[];
    hasTryCatch?: boolean;
    batchSize?: number;
  };
}

export interface GateItem {
  id: string;
  stepNum: string; // "01", "02", ... "15"
  title: string;
  namespace: string; // e.g. "boomi / blueprint / dev" or "boomi / inspect / dev"
  status: 'completed' | 'in_progress' | 'pending';
  included: boolean; // false when the guardrail that drives this gate is switched off
  description: string;
  boomiArtifacts: string[];
}

export interface JobBreakdownItem {
  id: string;
  componentType: string; // "Process", "JSON Profile", "Map Component", "Connector Operation", "Dynamic Process Properties"
  name: string;
  boomiFolder: string;
  purpose: string;
  shapesInvolved: string[];
}

export interface BlueprintConfig {
  blueprintId: string;
  title: string;
  stages: Stage[];
  businessRule: string;
  settings: {
    enableTryCatchBoundary: boolean;
    separateDPPvsDDP: boolean;
    enableDocumentSplitCombine: boolean;
    enforceIdempotentUpsert: boolean;
    enable3xExponentialRetry: boolean;
    deployInitialScheduleDisabled: boolean;
  };
}
