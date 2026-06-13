from app.repositories.base_repository import BaseRepository
from app.core.supabase import supabase
from app.schemas.audit_log import AuditLogFilter
from typing import List, Dict, Any


class AuditLogRepository(BaseRepository):
    def __init__(self):
        super().__init__("audit_logs")

    def search(self, filters: AuditLogFilter) -> List[Dict[str, Any]]:
        query = supabase.table(self.table_name).select("*")
        if filters.user_id:
            query = query.eq("user_id", str(filters.user_id))
        if filters.action:
            query = query.eq("action", filters.action)
        if filters.analysis_id:
            query = query.eq("analysis_id", str(filters.analysis_id))
        if filters.resource_type:
            query = query.eq("resource_type", filters.resource_type)
        if filters.date_from:
            query = query.gte("created_at", filters.date_from.isoformat())
        if filters.date_to:
            query = query.lte("created_at", filters.date_to.isoformat())
        response = (
            query.order("created_at", desc=True)
            .range(filters.offset, filters.offset + filters.limit - 1)
            .execute()
        )
        return response.data


audit_log_repository = AuditLogRepository()
