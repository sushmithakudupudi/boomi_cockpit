import type { Stage, StageCategory } from '../types/compiler';

export type ShapeKind = 'start' | 'shape' | 'connector' | 'end';

export interface CatalogEntry {
  id: string; // stored in Stage.selectedShapeOrConnector
  label: string;
  tag: string;
  kind: ShapeKind;
}

export const START_SHAPES: CatalogEntry[] = [
  { id: 'Start - No Data', label: 'Start - No Data', tag: 'Scheduled / manual run', kind: 'start' },
  { id: 'REST API', label: 'REST API', tag: 'HTTP Client / JSON', kind: 'start' },
  { id: 'Web Services Server (Listen)', label: 'Web Services Server', tag: 'Inbound Webhook', kind: 'start' },
  { id: 'SAP Enterprise Connector', label: 'SAP Enterprise Connector', tag: 'IDoc / RFC', kind: 'start' },
  { id: 'Salesforce Outbound Messaging', label: 'Salesforce Listener', tag: 'SOAP / Outbound', kind: 'start' },
  { id: 'Database / JDBC', label: 'Database / JDBC', tag: 'PostgreSQL / Oracle', kind: 'start' },
  { id: 'AWS SQS / S3', label: 'AWS SQS / S3', tag: 'Cloud Queue / Storage', kind: 'start' },
  { id: 'Apache Kafka', label: 'Apache Kafka', tag: 'Event Stream', kind: 'start' },
];

export const PROCESS_SHAPES: CatalogEntry[] = [
  { id: 'Message', label: 'Message', tag: 'Build / log a message', kind: 'shape' },
  { id: 'Set Properties', label: 'Set Properties', tag: 'DPP / DDP values', kind: 'shape' },
  { id: 'Data Process (Split/Combine)', label: 'Data Process', tag: 'Split / Combine / Base64 / Script', kind: 'shape' },
  { id: 'Map & transform', label: 'Map', tag: 'Field Mappings & Functions', kind: 'shape' },
  { id: 'Business Rules & DPP Shape', label: 'Business Rules', tag: 'Rules Engine & Properties', kind: 'shape' },
  { id: 'Decision & Route Shapes', label: 'Decision / Route', tag: 'Conditional Routing', kind: 'shape' },
  { id: 'Try/Catch & Set Properties', label: 'Try/Catch', tag: 'Fault Tolerance & DLQ', kind: 'shape' },
  { id: 'Notify', label: 'Notify', tag: 'User log / alert', kind: 'shape' },
];

export const CONNECTOR_SHAPES: CatalogEntry[] = [
  { id: 'Boomi Platform API', label: 'Boomi Platform API', tag: 'AtomSphere GET / QUERY', kind: 'connector' },
  { id: 'HTTP Client', label: 'HTTP Client', tag: 'Generic REST call', kind: 'connector' },
  { id: 'Salesforce', label: 'Salesforce', tag: 'REST / Bulk Upsert', kind: 'connector' },
  { id: 'NetSuite SuiteTalk', label: 'NetSuite SuiteTalk', tag: 'ERP Sync', kind: 'connector' },
  { id: 'SAP ERP', label: 'SAP ERP', tag: 'IDoc / BAPI', kind: 'connector' },
  { id: 'PostgreSQL Database', label: 'PostgreSQL Database', tag: 'Relational Store', kind: 'connector' },
  { id: 'AWS S3 Data Lake', label: 'AWS S3 Data Lake', tag: 'Object Store / Parquet', kind: 'connector' },
  { id: 'ServiceNow', label: 'ServiceNow', tag: 'ITSM Incidents', kind: 'connector' },
];

export const END_SHAPES: CatalogEntry[] = [
  { id: 'Stop', label: 'Stop', tag: 'End and continue', kind: 'end' },
  { id: 'Return Documents', label: 'Return Documents', tag: 'Synchronous response', kind: 'end' },
];

export const CATALOG_GROUPS: { group: string; entries: CatalogEntry[] }[] = [
  { group: 'Start', entries: START_SHAPES },
  { group: 'Shapes', entries: PROCESS_SHAPES },
  { group: 'Connectors', entries: CONNECTOR_SHAPES },
  { group: 'End', entries: END_SHAPES },
];

const ALL = CATALOG_GROUPS.flatMap(g => g.entries);

export const kindOf = (id: string): ShapeKind =>
  ALL.find(e => e.id === id)?.kind ?? 'shape';

/** Category follows position and kind, so any shape can go in any slot. */
export const categorize = (stages: Stage[]): Stage[] => {
  const lastConnector = stages.map(s => kindOf(s.selectedShapeOrConnector)).lastIndexOf('connector');
  return stages.map((s, idx) => {
    const kind = kindOf(s.selectedShapeOrConnector);
    let category: StageCategory = 'MIDDLEWARE / SKILL';
    if (idx === 0) category = 'SOURCE SYSTEM';
    else if (kind === 'end') category = 'END SHAPE';
    else if (kind === 'connector' && idx === lastConnector) category = 'DESTINATION';
    return {
      ...s,
      category,
      stepNumber: `STEP ${String(idx + 1).padStart(2, '0')}`,
    };
  });
};
