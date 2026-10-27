"""Restore a Boomi component to an earlier revision.

A restore saves the old definition as a NEW revision, so the full history is kept and the restore can
itself be undone. It does not deploy anything: the runtime keeps running whatever is deployed until a
person deploys the new revision.
"""
import logging
import re
import xml.etree.ElementTree as ET
from typing import Any, Dict, Optional

import httpx

from ..config import settings
from .boomi_service import boomi_service
from .revision_service import RevisionError, revision_service

logger = logging.getLogger("component_restore")

# Only these component types can be restored through the agent. Start with processes.
RESTORABLE_TYPES = {"process"}


def _with_current_version(xml_text: str, current_version: int) -> str:
    """The saved definition carries the old version number; Boomi expects the version being replaced."""
    return re.sub(r'(<bns:Component\b[^>]*?\sversion=")\d+(")', rf"\g<1>{current_version}\g<2>", xml_text, count=1)


async def restore_revision(component_id: str, target_version: int, expected_current_version: Optional[int] = None) -> Dict[str, Any]:
    auth = boomi_service._get_boomi_auth()
    if not auth or not settings.BOOMI_ACCOUNT_ID:
        raise ValueError("Boomi credentials are not configured, so nothing can be restored.")

    try:
        revision_service.clear_cache()  # decisions must use the live revision list, not a cached one
        revs = await revision_service.revisions("live", component_id)
    except RevisionError as e:
        raise RuntimeError(f"Could not read the revision history: {e.message}")

    current = revs[0]
    if current["type"] not in RESTORABLE_TYPES:
        raise RuntimeError(f"Only {', '.join(sorted(RESTORABLE_TYPES))} components can be restored here, not '{current['type']}'.")
    if expected_current_version is not None and current["version"] != expected_current_version:
        raise RuntimeError(
            f"'{current['name']}' was changed after this was proposed (now revision {current['version']}, expected {expected_current_version}). "
            "Nothing was restored. Ask the investigator to look again."
        )
    if target_version >= current["version"] or not any(r["version"] == target_version for r in revs):
        raise RuntimeError(f"Revision {target_version} is not an earlier revision of '{current['name']}'.")

    try:
        old_xml = await revision_service.definition("live", component_id, target_version)
    except RevisionError as e:
        raise RuntimeError(f"Could not read revision {target_version}: {e.message}")

    body = _with_current_version(old_xml, current["version"])
    base = f"{settings.BOOMI_BASE_URL.rstrip('/')}/{settings.BOOMI_ACCOUNT_ID.strip()}"
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            res = await client.post(
                f"{base}/Component/{component_id}", auth=auth, content=body,
                headers={"Content-Type": "application/xml", "Accept": "application/xml"},
            )
    except Exception as ex:
        raise RuntimeError(f"Could not reach Boomi to save the restore ({ex.__class__.__name__}). Nothing was changed.")
    if res.status_code not in (200, 201):
        raise RuntimeError(f"Boomi did not accept the restore (HTTP {res.status_code}). {res.text[:200]} Nothing was changed.".strip())

    new_version = None
    try:
        new_version = int(ET.fromstring(res.text).attrib.get("version", "0")) or None
    except (ET.ParseError, ValueError):
        pass
    revision_service.clear_cache()
    logger.info("Restored %s to revision %s (new revision %s)", component_id, target_version, new_version)
    return {
        "success": True, "componentId": component_id, "componentName": current["name"],
        "restoredToVersion": target_version, "replacedVersion": current["version"], "newVersion": new_version,
        "message": (f"Saved revision {new_version or '?'} of '{current['name']}' with the content of revision {target_version}. "
                    "Nothing was deployed: the running process is unchanged until you deploy the new revision."),
    }
