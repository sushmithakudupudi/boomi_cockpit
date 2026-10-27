from typing import List, Optional, Dict, Any, Literal
from pydantic import BaseModel, Field

# Core Status & Formats
ExecutionStatus = Literal['SUCCESS', 'ERROR', 'WARNING', 'IN_PROGRESS']
PayloadFormat = Literal['JSON', 'XML', 'EDI', 'CSV']
EnvironmentType = str
SeverityType = Literal['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']
ActionType = Literal['REPROCESS', 'VIEW_FLOW', 'INSPECT_PAYLOAD', 'EXPORT_DOCS', 'BUILD_PROCESS']
AtomStatus = Literal['ONLINE', 'DEGRADED', 'OFFLINE']
AtomType = Literal['Molecule', 'Cloud', 'Local Atom']

class DocumentPayload(BaseModel):
    documentId: str
    sizeBytes: int
    format: PayloadFormat
    rawContent: str
    fixedContent: Optional[str] = None
    diffSummary: Optional[str] = None

class CompanionAnalysis(BaseModel):
    rootCause: str
    impactSeverity: SeverityType
    suggestedAction: str
    autoHealAvailable: bool
    confidenceScore: float
    blastRadiusCount: int

class ExecutionRecord(BaseModel):
    id: str
    processId: str
    processName: str
    atomName: str
    environment: EnvironmentType
    status: ExecutionStatus
    startedAt: str
    durationMs: int
    inboundDocs: int
    outboundDocs: int
    errorMessage: Optional[str] = None
    errorShapeName: Optional[str] = None
    errorShapeType: Optional[str] = None
    payload: Optional[DocumentPayload] = None
    companionAnalysis: Optional[CompanionAnalysis] = None
    reprocessed: Optional[bool] = False

class SuggestedAction(BaseModel):
    type: ActionType
    label: str
    executionId: Optional[str] = None
    data: Optional[Dict[str, Any]] = None

class CodeBlock(BaseModel):
    language: str
    code: str

class CompanionMessage(BaseModel):
    id: str
    sender: Literal['user', 'companion']
    text: str
    timestamp: str
    suggestedAction: Optional[SuggestedAction] = None
    codeBlock: Optional[CodeBlock] = None

class ChatRequest(BaseModel):
    prompt: str
    executionId: Optional[str] = None
    context: Optional[Dict[str, Any]] = None

class ChatResponse(BaseModel):
    message: CompanionMessage

class TriageResponse(BaseModel):
    executionId: str
    processName: str
    status: ExecutionStatus
    decodedError: str
    rootCause: str
    impactSeverity: SeverityType
    confidenceScore: float
    blastRadiusCount: int
    suggestedAction: SuggestedAction
    payload: Optional[DocumentPayload] = None

class ReprocessRequest(BaseModel):
    executionId: str
    patchedPayload: Optional[str] = None
    customOverrides: Optional[Dict[str, Any]] = None

class ReprocessResponse(BaseModel):
    success: bool
    executionId: str
    status: ExecutionStatus
    message: str
    reprocessTimestamp: str
    updatedExecution: ExecutionRecord

class BuildProcessRequest(BaseModel):
    processName: str
    description: Optional[str] = "Autonomous Boomi Companion Process Creation"
    folderId: Optional[str] = "Rjo4ODQyMTg1"

class BuildProcessResponse(BaseModel):
    success: bool
    componentId: str
    name: str
    folder: str
    message: str

class AtomHealth(BaseModel):
    id: str
    name: str
    type: AtomType
    status: AtomStatus
    version: str
    heapUsagePercent: float
    activeExecutions: int
    queuedExecutions: int

class StatsOverviewResponse(BaseModel):
    totalExecutions: int
    successCount: int
    failedCount: int
    autoHealedCount: int
    warningCount: int
    inProgressCount: int
    successRatePercent: float
    avgLatencyMs: float
    estimatedMttrReductionMinutes: float

class TopologyNode(BaseModel):
    id: str
    type: str = "boomiShape"
    position: Dict[str, float]
    data: Dict[str, Any]

class TopologyEdge(BaseModel):
    id: str
    source: str
    target: str
    animated: bool = False
    style: Optional[Dict[str, Any]] = None

class TopologyResponse(BaseModel):
    processId: str
    processName: str
    nodes: List[TopologyNode]
    edges: List[TopologyEdge]

class ResetResponse(BaseModel):
    message: str
    timestamp: str
    executionCount: int
