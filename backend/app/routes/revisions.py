from typing import Any, Dict
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from ..services.revision_service import RevisionError, revision_service

router = APIRouter(prefix="/revisions", tags=["Revision History"])

MAX_XML_CHARS = 5_000_000


def _raise(e: RevisionError):
    raise HTTPException(status_code=e.status, detail={"code": e.code, "message": e.message})


class XmlCompareRequest(BaseModel):
    leftXml: str
    rightXml: str
    leftLabel: str = "Revision A"
    rightLabel: str = "Revision B"
    includeUnchanged: bool = False


@router.get("/status")
def revisions_status() -> Dict[str, Any]:
    """Whether live Boomi access is configured, and that sample fixtures are available."""
    return revision_service.status()


@router.get("/components")
async def list_components(
    source: str = "live",
    q: str = "",
    type: str = "",
    author: str = "",
    dateFrom: str = Query("", pattern=r"^(\d{4}-\d{2}-\d{2})?$"),
    dateTo: str = Query("", pattern=r"^(\d{4}-\d{2}-\d{2})?$"),
    refresh: bool = False,
):
    """Browse components (latest revision metadata), filtered by name/ID, type, author and last-modified range."""
    try:
        if refresh:
            revision_service.clear_cache()
        return await revision_service.list_components(source, q, type, author, dateFrom, dateTo)
    except RevisionError as e:
        _raise(e)


@router.get("/components/{component_id}/revisions")
async def list_revisions(component_id: str, source: str = "live"):
    """All available revisions of a component, newest first."""
    try:
        return {"source": source, "componentId": component_id, "revisions": await revision_service.revisions(source, component_id)}
    except RevisionError as e:
        _raise(e)


@router.get("/components/{component_id}/compare")
async def compare_revisions(component_id: str, fromVersion: int, toVersion: int, source: str = "live", includeUnchanged: bool = False):
    """Compare the real definitions of any two revisions of a component (non-consecutive allowed)."""
    try:
        return await revision_service.compare(source, component_id, fromVersion, toVersion, includeUnchanged)
    except RevisionError as e:
        _raise(e)


@router.post("/compare-xml")
async def compare_xml(body: XmlCompareRequest):
    """Compare two uploaded component XML files. Results are labelled source='upload'."""
    if len(body.leftXml) > MAX_XML_CHARS or len(body.rightXml) > MAX_XML_CHARS:
        raise HTTPException(status_code=413, detail={"code": "too_large", "message": "Uploaded XML exceeds the 5 MB limit."})
    try:
        return await revision_service.compare_xml(body.leftXml, body.rightXml, body.leftLabel, body.rightLabel, body.includeUnchanged)
    except RevisionError as e:
        _raise(e)
