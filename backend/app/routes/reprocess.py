from fastapi import APIRouter, HTTPException
from ..models.schemas import ReprocessRequest, ReprocessResponse
from ..services.boomi_service import boomi_service

router = APIRouter(tags=["Self-Healing Reprocessor"])

@router.post("/reprocess", response_model=ReprocessResponse)
async def reprocess_execution(req: ReprocessRequest):
    """
    Autonomous 'Self-Healing' Reprocessor:
    Applies Boomi Companion's patch to the malformed document and triggers
    document replay through Boomi AtomSphere API.
    """
    try:
        result = await boomi_service.reprocess_document(
            execution_id=req.executionId,
            patched_payload=req.patchedPayload,
            custom_overrides=req.customOverrides
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to reprocess document: {str(e)}")

@router.post("/executions/{execution_id}/reprocess", response_model=ReprocessResponse)
async def reprocess_execution_by_path(execution_id: str):
    """
    Direct reprocess endpoint by execution ID.
    """
    try:
        result = await boomi_service.reprocess_document(execution_id=execution_id)
        return result
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to reprocess document: {str(e)}")
