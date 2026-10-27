"""Incident memory: what failed, what the investigator concluded, and what fixed it.

Each finished investigation is saved as an incident. Resolutions are added from approved agent actions or a
person's note, and recovery is detected when the process later runs successfully. When a similar failure
happens again, the investigator and the chat can recall the earlier incident and how it ended.

Memory is a hint, never proof: a past cause is shown as context and the current evidence still decides.
"""
import datetime
import json
import logging
import os
import re
import tempfile
import threading
from pathlib import Path
from typing import Any, Dict, List, Optional

logger = logging.getLogger("incident_memory")

STORAGE = Path(__file__).resolve().parents[2] / "storage"
STORE = STORAGE / "incidents.json"
MAX_RECORDS = 500
RECOVERY_WINDOW_DAYS = 7

_lock = threading.Lock()
_UUID = re.compile(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}", re.I)
_HEX = re.compile(r"\b[0-9a-f]{12,}\b", re.I)
_TIME = re.compile(r"\d{4}-\d{2}-\d{2}[t ]\d{2}:\d{2}(:\d{2})?(\.\d+)?z?", re.I)
_NUM = re.compile(r"\d+")


def _now() -> str:
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def fingerprint(message: Optional[str]) -> str:
    """A stable signature of an error message: ids, times and numbers removed, so the same error matches across runs."""
    t = (message or "").lower()
    t = _UUID.sub("<id>", t)
    t = _TIME.sub("<time>", t)
    t = _HEX.sub("<id>", t)
    t = _NUM.sub("#", t)
    return re.sub(r"\s+", " ", t).strip()[:140]


# ---- storage ---------------------------------------------------------------------------

def _read() -> Dict[str, Dict[str, Any]]:
    try:
        return json.loads(STORE.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def _write(data: Dict[str, Dict[str, Any]]) -> None:
    STORAGE.mkdir(parents=True, exist_ok=True)
    if len(data) > MAX_RECORDS:  # drop the oldest
        for k in sorted(data, key=lambda k: data[k].get("createdAt", ""))[: len(data) - MAX_RECORDS]:
            del data[k]
    fd, tmp = tempfile.mkstemp(dir=STORAGE, suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
        os.replace(tmp, STORE)
    finally:
        if os.path.exists(tmp):
            os.remove(tmp)


def get(execution_id: str) -> Optional[Dict[str, Any]]:
    with _lock:
        return _read().get(execution_id)


def list_incidents(limit: int = 50) -> List[Dict[str, Any]]:
    with _lock:
        items = list(_read().values())
    return sorted(items, key=lambda i: i.get("createdAt", ""), reverse=True)[:limit]


# ---- writing ---------------------------------------------------------------------------

def record(execution: Dict[str, Any], diagnosis: Dict[str, Any], facts: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """Saves (or refreshes) the incident for one failed execution. Keeps any resolution already recorded."""
    exec_id = execution["executionId"]
    facts = facts or {}
    with _lock:
        data = _read()
        old = data.get(exec_id, {})
        data[exec_id] = {
            "executionId": exec_id,
            "processName": execution.get("processName"),
            "processId": execution.get("processId"),
            "errorMessage": (execution.get("errorMessage") or "")[:300],
            "fingerprint": fingerprint(execution.get("errorMessage")),
            "failedAt": execution.get("startedAt"),
            "createdAt": old.get("createdAt") or _now(),
            "summary": diagnosis.get("summary", ""),
            "failureKind": diagnosis.get("failureKind", "unknown"),
            "likelyCause": diagnosis.get("likelyCause", ""),
            "confidence": diagnosis.get("confidence", "low"),
            "suspectChanges": (facts.get("suspectRevisionChanges") or old.get("suspectChanges") or [])[:6],
            "resolutions": old.get("resolutions", []),
            "recoveredAt": old.get("recoveredAt"),
        }
        _write(data)
        return data[exec_id]


def add_resolution(execution_id: str, kind: str, text: str, by: str) -> Optional[Dict[str, Any]]:
    """Adds 'what fixed it'. kind is 'action' (an approved agent action) or 'note' (a person's own words)."""
    with _lock:
        data = _read()
        inc = data.get(execution_id)
        if not inc:
            return None
        inc.setdefault("resolutions", []).append({"kind": kind, "text": text.strip()[:500], "by": by, "at": _now()})
        _write(data)
        return inc


def mark_recovered(execution_id: str, when: str) -> None:
    with _lock:
        data = _read()
        if execution_id in data and not data[execution_id].get("recoveredAt"):
            data[execution_id]["recoveredAt"] = when
            _write(data)


def open_incidents(max_age_days: int = RECOVERY_WINDOW_DAYS, limit: int = 5) -> List[Dict[str, Any]]:
    """Incidents not yet seen to recover, recent enough to watch."""
    cutoff = (datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(days=max_age_days)).isoformat()
    with _lock:
        items = [i for i in _read().values() if not i.get("recoveredAt") and i.get("createdAt", "") >= cutoff]
    return sorted(items, key=lambda i: i.get("createdAt", ""))[:limit]


# ---- recall ----------------------------------------------------------------------------

def similar(execution_id: Optional[str], process_name: Optional[str], error_message: Optional[str], limit: int = 3) -> List[Dict[str, Any]]:
    """Past incidents ranked by match: the same error signature counts most, then the same process, then recency."""
    fp = fingerprint(error_message)
    scored = []
    for inc in list_incidents(MAX_RECORDS):
        if inc["executionId"] == execution_id:
            continue
        score = (2 if fp and inc.get("fingerprint") == fp else 0) + (1 if process_name and inc.get("processName") == process_name else 0)
        if score:
            scored.append((score, inc.get("createdAt", ""), inc))
    scored.sort(key=lambda t: (t[0], t[1]), reverse=True)
    return [brief(i) for _, _, i in scored[:limit]]


def brief(inc: Dict[str, Any]) -> Dict[str, Any]:
    """A compact view for the investigator, the chat and the UI."""
    res = inc.get("resolutions") or []
    return {
        "executionId": inc["executionId"], "processName": inc.get("processName"), "failedAt": inc.get("failedAt"),
        "kind": inc.get("failureKind"), "likelyCause": (inc.get("likelyCause") or "")[:240], "confidence": inc.get("confidence"),
        "whatFixedIt": [r["text"] for r in res][:3] or None,
        "resolvedBy": [r["by"] for r in res][:3] or None,
        "recoveredAt": inc.get("recoveredAt"),
        "outcome": ("fixed and recovered" if res and inc.get("recoveredAt") else
                    "recovered, no fix recorded" if inc.get("recoveredAt") else
                    "fix recorded, no recovery seen yet" if res else "no resolution recorded"),
    }


def backfill(investigations: List[Dict[str, Any]]) -> int:
    """Brings in finished investigations made before memory existed."""
    added = 0
    for inv in investigations:
        if inv.get("status") == "done" and inv.get("diagnosis") and inv.get("execution") and not get(inv["executionId"]):
            record(inv["execution"], inv["diagnosis"])
            added += 1
    return added


async def check_recoveries() -> int:
    """Marks open incidents as recovered when their process has run without error since the failure."""
    from .boomi_account_tools import boomi_account_tools

    recovered = 0
    for inc in open_incidents():
        try:
            recs = await boomi_account_tools._query("ExecutionRecord", [
                {"argument": [inc["processName"]], "operator": "EQUALS", "property": "processName"},
            ])
        except Exception as e:
            logger.warning(f"Recovery check for {inc.get('processName')} failed: {e}")
            continue
        recs.sort(key=lambda r: r.get("executionTime", ""), reverse=True)
        latest = recs[0] if recs else None
        if latest and latest.get("status") not in ("ERROR", "INPROCESS", None) and (latest.get("executionTime") or "") > (inc.get("failedAt") or ""):
            mark_recovered(inc["executionId"], latest["executionTime"])
            recovered += 1
    return recovered
