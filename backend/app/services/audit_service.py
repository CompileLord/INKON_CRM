import logging
from typing import Any, Dict, Optional
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.audit_log import AuditLog, AuditAction
from app.repositories.sqlalchemy.audit_log_repository import SQLAlchemyAuditLogRepository

logger = logging.getLogger(__name__)


class AuditService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.audit_repo = SQLAlchemyAuditLogRepository(db)

    async def log(
        self,
        user_id: Optional[int],
        action: str,
        entity_type: str,
        entity_id: int,
        changes: Dict[str, Any]
    ) -> None:
        try:
            for field, values in changes.items():
                old_val, new_val = values
                audit_log = AuditLog(
                    user_id=user_id,
                    action=AuditAction(action),
                    entity_type=entity_type,
                    entity_id=entity_id,
                    field_name=field,
                    old_value=str(old_val) if old_val is not None else None,
                    new_value=str(new_val) if new_val is not None else None
                )
                self.db.add(audit_log)
            await self.db.flush()
        except Exception:
            # Audit must not break the operation being audited, but a silent
            # swallow makes "everything is audited" unverifiable — log it.
            logger.exception(
                "Failed to write audit log for %s #%s (action=%s)", entity_type, entity_id, action
            )

    async def list_logs(self, page: int, page_size: int) -> dict:
        query = select(AuditLog).order_by(AuditLog.id.desc())
        return await self.audit_repo.get_paginated(query, page, page_size)
