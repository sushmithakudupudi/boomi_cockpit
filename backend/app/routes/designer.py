from typing import Any, Dict
from fastapi import APIRouter
from pydantic import BaseModel, Field

from ..services import process_designer
from ..services.companion_ai import companion_ai_service

router = APIRouter(prefix="/designer", tags=["Process Designer"])


class DraftRequest(BaseModel):
    description: str = Field(min_length=1, max_length=2000)


@router.post("/draft")
async def draft(req: DraftRequest) -> Dict[str, Any]:
    """Drafts an integration blueprint in ArchForge from a description. It only saves a draft: nothing is created in Boomi."""
    return await process_designer.design_and_save(req.description, companion_ai_service._openai_client)
