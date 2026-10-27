from fastapi import APIRouter
from ..models.schemas import TopologyResponse
from ..services.boomi_service import boomi_service

router = APIRouter(prefix="/topology", tags=["Topology & Process Flow"])

@router.get("/{process_id}", response_model=TopologyResponse)
async def get_process_topology(process_id: str):
    """
    Returns the visual React Flow node and edge hierarchy for a given Boomi process,
    reflecting live shape execution states, document metrics, and error callouts directly
    extracted from Boomi XML component definitions.
    """
    return await boomi_service.get_topology(process_id)
