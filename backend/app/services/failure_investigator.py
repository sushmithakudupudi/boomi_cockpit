"""Failure investigator: a small agent that diagnoses a failed Boomi execution.

It calls the same read-only account tools as the chat (execution history, revisions, audit log),
works through several steps, and saves a diagnosis plus the steps it took. It never runs, changes
or deploys anything in Boomi; acting on a diagnosis is always a separate, human-approved step.
"""
import asyncio
import datetime
import json
import logging
import os
import re
import tempfile
import threading
from pathlib import Path
from typing import Any, Dict, List, Optional

from . import action_queue, incident_memory
from .boomi_account_tools import TOOL_SCHEMAS, boomi_account_tools, tool_result_text

logger = logging.getLogger("failure_investigator")

STORAGE = Path(__file__).resolve().parents[2] / "storage"
STORE = STORAGE / "investigations.json"

MODEL = "gpt-4o-mini"
MAX_ROUNDS = 6
MAX_TOKENS = 900
TIMEOUT_SECONDS = 150
DAILY_CAP = int(os.getenv("INVESTIGATIONS_PER_DAY", "20"))
# The investigator may only look things up
ALLOWED_TOOLS = {"get_process_executions", "get_component_revisions", "get_audit_log", "get_components", "get_deployments"}

_lock = threading.Lock()
_running: set = set()


# ---- storage ---------------------------------------------------------------------------

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


def get(execution_id: str) -> Optional[Dict[str, Any]]:
    with _lock:
        return _read().get(execution_id)


def list_recent(limit: int = 20) -> List[Dict[str, Any]]:
    with _lock:
        docs = list(_read().values())
    return sorted(docs, key=lambda d: d.get("startedAt", ""), reverse=True)[:limit]


def _save(doc: Dict[str, Any]) -> None:
    with _lock:
        data = _read()
        data[doc["executionId"]] = doc
        if len(data) > 300:  # keep the file small: drop the oldest finished ones
            for k in sorted(data, key=lambda k: data[k].get("startedAt", ""))[: len(data) - 300]:
                del data[k]
        _write(data)


def _today_count() -> int:
    today = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%d")
    with _lock:
        return sum(1 for d in _read().values() if d.get("startedAt", "").startswith(today))


# ---- agent -----------------------------------------------------------------------------

SYSTEM_PROMPT = """You are a Dell Boomi integration failure investigator. Work out why ONE execution failed, using read-only tools.

Work in steps:
1. Read the timing facts you were given: they already cover the execution history and revision list of this process. Do not repeat those two lookups.
2. If a revision saved before the failures began could matter, use get_component_revisions with from_version and to_version for that revision to see exactly what changed.
3. If it helps, get_audit_log for events around the failure time (deployments, attach/detach, who changed what).
Stop as soon as you have enough evidence. Do not call a tool twice with the same arguments.

Rules:
- If similarPastIncidents is not empty, say in your summary or evidence that this has happened before and what fixed it (whatFixedIt), if known. A past cause is a hint, not proof: verify it against the current evidence, and never raise your confidence just because it happened before.
- Timing decides blame. You are given computed timing facts: when the current run of failures began (failingSince) and which revisions were saved before or after that moment. Only revisions in revisionsSavedBeforeFailuresBegan can be blamed for the start of the failures. A revision saved after failures began can only be a later change (possibly an attempt to fix); never say it caused them.
- Confidence: "high" only when the evidence directly links a specific change or external cause to the error AND the timing fits. A plausible but unproven link is "medium". Everything else is "low".
- If the process name or behaviour suggests an intentional test (for example chaos, load, test, fuzz), say the failures may be expected.
- Only state a cause you have evidence for. If the evidence is thin, say the cause is unknown and the confidence low.
- Separate facts from guesses. Evidence must be facts from the tool results.
- You cannot run, change or deploy anything. You may PROPOSE a re-run of the process only when the failure looks temporary (intermittent or external, for example a timeout or a service outage) AND the history shows the process succeeded before. Never propose a re-run for a persistent failure or a configuration regression: running a broken process again is pointless. You may also PROPOSE restoring the process to the revision before the suspect one (type restore_revision) when the failure is a new regression, the suspect revision's changes clearly explain the error, and your confidence is medium or high. The code chooses the revision; you only give the reason. A person approves or dismisses any proposal; nothing runs until they do.

Finish with ONLY a JSON object, no other text:
{"summary": "one sentence",
 "failureKind": "new regression | intermittent | persistent | external | unknown",
 "likelyCause": "one or two sentences",
 "confidence": "high | medium | low",
 "evidence": ["short facts from the tools"],
 "suggestedNextSteps": ["short actions for a human"],
 "proposedActions": [{"type": "rerun_process or restore_revision", "reason": "why this should fix it"}]}
Use an empty proposedActions list in most cases."""


def _normalize(rec: Dict[str, Any]) -> Dict[str, Any]:
    """Accepts either a Boomi ExecutionRecord or the backend's cached execution."""
    return {
        "executionId": rec.get("executionId") or rec.get("id"),
        "processName": rec.get("processName"),
        "processId": rec.get("processId"),
        "atomName": rec.get("atomName"),
        "startedAt": rec.get("executionTime") or rec.get("startedAt"),
        "errorMessage": (rec.get("message") or rec.get("errorMessage") or "")[:500],
    }


def _parse_diagnosis(text: str) -> Dict[str, Any]:
    t = (text or "").strip()
    if t.startswith("```"):
        t = t.strip("`")
        t = t[4:] if t.lower().startswith("json") else t
    try:
        d = json.loads(t)
        if isinstance(d, dict):
            return {
                "summary": str(d.get("summary", ""))[:300],
                "failureKind": str(d.get("failureKind", "unknown"))[:40],
                "likelyCause": str(d.get("likelyCause", ""))[:600],
                "confidence": d.get("confidence") if d.get("confidence") in ("high", "medium", "low") else "low",
                "evidence": [str(x)[:240] for x in (d.get("evidence") or [])][:8],
                "suggestedNextSteps": [str(x)[:240] for x in (d.get("suggestedNextSteps") or [])][:6],
                "proposedActions": [
                    {"type": str(a.get("type")), "reason": str(a.get("reason", ""))[:300]}
                    for a in (d.get("proposedActions") or []) if isinstance(a, dict) and a.get("type") in action_queue.ALLOWED_TYPES
                ][:2],
            }
    except ValueError:
        pass
    # The model ignored the format: keep its words, but mark the diagnosis low confidence
    return {"summary": t[:300], "failureKind": "unknown", "likelyCause": t[:600], "confidence": "low", "evidence": [], "suggestedNextSteps": [], "proposedActions": []}


async def _timing_facts(execution: Dict[str, Any], steps: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Works out, in code, when the current run of failures began and which revisions were saved before or after.
    Dates are compared here, not by the model, so a change made after the failures started is never blamed for them.
    """
    name = execution.get("processName")
    facts: Dict[str, Any] = {}
    try:
        hist = await boomi_account_tools.run("get_process_executions", {"process_name": name, "limit": 50})
        steps.append({"tool": "get_process_executions", "args": {"process_name": name, "limit": 50}, "ok": "error" not in hist,
                      "preview": tool_result_text(hist)[:220], "precomputed": True})
        recent = hist.get("recent", []) if isinstance(hist, dict) else []
        streak = []
        for r in recent:  # newest first: take the unbroken run of failures at the top
            if r.get("status") == "ERROR":
                streak.append(r)
            else:
                break
        if streak:
            facts["failingSince"] = streak[-1].get("time")
            facts["consecutiveFailures"] = len(streak)
        ok_before = next((r for r in recent if r.get("status") not in ("ERROR", None)), None)
        facts["lastNonFailureBeforeStreak"] = ok_before.get("time") if ok_before else None
        facts["statusCounts"] = hist.get("statusCounts") if isinstance(hist, dict) else None
    except Exception as e:
        facts["executionHistoryError"] = str(e)[:120]

    try:
        revs = await boomi_account_tools.run("get_component_revisions", {"component": name})
        steps.append({"tool": "get_component_revisions", "args": {"component": name}, "ok": "error" not in revs,
                      "preview": tool_result_text(revs)[:220], "precomputed": True})
        since = facts.get("failingSince")
        history = revs.get("history", []) if isinstance(revs, dict) else []
        if since and history:
            facts["revisionsSavedBeforeFailuresBegan"] = [
                {"version": h["version"], "savedAt": h["modifiedDate"], "savedBy": h["modifiedBy"]} for h in history if (h.get("modifiedDate") or "") <= since
            ][:5]
            facts["revisionsSavedAfterFailuresBegan"] = [
                {"version": h["version"], "savedAt": h["modifiedDate"], "savedBy": h["modifiedBy"]} for h in history if (h.get("modifiedDate") or "") > since
            ][:5]
        before = facts.get("revisionsSavedBeforeFailuresBegan") or []
        if before and before[0]["version"] > 1:
            # The revision saved just before the failures is the first suspect: look at exactly what it changed
            v = before[0]["version"]
            args = {"component": name, "from_version": v - 1, "to_version": v}
            diff = await boomi_account_tools.run("get_component_revisions", args)
            steps.append({"tool": "get_component_revisions", "args": args, "ok": "error" not in diff,
                          "preview": tool_result_text(diff)[:220], "precomputed": True})
            if isinstance(diff, dict) and diff.get("changes") is not None:
                facts["suspectRevision"] = f"v{v - 1} -> v{v} (saved {before[0]['savedAt']}, just before the failures began)"
                facts["suspectFromVersion"], facts["suspectToVersion"] = v - 1, v
                facts["currentVersion"] = history[0]["version"]
                facts["suspectRevisionChanges"] = [c.get("title") for c in diff["changes"]][:8]
        facts["note"] = ("Revisions in revisionsSavedAfterFailuresBegan cannot have caused the start of the failures. "
                         "Judge the cause from suspectRevisionChanges, the error message and the history.")
    except Exception as e:
        facts["revisionHistoryError"] = str(e)[:120]
    return facts


def _check_blame(diagnosis: Dict[str, Any], facts: Dict[str, Any]) -> Dict[str, Any]:
    """If the diagnosis names a revision saved after the failures began, it is wrong about timing: cap its confidence."""
    text = " ".join([diagnosis.get("likelyCause", ""), diagnosis.get("summary", "")] + diagnosis.get("evidence", []))
    for rev in facts.get("revisionsSavedAfterFailuresBegan", []) or []:
        n = rev["version"]
        if re.search(rf"(?<![A-Za-z])(?:version|revision|rev\.?|v)\s*{n}(?!\d)", text, re.I):
            diagnosis["confidence"] = "low"
            diagnosis["caution"] = (f"This diagnosis mentions revision {n}, which was saved after the failures began, so its reasoning about "
                                    "timing is unreliable. Treat the cause as unconfirmed.")
            break
    return diagnosis


async def _run_agent(client: Any, execution: Dict[str, Any], steps: List[Dict[str, Any]]) -> Dict[str, Any]:
    tools = [t for t in TOOL_SCHEMAS if t["function"]["name"] in ALLOWED_TOOLS]
    facts = await _timing_facts(execution, steps)
    # Earlier incidents like this one, from memory (hints only; the current evidence still decides)
    facts["similarPastIncidents"] = incident_memory.similar(execution.get("executionId"), execution.get("processName"), execution.get("errorMessage"))
    messages: List[Dict[str, Any]] = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": (
            "Failed execution to investigate:\n" + json.dumps(execution, default=str)
            + "\n\nTiming facts computed from Boomi data (trust these over your own date comparisons):\n"
            + json.dumps(facts, default=str)
        )},
    ]
    # The history and revision lookups are already done above, so repeating them is blocked
    seen_calls: set = {f"{s['tool']}:{json.dumps(s['args'], sort_keys=True)}" for s in steps if s.get("precomputed")}
    for _ in range(MAX_ROUNDS):
        resp = await client.chat.completions.create(
            model=MODEL, messages=messages, tools=tools, tool_choice="auto", temperature=0.1, max_tokens=MAX_TOKENS,
        )
        reply = resp.choices[0].message
        if not reply.tool_calls:
            diagnosis = _check_blame(_parse_diagnosis(reply.content or ""), facts)
            diagnosis["_facts"] = facts  # used by the caller to vet proposals, then removed
            return diagnosis
        messages.append({
            "role": "assistant", "content": reply.content,
            "tool_calls": [{"id": tc.id, "type": "function", "function": {"name": tc.function.name, "arguments": tc.function.arguments}} for tc in reply.tool_calls],
        })
        for tc in reply.tool_calls:
            name = tc.function.name
            try:
                args = json.loads(tc.function.arguments or "{}")
            except ValueError:
                args = {}
            key = f"{name}:{json.dumps(args, sort_keys=True)}"
            if name not in ALLOWED_TOOLS:
                result: Dict[str, Any] = {"error": "That tool is not available to the investigator."}
            elif key in seen_calls:
                result = {"error": "Already called with these arguments; use the earlier result."}
            else:
                seen_calls.add(key)
                result = await boomi_account_tools.run(name, args)
                since = facts.get("failingSince")
                if name == "get_component_revisions" and since and isinstance(result, dict) and (result.get("toSavedAt") or "") > since:
                    result["timingWarning"] = (f"Revision v{result.get('comparedToVersion')} was saved at {result.get('toSavedAt')}, AFTER the failures began "
                                               f"({since}). It cannot be the cause of those failures.")
            text = tool_result_text(result)
            steps.append({"tool": name, "args": args, "ok": "error" not in result, "preview": text[:220]})
            messages.append({"role": "tool", "tool_call_id": tc.id, "content": text})
    # Out of rounds without a final answer
    return {"summary": "The investigation did not reach a conclusion within its step limit.", "failureKind": "unknown",
            "likelyCause": "Not determined.", "confidence": "low", "evidence": [], "suggestedNextSteps": ["Investigate manually or ask a follow-up in the chat."]}


TEST_LIKE = re.compile(r"chaos|load|fuzz|stress|test|demo", re.I)


def _vet_proposals(execution: Dict[str, Any], diagnosis: Dict[str, Any], facts: Dict[str, Any]) -> int:
    """
    The model may suggest a re-run; code decides whether it reaches the approval queue. A proposal needs a temporary-looking
    failure, a process that has succeeded before, a confident-enough diagnosis, and a process name that is not a load/test job.
    """
    created = 0
    counts = facts.get("statusCounts") or {}
    succeeded_before = any(status not in ("ERROR", None) and n for status, n in counts.items())
    for proposal in diagnosis.get("proposedActions", []):
        if proposal.get("type") == "restore_revision":
            frm, to, cur = facts.get("suspectFromVersion"), facts.get("suspectToVersion"), facts.get("currentVersion")
            if diagnosis.get("failureKind") != "new regression" or diagnosis.get("confidence") not in ("medium", "high"):
                continue
            if not (frm and to and cur) or not execution.get("processId"):
                continue
            # The diagnosis must actually blame the suspect revision, not just propose a restore
            text = " ".join([diagnosis.get("likelyCause", ""), diagnosis.get("summary", "")] + diagnosis.get("evidence", []))
            if not re.search(rf"(?<![A-Za-z])(?:version|revision|rev\.?|v)\s*{to}(?!\d)", text, re.I):
                continue
            if action_queue.propose(
                "restore_revision", execution_id=execution["executionId"], process_id=execution["processId"],
                process_name=execution["processName"], atom_name=execution.get("atomName"), rationale=proposal.get("reason", ""),
                params={"targetVersion": frm, "expectedCurrentVersion": cur, "suspectVersion": to},
            ):
                created += 1
            continue
        if proposal.get("type") != "rerun_process":
            continue
        if diagnosis.get("failureKind") not in ("intermittent", "external") or diagnosis.get("confidence") == "low":
            continue
        if not succeeded_before or TEST_LIKE.search(execution.get("processName") or ""):
            continue
        if action_queue.propose(
            "rerun_process", execution_id=execution["executionId"], process_id=execution.get("processId") or "",
            process_name=execution["processName"], atom_name=execution.get("atomName"), rationale=proposal.get("reason", ""),
        ):
            created += 1
    return created


async def investigate_failure(record: Dict[str, Any], force: bool = False) -> Dict[str, Any]:
    """Runs one investigation and saves it. Returns the saved document (status done, error or skipped)."""
    from .companion_ai import companion_ai_service

    ex = _normalize(record)
    exec_id = ex["executionId"]
    if not exec_id or not ex.get("processName"):
        return {"status": "skipped", "reason": "The execution has no id or process name."}

    existing = get(exec_id)
    if existing and not force and existing.get("status") in ("running", "done"):
        return existing
    if exec_id in _running:
        return existing or {"executionId": exec_id, "status": "running"}

    now = datetime.datetime.now(datetime.timezone.utc).isoformat()
    base = {"executionId": exec_id, "processName": ex["processName"], "startedAt": now, "execution": ex, "model": MODEL}

    client = companion_ai_service._openai_client
    if not client:
        doc = {**base, "status": "skipped", "reason": "No AI key is configured, so the investigator cannot run."}
        _save(doc)
        return doc
    if _today_count() >= DAILY_CAP:
        doc = {**base, "status": "skipped", "reason": f"Daily limit of {DAILY_CAP} investigations reached."}
        _save(doc)
        return doc

    incident_memory.backfill(list_recent(300))  # bring in investigations made before memory existed
    _running.add(exec_id)
    steps: List[Dict[str, Any]] = []
    _save({**base, "status": "running", "steps": steps})
    try:
        diagnosis = await asyncio.wait_for(_run_agent(client, ex, steps), timeout=TIMEOUT_SECONDS)
        facts = diagnosis.pop("_facts", {})
        diagnosis["proposalsQueued"] = _vet_proposals(ex, diagnosis, facts)
        incident_memory.record(ex, diagnosis, facts)
        doc = {**base, "status": "done", "finishedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
               "diagnosis": diagnosis, "steps": steps}
    except asyncio.TimeoutError:
        doc = {**base, "status": "error", "reason": f"Timed out after {TIMEOUT_SECONDS}s.", "steps": steps}
    except Exception as e:
        logger.warning(f"Investigation of {exec_id} failed: {e}")
        doc = {**base, "status": "error", "reason": f"{e.__class__.__name__}: {str(e)[:200]}", "steps": steps}
    finally:
        _running.discard(exec_id)
    _save(doc)
    return doc
