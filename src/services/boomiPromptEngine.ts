import type { BlueprintConfig, GateItem, JobBreakdownItem, Stage } from '../types/compiler';
import { kindOf } from './shapeCatalog';

export const DEFAULT_STAGES: Stage[] = [
  {
    id: 'stage-1',
    stepNumber: 'STEP 01',
    category: 'SOURCE SYSTEM',
    label: 'Incoming event',
    selectedShapeOrConnector: 'REST API',
    subLabel: 'JSON / payload',
    badgeText: 'FILTER',
    details: {
      connectorType: 'HTTP Client',
      action: 'GET / LISTEN',
      profileType: 'JSON',
      objectName: 'CustomerOrders',
      dppVariables: ['DPP_BatchRunId', 'DPP_BatchStartTime'],
      ddpVariables: ['DDP_SourceRecordId', 'DDP_ReceivedTimestamp'],
      hasTryCatch: false,
    }
  },
  {
    id: 'stage-2',
    stepNumber: 'STEP 02',
    category: 'MIDDLEWARE / SKILL',
    label: 'Process & enrich',
    selectedShapeOrConnector: 'Map & transform',
    subLabel: '+ Add custom step',
    badgeText: 'ROUTE',
    details: {
      action: 'TRANSFORM',
      profileType: 'JSON',
      objectName: 'OrderToSalesforceOrderMap',
      dppVariables: ['DPP_ProcessedCount', 'DPP_FailedCount'],
      ddpVariables: ['DDP_Status', 'DDP_NormalizedEmail', 'DDP_ErrorMessage'],
      hasTryCatch: true,
      batchSize: 200,
    }
  },
  {
    id: 'stage-3',
    stepNumber: 'STEP 03',
    category: 'DESTINATION',
    label: 'Deliver result',
    selectedShapeOrConnector: 'Salesforce',
    subLabel: 'Target connector',
    details: {
      connectorType: 'Salesforce',
      action: 'UPSERT',
      objectName: 'Order__c',
      ddpVariables: ['DDP_ExternalOrderId', 'DDP_SFDCObjectId'],
      batchSize: 200,
    }
  }
];

export const PRESET_BLUEPRINTS: { id: string; name: string; description: string; config: BlueprintConfig }[] = [
  {
    id: 'rest-to-salesforce',
    name: 'REST API Ã¢Å¾â€ Map & Transform Ã¢Å¾â€ Salesforce (Approved Orders)',
    description: 'Standard order ingestion from REST API with status filtering, email normalization, and Salesforce Upsert.',
    config: {
      blueprintId: '98-3830-188',
      title: 'REST to Salesforce Order Blueprint',
      stages: DEFAULT_STAGES,
      businessRule: 'Only send orders with status = approved. Normalize email to lowercase.',
      settings: {
        enableTryCatchBoundary: true,
        separateDPPvsDDP: true,
        enableDocumentSplitCombine: true,
        enforceIdempotentUpsert: true,
        enable3xExponentialRetry: true,
        deployInitialScheduleDisabled: true,
      }
    }
  },
  {
    id: 'sap-to-netsuite',
    name: 'SAP IDoc Ã¢Å¾â€ Business Rules Ã¢Å¾â€ NetSuite Customer Sync',
    description: 'B2B enterprise pipeline syncing customer masters from SAP ORDERS05/DEBMAS with data quality verification.',
    config: {
      blueprintId: '77-1042-491',
      title: 'SAP to NetSuite Customer Blueprint',
      stages: [
        {
          id: 'stage-sap-1',
          stepNumber: 'STEP 01',
          category: 'SOURCE SYSTEM',
          label: 'Inbound IDoc',
          selectedShapeOrConnector: 'SAP Enterprise Connector',
          subLabel: 'DEBMAS07 / IDoc XML',
          badgeText: 'VALIDATE',
          details: {
            connectorType: 'SAP',
            action: 'LISTEN',
            profileType: 'XML',
            objectName: 'DEBMAS07',
            dppVariables: ['DPP_SAPDocNum', 'DPP_BatchId'],
            ddpVariables: ['DDP_CustomerId', 'DDP_CountryCode']
          }
        },
        {
          id: 'stage-sap-2',
          stepNumber: 'STEP 02',
          category: 'MIDDLEWARE / SKILL',
          label: 'Business Rules & Map',
          selectedShapeOrConnector: 'Business Rules & DPP Shape',
          subLabel: '+ Scrub & Lookup',
          badgeText: 'UPSERT',
          details: {
            action: 'VALIDATE_AND_MAP',
            profileType: 'XML',
            objectName: 'SAPToNetSuiteCustomerMap',
            dppVariables: ['DPP_ValidRecordCount'],
            ddpVariables: ['DDP_NetSuiteInternalId']
          }
        },
        {
          id: 'stage-sap-3',
          stepNumber: 'STEP 03',
          category: 'DESTINATION',
          label: 'Target NetSuite ERP',
          selectedShapeOrConnector: 'NetSuite SuiteTalk',
          subLabel: 'Customer Record Upsert',
          details: {
            connectorType: 'NetSuite',
            action: 'UPSERT',
            objectName: 'Customer',
            batchSize: 100
          }
        }
      ],
      businessRule: 'Filter out test accounts where postal_code is blank. Default Country to US if missing.',
      settings: {
        enableTryCatchBoundary: true,
        separateDPPvsDDP: true,
        enableDocumentSplitCombine: true,
        enforceIdempotentUpsert: true,
        enable3xExponentialRetry: true,
        deployInitialScheduleDisabled: true,
      }
    }
  },
  {
    id: 'webhook-to-postgres',
    name: 'Webhook Event Ã¢Å¾â€ Try/Catch & DPP Ã¢Å¾â€ PostgreSQL / S3 DLQ',
    description: 'High-frequency streaming webhook with document caching, dead-letter routing, and database insert.',
    config: {
      blueprintId: '44-9021-337',
      title: 'Real-Time Webhook Pipeline',
      stages: [
        {
          id: 'stage-wh-1',
          stepNumber: 'STEP 01',
          category: 'SOURCE SYSTEM',
          label: 'Webhook Ingress',
          selectedShapeOrConnector: 'Web Services Server (Listen)',
          subLabel: 'HTTP POST / JSON',
          badgeText: 'PROTECT',
          details: {
            connectorType: 'Web Services Server',
            action: 'LISTEN',
            profileType: 'JSON',
            objectName: 'EventPayload',
            dppVariables: ['DPP_TraceId'],
            ddpVariables: ['DDP_EventId', 'DDP_CorrelationKey']
          }
        },
        {
          id: 'stage-wh-2',
          stepNumber: 'STEP 02',
          category: 'MIDDLEWARE / SKILL',
          label: 'Try/Catch Envelope',
          selectedShapeOrConnector: 'Try/Catch & Set Properties',
          subLabel: 'Catch all errors',
          badgeText: 'PERSIST',
          details: {
            action: 'TRY_CATCH',
            dppVariables: ['DPP_ExecutionStatus'],
            ddpVariables: ['DDP_ErrorMessage', 'DDP_ErrorDetail']
          }
        },
        {
          id: 'stage-wh-3',
          stepNumber: 'STEP 03',
          category: 'DESTINATION',
          label: 'Database Warehouse',
          selectedShapeOrConnector: 'PostgreSQL Database',
          subLabel: 'Batch Insert & Return 200',
          details: {
            connectorType: 'Database',
            action: 'INSERT / RETURN',
            objectName: 'telemetry_events',
            batchSize: 500
          }
        }
      ],
      businessRule: 'Verify event_type is not null. Dead-letter unparseable JSON to AWS S3 before returning 400 response.',
      settings: {
        enableTryCatchBoundary: true,
        separateDPPvsDDP: true,
        enableDocumentSplitCombine: true,
        enforceIdempotentUpsert: true,
        enable3xExponentialRetry: true,
        deployInitialScheduleDisabled: true,
      }
    }
  }
];

const slug = (s: string): string => s.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

interface FlowContext {
  source: Stage;
  target: Stage;
  middleware: Stage[];
  sourceName: string;
  targetName: string;
  businessRule: string;
  hasRule: boolean;
  isReadTarget: boolean;
  action: string;
  objectName: string;
  batchSize: number;
  isListener: boolean;
  mentionsEmail: boolean;
  hasShape: (id: string) => boolean;
}

const READ_CONNECTORS = ['Boomi Platform API', 'HTTP Client', 'REST API'];

const buildContext = (config: BlueprintConfig): FlowContext => {
  const stages = config.stages;
  const source = stages.find(s => s.category === 'SOURCE SYSTEM') || stages[0];
  const target = stages.find(s => s.category === 'DESTINATION') || stages[stages.length - 1];
  const middleware = stages.filter(s => s !== source && s !== target);
  const sourceName = source?.selectedShapeOrConnector || 'REST API';
  const targetName = target?.selectedShapeOrConnector || 'Salesforce';
  const businessRule = config.businessRule.trim();
  const details = target?.details;
  const isReadTarget = READ_CONNECTORS.includes(targetName);
  return {
    source,
    target,
    middleware,
    sourceName,
    targetName,
    businessRule,
    hasRule: businessRule.length > 0,
    isReadTarget,
    action: details?.action || (isReadTarget ? 'GET' : config.settings.enforceIdempotentUpsert ? 'UPSERT' : 'INSERT'),
    objectName: details?.objectName || 'target object',
    batchSize: details?.batchSize ?? 200,
    isListener: /listen|webhook|web services server|kafka|sqs/i.test(sourceName),
    mentionsEmail: /e-?mail|lowercase/i.test(businessRule),
    hasShape: (id: string) => stages.some(s => s.selectedShapeOrConnector === id),
  };
};

const describeStage = (stage: Stage, businessRule: string): string[] => {
  const lines: string[] = [];
  const rule = businessRule || 'the rule described in this stage\'s notes';
  switch (stage.selectedShapeOrConnector) {
    case 'Start - No Data':
      lines.push('Start shape, Type "No Data" (no input document; the process runs on schedule or manually).');
      break;
    case 'Map & transform':
      lines.push('Boomi Map component translating the source profile to the target profile (see section 4).');
      break;
    case 'Business Rules & DPP Shape':
      lines.push(`Business Rules shape enforcing: "${rule}".`,
        'Rejected documents are logged with the reason and routed cleanly to a Stop shape without throwing fatal exceptions.');
      break;
    case 'Try/Catch & Set Properties':
      lines.push('Try/Catch shape with a Set Properties shape capturing error context in the Catch branch (see section 6).');
      break;
    case 'Data Process (Split/Combine)':
      lines.push('Data Process shape. Use the processing step named in the notes (for example Base64 Encode/Decode, Split Documents, Combine Documents or a Groovy script); default to Split Documents on the root repeating element.');
      break;
    case 'Decision & Route Shapes':
      lines.push(`Decision shape routing documents by: "${rule}". The false path goes to a Notify shape then a Stop shape.`);
      break;
    case 'Message':
      lines.push('Message shape. Build the message text from the notes; use {1}, {2} parameters for dynamic values.');
      break;
    case 'Set Properties':
      lines.push('Set Properties shape. Set the DPP/DDP values named in the notes (use DDP for per-document values, DPP for process-wide values).');
      break;
    case 'Notify':
      lines.push('Notify shape. Level and message per the notes; User Log checked.');
      break;
    case 'Boomi Platform API':
      lines.push('Boomi Platform API (AtomSphere API) connector shape with its own connection and operation components. Action and object (for example GET or QUERY on the object named in the notes) as stated in the notes; confirm the object name with the engineer.');
      break;
    case 'HTTP Client':
      lines.push('HTTP Client connector shape with its own connection and operation components. HTTP method, URL path and headers as stated in the notes.');
      break;
    case 'Stop':
      lines.push('Stop shape, "Continue processing other execution paths" checked.');
      break;
    case 'Return Documents':
      lines.push('Return Documents shape returning the final documents to the caller.');
      break;
    default:
      if (stage.category === 'DESTINATION' || stage.category === 'SOURCE SYSTEM') {
        lines.push(`${stage.selectedShapeOrConnector} connector shape with its own connection and operation components.`);
      } else {
        lines.push(`${stage.selectedShapeOrConnector}: implement as a dedicated shape and confirm the configuration with the engineer.`);
      }
  }
  if (stage.notes?.trim()) lines.push(`Configuration: ${stage.notes.trim()}`);
  return lines;
};

export const generateJobBreakdown = (config: BlueprintConfig): JobBreakdownItem[] => {
  const ctx = buildContext(config);
  const { settings } = config;
  const src = slug(ctx.sourceName);
  const tgt = slug(ctx.targetName);
  const folderRoot = `#Development/${slug(config.title) || 'Integration'}`;
  const profileType = ctx.source?.details?.profileType || 'JSON';

  const processShapes = [`Start Shape (${ctx.sourceName})`];
  if (settings.enableDocumentSplitCombine) processShapes.push('Data Process (Split Documents)');
  if (settings.enableTryCatchBoundary) processShapes.push('Try/Catch Shape');
  if (settings.separateDPPvsDDP) processShapes.push('Set Properties (DPP/DDP)');
  ctx.middleware.forEach(m => processShapes.push(m.selectedShapeOrConnector));
  processShapes.push(`${ctx.targetName} Connector`, ctx.isListener ? 'Return Documents' : 'Stop');

  const items: JobBreakdownItem[] = [
    {
      id: 'jb-01',
      componentType: 'Integration Process',
      name: `PRC_${src}_to_${tgt}_Sync`,
      boomiFolder: `${folderRoot}/Processes`,
      purpose: `Master pipeline from ${ctx.sourceName} to ${ctx.targetName} across ${config.stages.length} stages.`,
      shapesInvolved: processShapes,
    },
    {
      id: 'jb-02',
      componentType: 'Profiles & Data Schemas',
      name: `${profileType}_Source_${src}_Profile & ${tgt}_Target_Profile`,
      boomiFolder: `${folderRoot}/Profiles`,
      purpose: 'Authoritative data contracts defining fields, repeating elements, data types and required constraints.',
      shapesInvolved: [`${profileType} Profile`, `${ctx.targetName} Object Profile`, ...(settings.enableTryCatchBoundary ? ['Error Payload Profile'] : [])],
    },
  ];

  if (ctx.middleware.some(m => m.selectedShapeOrConnector === 'Map & transform') || ctx.middleware.length === 0) {
    items.push({
      id: 'jb-03',
      componentType: 'Boomi Map & Transformations',
      name: `MAP_${src}_to_${tgt}_Mapping`,
      boomiFolder: `${folderRoot}/Maps`,
      purpose: ctx.hasRule ? `Field-level translation rules for "${ctx.businessRule}".` : 'Field-level translation rules between source and target profiles.',
      shapesInvolved: [
        'Map Component',
        ...(ctx.mentionsEmail ? ['String Lowercase Map Function'] : []),
        'Date Mask Formatter',
        'Cross-Reference Lookup',
      ],
    });
  }

  items.push({
    id: 'jb-04',
    componentType: 'Connector Operations & Connections',
    name: `CONN_${src}_Read & CONN_${tgt}_${ctx.action}`,
    boomiFolder: `${folderRoot}/Connections`,
    purpose: [
      'Isolated sandbox connections',
      settings.enable3xExponentialRetry ? 'with 3x exponential retry' : null,
      `batch size ${ctx.batchSize}`,
      settings.enforceIdempotentUpsert ? 'and external-ID matching' : null,
    ].filter(Boolean).join(', ') + '.',
    shapesInvolved: [`${ctx.sourceName} Connector Operation`, `${ctx.targetName} ${ctx.action} Operation`, 'Connection Pool Config'],
  });

  if (settings.separateDPPvsDDP || settings.enableTryCatchBoundary) {
    items.push({
      id: 'jb-05',
      componentType: 'Dynamic Property Dictionary & Error DLQ',
      name: `PROPS_${config.blueprintId}_Dictionary`,
      boomiFolder: `${folderRoot}/Properties`,
      purpose: settings.separateDPPvsDDP
        ? 'Strict separation of DPP_* (process scope) and DDP_* (document scope) properties.'
        : 'Error context properties and dead-letter handling.',
      shapesInvolved: [
        'Set Properties Shape',
        ...(settings.enableTryCatchBoundary ? ['Notify Shape', 'Catch Branch Message Shape'] : []),
      ],
    });
  }

  return items;
};

export const generateGates = (config: BlueprintConfig): GateItem[] => {
  const ctx = buildContext(config);
  const { settings } = config;
  const ns = 'boomi / blueprint / dev';
  const gate = (
    n: number,
    title: string,
    namespace: string,
    description: string,
    boomiArtifacts: string[],
    included = true
  ): GateItem => ({
    id: `gate-${String(n).padStart(2, '0')}`,
    stepNum: String(n).padStart(2, '0'),
    title,
    namespace,
    status: 'pending',
    included,
    description,
    boomiArtifacts,
  });

  return [
    gate(1, 'Inspect and document the current development landscape', 'boomi / inspect / dev',
      `Verify Atom connectivity, installed connectors (${ctx.sourceName}, ${ctx.targetName}), folder access and sub-account scopes.`,
      ['AtomSphere API / Atom Telemetry', 'Connection Component Catalog', 'User Permissions Matrix']),
    gate(2, 'Resolve contracts and obtain design decisions', ns,
      `Confirm ${ctx.sourceName} and ${ctx.targetName} schemas, mandatory fields, enumerations and key fields.`,
      [`${ctx.sourceName} Source Profile`, `${ctx.targetName} Target Profile`, 'Contract Specification']),
    gate(3, 'Design synchronization, recovery, and process flow', ns,
      `Establish topology for ${ctx.middleware.length + 2} stages: ${config.stages.map(s => s.selectedShapeOrConnector).join(' Ã¢â€ â€™ ')}.`,
      ['Boomi Canvas Topology Diagram', 'Document Flow Sequencer', 'Error Routing Architecture']),
    gate(4, 'Prepare isolated development components and connections', ns,
      `Create the dev folder structure, isolated ${ctx.sourceName} and ${ctx.targetName} sandbox connections and credentials.`,
      [`${ctx.sourceName} Connection Component`, `${ctx.targetName} Sandbox Connection`, 'Folder Architecture']),
    gate(5, `Implement ${ctx.sourceName} retrieval and state handling`, ns,
      settings.enableDocumentSplitCombine
        ? `Configure the ${ctx.sourceName} start shape, split documents, and set ${settings.separateDPPvsDDP ? 'DPP/DDP' : 'tracking'} properties.`
        : `Configure the ${ctx.sourceName} start shape and set tracking properties.`,
      [`${ctx.sourceName} Connector Operation`, 'Set Properties Shape (Ingress)', ...(settings.enableDocumentSplitCombine ? ['Data Process (Split Documents)'] : [])]),
    gate(6, 'Implement business rule filtering and validation', ns,
      ctx.hasRule
        ? `Build Decision or Business Rules shape for: "${ctx.businessRule}" with clean rejection handling.`
        : 'No business rule specified; confirm with the engineer whether any filtering is needed.',
      ['Decision / Business Rules Shape', 'Clean Discard Stop Shape', 'Rejected Document Log']),
    gate(7, `Implement mapping to ${ctx.targetName}`, ns,
      `Construct the Map component from ${ctx.sourceName} fields to ${ctx.targetName} with date formatting and defaults${ctx.mentionsEmail ? ' and a Lowercase() function' : ''}.`,
      ['Boomi Map Component', ...(ctx.mentionsEmail ? ['String Lowercase Map Function'] : []), 'Date Mask Conversion Function']),
    gate(8, `Implement ${ctx.targetName} writes and idempotency`, ns,
      settings.enforceIdempotentUpsert
        ? `Configure ${ctx.targetName} operation Action=${ctx.action} on ${ctx.objectName}, matching on an external ID, batch size ${ctx.batchSize}.`
        : `Configure ${ctx.targetName} operation Action=${ctx.action} on ${ctx.objectName}, batch size ${ctx.batchSize}. Idempotency guard is disabled.`,
      [`${ctx.targetName} Connector Operation (${ctx.action})`, 'External ID Deduplication Key', 'Bulk Commit Configuration'],
      settings.enforceIdempotentUpsert),
    gate(9, 'Implement unified error handling, retry, and replay', ns,
      `Try/Catch Catch branch extracting 'Base - Try/Catch Message', logging to Notify and forwarding to a DLQ${settings.enable3xExponentialRetry ? ', with 3x exponential retry' : ''}.`,
      ['Try/Catch Shape (Catch All Errors)', 'Set Properties (Catch Context)', 'Notify Shape / Dead Letter Store'],
      settings.enableTryCatchBoundary),
    gate(10, 'Configure observability and the disabled schedule', ns,
      settings.deployInitialScheduleDisabled
        ? 'Define tracking variables and process reporting tags; ensure the initial deployment schedule is DISABLED.'
        : 'Define tracking variables and process reporting tags. Schedule guard is disabled.',
      ['Process Reporting Metadata', 'Dynamic Process Property Tracking', 'Deployment Schedule Guardrail'],
      settings.deployInitialScheduleDisabled),
    gate(11, 'Build reproducible fixtures and a test matrix', ns,
      `Prepare synthetic ${ctx.source?.details?.profileType || 'JSON'} documents: happy path, rule-rejected, missing fields, and timeout simulation.`,
      ['Test Fixture Catalog', 'Edge Case Test Payloads', 'Schema Validation Harness']),
    gate(12, 'Run development functional and failure path tests', ns,
      'Execute Test Mode runs on a dev Atom, verifying shape execution and document log counts.',
      ['Test Mode Execution Logs', 'Document Flow Audits', 'Shape Performance Metrics']),
    gate(13, 'Validate outbox, capacity, and recovery', ns,
      `Verify ${ctx.batchSize}-document batch commits, Atom heap use${settings.enforceIdempotentUpsert ? ', and zero duplicates on a second run' : ''}.`,
      [...(settings.enforceIdempotentUpsert ? ['Idempotency Verification Report'] : []), 'Atom JVM Telemetry', `${ctx.targetName} Audit Log`]),
    gate(14, 'Assemble evidence and operational handover', ns,
      'Compile component documentation, property catalog, error code guide and a support runbook.',
      ['Operational Runbook', 'Property Dictionary', 'Error Code Decoders']),
    gate(15, 'Obtain human release approval and prepare deployment instructions', ns,
      'Package components as a release candidate, prepare environment attachment instructions, and await human sign-off.',
      ['Packaged Component Spec', 'Environment Extension Profile', 'Human Release Sign-off Sheet']),
  ];
};

/**
 * Generates the master prompt for Boomi Companion from the blueprint.
 * The canvas sequence lists every stage in order and is authoritative; the
 * guardrail toggles only add the shapes they name when the canvas lacks them.
 * boomi_blueprint_engine.py mirrors this structure for the backend fallback.
 */
export const generateBoomiCompanionPrompt = (config: BlueprintConfig): string => {
  const ctx = buildContext(config);
  const { settings } = config;
  const { sourceName, targetName, businessRule } = ctx;
  const out: string[] = [];

  out.push(`Implement the following plan through inspection, clarification, approval-gated development, testing, and handover. Treat the plan as requirements, not evidence that any actions have occurred.

## Integration Blueprint (ID: ${config.blueprintId})
Build ONE Boomi process whose canvas contains these shapes, connected left to right in exactly this order:`);
  out.push(config.stages.map((s, i) => {
    const notes = s.notes?.trim() ? ` â€” ${s.notes.trim()}` : '';
    return `${i + 1}. "${s.label}" [${s.selectedShapeOrConnector}]${notes}`;
  }).join('\n'));
  out.push(`Use each quoted name as the shape label on the canvas.
- Entry: ${sourceName}.
- Final connector: ${ctx.target?.category === 'DESTINATION' ? targetName : 'none'}.
- Business rule: ${ctx.hasRule ? `"${businessRule}". Enforce correct type casting.` : 'none specified.'}
- Robustness: ${settings.enable3xExponentialRetry ? '3x retries with exponential backoff on transient network faults.' : 'No automatic retry is requested; surface transient failures through the error path.'}
- Reliability: handle retrieval, validation, transformation and execution-level failures.${settings.enableTryCatchBoundary ? ' Include safe progress tracking and recoverable replay.' : ''}${settings.enforceIdempotentUpsert && !ctx.isReadTarget ? ' Prevent duplicates.' : ''}
- Schedule: ${settings.deployInitialScheduleDisabled ? 'initial schedule must remain DISABLED upon deployment.' : 'confirm schedule settings with the engineer before deployment.'}
- Handover: authorized Boomi resources and sandbox/dev endpoints only.

## Mandatory operating rules and approval gates
1. Inspect first: review available Companion skills/tools, environment, permissions, existing assets, runtime capabilities, source documentation and connector schemas before designing or changing assets. Do not assume a skill or tool exists.
2. Keep scope minimal: inspect only what is needed to establish the authorized development scope. Stop if the runtime, endpoints or authorization cannot be confirmed. Never touch production resources.
3. Separate facts from assumptions: label findings as verified, proposed, unconfirmed/plan, or blocked. Never invent connector IDs, credentials, schemas, approvals or outcomes.
4. Obtain explicit human approval before creating or modifying platform assets. Stop at the design gate until the blueprint, field mappings, error paths and component names are confirmed.

---

## Expert Boomi Architecture Directives & Canvas Implementation Specifications
`);

  // 1. Topology: per-shape directives in canvas order
  const topo: string[] = ['### 1. Canvas Topology & Shape Sequencing'];
  topo.push('Create the shapes in the order of the Integration Blueprint list. Per shape:');
  config.stages.forEach((s, i) => {
    topo.push(`${i + 1}. **${s.label}** (${s.selectedShapeOrConnector})`);
    describeStage(s, businessRule).forEach(line => topo.push(`   - ${line}`));
  });
  const extras: string[] = [];
  if (settings.enableDocumentSplitCombine && !ctx.hasShape('Data Process (Split/Combine)')) {
    extras.push(`- **Document Splitting:** if the ${sourceName} payload is an array or batch envelope, add a Data Process shape ("Split Documents") right after the entry shape so one bad record cannot poison the batch.`);
  }
  if (settings.enableTryCatchBoundary && !ctx.hasShape('Try/Catch & Set Properties')) {
    extras.push(`- **Try/Catch:** wrap the processing shapes in a Try/Catch. Catch Errors = "All Errors"${settings.enable3xExponentialRetry ? ', Retry Count = 3' : ''}.`);
  }
  if (extras.length > 0) {
    topo.push('', '**Guardrail additions (not on the canvas list; add only these, and only if they fit):**', ...extras);
  }
  topo.push('', '- **Branch discipline:** Branch execution is strictly sequential; Branch 1 finishes all documents before Branch 2 starts.');
  topo.push(`- **Terminating shapes:** ${ctx.hasShape('Return Documents') ? 'the canvas ends with Return Documents.' : ctx.hasShape('Stop') ? 'the canvas ends with a Stop shape.' : ctx.isListener ? 'end with Return Documents for synchronous listeners, Stop for asynchronous branches.' : 'end with a Stop shape for batch flows.'}`);
  out.push(topo.join('\n'));

  // 2. Properties
  if (settings.separateDPPvsDDP) {
    out.push(`### 2. Strict Property Matrix (DPP vs DDP)
*Never use Dynamic Process Properties for document-level values: later documents overwrite earlier ones.*
- **DPP (execution scope only):** \`DPP_BatchRunId\`, \`DPP_ExecutionStartTime\`, \`DPP_TotalRecordsIngested\`, \`DPP_TargetEnvironment\`. Only create the ones the canvas needs.
- **DDP (per-document only):** \`DDP_RecordId\`${ctx.mentionsEmail ? ', `DDP_NormalizedEmail`' : ''}, \`DDP_ValidationStatus\`, \`DDP_ErrorMessage\`, \`DDP_RetryAttempt\`. Only create the ones the canvas needs.`);
  } else {
    out.push(`### 2. Properties
- Track \`RecordId\` and error context as Dynamic properties. Confirm scoping with the engineer before use.`);
  }

  // 3. Business rule
  if (ctx.hasRule || ctx.hasShape('Decision & Route Shapes') || ctx.hasShape('Business Rules & DPP Shape')) {
    out.push(`### 3. Business Rules & Decision Shape
- Enforce: ${ctx.hasRule ? `"${businessRule}"` : 'the rule described in the shape notes'}.
- Use a Decision shape for simple comparisons, or a Business Rules shape for multiple conditions.
- Accepted path continues; rejected path goes to a Notify shape and a Stop shape. Never throw a fatal exception for a rejected document.`);
  }

  // 4. Map
  if (ctx.hasShape('Map & transform')) {
    out.push(`### 4. Boomi Map Component
- **Source profile:** profile for the data entering the Map shape. **Target profile:** profile for what the next shape expects.
${ctx.mentionsEmail ? '- **Email normalization:** Standard Function -> String -> Lowercase from the source email field to the target email field.\n' : ''}- **Dates:** convert ISO-8601 timestamps to the target format using a Date Format function where dates are mapped.
- **Defaults:** set default values for required fields missing in the source.
- **Lookups:** use a Cross-Reference Table for code translations where applicable.`);
  }

  // 5. Connector operations
  if (config.stages.some(s => kindOf(s.selectedShapeOrConnector) === 'connector')) {
    const lines = [`### 5. Connector Operations`];
    lines.push('- Create a separate connection component and operation component for each connector shape; keep them in the dev folder.');
    lines.push(`- **Final connector (${targetName}):** Action \`${ctx.action}\`${ctx.isReadTarget ? '' : `, object \`${ctx.objectName}\` (confirm with the engineer)`}.`);
    if (!ctx.isReadTarget) {
      lines.push(settings.enforceIdempotentUpsert
        ? '- **Idempotency key:** an external ID field mapped from the source record key, so retries update rather than duplicate.'
        : '- Idempotency guard is not requested; call out any duplicate risk in the design review.');
      lines.push(`- **Batching:** commit by profile, batch count = ${ctx.batchSize} documents.`);
    }
    out.push(lines.join('\n'));
  }

  // 6. Errors
  if (settings.enableTryCatchBoundary) {
    out.push(`### 6. Unified Error Handling
In the **Catch branch**:
- Set Properties: \`DDP_ErrorMessage\` = Document Property \`Base - Try/Catch Message\`.
- Message shape: \`[Boomi Error] Process: PRC_${slug(sourceName)}_to_${slug(targetName)}_Sync | Record: '{1}' | Error: '{2}' | Timestamp: '{3}'\` with {1} = \`DDP_RecordId\`, {2} = \`DDP_ErrorMessage\`, {3} = current date/time.
- Notify shape: level "Error", User Log checked.
- Dead letter: route the document to a DLQ (disk folder, error bucket or Exception shape with Stop Execution = false).`);
  } else {
    out.push(`### 6. Error Handling
- Try/Catch boundary is not requested. Document the failure behavior of each shape in the design review.`);
  }

  // 7. Handover
  out.push(`### 7. Handover & Deployment Safety
- Deploy to a Dev/Sandbox Atom${settings.deployInitialScheduleDisabled ? ' with Schedule = **DISABLED**' : ''}.
- Provide 3 reproducible test cases: happy path, rule-rejected or empty result, and malformed input.
- Await human sign-off before activating any listener or scheduler.
`);

  return out.join('\n\n');
};

const randomDigits = (n: number): string =>
  Array.from({ length: n }, () => Math.floor(Math.random() * 10)).join('');

/** Empty canvas for "+ New": a Start and a Stop, with every guardrail off so the prompt matches the canvas. */
export const createBlankConfig = (): BlueprintConfig => ({
  blueprintId: `${randomDigits(2)}-${randomDigits(4)}-${randomDigits(3)}`,
  title: 'Untitled blueprint',
  stages: [
    { id: `stage-${Date.now()}-a`, stepNumber: 'STEP 01', category: 'SOURCE SYSTEM', label: 'Start', selectedShapeOrConnector: 'Start - No Data' },
    { id: `stage-${Date.now()}-b`, stepNumber: 'STEP 02', category: 'END SHAPE', label: 'End and continue', selectedShapeOrConnector: 'Stop' },
  ],
  businessRule: '',
  settings: {
    enableTryCatchBoundary: false,
    separateDPPvsDDP: false,
    enableDocumentSplitCombine: false,
    enforceIdempotentUpsert: false,
    enable3xExponentialRetry: false,
    deployInitialScheduleDisabled: true,
  },
});
