"""Read-only Boomi account lookups the Companion chat can call (environments, users, audit log, ...).

Every tool only issues Platform API query calls. Session ids and anything that looks like a
secret are stripped before data reaches the model.
"""
import datetime
import json
import logging
from collections import Counter
from typing import Any, Dict, List, Optional

import httpx

from ..config import settings
from .boomi_service import boomi_service
from .revision_service import RevisionError, revision_service

logger = logging.getLogger("boomi_account_tools")

MAX_RECORDS = 500
_SECRET_WORDS = ("password", "token", "secret", "session_id", "apikey", "api_key")

TOOL_SCHEMAS: List[Dict[str, Any]] = [
    {"type": "function", "function": {
        "name": "get_environments",
        "description": "List the AtomSphere Environments in the account (name, classification) and which runtime Atoms are attached to each.",
        "parameters": {"type": "object", "properties": {}},
    }},
    {"type": "function", "function": {
        "name": "get_atoms",
        "description": "List runtime Atoms with status and type.",
        "parameters": {"type": "object", "properties": {}},
    }},
    {"type": "function", "function": {
        "name": "get_users_and_roles",
        "description": "List the users in the account and the roles assigned to each user.",
        "parameters": {"type": "object", "properties": {}},
    }},
    {"type": "function", "function": {
        "name": "get_audit_log",
        "description": (
            "Recent audit log events: who did what and when (logins, process executions, deployments, "
            "attach/detach, account changes). Returns a summary by user and event type plus the most recent events. "
            "The API does not provide browser or IP address."
        ),
        "parameters": {"type": "object", "properties": {
            "days": {"type": "integer", "description": "How many days back to look (default 7, max 90)."},
            "user": {"type": "string", "description": "Only events by this user id (email)."},
            "limit": {"type": "integer", "description": "Max recent events to return (default 30, max 100)."},
        }},
    }},
    {"type": "function", "function": {
        "name": "get_deployments",
        "description": "Components currently deployed to environments: component name, environment, package version, who deployed and when.",
        "parameters": {"type": "object", "properties": {}},
    }},
    {"type": "function", "function": {
        "name": "get_components",
        "description": (
            "Components in the account (processes, connections, operations, maps, profiles) with who created and last modified them and when. "
            "Use for questions about processes and who changed an integration."
        ),
        "parameters": {"type": "object", "properties": {
            "type": {"type": "string", "description": "Component type, e.g. process, connector-settings, connector-action, transform.map, profile.json."},
            "name_contains": {"type": "string", "description": "Only components whose name contains this text."},
            "limit": {"type": "integer", "description": "Max components to return (default 40, max 100)."},
        }},
    }},
    {"type": "function", "function": {
        "name": "draft_integration",
        "description": (
            "Turns the user's plain-language description of an integration into a DRAFT blueprint in ArchForge. It never builds anything in Boomi: "
            "the user reviews the draft and builds it themselves. Pass everything the user said about trigger, source, steps and destination. "
            "Returns status drafted (with shapes, assumptions and which shapes need manual configuration) or needs_more_info (with questions to ask)."
        ),
        "parameters": {"type": "object", "properties": {
            "description": {"type": "string", "description": "The integration the user wants, in their words plus any detail from the conversation."},
        }, "required": ["description"]},
    }},
    {"type": "function", "function": {
        "name": "get_similar_incidents",
        "description": (
            "Incident memory: earlier failures the investigator diagnosed, matched by process name and/or error text, "
            "with what fixed them and whether the process recovered. Use for 'has this happened before' and 'what fixed it last time'."
        ),
        "parameters": {"type": "object", "properties": {
            "process_name": {"type": "string", "description": "Process name to look up."},
            "error_text": {"type": "string", "description": "Error message text to match."},
        }},
    }},
    {"type": "function", "function": {
        "name": "get_process_executions",
        "description": (
            "Recent execution history of one process (status, time, error message). Use it to tell whether a failure is new, "
            "intermittent or constant, and when it started."
        ),
        "parameters": {"type": "object", "properties": {
            "process_name": {"type": "string", "description": "Process name."},
            "limit": {"type": "integer", "description": "How many recent executions (default 20, max 50)."},
        }, "required": ["process_name"]},
    }},
    {"type": "function", "function": {
        "name": "get_component_revisions",
        "description": (
            "Revision history of one component (process, connection, map ...): every saved version with who saved it and when, "
            "plus what changed between two versions (shapes added/removed/modified, properties, connections, maps). "
            "Defaults to comparing the latest revision with the one before it. Use for 'what changed in X', 'who edited X' and 'why did X start failing'."
        ),
        "parameters": {"type": "object", "properties": {
            "component": {"type": "string", "description": "Component name (or id)."},
            "from_version": {"type": "integer", "description": "Older revision number to compare from (optional)."},
            "to_version": {"type": "integer", "description": "Newer revision number to compare to (optional)."},
        }, "required": ["component"]},
    }},
]


def _clip(value: Optional[int], default: int, maximum: int) -> int:
    if not isinstance(value, int) or value <= 0:
        return default
    return min(value, maximum)


def _safe_props(props: List[Dict[str, Any]]) -> Dict[str, str]:
    out: Dict[str, str] = {}
    for p in props or []:
        name = str(p.get("name", ""))
        if any(w in name.lower() for w in _SECRET_WORDS):
            continue
        out[name] = str(p.get("value", ""))[:120]
    return out


class BoomiAccountTools:
    def _ctx(self):
        auth = boomi_service._get_boomi_auth()
        if not auth or not settings.BOOMI_ACCOUNT_ID:
            raise ValueError("Boomi credentials are not configured.")
        base = f"{settings.BOOMI_BASE_URL.rstrip('/')}/{settings.BOOMI_ACCOUNT_ID.strip()}"
        return auth, base

    async def _query(self, obj: str, filters: Optional[List[Dict[str, Any]]] = None) -> List[Dict[str, Any]]:
        """Runs a Platform API query and follows queryMore tokens, up to MAX_RECORDS."""
        auth, base = self._ctx()
        headers = {"Accept": "application/json", "Content-Type": "application/json"}
        body: Dict[str, Any] = {}
        if filters:
            body = {"QueryFilter": {"expression": {"operator": "and", "nestedExpression": filters}}}
        results: List[Dict[str, Any]] = []
        async with httpx.AsyncClient(timeout=40.0) as client:
            res = await client.post(f"{base}/{obj}/query", auth=auth, headers=headers, json=body)
            while True:
                if res.status_code != 200:
                    raise RuntimeError(f"Boomi {obj} query returned {res.status_code}: {res.text[:200]}")
                data = res.json()
                results.extend(data.get("result", []))
                token = data.get("queryToken")
                if not token or len(results) >= MAX_RECORDS:
                    break
                res = await client.post(
                    f"{base}/{obj}/queryMore", auth=auth,
                    headers={"Accept": "application/json", "Content-Type": "text/plain"}, content=token,
                )
        return results[:MAX_RECORDS]

    # ---- tools -------------------------------------------------------------------------

    async def get_environments(self) -> Dict[str, Any]:
        envs = await self._query("Environment")
        attachments = await self._query("EnvironmentAtomAttachment")
        atoms = {a.get("id"): a.get("name") for a in await self._query("Atom")}
        by_env: Dict[str, List[str]] = {}
        for att in attachments:
            by_env.setdefault(att.get("environmentId", ""), []).append(atoms.get(att.get("atomId"), att.get("atomId")))
        return {
            "environmentCount": len(envs),
            "environments": [
                {"name": e.get("name"), "classification": e.get("classification"), "attachedAtoms": by_env.get(e.get("id"), [])}
                for e in envs
            ],
        }

    async def get_atoms(self) -> Dict[str, Any]:
        atoms = await boomi_service.get_atoms_live()
        return {"atomCount": len(atoms), "atoms": [{"name": a.get("name"), "status": a.get("status"), "type": a.get("type")} for a in atoms]}

    async def get_users_and_roles(self) -> Dict[str, Any]:
        assignments = await self._query("AccountUserRole")
        roles = {r.get("id"): r for r in await self._query("Role")}
        users: Dict[str, List[str]] = {}
        for a in assignments:
            role = roles.get(a.get("roleId"), {})
            name = role.get("Name") or role.get("name") or role.get("Description") or a.get("roleId")
            users.setdefault(a.get("userId", "unknown"), []).append(str(name))
        return {
            "userCount": len(users),
            "users": [{"userId": u, "roles": sorted(set(r))} for u, r in users.items()],
            "note": "Only users with role assignments in this account are listed.",
        }

    async def get_audit_log(self, days: Optional[int] = None, user: Optional[str] = None, limit: Optional[int] = None) -> Dict[str, Any]:
        days = _clip(days, 7, 90)
        limit = _clip(limit, 30, 100)
        since = (datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(days=days)).strftime("%Y-%m-%dT%H:%M:%SZ")
        filters = [{"argument": [since], "operator": "GREATER_THAN", "property": "date"}]
        if user:
            filters.append({"argument": [user], "operator": "EQUALS", "property": "userId"})
        events = await self._query("AuditLog", filters)
        events.sort(key=lambda e: e.get("date", ""), reverse=True)

        by_user = Counter(e.get("userId", "unknown") for e in events)
        by_type = Counter(f"{e.get('type')} / {e.get('action')}" for e in events)
        sessions: Dict[str, set] = {}
        for e in events:
            for p in e.get("AuditLogProperty", []) or []:
                if p.get("name") == "SESSION_ID":
                    sessions.setdefault(e.get("userId", "unknown"), set()).add(p.get("value"))
        return {
            "lookedBackDays": days,
            "totalEvents": len(events),
            "cappedAt": MAX_RECORDS if len(events) >= MAX_RECORDS else None,
            "eventsByUser": dict(by_user.most_common(15)),
            "eventsByType": dict(by_type.most_common(15)),
            "distinctSessionsByUser": {u: len(s) for u, s in sessions.items()},
            "recentEvents": [
                {
                    "date": e.get("date"), "user": e.get("userId"), "type": e.get("type"), "action": e.get("action"),
                    "message": (e.get("message") or "")[:160], "source": e.get("source"), "level": e.get("level"),
                    "details": _safe_props(e.get("AuditLogProperty", [])),
                }
                for e in events[:limit]
            ],
            "limitations": "Browser type and IP address are not available from the Platform API. Sessions are counted by distinct session id.",
        }

    async def get_deployments(self) -> Dict[str, Any]:
        deployed = await self._query("DeployedPackage")
        envs = {e.get("id"): e.get("name") for e in await self._query("Environment")}
        comps = {
            c.get("componentId"): c.get("name")
            for c in await self._query("ComponentMetadata", [
                {"argument": ["false"], "operator": "EQUALS", "property": "deleted"},
                {"argument": ["true"], "operator": "EQUALS", "property": "currentVersion"},
            ])
        }
        rows = [
            {
                "component": comps.get(d.get("componentId"), d.get("componentId")),
                "environment": envs.get(d.get("environmentId"), d.get("environmentId")),
                "packageVersion": d.get("packageVersion"),
                "deployedBy": d.get("deployedBy"),
                "deployedDate": d.get("deployedDate"),
                "active": d.get("active"),
            }
            for d in deployed
        ]
        rows.sort(key=lambda r: r.get("deployedDate") or "", reverse=True)
        return {"deploymentCount": len(rows), "deployments": rows[:60]}

    async def get_components(self, type: Optional[str] = None, name_contains: Optional[str] = None, limit: Optional[int] = None) -> Dict[str, Any]:
        limit = _clip(limit, 40, 100)
        filters: List[Dict[str, Any]] = [
            {"argument": ["false"], "operator": "EQUALS", "property": "deleted"},
            {"argument": ["true"], "operator": "EQUALS", "property": "currentVersion"},
        ]
        if type:
            filters.append({"argument": [type], "operator": "EQUALS", "property": "type"})
        if name_contains:
            filters.append({"argument": [f"%{name_contains}%"], "operator": "LIKE", "property": "name"})
        comps = await self._query("ComponentMetadata", filters)
        comps.sort(key=lambda c: c.get("modifiedDate", ""), reverse=True)
        return {
            "matchingComponents": len(comps),
            "byType": dict(Counter(c.get("type") for c in comps).most_common(12)),
            "components": [
                {
                    "name": c.get("name"), "type": c.get("type"), "folder": c.get("folderName"),
                    "createdBy": c.get("createdBy"), "createdDate": c.get("createdDate"),
                    "modifiedBy": c.get("modifiedBy"), "modifiedDate": c.get("modifiedDate"),
                    "version": c.get("version"),
                }
                for c in comps[:limit]
            ],
        }

    async def draft_integration(self, description: str) -> Dict[str, Any]:
        from . import process_designer
        from .companion_ai import companion_ai_service

        return await process_designer.design_and_save(description, companion_ai_service._openai_client)

    async def get_similar_incidents(self, process_name: Optional[str] = None, error_text: Optional[str] = None) -> Dict[str, Any]:
        from . import incident_memory

        found = incident_memory.similar(None, process_name, error_text, 5)
        return {"matches": found, "note": "Past causes are hints, not proof." if found else "No similar incident is in memory."}

    async def get_process_executions(self, process_name: str, limit: Optional[int] = None) -> Dict[str, Any]:
        limit = _clip(limit, 20, 50)
        recs = await self._query("ExecutionRecord", [
            {"argument": [process_name], "operator": "EQUALS", "property": "processName"},
        ])
        recs.sort(key=lambda r: r.get("executionTime", ""), reverse=True)
        counts = Counter(r.get("status") for r in recs)
        return {
            "process": process_name,
            "totalOnRecord": len(recs),
            "statusCounts": dict(counts),
            "recent": [
                {"time": r.get("executionTime"), "status": r.get("status"), "message": (r.get("message") or "")[:140],
                 "atom": r.get("atomName"), "durationMs": r.get("executionDuration")}
                for r in recs[:limit]
            ],
        }

    async def get_component_revisions(
        self, component: str, from_version: Optional[int] = None, to_version: Optional[int] = None
    ) -> Dict[str, Any]:
        """Revision list plus a diff of two revisions, using the Revision History engine."""
        try:
            items = await revision_service.all_components("live")
            needle = (component or "").strip().lower()
            exact = [c for c in items if c["name"].lower() == needle or (c["componentId"] or "").lower() == needle]
            matches = exact or [c for c in items if needle and needle in c["name"].lower()]
            if not matches:
                return {"error": f"No component matches '{component}'.", "hint": "Try get_components to list names."}
            if len(matches) > 1:
                return {
                    "error": f"'{component}' matches {len(matches)} components; ask which one.",
                    "candidates": [{"name": c["name"], "type": c["type"], "latestVersion": c["version"]} for c in matches[:10]],
                }
            comp = matches[0]
            revs = await revision_service.revisions("live", comp["componentId"])
            history = [
                {"version": r["version"], "modifiedBy": r["modifiedBy"], "modifiedDate": r["modifiedDate"]} for r in revs[:15]
            ]
            out: Dict[str, Any] = {
                "component": comp["name"], "type": comp["type"], "revisionCount": len(revs), "history": history,
            }
            if len(revs) < 2 and not (from_version and to_version):
                out["note"] = "Only one revision exists, so there is nothing to compare."
                return out
            to_v = to_version or revs[0]["version"]
            from_v = from_version or next((r["version"] for r in revs if r["version"] < to_v), None)
            if from_v is None:
                out["note"] = "No earlier revision to compare against."
                return out
            cmp = await revision_service.compare("live", comp["componentId"], from_v, to_v, False)
            changes = []
            for ch in cmp["changes"][:25]:
                changes.append({
                    "change": ch.get("changeType"), "category": ch.get("category"), "scope": ch.get("scope"),
                    "title": ch.get("title"), "shape": ch.get("shapeName"), "shapeType": ch.get("shapeType"),
                    "old": json.dumps(ch.get("old"), default=str)[:200] if ch.get("old") is not None else None,
                    "new": json.dumps(ch.get("new"), default=str)[:200] if ch.get("new") is not None else None,
                })
            out.update({
                "comparedFromVersion": from_v, "comparedToVersion": to_v,
                "fromSavedBy": cmp["left"].get("modifiedBy"), "fromSavedAt": cmp["left"].get("modifiedDate"),
                "toSavedBy": cmp["right"].get("modifiedBy"), "toSavedAt": cmp["right"].get("modifiedDate"),
                "summary": cmp["summary"], "changes": changes,
                "moreChangesNotShown": max(0, len(cmp["changes"]) - len(changes)),
                "warnings": cmp.get("warnings", [])[:3],
            })
            return out
        except RevisionError as e:
            return {"error": e.message}

    async def run(self, name: str, arguments: Dict[str, Any]) -> Dict[str, Any]:
        handlers = {
            "get_environments": self.get_environments,
            "get_atoms": self.get_atoms,
            "get_users_and_roles": self.get_users_and_roles,
            "get_audit_log": self.get_audit_log,
            "get_deployments": self.get_deployments,
            "get_components": self.get_components,
            "get_component_revisions": self.get_component_revisions,
            "get_process_executions": self.get_process_executions,
            "get_similar_incidents": self.get_similar_incidents,
            "draft_integration": self.draft_integration,
        }
        handler = handlers.get(name)
        if not handler:
            return {"error": f"Unknown tool {name}"}
        try:
            allowed = {k: v for k, v in (arguments or {}).items() if k in handler.__code__.co_varnames}
            return await handler(**allowed)
        except Exception as e:  # report to the model so it can tell the user plainly
            logger.warning(f"Tool {name} failed: {e}")
            return {"error": str(e)[:300]}


boomi_account_tools = BoomiAccountTools()


def tool_result_text(result: Dict[str, Any], limit: int = 12000) -> str:
    text = json.dumps(result, default=str)
    return text if len(text) <= limit else text[:limit] + '..."truncated"'
