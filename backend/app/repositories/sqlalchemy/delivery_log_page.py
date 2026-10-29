from datetime import date
from typing import Any, Awaitable, Callable
from sqlalchemy import Date, and_, case, cast, func, select, union_all
from sqlalchemy.engine import Row
from sqlalchemy.sql.elements import ColumnElement
from sqlalchemy.orm import aliased
from typing import Sequence
from app.models.enrollment import Enrollment
from app.models.course import Course
from app.models.journal import Journal
from app.models.journal_student_summary import JournalStudentSummary
from app.models.user import UserRole
from app.models.notification_log import NotificationType
from app.repositories.sqlalchemy.notification_context import NotificationContext
from app.repositories.sqlalchemy.charge_balance_query import ChargeBalanceQuery
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.notification_log import NotificationLog, NotificationStatus
from app.models.outbox_event import OutboxEvent, OutboxEventKind, OutboxEventStatus
from app.models.user import User


class DeliveryLogPage:
    def __init__(self, session: AsyncSession) -> None:
        self.session: AsyncSession = session
        self.reminder_query: ChargeBalanceQuery = ChargeBalanceQuery()

    @staticmethod
    def sms_status() -> Any:
        return case(
            (OutboxEvent.status == OutboxEventStatus.PENDING, "queued"),
            (OutboxEvent.status == OutboxEventStatus.CLAIMED, "inflight"),
            (OutboxEvent.status == OutboxEventStatus.DELIVERED, "sent"),
            else_="failed",
        )

    async def page(self, page: int, page_size: int, delivery_status: NotificationStatus | None,
                   legacy: Callable[..., Awaitable[tuple[list[dict[str, Any]], int]]]) -> tuple[list[dict[str, Any]], int]:
        notification_status: Any = func.coalesce(NotificationLog.delivery_state, NotificationLog.status)
        sms_status: Any = self.sms_status()
        notifications: Any = select(NotificationLog.id.label("id"), NotificationLog.notification_date.label("day"), notification_status.label("status"))
        messages: Any = select((-OutboxEvent.id).label("id"), cast(OutboxEvent.created_at, Date).label("day"), sms_status.label("status")).where(OutboxEvent.kind == OutboxEventKind.DEBT_REMINDER_SMS)
        combined: Any = union_all(notifications, messages).subquery()
        conditions: list[Any] = [combined.c.status == delivery_status.value] if delivery_status is not None else []
        total: int = (await self.session.execute(select(func.count()).select_from(combined).where(*conditions))).scalar_one()
        keys: list[int] = list((await self.session.execute(select(combined.c.id).where(*conditions).order_by(combined.c.day.desc(), combined.c.id.desc()).offset((page - 1) * page_size).limit(page_size))).scalars())
        notification_ids: list[int] = [key for key in keys if key > 0]
        event_ids: list[int] = [-key for key in keys if key < 0]
        items: dict[int, dict[str, Any]] = {}
        if notification_ids:
            legacy_items: list[dict[str, Any]]
            legacy_items, _ = await legacy(1, len(notification_ids), None, notification_ids=notification_ids)
            items.update({item["id"]: item for item in legacy_items})
        if event_ids:
            rows: Any = (await self.session.execute(select(OutboxEvent, User.first_name, User.last_name).outerjoin(User, User.id == OutboxEvent.target_user_id).where(OutboxEvent.id.in_(event_ids), OutboxEvent.kind == OutboxEventKind.DEBT_REMINDER_SMS))).all()
            for event, first_name, last_name in rows:
                state: str = {OutboxEventStatus.PENDING: "queued", OutboxEventStatus.CLAIMED: "inflight", OutboxEventStatus.DELIVERED: "sent"}.get(event.status, "failed")
                items[-event.id] = {"id": -event.id, "recipient_name": f"{first_name} {last_name}".strip() if first_name is not None else None,
                    "type": "debt_reminder_sms", "notification_date": event.created_at.date(), "status": state,
                    "attempts": event.attempt_count, "sent_at": event.delivered_at, "student_id": event.target_user_id,
                    "course_id": None, "course_title": None, "amount": format(event.dispatched_amount, ".2f") if event.dispatched_amount is not None else None,
                    "score": None, "reason": event.last_error if state == "failed" else None, "outbox_status": event.status.value}
        return [items[key] for key in keys if key in items], total

    async def legacy(
        self, page: int, page_size: int, delivery_status: NotificationStatus | None,
        notification_id: int | None = None, notification_ids: list[int] | None = None,
    ) -> tuple[list[dict[str, Any]], int]:
        conditions: list[ColumnElement[bool]] = (
            [func.coalesce(NotificationLog.delivery_state, NotificationLog.status) == delivery_status.value]
            if delivery_status is not None
            else []
        )
        if notification_id is not None:
            conditions.append(NotificationLog.id == notification_id)
        if notification_ids is not None:
            conditions.append(NotificationLog.id.in_(notification_ids))
        total: int = (
            await self.session.execute(select(func.count()).select_from(NotificationLog).where(*conditions))
        ).scalar_one()
        reminder_course: Any = aliased(Course)
        exam_course: Any = aliased(Course)
        rows: Sequence[Row[Any]] = (
            await self.session.execute(
                select(NotificationLog, User.first_name, User.last_name, User.role, reminder_course.id,
                       reminder_course.title, exam_course.id, exam_course.title)
                .outerjoin(User, User.id == NotificationLog.user_id)
                .outerjoin(Enrollment, and_(NotificationLog.type.in_(self.reminder_query.reminder_types),
                                             Enrollment.id == NotificationLog.related_entity_id,
                                             Enrollment.student_id == NotificationLog.user_id))
                .outerjoin(reminder_course, reminder_course.id == Enrollment.course_id)
                .outerjoin(JournalStudentSummary, and_(NotificationLog.type == NotificationType.EXAM_RESULT,
                    JournalStudentSummary.id == -NotificationLog.related_entity_id,
                    JournalStudentSummary.student_id == NotificationLog.user_id))
                .outerjoin(Journal, and_(NotificationLog.type == NotificationType.EXAM_RESULT,
                    Journal.id == func.coalesce(NotificationLog.source_journal_id,
                                               JournalStudentSummary.journal_id, NotificationLog.related_entity_id)))
                .outerjoin(exam_course, exam_course.id == Journal.course_id)
                .where(*conditions)
                .order_by(NotificationLog.notification_date.desc(), NotificationLog.id.desc())
                .offset((page - 1) * page_size)
                .limit(page_size)
            )
        ).all()
        items: list[dict[str, Any]] = [
            {
                "id": log.id,
                "recipient_name": f"{first_name} {last_name}".strip() if first_name is not None else None,
                "type": log.type,
                "notification_date": log.notification_date,
                "status": log.delivery_state or log.status,
                "attempts": log.attempts,
                "sent_at": log.sent_at,
                "student_id": log.user_id if role == UserRole.STUDENT else None,
                "course_id": reminder_course_id or exam_course_id,
                "course_title": reminder_title or exam_title,
                "amount": format(log.delivery_amount, ".2f") if log.delivery_amount is not None else None,
                "score": NotificationContext.exam_score(log),
            }
            for log, first_name, last_name, role, reminder_course_id, reminder_title, exam_course_id, exam_title in rows
        ]
        return items, total

