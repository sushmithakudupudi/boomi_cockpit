"""Saves Architecture Compiler blueprints to a JSON file so they survive page refreshes and restarts."""
import json
import os
import re
import tempfile
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

STORE_PATH = Path(__file__).resolve().parents[2] / "storage" / "blueprints.json"
_ID_RE = re.compile(r"^[A-Za-z0-9_-]{1,64}$")
_lock = threading.Lock()


def valid_id(blueprint_id: str) -> bool:
    return bool(_ID_RE.match(blueprint_id))


def _read() -> Dict[str, Dict[str, Any]]:
    if not STORE_PATH.exists():
        return {}
    try:
        return json.loads(STORE_PATH.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def _write(data: Dict[str, Dict[str, Any]]) -> None:
    STORE_PATH.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=STORE_PATH.parent, suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
        os.replace(tmp, STORE_PATH)  # atomic, so a crash never leaves a half-written file
    finally:
        if os.path.exists(tmp):
            os.remove(tmp)


def get(blueprint_id: str) -> Optional[Dict[str, Any]]:
    with _lock:
        return _read().get(blueprint_id)


def list_all() -> List[Dict[str, Any]]:
    with _lock:
        data = _read()
        now = datetime.now(timezone.utc)
        expired = [key for key, doc in data.items() if doc.get("deletedAt") and (now - _parse_date(doc["deletedAt"])).total_seconds() >= 30 * 86400]
        for key in expired:
            del data[key]
        if expired:
            _write(data)
        docs = list(data.values())
    return sorted(docs, key=lambda d: d.get("updatedAt", ""), reverse=True)


def _parse_date(value: str) -> datetime:
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except (ValueError, TypeError):
        return datetime.min.replace(tzinfo=timezone.utc)


def put(blueprint_id: str, doc: Dict[str, Any]) -> Dict[str, Any]:
    doc = {**doc, "id": blueprint_id, "updatedAt": datetime.now(timezone.utc).isoformat()}
    with _lock:
        data = _read()
        data[blueprint_id] = doc
        _write(data)
    return doc


def restore(blueprint_id: str) -> bool:
    with _lock:
        data = _read()
        doc = data.get(blueprint_id)
        if not doc or not doc.get("deletedAt"):
            return False
        doc.pop("deletedAt", None)
        doc["updatedAt"] = datetime.now(timezone.utc).isoformat()
        _write(data)
    return True


def delete(blueprint_id: str) -> bool:
    with _lock:
        data = _read()
        if blueprint_id not in data:
            return False
        data[blueprint_id]["deletedAt"] = datetime.now(timezone.utc).isoformat()
        _write(data)
    return True
