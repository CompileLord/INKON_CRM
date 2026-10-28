from datetime import date, datetime, timedelta
from typing import Any

from sqlalchemy import and_, false, func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.charge import Charge
from app.models.course import Course
from app.models.enrollment import Enrollment
from app.models.journal import Journal
from app.models.journal_student_summary import JournalStudentSummary
from app.models.notification_log import NotificationLog, NotificationStatus
from app.models.user import User, UserRole
from app.repositories.sqlalchemy.charge_balance_query import ChargeBalanceQuery


class SQLAlchemyNotificationRetryDispatchRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session: AsyncSession = session

    async def claim(self, notification_id: int, revision: int, token: str, now: datetime) -> NotificationLog | None:
        return (await self._session.execute(
            update(NotificationLog).where(
                NotificationLog.id == notification_id, NotificationLog.retry_requested.is_(True),
                NotificationLog.revision == revision, NotificationLog.attempts < 3,
                func.coalesce(NotificationLog.is_terminal, false()).is_(False),
                or_(NotificationLog.delivery_state.in_([NotificationStatus.QUEUED, NotificationStatus.FAILED]),
                    and_(NotificationLog.delivery_state == NotificationStatus.INFLIGHT,
                         NotificationLog.lease_expires_at <= now)),
            ).values(delivery_state=NotificationStatus.INFLIGHT, claim_token=token,
                     lease_expires_at=now + timedelta(seconds=90), attempts=NotificationLog.attempts + 1)
            .returning(NotificationLog).execution_options(populate_existing=True)
        )).scalar_one_or_none()

    async def student(self, user_id: int | None) -> User | None:
        return (await self._session.execute(select(User).where(
            User.id == user_id, User.role == UserRole.STUDENT, User.is_deleted.is_(False)
        ))).scalar_one_or_none()

    async def reminder(self, enrollment_id: int, student_id: int, due_date: date) -> Any:
        query: ChargeBalanceQuery = ChargeBalanceQuery()
        return (await self._session.execute(query.balances(require_chat=False).where(
            Enrollment.id == enrollment_id, User.id == student_id, Charge.due_date == due_date,
            query.payment_notifications_enabled(),
        ))).one_or_none()

    async def exam(self, journal_id: int | None, summary_id: int, student_id: int) -> Any:
        return (await self._session.execute(select(JournalStudentSummary, Journal, Course)
            .join(Journal, Journal.id == JournalStudentSummary.journal_id)
            .join(Course, Course.id == Journal.course_id)
            .where((Journal.id == journal_id) if journal_id is not None else (JournalStudentSummary.id == summary_id),
                   JournalStudentSummary.student_id == student_id, Course.is_deleted.is_(False)))).one_or_none()
