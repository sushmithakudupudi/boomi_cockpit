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
  // Listener connectors (Listen operation): the process starts when a message or request arrives.
  // Keep in sync with START_SHAPE_IDS in backend/app/services/boomi_process_builder.py.
  { id: 'Boomi Event Streams', label: 'Boomi Event Streams', tag: 'Listen / Topic subscription', kind: 'start' },
  { id: 'Flow Services Server', label: 'Flow Services Server', tag: 'Listen / Boomi Flow', kind: 'start' },
  { id: 'AS2 Shared Server', label: 'AS2 Shared Server', tag: 'Listen / B2B EDI', kind: 'start' },
  { id: 'MLLP Server', label: 'MLLP Server', tag: 'Listen / HL7', kind: 'start' },
  { id: 'Atom Queue', label: 'Atom Queue', tag: 'Listen / Atom messaging', kind: 'start' },
  { id: 'JMS', label: 'JMS', tag: 'Listen / Queue or topic', kind: 'start' },
  { id: 'IBM MQ', label: 'IBM MQ', tag: 'Listen / Queue', kind: 'start' },
  { id: 'RabbitMQ', label: 'RabbitMQ', tag: 'Listen / AMQP queue', kind: 'start' },
  { id: 'Solace PubSub+', label: 'Solace PubSub+', tag: 'Listen / Event broker', kind: 'start' },
  { id: 'MQTT', label: 'MQTT', tag: 'Listen / IoT topic', kind: 'start' },
  { id: 'Amazon SQS', label: 'Amazon SQS', tag: 'Listen / Cloud queue', kind: 'start' },
  { id: 'Amazon EventBridge', label: 'Amazon EventBridge', tag: 'Listen / Event bus', kind: 'start' },
  { id: 'Azure Service Bus', label: 'Azure Service Bus', tag: 'Listen / Queue or topic', kind: 'start' },
  { id: 'Google Cloud Pub/Sub', label: 'Google Cloud Pub/Sub', tag: 'Listen / Subscription', kind: 'start' },
  { id: 'Salesforce Platform Events', label: 'Salesforce Platform Events', tag: 'Listen / Event channel', kind: 'start' },
  { id: 'Disk v2 (Listen)', label: 'Disk v2', tag: 'Listen / File drop', kind: 'start' },
];

export const PROCESS_SHAPES: CatalogEntry[] = [
  { id: 'Message', label: 'Message', tag: 'Build / log a message', kind: 'shape' },
  { id: 'Set Properties', label: 'Set Properties', tag: 'DPP / DDP values', kind: 'shape' },
  { id: 'Data Process (Split/Combine)', label: 'Data Process', tag: 'Split / Combine / Base64 / Script', kind: 'shape' },
  { id: 'Map & transform', label: 'Map', tag: 'Field Mappings & Functions', kind: 'shape' },
  { id: 'Business Rules & DPP Shape', label: 'Business Rules', tag: 'Rules Engine & Properties', kind: 'shape' },
  { id: 'Decision & Route Shapes', label: 'Decision', tag: 'True / False on a condition', kind: 'shape' },
  { id: 'Try/Catch & Set Properties', label: 'Try/Catch', tag: 'Fault Tolerance & DLQ', kind: 'shape' },
  { id: 'Notify', label: 'Notify', tag: 'User log / alert', kind: 'shape' },
  { id: 'Process Call', label: 'Process Call', tag: 'Run a sub-process', kind: 'shape' },
  { id: 'Agent', label: 'Agent', tag: 'Boomi AI agent', kind: 'shape' },
  { id: 'Process Route', label: 'Process Route', tag: 'Route to a process by key', kind: 'shape' },
  // Keep in sync with PROCESS_SHAPES in backend/app/services/process_designer.py.
  { id: 'Branch', label: 'Branch', tag: 'Send documents down several paths', kind: 'shape' },
  { id: 'Route', label: 'Route', tag: 'Route by a value', kind: 'shape' },
  { id: 'Cleanse', label: 'Cleanse', tag: 'Validate / repair fields', kind: 'shape' },
  { id: 'Find Changes', label: 'Find Changes', tag: 'Compare with last run', kind: 'shape' },
  { id: 'Flow Control', label: 'Flow Control', tag: 'Batch / parallel processing', kind: 'shape' },
  { id: 'Retrieve From Cache', label: 'Retrieve From Cache', tag: 'Read cached documents', kind: 'shape' },
  { id: 'Program Command', label: 'Program Command', tag: 'SQL / system command', kind: 'shape' },
];

export const CONNECTOR_SHAPES: CatalogEntry[] = [
  { id: 'Connector', label: 'Connector', tag: 'Any other connector', kind: 'connector' },
  { id: 'Boomi Platform API', label: 'Boomi Platform API', tag: 'AtomSphere GET / QUERY', kind: 'connector' },
  { id: 'HTTP Client', label: 'HTTP Client', tag: 'Generic REST call', kind: 'connector' },
  { id: 'Salesforce', label: 'Salesforce', tag: 'REST / Bulk Upsert', kind: 'connector' },
  { id: 'NetSuite SuiteTalk', label: 'NetSuite SuiteTalk', tag: 'ERP Sync', kind: 'connector' },
  { id: 'SAP ERP', label: 'SAP ERP', tag: 'IDoc / BAPI', kind: 'connector' },
  { id: 'PostgreSQL Database', label: 'PostgreSQL Database', tag: 'Relational Store', kind: 'connector' },
  { id: 'AWS S3 Data Lake', label: 'AWS S3 Data Lake', tag: 'Object Store / Parquet', kind: 'connector' },
  { id: 'ServiceNow', label: 'ServiceNow', tag: 'ITSM Incidents', kind: 'connector' },
  // Keep in sync with CONNECTOR_SHAPES in backend/app/services/process_designer.py.
  // Databases
  { id: 'Database (JDBC)', label: 'Database', tag: 'JDBC read / write / stored procedures', kind: 'connector' },
  { id: 'Database (Legacy)', label: 'Database (Legacy)', tag: 'Older JDBC connector', kind: 'connector' },
  { id: 'Microsoft Azure SQL Database', label: 'Microsoft Azure SQL Database', tag: 'Cloud relational store', kind: 'connector' },
  { id: 'Oracle Database', label: 'Oracle Database', tag: 'Relational Store', kind: 'connector' },
  { id: 'Microsoft SQL Server', label: 'Microsoft SQL Server', tag: 'Relational Store', kind: 'connector' },
  { id: 'MySQL', label: 'MySQL', tag: 'Relational Store', kind: 'connector' },
  { id: 'Snowflake', label: 'Snowflake', tag: 'Cloud data warehouse', kind: 'connector' },
  { id: 'Google BigQuery', label: 'Google BigQuery', tag: 'Cloud data warehouse', kind: 'connector' },
  { id: 'MongoDB', label: 'MongoDB', tag: 'Document store', kind: 'connector' },
  // Files and transfer
  { id: 'Disk V2', label: 'Disk V2', tag: 'Local / shared files', kind: 'connector' },
  { id: 'FTP', label: 'FTP', tag: 'File transfer', kind: 'connector' },
  { id: 'SFTP', label: 'SFTP', tag: 'Secure file transfer', kind: 'connector' },
  { id: 'Amazon S3', label: 'Amazon S3', tag: 'Object storage', kind: 'connector' },
  { id: 'Azure Blob Storage', label: 'Azure Blob Storage', tag: 'Object storage', kind: 'connector' },
  { id: 'Box', label: 'Box', tag: 'Cloud files', kind: 'connector' },
  // Web services and messaging
  { id: 'SOAP Client', label: 'Web Services SOAP Client', tag: 'SOAP call', kind: 'connector' },
  { id: 'Mail', label: 'Mail', tag: 'Send / read email', kind: 'connector' },
  { id: 'Kafka (Produce)', label: 'Apache Kafka', tag: 'Produce to topic', kind: 'connector' },
  { id: 'JMS (Send)', label: 'JMS', tag: 'Send to queue / topic', kind: 'connector' },
  { id: 'Boomi Event Streams (Produce)', label: 'Boomi Event Streams', tag: 'Produce to topic', kind: 'connector' },
  { id: 'Atom Queue (Send)', label: 'Atom Queue', tag: 'Send to Atom queue', kind: 'connector' },
  { id: 'Slack', label: 'Slack', tag: 'Post a message', kind: 'connector' },
  // Applications
  { id: 'Workday', label: 'Workday', tag: 'HCM / Financials', kind: 'connector' },
  { id: 'Microsoft Dynamics 365', label: 'Microsoft Dynamics 365', tag: 'CRM / ERP', kind: 'connector' },
  { id: 'SAP SuccessFactors', label: 'SAP SuccessFactors', tag: 'HR', kind: 'connector' },
  { id: 'Oracle E-Business Suite', label: 'Oracle E-Business Suite', tag: 'ERP', kind: 'connector' },
  { id: 'Shopify', label: 'Shopify', tag: 'Orders / products', kind: 'connector' },
];

export const END_SHAPES: CatalogEntry[] = [
  { id: 'Stop', label: 'Stop', tag: 'End and continue', kind: 'end' },
  { id: 'Return Documents', label: 'Return Documents', tag: 'Synchronous response', kind: 'end' },
  // These consume documents or fail them, so nothing runs after them
  { id: 'Exception', label: 'Exception', tag: 'Fail the document with a message', kind: 'end' },
  { id: 'Add to Cache', label: 'Add to Cache', tag: 'Store documents (ends the path)', kind: 'end' },
  { id: 'Remove From Cache', label: 'Remove From Cache', tag: 'Clear the cache (ends the path)', kind: 'end' },
];

export const CATALOG_GROUPS: { group: string; entries: CatalogEntry[] }[] = [
  { group: 'Start', entries: START_SHAPES },
  { group: 'Shapes', entries: PROCESS_SHAPES },
  { group: 'Connectors', entries: CONNECTOR_SHAPES },
  { group: 'End', entries: END_SHAPES },
];

const ALL = CATALOG_GROUPS.flatMap(g => g.entries);

export const entryOf = (id: string): CatalogEntry | undefined => ALL.find(e => e.id === id);

export const kindOf = (id: string): ShapeKind => entryOf(id)?.kind ?? 'shape';

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
