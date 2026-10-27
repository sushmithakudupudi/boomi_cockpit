from fastapi import APIRouter, Depends, HTTPException
from ..models.schemas import (
    ChatRequest,
    ChatResponse,
    TriageResponse,
    BuildProcessRequest,
    BuildProcessResponse,
    BuildBlueprintRequest,
    BuildBlueprintResponse,
    SavedBlueprint,
    GenerateBlueprintPromptRequest,
    GenerateBlueprintPromptResponse,
)
from ..services.companion_ai import companion_ai_service
from ..services.boomi_service import boomi_service
from . import auth as auth_routes
from .actions import APPROVER_ROLES

router = APIRouter(prefix="/companion", tags=["Boomi Companion AI"])

@router.post("/chat", response_model=ChatResponse)
async def chat_with_companion(req: ChatRequest):
    """
    Conversational AI interface powered by Boomi Companion.
    Provides natural language reasoning, error explanation, and remediation recommendations.
    """
    await boomi_service.ensure_synced()
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

@router.post("/build-blueprint", response_model=BuildBlueprintResponse)
async def build_blueprint_process(req: BuildBlueprintRequest, user=Depends(auth_routes.current_user)):
    """
    Creates a Boomi process whose shapes follow the Architecture Compiler canvas.
    With dryRun=true it only returns the shape plan and writes nothing to Boomi.
    """
    from ..services.boomi_process_builder import plan_shapes

    plan = plan_shapes(req.stages)
    shapes = [
        {"label": p["label"], "kind": p["kind"], "placeholder": p["placeholder"], "reason": p["reason"], "call": p.get("call", ""), "configure": p.get("configure", False)}
        for p in plan
    ]
    if req.dryRun:
        return BuildBlueprintResponse(dryRun=True, shapes=shapes)
    # Previewing is open to everyone signed in; creating components in Boomi needs an administrator or operator
    if user.role.name not in APPROVER_ROLES:
        raise HTTPException(status_code=403, detail="Only administrators and operators can create processes in Boomi.")
    try:
        result = await boomi_service.create_process_from_blueprint(
            name=req.processName,
            description=req.description or "",
            folder_id=req.folderId or "Rjo4ODQyMTg1",
            plan=plan,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    return BuildBlueprintResponse(dryRun=False, shapes=shapes, **result)

@router.get("/blueprints", response_model=list[SavedBlueprint])
async def list_blueprints():
    """Saved Architecture Compiler blueprints, most recently updated first."""
    from ..services import blueprint_store
    return blueprint_store.list_all()

@router.get("/blueprints/{blueprint_id}", response_model=SavedBlueprint)
async def get_blueprint(blueprint_id: str):
    from ..services import blueprint_store
    doc = blueprint_store.get(blueprint_id) if blueprint_store.valid_id(blueprint_id) else None
    if not doc:
        raise HTTPException(status_code=404, detail="Blueprint not found")
    return doc

@router.put("/blueprints/{blueprint_id}", response_model=SavedBlueprint)
async def save_blueprint(blueprint_id: str, req: SavedBlueprint):
    from ..services import blueprint_store
    if not blueprint_store.valid_id(blueprint_id):
        raise HTTPException(status_code=400, detail="Blueprint id may only contain letters, digits, - and _")
    return blueprint_store.put(blueprint_id, req.model_dump(exclude={"id", "updatedAt"}))

@router.delete("/blueprints/{blueprint_id}")
async def delete_blueprint(blueprint_id: str):
    from ..services import blueprint_store
    if not blueprint_store.valid_id(blueprint_id) or not blueprint_store.delete(blueprint_id):
        raise HTTPException(status_code=404, detail="Blueprint not found")
    return {"deleted": blueprint_id, "retentionDays": 30}

@router.post("/blueprints/{blueprint_id}/restore")
async def restore_blueprint(blueprint_id: str):
    from ..services import blueprint_store
    if not blueprint_store.valid_id(blueprint_id) or not blueprint_store.restore(blueprint_id):
        raise HTTPException(status_code=404, detail="Deleted blueprint not found")
    return {"restored": blueprint_id}

@router.post("/triage/{execution_id}", response_model=TriageResponse)
async def triage_execution(execution_id: str):
    """
    1-Click AI Root Cause & Payload Inspection.
    Decodes the raw failure stacktrace, maps it to the offending shape,
    and generates the automated correction patch using OpenAI + Boomi knowledge.
    """
    await boomi_service.ensure_synced()
    record = boomi_service.get_execution_by_id(execution_id)
    if not record:
        raise HTTPException(status_code=404, detail=f"Execution with ID '{execution_id}' was not found.")
    
    triage = await companion_ai_service.triage_execution_async(record)
    return triage

@router.post("/generate-spec", response_model=GenerateBlueprintPromptResponse)
async def generate_blueprint_spec(req: GenerateBlueprintPromptRequest):
    """
    Synthesizes an expert Boomi Companion prompt customized to the integration pipeline
    using OpenAI (gpt-4o-mini).
    """
    result = await companion_ai_service.generate_blueprint_prompt(
        blueprint_id=req.blueprintId,
        stages=req.stages,
        business_rule=req.businessRule or "",
        settings=req.settings
    )
    return GenerateBlueprintPromptResponse(**result)
