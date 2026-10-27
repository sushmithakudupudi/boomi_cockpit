import asyncio
from typing import Any, Dict, List
from fastapi import APIRouter, HTTPException

from ..services import failure_investigator
from ..services.boomi_service import boomi_service

router = APIRouter(prefix="/investigations", tags=["Failure Investigator"])

# Keep references so background investigations are not garbage-collected mid-run
_tasks: set = set()


@router.get("")
def list_investigations(limit: int = 20) -> List[Dict[str, Any]]:
    """Recent investigations, newest first."""
    return failure_investigator.list_recent(max(1, min(limit, 100)))


@router.get("/{execution_id}")
def get_investigation(execution_id: str) -> Dict[str, Any]:
    doc = failure_investigator.get(execution_id)
    if not doc:
        raise HTTPException(status_code=404, detail="No investigation for this execution yet.")
    return doc


@router.post("/{execution_id}/run")
async def run_investigation(execution_id: str, force: bool = False) -> Dict[str, Any]:
    """
    Starts an investigation in the background and returns at once; poll GET until status is done.
    The investigator only reads data. It never runs or changes anything in Boomi.
    """
    record = boomi_service.get_execution_by_id(execution_id)
    if not record:
        raise HTTPException(status_code=404, detail=f"Execution '{execution_id}' was not found.")
    if record.get("status") != "ERROR":
        raise HTTPException(status_code=400, detail="Only failed executions can be investigated.")

    existing = failure_investigator.get(execution_id)
    if existing and not force and existing.get("status") in ("running", "done"):
        return existing

    task = asyncio.create_task(failure_investigator.investigate_failure(record, force=force))
    _tasks.add(task)
    task.add_done_callback(_tasks.discard)
    return {"executionId": execution_id, "status": "running"}
