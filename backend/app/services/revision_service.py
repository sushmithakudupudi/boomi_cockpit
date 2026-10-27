"""
Revision retrieval for the Revision History module.

Boomi AtomSphere REST capabilities used (all read-only):
  * POST /ComponentMetadata/query (+ /queryMore)  -> component list and per-component revision list.
    Every revision of a component is a ComponentMetadata record with its own `version`,
    `modifiedBy` and `modifiedDate`. There is no revision-comment field; only the component
    `description` is available, so that is what the UI shows as notes.
  * GET /Component/{componentId}~{version}         -> full XML definition of ONE historical revision.

The revision list does not include definitions, so each selected revision's XML is fetched
separately and cached (a saved version is immutable, so definitions never expire).
"""
import asyncio
import logging
import time
from typing import Any, Dict, List, Optional, Tuple

import httpx

from ..config import settings
from ..data import revision_samples as samples
from . import revision_diff as diff
from .boomi_service import boomi_service

logger = logging.getLogger("revision_service")

LIST_TTL = 300
MAX_COMPONENTS = 2000
MAX_DEFINITIONS = 300
SOURCES = ("live", "sample")


class RevisionError(Exception):
    def __init__(self, status: int, code: str, message: str):
        super().__init__(message)
        self.status, self.code, self.message = status, code, message


class RevisionService:
    def __init__(self):
        self._lists: Dict[str, Tuple[float, List[Dict[str, Any]]]] = {}
        self._revisions: Dict[Tuple[str, str], Tuple[float, List[Dict[str, Any]]]] = {}
        self._definitions: Dict[Tuple[str, str, int], str] = {}

    # ------------------------------------------------------------------ status
    def status(self) -> Dict[str, Any]:
        configured = bool(boomi_service._get_boomi_auth() and settings.BOOMI_ACCOUNT_ID)
        return {
            "liveConfigured": configured,
            "reason": None if configured else "Boomi credentials (BOOMI_ACCOUNT_ID / BOOMI_API_TOKEN / BOOMI_USERNAME) are not configured on the backend.",
            "sampleAvailable": True,
        }

    def clear_cache(self) -> None:
        self._lists.clear()
        self._revisions.clear()
        self._definitions.clear()

    # ------------------------------------------------------------------ live access
    def _live_ctx(self) -> Tuple[tuple, str]:
        auth = boomi_service._get_boomi_auth()
        if not auth or not settings.BOOMI_ACCOUNT_ID:
            raise RevisionError(503, "not_configured",
                                "Live Boomi access is not configured. Set BOOMI_ACCOUNT_ID, BOOMI_USERNAME and BOOMI_API_TOKEN in backend/.env, or switch to sample fixtures.")
        return auth, f"{settings.BOOMI_BASE_URL.rstrip('/')}/{settings.BOOMI_ACCOUNT_ID.strip()}"

    async def _request(self, method: str, url: str, auth: tuple, **kw) -> httpx.Response:
        try:
            async with httpx.AsyncClient(timeout=20.0) as client:
                res = await client.request(method, url, auth=auth, **kw)
        except httpx.HTTPError as e:
            raise RevisionError(502, "unreachable", f"Could not reach the Boomi AtomSphere API: {e.__class__.__name__}")
        if res.status_code in (401, 403):
            raise RevisionError(res.status_code, "boomi_auth", "Boomi rejected the configured credentials or the token lacks access to Component metadata.")
        return res

    async def _query_metadata(self, expression: Dict[str, Any]) -> List[Dict[str, Any]]:
        auth, base = self._live_ctx()
        headers = {"Accept": "application/json", "Content-Type": "application/json"}
        res = await self._request("POST", f"{base}/ComponentMetadata/query", auth, headers=headers,
                                  json={"QueryFilter": {"expression": expression}})
        results: List[Dict[str, Any]] = []
        while True:
            if res.status_code != 200:
                raise RevisionError(502, "boomi_error", f"Boomi ComponentMetadata query failed (HTTP {res.status_code}).")
            data = res.json()
            results.extend(data.get("result", []))
            token = data.get("queryToken")
            if not token or len(results) >= MAX_COMPONENTS:
                return results
            res = await self._request("POST", f"{base}/ComponentMetadata/queryMore", auth,
                                      headers={"Accept": "application/json", "Content-Type": "text/plain"}, content=token)

    @staticmethod
    def _norm(rec: Dict[str, Any]) -> Dict[str, Any]:
        return {
            "componentId": rec.get("componentId"),
            "version": int(rec.get("version", 0)),
            "name": rec.get("name") or "(unnamed)",
            "type": rec.get("type") or "unknown",
            "modifiedBy": rec.get("modifiedBy"),
            "modifiedDate": rec.get("modifiedDate"),
            "createdBy": rec.get("createdBy"),
            "createdDate": rec.get("createdDate"),
            "currentVersion": bool(rec.get("currentVersion")),
            "deleted": bool(rec.get("deleted")),
            "folderName": rec.get("folderName"),
            "description": rec.get("description") or None,
        }

    # ------------------------------------------------------------------ public data access
    async def all_components(self, source: str) -> List[Dict[str, Any]]:
        self._check_source(source)
        hit = self._lists.get(source)
        if hit and time.time() - hit[0] < LIST_TTL:
            return hit[1]
        if source == "sample":
            items = [self._norm(r) for revs in samples.REVISIONS.values() for r in revs if r["currentVersion"]]
        else:
            expr = {"operator": "and", "nestedExpression": [
                {"argument": ["true"], "operator": "EQUALS", "property": "currentVersion"},
                {"argument": ["false"], "operator": "EQUALS", "property": "deleted"},
            ]}
            items = [self._norm(r) for r in await self._query_metadata(expr)]
        self._lists[source] = (time.time(), items)
        return items

    async def revisions(self, source: str, component_id: str) -> List[Dict[str, Any]]:
        self._check_source(source)
        key = (source, component_id)
        hit = self._revisions.get(key)
        if hit and time.time() - hit[0] < LIST_TTL:
            return hit[1]
        if source == "sample":
            if component_id not in samples.REVISIONS:
                raise RevisionError(404, "not_found", f"Sample component {component_id} does not exist.")
            items = [self._norm(r) for r in samples.REVISIONS[component_id]]
        else:
            expr = {"argument": [component_id], "operator": "EQUALS", "property": "componentId"}
            items = [self._norm(r) for r in await self._query_metadata(expr)]
            if not items:
                raise RevisionError(404, "not_found", f"Boomi returned no revisions for component {component_id}.")
        items.sort(key=lambda r: r["version"], reverse=True)
        self._revisions[key] = (time.time(), items)
        return items

    async def definition(self, source: str, component_id: str, version: int) -> str:
        key = (source, component_id, version)
        if key in self._definitions:
            return self._definitions[key]
        if source == "sample":
            xml = samples.DEFINITIONS.get(component_id, {}).get(version)
            if xml is None:
                raise RevisionError(404, "definition_unavailable", f"No sample definition for {component_id} revision {version}.")
        else:
            auth, base = self._live_ctx()
            res = await self._request("GET", f"{base}/Component/{component_id}~{version}", auth, headers={"Accept": "application/xml"})
            if res.status_code in (400, 404):
                raise RevisionError(404, "definition_unavailable",
                                    f"Boomi did not return a definition for revision {version} of {component_id} (HTTP {res.status_code}). "
                                    "The revision may have been purged or is not readable with this token.")
            if res.status_code != 200:
                raise RevisionError(502, "boomi_error", f"Boomi Component fetch failed (HTTP {res.status_code}).")
            xml = res.text
        if len(self._definitions) >= MAX_DEFINITIONS:
            self._definitions.pop(next(iter(self._definitions)))
        self._definitions[key] = xml
        return xml

    # ------------------------------------------------------------------ browse
    async def list_components(self, source: str, q: str, ctype: str, author: str,
                              date_from: str, date_to: str) -> Dict[str, Any]:
        items = await self.all_components(source)
        out = []
        ql = q.strip().lower()
        for c in items:
            if ql and ql not in c["name"].lower() and ql not in (c["componentId"] or "").lower():
                continue
            if ctype and c["type"] != ctype:
                continue
            if author and c["modifiedBy"] != author:
                continue
            day = (c["modifiedDate"] or "")[:10]
            if date_from and (not day or day < date_from):
                continue
            if date_to and (not day or day > date_to):
                continue
            out.append(c)
        out.sort(key=lambda c: c["modifiedDate"] or "", reverse=True)
        return {
            "source": source,
            "components": out,
            "total": len(items),
            "facets": {"types": sorted({c["type"] for c in items}),
                       "authors": sorted({c["modifiedBy"] for c in items if c["modifiedBy"]})},
        }

    # ------------------------------------------------------------------ compare
    @staticmethod
    def _version_at(revs: List[Dict[str, Any]], when: Optional[str]) -> Optional[Dict[str, Any]]:
        """Newest revision saved at or before `when` (ISO timestamps compare lexically)."""
        if not when:
            return None
        eligible = [r for r in revs if r["modifiedDate"] and r["modifiedDate"] <= when]
        return max(eligible, key=lambda r: r["version"]) if eligible else None

    async def compare(self, source: str, component_id: str, v_from: int, v_to: int, include_unchanged: bool) -> Dict[str, Any]:
        revs = await self.revisions(source, component_id)
        by_ver = {r["version"]: r for r in revs}
        for v in (v_from, v_to):
            if v not in by_ver:
                raise RevisionError(404, "not_found", f"Revision {v} of {component_id} is not in the available revision history.")
        left_xml, right_xml = await asyncio.gather(self.definition(source, component_id, v_from), self.definition(source, component_id, v_to))
        try:
            result = diff.compare_definitions(left_xml, right_xml, include_unchanged)
        except diff.ComparisonError as e:
            raise RevisionError(422, "comparison_failed", str(e))

        changes, warnings, resolved = result["changes"], list(result["warnings"]), []
        left_meta, right_meta = by_ver[v_from], by_ver[v_to]

        if result["kind"] == "process":
            shape_ids = sorted(set(result["mapRefs"]["left"]) | set(result["mapRefs"]["right"]))
            for sid in shape_ids:
                lm, rm = result["mapRefs"]["left"].get(sid), result["mapRefs"]["right"].get(sid)
                if not lm or not rm:
                    continue  # map shape added/removed: already reported at shape level
                try:
                    mrevs = await self.revisions(source, rm)
                    mrevs_l = mrevs if lm == rm else await self.revisions(source, lm)
                except RevisionError as e:
                    warnings.append(f"Map {sid}: referenced Map revisions unavailable ({e.message})")
                    continue
                lv, rv = self._version_at(mrevs_l, left_meta["modifiedDate"]), self._version_at(mrevs, right_meta["modifiedDate"])
                info = {"shapeId": sid, "leftMapId": lm, "rightMapId": rm,
                        "leftVersion": lv["version"] if lv else None, "rightVersion": rv["version"] if rv else None,
                        "mapName": (rv or lv or {}).get("name")}
                resolved.append(info)
                if not lv or not rv:
                    warnings.append(f"Map {sid}: could not determine which Map revision was current at each process revision; Map definition not compared.")
                    continue
                if lm == rm and lv["version"] == rv["version"]:
                    continue
                try:
                    lx, rx = await asyncio.gather(self.definition(source, lm, lv["version"]), self.definition(source, rm, rv["version"]))
                    src = {"componentId": rm, "name": rv["name"], "kind": "map",
                           "versions": f"v{lv['version']} → v{rv['version']}"}
                    changes.extend(diff.compare_maps(lx, rx, {**src, "shapeId": sid}, include_unchanged, len(changes)))
                except RevisionError as e:
                    warnings.append(f"Map {sid}: {e.message}")
                except diff.ComparisonError as e:
                    warnings.append(f"Map {sid}: {e}")
            if resolved:
                warnings.append("Referenced Map revisions are resolved by timestamp (the newest Map revision saved at or before each process revision). "
                                "Boomi does not record which Map revision a process revision used.")

        return {
            "source": source,
            "componentId": component_id,
            "componentName": right_meta["name"],
            "kind": result["kind"],
            "left": left_meta,
            "right": right_meta,
            "summary": diff.summarize(changes),
            "changes": changes,
            "warnings": warnings,
            "resolvedMaps": resolved,
        }

    async def compare_xml(self, left_xml: str, right_xml: str, left_label: str, right_label: str, include_unchanged: bool) -> Dict[str, Any]:
        try:
            result = diff.compare_definitions(left_xml, right_xml, include_unchanged)
        except diff.ComparisonError as e:
            raise RevisionError(422, "comparison_failed", str(e))
        warnings = list(result["warnings"])
        if result["kind"] == "process" and (result["mapRefs"]["left"] or result["mapRefs"]["right"]):
            warnings.append("Uploaded XML contains no historical Map definitions; Map shapes are compared by reference only.")
        label = lambda s: {"version": s, "modifiedBy": None, "modifiedDate": None, "name": s}
        return {
            "source": "upload", "componentId": "uploaded", "componentName": right_label, "kind": result["kind"],
            "left": label(left_label), "right": label(right_label),
            "summary": diff.summarize(result["changes"]), "changes": result["changes"], "warnings": warnings, "resolvedMaps": [],
        }

    @staticmethod
    def _check_source(source: str) -> None:
        if source not in SOURCES:
            raise RevisionError(400, "bad_source", f"Unknown source '{source}'. Use one of: {', '.join(SOURCES)}.")


revision_service = RevisionService()
