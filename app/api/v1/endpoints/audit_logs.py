from fastapi import APIRouter, HTTPException
from typing import List

from app.schemas.audit_log import AuditLog, AuditLogFilter
from app.services.audit_service import audit_service

router = APIRouter()


@router.post("/search", response_model=List[AuditLog])
def search_audit_logs(filter_params: AuditLogFilter):
    """
    Search audit logs with optional filters (user, action, analysis,
    resource_type, date range), ordered by created_at desc, paginated.
    """
    try:
        return audit_service.search(filter_params)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
