from fastapi import APIRouter, HTTPException
from ..models.schemas import (
    ChatRequest,
    ChatResponse,
    TriageResponse,
    BuildProcessRequest,
    BuildProcessResponse,
)
from ..services.companion_ai import companion_ai_service
from ..services.boomi_service import boomi_service

router = APIRouter(prefix="/companion", tags=["Boomi Companion AI"])

@router.post("/chat", response_model=ChatResponse)
async def chat_with_companion(req: ChatRequest):
    """
    Conversational AI interface powered by Boomi Companion.
    Provides natural language reasoning, error explanation, and remediation recommendations.
    """
    message = await companion_ai_service.chat(
        prompt=req.prompt,
        execution_id=req.executionId,
        context=req.context
    )
    return ChatResponse(message=message)

@router.post("/build-process", response_model=BuildProcessResponse)
async def build_boomi_process(req: BuildProcessRequest):
    """
    Programmatically creates a real Process component in Dell Boomi AtomSphere
    via Boomi Component REST API upon user approval ('Proceed').
    """
    try:
        result = await boomi_service.create_process_component(
            name=req.processName,
            description=req.description or "Autonomous Boomi Companion Process Creation",
            folder_id=req.folderId or "Rjo4ODQyMTg1"
        )
        return BuildProcessResponse(**result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/triage/{execution_id}", response_model=TriageResponse)
async def triage_execution(execution_id: str):
    """
    1-Click AI Root Cause & Payload Inspection.
    Decodes the raw failure stacktrace, maps it to the offending shape,
    and generates the automated correction patch using OpenAI + Boomi knowledge.
    """
    record = boomi_service.get_execution_by_id(execution_id)
    if not record:
        raise HTTPException(status_code=404, detail=f"Execution with ID '{execution_id}' was not found.")
    
    triage = await companion_ai_service.triage_execution_async(record)
    return triage
