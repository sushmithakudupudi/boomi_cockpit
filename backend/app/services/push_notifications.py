"""Browser push notifications for new Boomi failures, delivered even when the page is closed.

A background task polls Boomi for new failed executions and sends a Web Push message to every
subscribed browser. The browser's service worker shows it, so the page does not need to be open
(the browser itself must be running).

Keys and subscriptions live in backend/storage (git-ignored).
"""
import asyncio
import base64
import datetime
import json
import logging
import os
import tempfile
from pathlib import Path
from typing import Any, Dict, List

from cryptography.hazmat.primitives import serialization

from .boomi_account_tools import boomi_account_tools

logger = logging.getLogger("push_notifications")

STORAGE = Path(__file__).resolve().parents[2] / "storage"
VAPID_KEY = STORAGE / "vapid_private.pem"
SUBSCRIPTIONS = STORAGE / "push_subscriptions.json"
STATE = STORAGE / "notify_state.json"

# VAPID 'sub' is shown to the push service; a neutral contact avoids sending a personal address
VAPID_CLAIMS_SUB = "mailto:boomiops@example.com"
POLL_SECONDS = 60
GROUP_THRESHOLD = 3  # more new failures than this in one poll become a single notification


def _read_json(path: Path, default: Any) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return default


def _write_json(path: Path, data: Any) -> None:
    STORAGE.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=STORAGE, suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
        os.replace(tmp, path)
    finally:
        if os.path.exists(tmp):
            os.remove(tmp)


# ---- keys ------------------------------------------------------------------------------

def _ensure_vapid() -> None:
    if VAPID_KEY.exists():
        return
    from py_vapid import Vapid

    STORAGE.mkdir(parents=True, exist_ok=True)
    v = Vapid()
    v.generate_keys()
    v.save_key(str(VAPID_KEY))
    logger.info("Generated a new VAPID key pair for push notifications.")


def public_key() -> str:
    """The application server key the browser needs to subscribe (URL-safe base64)."""
    from py_vapid import Vapid

    _ensure_vapid()
    v = Vapid.from_file(str(VAPID_KEY))
    raw = v.public_key.public_bytes(
        encoding=serialization.Encoding.X962, format=serialization.PublicFormat.UncompressedPoint
    )
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()


# ---- subscriptions ---------------------------------------------------------------------

def list_subscriptions() -> List[Dict[str, Any]]:
    return _read_json(SUBSCRIPTIONS, [])


def add_subscription(sub: Dict[str, Any]) -> None:
    subs = [s for s in list_subscriptions() if s.get("endpoint") != sub.get("endpoint")]
    subs.append(sub)
    _write_json(SUBSCRIPTIONS, subs)


def remove_subscription(endpoint: str) -> None:
    _write_json(SUBSCRIPTIONS, [s for s in list_subscriptions() if s.get("endpoint") != endpoint])


# ---- sending ---------------------------------------------------------------------------

def _send_one(sub: Dict[str, Any], payload: str) -> str:
    """Returns 'ok', 'gone' (subscription expired) or 'error'. Blocking: run in a thread."""
    from pywebpush import WebPushException, webpush

    try:
        webpush(
            subscription_info=sub,
            data=payload,
            vapid_private_key=str(VAPID_KEY),
            vapid_claims={"sub": VAPID_CLAIMS_SUB},
            ttl=3600,
        )
        return "ok"
    except WebPushException as e:
        status = getattr(getattr(e, "response", None), "status_code", None)
        if status in (404, 410):
            return "gone"
        logger.warning(f"Push delivery failed ({status}): {e}")
        return "error"
    except Exception as e:  # network problems etc.
        logger.warning(f"Push delivery failed: {e.__class__.__name__}: {e}")
        return "error"


async def send_to_all(title: str, body: str, tag: str = "boomi-failure") -> Dict[str, int]:
    _ensure_vapid()
    subs = list_subscriptions()
    payload = json.dumps({"title": title, "body": body, "tag": tag, "url": "/?openCompanion=1"})
    results = await asyncio.gather(*(asyncio.to_thread(_send_one, s, payload) for s in subs)) if subs else []
    for sub, outcome in zip(subs, results):
        if outcome == "gone":
            remove_subscription(sub.get("endpoint", ""))
    return {"sent": results.count("ok") if results else 0, "removed": results.count("gone") if results else 0, "failed": results.count("error") if results else 0}


# ---- failure watcher -------------------------------------------------------------------

def _iso(dt: datetime.datetime) -> str:
    return dt.astimezone(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


async def find_new_failures(since_iso: str, seen: List[str]) -> List[Dict[str, Any]]:
    records = await boomi_account_tools._query("ExecutionRecord", [
        {"argument": ["ERROR"], "operator": "EQUALS", "property": "status"},
        {"argument": [since_iso], "operator": "GREATER_THAN", "property": "executionTime"},
    ])
    fresh = [r for r in records if r.get("executionId") not in seen]
    fresh.sort(key=lambda r: r.get("executionTime", ""))
    return fresh


def describe(failures: List[Dict[str, Any]]) -> Dict[str, str]:
    if len(failures) <= GROUP_THRESHOLD:
        f = failures[-1]
        extra = f" (+{len(failures) - 1} more)" if len(failures) > 1 else ""
        return {"title": f"Boomi failure: {f.get('processName', 'process')}{extra}", "body": (f.get("message") or "Execution failed")[:160]}
    names = sorted({f.get("processName", "process") for f in failures})
    return {"title": f"{len(failures)} new Boomi failures", "body": ", ".join(names)[:160]}


async def check_once() -> int:
    """One poll. Returns how many new failures were found."""
    state = _read_json(STATE, None)
    now = datetime.datetime.now(datetime.timezone.utc)
    if not state:
        # First run: start from now so old failures do not flood the first notification
        _write_json(STATE, {"lastChecked": _iso(now), "seen": []})
        return 0

    fresh = await find_new_failures(state["lastChecked"], state.get("seen", []))
    if fresh and list_subscriptions():
        msg = describe(fresh)
        outcome = await send_to_all(msg["title"], msg["body"])
        logger.info(f"Failure alert for {len(fresh)} execution(s): {outcome}")

    seen = (state.get("seen", []) + [f.get("executionId") for f in fresh])[-300:]
    # Overlap the window a little: Boomi can list a record slightly after it starts
    _write_json(STATE, {"lastChecked": _iso(now - datetime.timedelta(seconds=120)), "seen": seen})
    return len(fresh)


async def watch_failures() -> None:
    logger.info("Failure notification watcher started.")
    while True:
        try:
            await check_once()
        except asyncio.CancelledError:
            raise
        except Exception as e:
            logger.warning(f"Failure watcher poll failed: {e}")
        await asyncio.sleep(POLL_SECONDS)
