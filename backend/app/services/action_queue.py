"""Approval queue for actions proposed by the AI agent.

The agent never executes anything. It can only add a *proposal* here. A signed-in admin or operator
approves or dismisses it, and only an approval runs the action, through the same guarded code the
manual buttons use. Every proposal keeps who decided, when, and what happened.
"""
import datetime
import json
import logging
import os
import secrets
import tempfile
import threading
from pathlib import Path
from typing import Any, Dict, List, Optional

logger = logging.getLogger("action_queue")

STORAGE = Path(__file__).resolve().parents[2] / "storage"
STORE = STORAGE / "actions.json"

# The only actions an agent may propose. Anything else is rejected, whatever the model says.
ALLOWED_TYPES = {"rerun_process", "restore_revision"}
EXPIRY_HOURS = 24
_lock = threading.Lock()


def _now() -> str:
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def _read() -> Dict[str, Dict[str, Any]]:
    try:
        return json.loads(STORE.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def _write(data: Dict[str, Dict[str, Any]]) -> None:
    STORAGE.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=STORAGE, suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
        os.replace(tmp, STORE)
    finally:
        if os.path.exists(tmp):
            os.remove(tmp)


def _expire(data: Dict[str, Dict[str, Any]]) -> bool:
    """Pending proposals older than EXPIRY_HOURS expire: a diagnosis from yesterday is not a reason to run something today."""
    changed = False
    cutoff = (datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(hours=EXPIRY_HOURS)).isoformat()
    for a in data.values():
        if a.get("status") == "pending" and a.get("createdAt", "") < cutoff:
            a["status"], a["decidedAt"], a["decidedBy"], a["message"] = "expired", _now(), "system", "Expired before anyone decided."
            changed = True
    return changed


def propose(action_type: str, *, execution_id: str, process_id: str, process_name: str, atom_name: Optional[str],
            rationale: str, proposed_by: str = "failure-investigator", params: Optional[Dict[str, Any]] = None) -> Optional[Dict[str, Any]]:
    """Adds a pending proposal. Returns None if the type is not allowed or an identical one is already waiting."""
    if action_type not in ALLOWED_TYPES or not process_id:
        return None
    with _lock:
        data = _read()
        _expire(data)
        if any(a["type"] == action_type and a["processId"] == process_id and a["status"] == "pending" for a in data.values()):
            _write(data)
            return None
        action = {
            "id": "act-" + secrets.token_hex(5), "type": action_type, "status": "pending", "createdAt": _now(),
            "proposedBy": proposed_by, "executionId": execution_id, "processId": process_id, "processName": process_name,
            "atomName": atom_name, "rationale": rationale[:400], "params": params or {},
        }
        data[action["id"]] = action
        _write(data)
    logger.info("Proposed %s for %s (%s)", action_type, process_name, action["id"])
    return action


def get(action_id: str) -> Optional[Dict[str, Any]]:
    with _lock:
        data = _read()
        if _expire(data):
            _write(data)
        return data.get(action_id)


def list_actions(status: Optional[str] = None, execution_id: Optional[str] = None, limit: int = 50) -> List[Dict[str, Any]]:
    with _lock:
        data = _read()
        if _expire(data):
            _write(data)
        items = list(data.values())
    if status:
        items = [a for a in items if a["status"] == status]
    if execution_id:
        items = [a for a in items if a["executionId"] == execution_id]
    return sorted(items, key=lambda a: a["createdAt"], reverse=True)[:limit]


def decide(action_id: str, *, new_status: str, decided_by: str, message: str = "", result: Optional[Dict[str, Any]] = None) -> Optional[Dict[str, Any]]:
    """Records a decision or outcome. Only a pending proposal can be approved or rejected."""
    with _lock:
        data = _read()
        a = data.get(action_id)
        if not a:
            return None
        if new_status in ("approved", "rejected") and a["status"] != "pending":
            return a  # already decided: never decide twice
        a["status"] = new_status
        if new_status in ("approved", "rejected"):
            a["decidedAt"], a["decidedBy"] = _now(), decided_by
        else:
            a["finishedAt"] = _now()
        if message:
            a["message"] = message[:400]
        if result is not None:
            a["result"] = result
        _write(data)
    return a
