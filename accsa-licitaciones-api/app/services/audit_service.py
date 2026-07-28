import logging
from typing import Optional, Dict, Any

from app.repositories.audit_log_repository import audit_log_repository
from app.schemas.audit_log import AuditLog, AuditLogFilter
from app.core.audit import Actor
from typing import List

logger = logging.getLogger(__name__)


class AuditService:
    def __init__(self):
        self.repository = audit_log_repository

    def log(
        self,
        action: str,
        actor: Optional[Actor] = None,
        *,
        analysis_id: Optional[str] = None,
        resource_type: Optional[str] = None,
        resource_id: Optional[str] = None,
        status: str = "success",
        details: Optional[Dict[str, Any]] = None,
    ) -> None:
        """Best-effort audit insert. Never raises: an audit failure must not
        break the business action."""
        try:
            record = {
                "action": action,
                "status": status,
                "resource_type": resource_type,
                "resource_id": str(resource_id) if resource_id else None,
                "analysis_id": str(analysis_id) if analysis_id else None,
                "details": details,
            }
            if actor:
                record["user_id"] = actor.user_id
                record["user_email"] = actor.user_email
                record["ip_address"] = actor.ip_address
                record["user_agent"] = actor.user_agent
            self.repository.create(record)
        except Exception as e:
            logger.error(f"audit log failed for action={action}: {e}")

    def search(self, filters: AuditLogFilter) -> List[AuditLog]:
        data = self.repository.search(filters)
        return [AuditLog(**item) for item in data]


audit_service = AuditService()
