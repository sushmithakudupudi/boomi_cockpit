from typing import List, Optional
from fastapi import APIRouter, HTTPException, Query
from ..models.schemas import ExecutionRecord
from ..services.boomi_service import boomi_service

router = APIRouter(prefix="/executions", tags=["Executions"])

@router.get("", response_model=List[ExecutionRecord])
def list_executions(
    status: Optional[str] = Query(None, description="Filter by status (SUCCESS, ERROR, WARNING, IN_PROGRESS)"),
    environment: Optional[str] = Query(None, description="Filter by environment (Production, Staging, Test)"),
    atom_name: Optional[str] = Query(None, description="Filter by Atom name"),
    search: Optional[str] = Query(None, description="Search keyword in ID, Process, or Error"),
    limit: int = Query(50, ge=1, le=200, description="Max number of records to return")
):
    """
    Fetches process execution records from the Boomi AtomSphere Process Reporting API.
    """
    records = boomi_service.get_executions(
        status=status,
        environment=environment,
        atom_name=atom_name,
        search=search,
        limit=limit
    )
    return records

@router.get("/{execution_id}", response_model=ExecutionRecord)
def get_execution_detail(execution_id: str):
    """
    Fetches execution record details including document payload, stacktrace, and AI triage findings.
    """
    record = boomi_service.get_execution_by_id(execution_id)
    if not record:
        raise HTTPException(status_code=404, detail=f"Execution with ID '{execution_id}' was not found.")
    return record
