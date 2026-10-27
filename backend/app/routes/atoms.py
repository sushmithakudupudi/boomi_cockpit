from typing import List
from fastapi import APIRouter
from ..models.schemas import AtomHealth
from ..services.boomi_service import boomi_service

router = APIRouter(prefix="/atoms", tags=["Atoms & Infrastructure"])

@router.get("", response_model=List[AtomHealth])
async def list_atoms():
    """
    Fetches real-time operational status and metrics for all Atoms and Molecules directly from Boomi AtomSphere API.
    """
    return await boomi_service.get_atoms_live()
