import re
from typing import Literal, Optional

from fastapi import APIRouter, HTTPException, Response

from ..services import process_docs
from ..services.revision_service import RevisionError

router = APIRouter(prefix="/process-docs", tags=["AI Docs"])

MEDIA_TYPES = {
    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "pdf": "application/pdf",
}


def _raise(e: RevisionError):
    raise HTTPException(status_code=e.status, detail={"code": e.code, "message": e.message})


@router.get("/{component_id}")
async def generate_docs(component_id: str, source: str = "live", ai: bool = True, version: Optional[int] = None):
    """Documentation for one revision of a component (latest by default), built from its XML plus an AI summary when OpenAI is configured."""
    try:
        return await process_docs.generate(source, component_id, use_ai=ai, version=version)
    except RevisionError as e:
        _raise(e)


@router.get("/{component_id}/export")
async def export_docs(component_id: str, format: Literal["docx", "pdf"], source: str = "live",
                      ai: bool = True, version: Optional[int] = None):
    """The detailed documentation as a Word (.docx) or PDF download."""
    from ..services import process_docs_export as export

    try:
        doc = await process_docs.generate(source, component_id, use_ai=ai, version=version)
    except RevisionError as e:
        _raise(e)
    body = export.to_docx(doc["exportMarkdown"]) if format == "docx" else export.to_pdf(doc["exportMarkdown"], doc["processName"])
    filename = f"{re.sub(r'[^\w.-]+', '_', doc['processName'])}_v{doc['version']}.{format}"
    return Response(content=body, media_type=MEDIA_TYPES[format],
                    headers={"Content-Disposition": f'attachment; filename="{filename}"'})
