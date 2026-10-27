from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException

from ..models.auth import User
from ..services import action_queue
from ..services.boomi_service import boomi_service
from ..services import component_restore, incident_memory
from . import auth as auth_routes

router = APIRouter(prefix="/actions", tags=["Agent Actions"])

# Viewers can read proposals, but only these roles may approve or run anything
APPROVER_ROLES = {"admin", "operator"}


def _approver(user: User = Depends(auth_routes.current_user)) -> User:
    if user.role.name not in APPROVER_ROLES:
        raise HTTPException(status_code=403, detail={"code": "forbidden", "message": "Only administrators and operators can approve actions."})
    return user


@router.get("")
def list_actions(status: Optional[str] = None, executionId: Optional[str] = None, limit: int = 50) -> List[Dict[str, Any]]:
    """Proposed actions, newest first. Pending ones are waiting for a human decision."""
    return action_queue.list_actions(status, executionId, max(1, min(limit, 200)))


@router.post("/{action_id}/approve")
async def approve_action(action_id: str, user: User = Depends(_approver)) -> Dict[str, Any]:
    """Approving a proposal runs it now, using the same guarded code as the manual buttons."""
    action = action_queue.get(action_id)
    if not action:
        raise HTTPException(status_code=404, detail="Action not found.")
    if action["status"] != "pending":
        raise HTTPException(status_code=409, detail=f"This action is already {action['status']}.")

    action_queue.decide(action_id, new_status="approved", decided_by=user.email)
    try:
        if action["type"] == "rerun_process":
            result = await boomi_service.rerun_process(action["processId"], action.get("atomName"))
        elif action["type"] == "restore_revision":
            p = action.get("params") or {}
            result = await component_restore.restore_revision(action["processId"], int(p["targetVersion"]), int(p["expectedCurrentVersion"]))
        else:  # not reachable for queued items, but never run an unknown type
            raise RuntimeError(f"Unknown action type {action['type']}.")
    except (RuntimeError, ValueError, KeyError, TypeError) as e:
        return action_queue.decide(action_id, new_status="failed", decided_by=user.email, message=str(e))
    if action["type"] == "restore_revision":
        fixed = f"Restored {action['processName']} to revision {(action.get('params') or {}).get('targetVersion')} (saved as revision {result.get('newVersion')})."
    else:
        fixed = f"Re-ran {action['processName']}."
    incident_memory.add_resolution(action["executionId"], "action", fixed, user.email)
    return action_queue.decide(action_id, new_status="executed", decided_by=user.email, message=result.get("message", "Started."), result=result)


@router.post("/{action_id}/reject")
def reject_action(action_id: str, user: User = Depends(_approver)) -> Dict[str, Any]:
    action = action_queue.get(action_id)
    if not action:
        raise HTTPException(status_code=404, detail="Action not found.")
    if action["status"] != "pending":
        raise HTTPException(status_code=409, detail=f"This action is already {action['status']}.")
    return action_queue.decide(action_id, new_status="rejected", decided_by=user.email, message="Dismissed.")
