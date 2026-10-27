import datetime
from fastapi import APIRouter
from ..models.schemas import ResetResponse
from ..services.boomi_service import boomi_service

router = APIRouter(tags=["System & Controls"])

@router.post("/reset", response_model=ResetResponse)
def reset_demo_scenario():
    """
    Resets the entire Boomi Cockpit demo environment to its initial failure state,
    allowing judges and presenters to replay the self-healing workflow repeatedly.
    """
    boomi_service.reset()
    now_str = datetime.datetime.now(datetime.timezone.utc).isoformat()
    return ResetResponse(
        message="Demo environment reset to initial failure scenario. Active failure: SAP_to_Salesforce_Order_Sync (exec-8921).",
        timestamp=now_str,
        executionCount=len(boomi_service.get_executions())
    )

@router.post("/sync")
async def sync_boomi_platform():
    """
    Triggers an immediate synchronization with the Dell Boomi AtomSphere Platform API,
    fetching live Atoms and Execution Records.
    """
    synced = await boomi_service.sync_from_boomi_platform()
    return {
        "success": synced,
        "atomsCount": len(boomi_service.get_atoms()),
        "executionsCount": len(boomi_service.get_executions()),
        "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat()
    }

@router.get("/health")
def health_check():
    return {
        "status": "healthy",
        "service": "BoomiOps AI Backend Gateway",
        "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat()
    }
