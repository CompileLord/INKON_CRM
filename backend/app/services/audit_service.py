import json
from datetime import date, datetime, time, timedelta, timezone
from typing import Any, Dict, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from app.repositories.interfaces.base_repository import RepositoryPage
from app.models.audit_log import AuditLog, AuditAction
from app.repositories.interfaces.audit_log_repository import (
    AuditLogRepository,
    AuditEntityReference,
    AuditEventKey,
    AuditLogFilters,
    AuditLogRow,
)
from app.repositories.sqlalchemy.audit_log_repository import SQLAlchemyAuditLogRepository

DUSHANBE_UTC_OFFSET: timedelta = timedelta(hours=5)
MAXIMUM_PAGE_SIZE: int = 100


class AuditService:
    def __init__(self, db: AsyncSession, audit_repo: AuditLogRepository | None = None) -> None:
        self.db: AsyncSession = db
        self.audit_repo: AuditLogRepository = audit_repo if audit_repo is not None else SQLAlchemyAuditLogRepository(db)

    async def log(
        self,
        user_id: Optional[int],
        action: str,
        entity_type: str,
        entity_id: int,
        changes: Dict[str, Any],
        entity_label: str | None = None,
    ) -> None:
        for field, values in changes.items():
            old_val, new_val = values
            audit_log: AuditLog = AuditLog(
                user_id=user_id,
                action=AuditAction(action),
                entity_type=entity_type,
                entity_id=entity_id,
                entity_label=entity_label,
                field_name=field,
                old_value=str(old_val) if old_val is not None else None,
                new_value=str(new_val) if new_val is not None else None,
            )
            if entity_label is not None:
                audit_log.created_at = datetime.now(timezone.utc)
            self.audit_repo.stage_log(audit_log)

    async def log_change(
        self, actor_id: int | None, action: str, entity_type: str,
        entity_id: int, entity_label: str, changed_fields: set[str],
    ) -> None:
        if changed_fields:
            await self.log(
                actor_id, action, entity_type, entity_id,
                {"changed_fields": (None, json.dumps(sorted(changed_fields)))},
                entity_label=entity_label,
            )

    @staticmethod
    def _dushanbe_day_start_in_utc(local_day: date) -> datetime:
        return datetime.combine(local_day, time.min).replace(tzinfo=timezone.utc) - DUSHANBE_UTC_OFFSET

    def _build_filters(
        self,
        actor_id: Optional[int],
        action: Optional[AuditAction],
        entity_type: Optional[str],
        entity_id: Optional[int],
        date_from: Optional[date],
        date_to: Optional[date],
        search: Optional[str],
    ) -> AuditLogFilters:
        normalized_search: Optional[str] = search.strip() if search and search.strip() else None
        return AuditLogFilters(
            actor_id=actor_id,
            action=action.value if action is not None else None,
            entity_type=entity_type,
            entity_id=entity_id,
            created_from=self._dushanbe_day_start_in_utc(date_from) if date_from is not None else None,
            created_before=self._dushanbe_day_start_in_utc(date_to + timedelta(days=1)) if date_to is not None else None,
            search=normalized_search,
        )

    async def list_events(
        self,
        page: int,
        page_size: int,
        actor_id: Optional[int] = None,
        action: Optional[AuditAction] = None,
        entity_type: Optional[str] = None,
        entity_id: Optional[int] = None,
        date_from: Optional[date] = None,
        date_to: Optional[date] = None,
        search: Optional[str] = None,
    ) -> RepositoryPage[dict[str, Any]]:
        bounded_page_size: int = min(max(1, page_size), MAXIMUM_PAGE_SIZE)
        filters: AuditLogFilters = self._build_filters(actor_id, action, entity_type, entity_id, date_from, date_to, search)
        event_keys, total = await self.audit_repo.list_event_keys(filters, page, bounded_page_size)
        changes = await self.audit_repo.list_changes_for_events(event_keys)
        changes_by_key: dict[tuple, list[AuditLog]] = {}
        for change in changes:
            changes_by_key.setdefault(self._event_identity(change.user_id, change.action, change.entity_type, change.entity_id, change.created_at), []).append(change)
        references = await self.audit_repo.resolve_entity_references(self._collect_event_entity_ids(event_keys))
        events: list[dict] = []
        for key in event_keys:
            event_changes = changes_by_key.get(self._event_identity(key.user_id, key.action, key.entity_type, key.entity_id, key.created_at), [])
            events.append(self._serialize_event(key, event_changes, references.get((key.entity_type, key.entity_id))))
        course_titles = await self.audit_repo.resolve_course_titles({event["course_id"] for event in events if event["course_id"] is not None})
        for event in events:
            event["course_title"] = course_titles.get(event["course_id"]) if event["course_id"] is not None else None
        return {
            "items": events,
            "total": total,
            "page": page,
            "page_size": bounded_page_size,
            "total_pages": (total + bounded_page_size - 1) // bounded_page_size if total > 0 else 0,
        }

    @staticmethod
    def _event_identity(user_id: Optional[int], action: str, entity_type: str, entity_id: int, created_at: datetime) -> tuple:
        return (user_id, str(action.value if isinstance(action, AuditAction) else action), entity_type, entity_id, created_at)

    @staticmethod
    def _collect_event_entity_ids(event_keys: list[AuditEventKey]) -> dict[str, set[int]]:
        entity_ids_by_type: dict[str, set[int]] = {}
        for key in event_keys:
            entity_ids_by_type.setdefault(key.entity_type, set()).add(key.entity_id)
        return entity_ids_by_type

    @staticmethod
    def _serialize_event(key: AuditEventKey, changes: list[AuditLog], reference: Optional[AuditEntityReference]) -> dict:
        course_id: Optional[int] = reference.course_id if reference else None
        if course_id is None:
            referenced_course = next((change.new_value for change in changes if change.field_name == "course_id" and change.new_value and change.new_value.isdigit()), None)
            course_id = int(referenced_course) if referenced_course is not None else None
        return {
            "id": min((change.id for change in changes), default=0),
            "user_id": key.user_id,
            "actor_name": key.actor_name,
            "action": key.action,
            "entity_type": key.entity_type,
            "entity_id": key.entity_id,
            "entity_label": next((change.entity_label for change in changes if change.entity_label), reference.label if reference else None),
            "student_id": reference.student_id if reference else None,
            "course_id": course_id,
            "course_title": None,
            "amount": reference.amount if reference else None,
            "created_at": key.created_at,
            "changes": [
                {"id": change.id, "field_name": change.field_name, "old_value": change.old_value, "new_value": change.new_value}
                for change in changes
            ],
        }

    async def list_logs(
        self,
        page: int,
        page_size: int,
        actor_id: Optional[int] = None,
        action: Optional[AuditAction] = None,
        entity_type: Optional[str] = None,
        entity_id: Optional[int] = None,
        date_from: Optional[date] = None,
        date_to: Optional[date] = None,
        search: Optional[str] = None,
    ) -> RepositoryPage[dict[str, Any]]:
        bounded_page_size: int = min(max(1, page_size), MAXIMUM_PAGE_SIZE)
        filters: AuditLogFilters = self._build_filters(actor_id, action, entity_type, entity_id, date_from, date_to, search)
        rows, total = await self.audit_repo.list_filtered_rows(filters, page, bounded_page_size)
        references = await self.audit_repo.resolve_entity_references(self._collect_entity_ids(rows))
        return {
            "items": [self._serialize_row(row, references.get((row.log.entity_type, row.log.entity_id))) for row in rows],
            "total": total,
            "page": page,
            "page_size": bounded_page_size,
            "total_pages": (total + bounded_page_size - 1) // bounded_page_size if total > 0 else 0,
        }

    @staticmethod
    def _collect_entity_ids(rows: list[AuditLogRow]) -> dict[str, set[int]]:
        entity_ids_by_type: dict[str, set[int]] = {}
        for row in rows:
            entity_ids_by_type.setdefault(row.log.entity_type, set()).add(row.log.entity_id)
        return entity_ids_by_type

    @staticmethod
    def _serialize_row(row: AuditLogRow, reference: Optional[AuditEntityReference]) -> dict:
        log: AuditLog = row.log
        return {
            "id": log.id,
            "user_id": log.user_id,
            "actor_name": row.actor_name,
            "action": log.action,
            "entity_type": log.entity_type,
            "entity_id": log.entity_id,
            "entity_label": log.entity_label or (reference.label if reference else None),
            "student_id": reference.student_id if reference else None,
            "course_id": reference.course_id if reference else None,
            "field_name": log.field_name,
            "old_value": log.old_value,
            "new_value": log.new_value,
            "created_at": log.created_at,
        }

    async def get_filter_options(self) -> dict:
        actors = await self.audit_repo.list_actors()
        entity_types = await self.audit_repo.list_entity_types()
        return {
            "actors": [{"id": actor.id, "name": actor.name} for actor in actors],
            "entity_types": entity_types,
        }
