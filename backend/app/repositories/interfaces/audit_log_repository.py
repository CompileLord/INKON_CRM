from dataclasses import dataclass
from datetime import datetime
from typing import Optional
from typing_extensions import Protocol
from app.models.audit_log import AuditLog
from app.repositories.interfaces.base_repository import BaseRepository


@dataclass(frozen=True)
class AuditLogFilters:
    actor_id: Optional[int] = None
    action: Optional[str] = None
    entity_type: Optional[str] = None
    entity_id: Optional[int] = None
    created_from: Optional[datetime] = None
    created_before: Optional[datetime] = None
    search: Optional[str] = None


@dataclass(frozen=True)
class AuditActorSummary:
    id: int
    name: str


@dataclass(frozen=True)
class AuditEntityReference:
    label: Optional[str]
    student_id: Optional[int]
    course_id: Optional[int]
    amount: Optional[str] = None


@dataclass(frozen=True)
class AuditEventKey:
    user_id: Optional[int]
    action: str
    entity_type: str
    entity_id: int
    created_at: datetime
    actor_name: Optional[str]


@dataclass(frozen=True)
class AuditLogRow:
    log: AuditLog
    actor_name: Optional[str]


class AuditLogRepository(BaseRepository[AuditLog], Protocol):
    async def list_filtered_rows(
        self, filters: AuditLogFilters, page: int, page_size: int
    ) -> tuple[list[AuditLogRow], int]:
        ...

    async def list_event_keys(
        self, filters: AuditLogFilters, page: int, page_size: int
    ) -> tuple[list[AuditEventKey], int]:
        ...

    async def list_changes_for_events(self, event_keys: list[AuditEventKey]) -> list[AuditLog]:
        ...

    async def resolve_course_titles(self, course_ids: set[int]) -> dict[int, str]:
        ...

    async def resolve_entity_references(
        self, entity_ids_by_type: dict[str, set[int]]
    ) -> dict[tuple[str, int], AuditEntityReference]:
        ...

    async def list_actors(self) -> list[AuditActorSummary]:
        ...

    async def list_entity_types(self) -> list[str]:
        ...
