import type { Node, Edge } from '@xyflow/react';
import type { ExecutionRecord, AtomHealth, BoomiNodeData } from '../types/boomi';

export const mockAtoms: AtomHealth[] = [
  {
    id: 'atom-01',
    name: 'US-East-Prod-Molecule-01',
    type: 'Molecule',
    status: 'ONLINE',
    version: '24.10.1',
    heapUsagePercent: 64,
    activeExecutions: 14,
    queuedExecutions: 2,
  },
  {
    id: 'atom-02',
    name: 'EU-Central-Cloud-Atom',
    type: 'Cloud',
    status: 'ONLINE',
    version: '24.10.1',
    heapUsagePercent: 41,
    activeExecutions: 5,
    queuedExecutions: 0,
  },
  {
    id: 'atom-03',
    name: 'APAC-Staging-Atom-01',
    type: 'Local Atom',
    status: 'ONLINE',
    version: '24.09.4',
    heapUsagePercent: 28,
    activeExecutions: 1,
    queuedExecutions: 0,
  },
];

export const mockExecutions: ExecutionRecord[] = [
  {
    id: 'exec-8921',
    processId: 'proc-sap-sfdc-001',
    processName: 'SAP_to_Salesforce_Order_Sync',
    atomName: 'US-East-Prod-Molecule-01',
    environment: 'Production',
    status: 'ERROR',
    startedAt: '2026-10-21T15:28:10Z',
    durationMs: 3420,
    inboundDocs: 1,
    outboundDocs: 0,
    errorMessage: 'Severe Error at Map [SAP ORDERS05 to SFDC Order]: java.lang.IllegalArgumentException: Field [BillingPostalCode] format invalid. Expected 5 digits, received "9401" (4 digits). Schema constraint violation.',
    errorShapeName: 'Boomi Map: SAP ORDERS05 to SFDC Order',
    errorShapeType: 'Map',
    payload: {
      documentId: 'DOC-SAP-98124',
      sizeBytes: 4210,
      format: 'JSON',
      rawContent: JSON.stringify({
        sapOrderId: "SAP-9988102",
        orderDate: "2026-10-21",
        customer: {
          sapCustomerId: "CUST-009182",
          companyName: "Acme Logistics Corp",
          taxId: "US-99128312",
          billingAddress: {
            street: "450 Mission Street, Suite 1200",
            city: "San Francisco",
            state: "CA",
            postalCode: "9401",
            country: "USA"
          }
        },
        items: [
          { sku: "SER-ENTERPRISE-NODE", qty: 2, unitPrice: 12500.00 },
          { sku: "SUPP-24-7-SLA", qty: 1, unitPrice: 4200.00 }
        ],
        totalAmount: 29200.00,
        currency: "USD"
      }, null, 2),
      fixedContent: JSON.stringify({
        sapOrderId: "SAP-9988102",
        orderDate: "2026-10-21",
        customer: {
          sapCustomerId: "CUST-009182",
          companyName: "Acme Logistics Corp",
          taxId: "US-99128312",
          billingAddress: {
            street: "450 Mission Street, Suite 1200",
            city: "San Francisco",
            state: "CA",
            postalCode: "09401",
            country: "USA"
          }
        },
        items: [
          { sku: "SER-ENTERPRISE-NODE", qty: 2, unitPrice: 12500.00 },
          { sku: "SUPP-24-7-SLA", qty: 1, unitPrice: 4200.00 }
        ],
        totalAmount: 29200.00,
        currency: "USD"
      }, null, 2),
      diffSummary: 'Changed billingAddress.postalCode from "9401" to "09401" (5-digit format compliant).'
    },
    companionAnalysis: {
      rootCause: 'Data quality defect in SAP source payload. The zip code "9401" was truncated by a leading zero during upstream SAP IDoc extraction, causing Salesforce schema validation in the Boomi Map shape to fail.',
      impactSeverity: 'CRITICAL',
      suggestedAction: 'Apply Boomi Companion Auto-Heal: Prepend leading zero to "09401" and re-inject document into the Map shape via Boomi AtomSphere API.',
      autoHealAvailable: true,
      confidenceScore: 98.7,
      blastRadiusCount: 3
    }
  },
  {
    id: 'exec-8920',
    processId: 'proc-workday-snow-002',
    processName: 'Workday_to_ServiceNow_User_Provisioning',
    atomName: 'US-East-Prod-Molecule-01',
    environment: 'Production',
    status: 'SUCCESS',
    startedAt: '2026-10-21T15:25:00Z',
    durationMs: 1840,
    inboundDocs: 15,
    outboundDocs: 15,
  },
  {
    id: 'exec-8919',
    processId: 'proc-edi-850-003',
    processName: 'EDI_850_Inbound_Purchase_Orders',
    atomName: 'US-East-Prod-Molecule-01',
    environment: 'Production',
    status: 'ERROR',
    startedAt: '2026-10-21T15:20:14Z',
    durationMs: 820,
    inboundDocs: 1,
    outboundDocs: 0,
    errorMessage: 'EDI Profile parsing failed at Segment [ISA06]: Sender ID qualifier is empty or malformed.',
    errorShapeName: 'Boomi Trading Partner / EDI Splitter',
    errorShapeType: 'Trading Partner',
    payload: {
      documentId: 'DOC-EDI-77192',
      sizeBytes: 1240,
      format: 'EDI',
      rawContent: `ISA*00*          *00*          *ZZ*               *01*003829102      *261021*1520*U*00401*000008912*0*P*>~
GS*PO*SENDER*003829102*20261021*1520*8912*X*004010~
ST*850*0001~
BEG*00*NE*PO-2026-8819**20261021~
N1*ST*ACME FULFILLMENT*92*0019~
PO1*1*100*EA*24.50**VN*PROD-A109~
CTT*1~
SE*7*0001~
GE*1*8912~
IEA*1*000008912~`,
      fixedContent: `ISA*00*          *00*          *ZZ*PARTNER99      *01*003829102      *261021*1520*U*00401*000008912*0*P*>~
GS*PO*PARTNER99*003829102*20261021*1520*8912*X*004010~
ST*850*0001~
BEG*00*NE*PO-2026-8819**20261021~
N1*ST*ACME FULFILLMENT*92*0019~
PO1*1*100*EA*24.50**VN*PROD-A109~
CTT*1~
SE*7*0001~
GE*1*8912~
IEA*1*000008912~`,
      diffSummary: 'Populated missing ISA06 Sender ID with partner qualifier "PARTNER99".'
    },
    companionAnalysis: {
      rootCause: 'Inbound EDI trading partner interchange envelope (ISA segment) contains blank spaces where ISA06 Sender Identifier is required.',
      impactSeverity: 'HIGH',
      suggestedAction: 'Inject fallback Partner identifier "PARTNER99" configured in Boomi Cross-Reference Table [CRT_EDI_ROUTING].',
      autoHealAvailable: true,
      confidenceScore: 94.2,
      blastRadiusCount: 1
    }
  },
  {
    id: 'exec-8918',
    processId: 'proc-netsuite-snow-004',
    processName: 'NetSuite_to_Snowflake_Financial_ETL',
    atomName: 'EU-Central-Cloud-Atom',
    environment: 'Production',
    status: 'WARNING',
    startedAt: '2026-10-21T15:15:30Z',
    durationMs: 9420,
    inboundDocs: 1200,
    outboundDocs: 1200,
    errorMessage: 'Connector Rate Limit Alert: NetSuite SuiteTalk API responded with HTTP 429. Boomi retry schedule throttled for 12 seconds.',
    errorShapeName: 'NetSuite Web Services Connector',
    errorShapeType: 'Connector',
  },
  {
    id: 'exec-8917',
    processId: 'proc-coupa-oracle-005',
    processName: 'Coupa_to_OracleERP_Invoice_Payment',
    atomName: 'US-East-Prod-Molecule-01',
    environment: 'Production',
    status: 'SUCCESS',
    startedAt: '2026-10-21T15:10:00Z',
    durationMs: 2150,
    inboundDocs: 4,
    outboundDocs: 4,
  },
  {
    id: 'exec-8916',
    processId: 'proc-kafka-iot-006',
    processName: 'Kafka_IoT_Telemetry_Ingestion',
    atomName: 'US-East-Prod-Molecule-01',
    environment: 'Production',
    status: 'IN_PROGRESS',
    startedAt: '2026-10-21T15:33:02Z',
    durationMs: 1420,
    inboundDocs: 450,
    outboundDocs: 450,
  },
  {
    id: 'exec-8915',
    processId: 'proc-shopify-order-007',
    processName: 'Shopify_Order_Webhook_Listener',
    atomName: 'EU-Central-Cloud-Atom',
    environment: 'Production',
    status: 'SUCCESS',
    startedAt: '2026-10-21T15:05:00Z',
    durationMs: 490,
    inboundDocs: 1,
    outboundDocs: 1,
  },
];

export const initialProcessNodes: Node<BoomiNodeData>[] = [
  {
    id: 'node-start',
    type: 'boomiShape',
    position: { x: 50, y: 150 },
    data: {
      title: 'SAP JCo IDoc Listener',
      subtitle: 'Start Shape (Inbound)',
      type: 'start',
      status: 'success',
      icon: 'Radio',
      system: 'SAP ERP',
      docsIn: 1,
      docsOut: 1,
      details: 'Received IDoc ORDERS05 #9988102 from SAP Gateway'
    }
  },
  {
    id: 'node-split',
    type: 'boomiShape',
    position: { x: 300, y: 150 },
    data: {
      title: 'Data Process: Split IDocs',
      subtitle: 'Data Process Shape',
      type: 'dataprocess',
      status: 'success',
      icon: 'Scissors',
      system: 'Boomi Engine',
      docsIn: 1,
      docsOut: 1,
      details: 'Split XML documents by segment /ORDERS05/IDOC/E1EDK01'
    }
  },
  {
    id: 'node-rules',
    type: 'boomiShape',
    position: { x: 550, y: 150 },
    data: {
      title: 'Business Rules: Validate Order',
      subtitle: 'Business Rules Shape',
      type: 'businessrules',
      status: 'success',
      icon: 'ShieldCheck',
      system: 'Boomi Engine',
      docsIn: 1,
      docsOut: 1,
      details: 'Passed: Customer credit limit > $0 and Tax ID verified'
    }
  },
  {
    id: 'node-map',
    type: 'boomiShape',
    position: { x: 800, y: 150 },
    data: {
      title: 'Map: ORDERS05 to SFDC Order',
      subtitle: 'Boomi Map Component',
      type: 'map',
      status: 'error',
      isErrorPoint: true,
      icon: 'Shuffle',
      system: 'Boomi Map',
      docsIn: 1,
      docsOut: 0,
      errorMessage: 'Invalid PostalCode length: "9401" requires 5 digits',
      details: 'Transformation failed during JSON profile generation'
    }
  },
  {
    id: 'node-connector',
    type: 'boomiShape',
    position: { x: 1080, y: 80 },
    data: {
      title: 'Salesforce REST Connector',
      subtitle: 'Connector Shape (Outbound)',
      type: 'connector',
      status: 'idle',
      icon: 'CloudUpload',
      system: 'Salesforce CRM',
      docsIn: 0,
      docsOut: 0,
      details: 'Action: UPSERT SObject: Order / LineItems'
    }
  },
  {
    id: 'node-exception',
    type: 'boomiShape',
    position: { x: 1080, y: 240 },
    data: {
      title: 'Exception Catch & Alert',
      subtitle: 'Exception Shape',
      type: 'exception',
      status: 'error',
      icon: 'AlertTriangle',
      system: 'Boomi Error Queue',
      docsIn: 1,
      docsOut: 1,
      details: 'Routing failed document to BoomiOps Triage Queue'
    }
  }
];

export const initialProcessEdges: Edge[] = [
  { id: 'e1-2', source: 'node-start', target: 'node-split', animated: true, style: { stroke: '#00B2FE' } },
  { id: 'e2-3', source: 'node-split', target: 'node-rules', animated: true, style: { stroke: '#00B2FE' } },
  { id: 'e3-4', source: 'node-rules', target: 'node-map', animated: true, style: { stroke: '#00B2FE' } },
  { id: 'e4-5', source: 'node-map', target: 'node-connector', animated: false, style: { stroke: '#475569', strokeDasharray: '4 4' } },
  { id: 'e4-6', source: 'node-map', target: 'node-exception', animated: true, style: { stroke: '#EF4444' } },
];
