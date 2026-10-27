from fastapi import APIRouter
from ..models.schemas import StatsOverviewResponse
from ..services.boomi_service import boomi_service

router = APIRouter(prefix="/stats", tags=["Telemetry & Metrics"])

@router.get("", response_model=StatsOverviewResponse)
def get_stats_overview():
    """
    Returns platform-wide execution KPIs, MTTR reduction metrics, and auto-heal ratios.
    """
    return boomi_service.get_stats()
