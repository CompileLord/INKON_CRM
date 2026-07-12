from typing import Any, Dict, Optional
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.audit_log import AuditLog, AuditAction
from app.repositories.sqlalchemy.audit_log_repository import SQLAlchemyAuditLogRepository


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
            try:
                await self.db.rollback()
            except Exception:
                pass

    async def list_logs(self, page: int, page_size: int) -> dict:
        query = select(AuditLog).order_by(AuditLog.id.desc())
        return await self.audit_repo.get_paginated(query, page, page_size)
