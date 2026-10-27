from typing import Any, Dict, List
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from ..models.auth import User
from ..services import failure_investigator, incident_memory
from .actions import _approver

router = APIRouter(prefix="/incidents", tags=["Incident Memory"])


class ResolveRequest(BaseModel):
    note: str


@router.get("")
def list_incidents(limit: int = 50) -> List[Dict[str, Any]]:
    """Remembered incidents, newest first."""
    incident_memory.backfill(failure_investigator.list_recent(300))
    return incident_memory.list_incidents(max(1, min(limit, 200)))


@router.get("/{execution_id}")
def get_incident(execution_id: str) -> Dict[str, Any]:
    """One incident plus similar earlier ones, so the UI can show 'seen before'."""
    incident_memory.backfill(failure_investigator.list_recent(300))
    inc = incident_memory.get(execution_id)
    if not inc:
        raise HTTPException(status_code=404, detail="No remembered incident for this execution yet.")
    return {**inc, "similar": incident_memory.similar(execution_id, inc.get("processName"), inc.get("errorMessage"))}


@router.get("/{execution_id}/similar")
def similar_for_execution(execution_id: str, processName: str = "", errorMessage: str = "") -> List[Dict[str, Any]]:
    """Similar past incidents for a failure that may not have been investigated yet."""
    return incident_memory.similar(execution_id, processName or None, errorMessage or None)


@router.post("/{execution_id}/resolve")
def record_resolution(execution_id: str, body: ResolveRequest, user: User = Depends(_approver)) -> Dict[str, Any]:
    """Record, in your own words, what fixed this incident. It is remembered for next time."""
    note = body.note.strip()
    if not note:
        raise HTTPException(status_code=400, detail="Write what fixed it.")
    inc = incident_memory.add_resolution(execution_id, "note", note, user.email)
    if not inc:
        raise HTTPException(status_code=404, detail="This failure has no remembered incident yet. Investigate it first.")
    return inc
