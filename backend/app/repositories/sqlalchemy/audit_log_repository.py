from typing import Any, Optional
from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.audit_log import AuditLog
from app.models.course import Course
from app.models.enrollment import Enrollment
from app.models.charge import Charge
from app.models.ledger import LedgerEntry
from app.models.user import User, UserRole
from app.repositories.interfaces.audit_log_repository import (
    AuditActorSummary,
    AuditEntityReference,
    AuditEventKey,
    AuditLogFilters,
    AuditLogRepository,
    AuditLogRow,
)
from app.repositories.sqlalchemy.base_repository import SQLAlchemyBaseRepository


class SQLAlchemyAuditLogRepository(SQLAlchemyBaseRepository[AuditLog], AuditLogRepository):
    def __init__(self, session: AsyncSession) -> None:
        super().__init__(AuditLog, session)

    def stage_log(self, log: AuditLog) -> None:
        self.session.add(log)

    @staticmethod
    def _escape_like_pattern(raw_text: str) -> str:
        return raw_text.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")

    def _apply_filters(self, query: Any, filters: AuditLogFilters) -> Any:
        if filters.actor_id is not None:
            query = query.where(AuditLog.user_id == filters.actor_id)
        if filters.action is not None:
            query = query.where(AuditLog.action == filters.action)
        if filters.entity_type is not None:
            query = query.where(AuditLog.entity_type == filters.entity_type)
        if filters.entity_id is not None:
            query = query.where(AuditLog.entity_id == filters.entity_id)
        if filters.created_from is not None:
            query = query.where(AuditLog.created_at >= filters.created_from)
        if filters.created_before is not None:
            query = query.where(AuditLog.created_at < filters.created_before)
        if filters.search:
            pattern: str = f"%{self._escape_like_pattern(filters.search)}%"
            actor_full_name = func.concat(User.first_name, " ", User.last_name)
            query = query.where(
                AuditLog.entity_type.ilike(pattern, escape="\\")
                | AuditLog.field_name.ilike(pattern, escape="\\")
                | actor_full_name.ilike(pattern, escape="\\")
            )
        return query

    async def list_filtered_rows(
        self, filters: AuditLogFilters, page: int, page_size: int
    ) -> tuple[list[AuditLogRow], int]:
        filtered_query = self._apply_filters(
            select(AuditLog, User.first_name, User.last_name).outerjoin(User, User.id == AuditLog.user_id),
            filters,
        )
        total_result = await self.session.execute(select(func.count()).select_from(filtered_query.subquery()))
        total: int = total_result.scalar() or 0
        page_result = await self.session.execute(
            filtered_query.order_by(AuditLog.created_at.desc(), AuditLog.id.desc()).offset((page - 1) * page_size).limit(page_size)
        )
        rows: list[AuditLogRow] = []
        for log, first_name, last_name in page_result.all():
            actor_name: Optional[str] = f"{first_name} {last_name}" if first_name is not None else None
            rows.append(AuditLogRow(log=log, actor_name=actor_name))
        return rows, total

    async def list_event_keys(
        self, filters: AuditLogFilters, page: int, page_size: int
    ) -> tuple[list[AuditEventKey], int]:
        grouping_columns = (AuditLog.user_id, AuditLog.action, AuditLog.entity_type, AuditLog.entity_id, AuditLog.created_at)
        latest_change_id = func.max(AuditLog.id).label("latest_change_id")
        grouped_query = (
            self._apply_filters(
                select(*grouping_columns, latest_change_id, User.first_name, User.last_name).outerjoin(User, User.id == AuditLog.user_id),
                filters,
            )
            .group_by(*grouping_columns, User.first_name, User.last_name)
        )
        total_result = await self.session.execute(select(func.count()).select_from(grouped_query.subquery()))
        total: int = total_result.scalar() or 0
        page_result = await self.session.execute(
            grouped_query.order_by(AuditLog.created_at.desc(), latest_change_id.desc()).offset((page - 1) * page_size).limit(page_size)
        )
        keys: list[AuditEventKey] = []
        for user_id, action, entity_type, entity_id, created_at, _latest, first_name, last_name in page_result.all():
            actor_name: Optional[str] = f"{first_name} {last_name}" if first_name is not None else None
            keys.append(AuditEventKey(user_id, action, entity_type, entity_id, created_at, actor_name))
        return keys, total

    async def list_changes_for_events(self, event_keys: list[AuditEventKey]) -> list[AuditLog]:
        if not event_keys:
            return []
        key_conditions = [
            and_(
                AuditLog.user_id.is_(None) if key.user_id is None else AuditLog.user_id == key.user_id,
                AuditLog.action == key.action,
                AuditLog.entity_type == key.entity_type,
                AuditLog.entity_id == key.entity_id,
                AuditLog.created_at == key.created_at,
            )
            for key in event_keys
        ]
        change_result = await self.session.execute(select(AuditLog).where(or_(*key_conditions)).order_by(AuditLog.id.asc()))
        return list(change_result.scalars().all())

    async def resolve_course_titles(self, course_ids: set[int]) -> dict[int, str]:
        if not course_ids:
            return {}
        title_result = await self.session.execute(select(Course.id, Course.title).where(Course.id.in_(course_ids)))
        return {course_id: title for course_id, title in title_result.all()}

    async def resolve_entity_references(
        self, entity_ids_by_type: dict[str, set[int]]
    ) -> dict[tuple[str, int], AuditEntityReference]:
        references: dict[tuple[str, int], AuditEntityReference] = {}
        for ledger_entity_type in ("payment", "discount", "adjustment"):
            ledger_entry_ids: set[int] = entity_ids_by_type.get(ledger_entity_type, set())
            if not ledger_entry_ids:
                continue
            ledger_result = await self.session.execute(
                select(LedgerEntry.id, LedgerEntry.student_id, User.first_name, User.last_name, LedgerEntry.amount)
                .join(User, User.id == LedgerEntry.student_id)
                .where(LedgerEntry.id.in_(ledger_entry_ids))
            )
            for ledger_entry_id, student_id, first_name, last_name, amount in ledger_result.all():
                references[(ledger_entity_type, ledger_entry_id)] = AuditEntityReference(f"{first_name} {last_name}", student_id, None, str(amount))
        charge_ids: set[int] = entity_ids_by_type.get("allocation", set())
        if charge_ids:
            charge_result = await self.session.execute(
                select(Charge.id, Charge.student_id, User.first_name, User.last_name)
                .join(User, User.id == Charge.student_id)
                .where(Charge.id.in_(charge_ids))
            )
            for charge_id, student_id, first_name, last_name in charge_result.all():
                references[("allocation", charge_id)] = AuditEntityReference(f"{first_name} {last_name}", student_id, None)
        course_ids: set[int] = entity_ids_by_type.get("course", set())
        if course_ids:
            course_result = await self.session.execute(select(Course.id, Course.title).where(Course.id.in_(course_ids)))
            for course_id, title in course_result.all():
                references[("course", course_id)] = AuditEntityReference(title, None, course_id)
        enrollment_ids: set[int] = entity_ids_by_type.get("enrollment", set())
        if enrollment_ids:
            enrollment_result = await self.session.execute(
                select(Enrollment.id, Enrollment.student_id, Enrollment.course_id, User.first_name, User.last_name)
                .join(User, User.id == Enrollment.student_id)
                .where(Enrollment.id.in_(enrollment_ids))
            )
            for enrollment_id, student_id, course_id, first_name, last_name in enrollment_result.all():
                references[("enrollment", enrollment_id)] = AuditEntityReference(f"{first_name} {last_name}", student_id, course_id)
        for user_entity_type in ("user", "student"):
            user_ids: set[int] = entity_ids_by_type.get(user_entity_type, set())
            if not user_ids:
                continue
            user_result = await self.session.execute(
                select(User.id, User.first_name, User.last_name, User.role).where(User.id.in_(user_ids))
            )
            for user_id, first_name, last_name, role in user_result.all():
                linked_student_id: Optional[int] = user_id if role == UserRole.STUDENT.value else None
                references[(user_entity_type, user_id)] = AuditEntityReference(f"{first_name} {last_name}", linked_student_id, None)
        return references

    async def list_actors(self) -> list[AuditActorSummary]:
        actor_result = await self.session.execute(
            select(User.id, User.first_name, User.last_name)
            .where(User.id.in_(select(AuditLog.user_id).where(AuditLog.user_id.is_not(None)).distinct()))
            .order_by(User.first_name, User.last_name, User.id)
        )
        return [AuditActorSummary(id=user_id, name=f"{first_name} {last_name}") for user_id, first_name, last_name in actor_result.all()]

    async def list_entity_types(self) -> list[str]:
        entity_type_result = await self.session.execute(select(AuditLog.entity_type).distinct().order_by(AuditLog.entity_type))
        return list(entity_type_result.scalars().all())
