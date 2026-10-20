from datetime import date, datetime
from decimal import Decimal
from typing import Any
from sqlalchemy import Select, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.course import Course
from app.models.debt_reminder_notification import DebtReminderNotification
from app.models.enrollment import Enrollment
from app.models.telegram_link import TelegramChatPreference
from app.models.user import User, UserRole
from app.repositories.interfaces.debt_reminder_repository import DebtReminderSource
from app.repositories.sqlalchemy.debt_query import DebtQuery


class SQLAlchemyDebtReminderRepository:
    counted_statuses: tuple[str, ...] = ("pending", "claimed", "sent")

    def __init__(self, session: AsyncSession) -> None:
        self._session: AsyncSession = session

    async def commit(self) -> None:
        await self._session.commit()

    async def lock_students(self, student_ids: list[int]) -> None:
        await self._session.execute(
            select(User.id).where(User.id.in_(student_ids)).order_by(User.id).with_for_update()
        )

    async def last_reminder_at(self, student_id: int) -> datetime | None:
        return await self._session.scalar(
            select(func.max(DebtReminderNotification.created_at))
            .where(DebtReminderNotification.student_id == student_id,
                   DebtReminderNotification.status.in_(self.counted_statuses))
        )

    async def queue(self, student_id: int, now: datetime) -> None:
        self._session.add(DebtReminderNotification(student_id=student_id, due_at=now, created_at=now))
        await self._session.flush()

    async def load_source(self, student_id: int, today: date) -> DebtReminderSource | None:
        student: Any = (await self._session.execute(
            select(User.first_name, User.last_name, User.parent_telegram_chat_id, TelegramChatPreference.language)
            .outerjoin(TelegramChatPreference, TelegramChatPreference.chat_id == User.parent_telegram_chat_id)
            .where(User.id == student_id, User.role == UserRole.STUDENT, User.is_deleted.is_(False))
        )).first()
        if student is None:
            return None
        query: Select[Any]
        query, _ = DebtQuery().build(today)
        balances: Any = query.where(Enrollment.student_id == student_id).subquery()
        course_rows: Any = (await self._session.execute(
            select(balances.c.title, func.sum(balances.c.debt))
            .group_by(balances.c.course_id, balances.c.title).order_by(balances.c.course_id)
        )).all()
        total: Decimal = await self._session.scalar(select(func.coalesce(func.sum(balances.c.debt), 0)))
        return DebtReminderSource(
            student_id, f"{student.first_name} {student.last_name}".strip(), student.parent_telegram_chat_id,
            student.language, total, tuple((row[0], row[1]) for row in course_rows if row[1] > 0),
        )

    async def list_debts(self, today: date, filters: dict[str, Any], page: int, page_size: int) -> dict[str, Any]:
        query: Select[Any]
        debt: Any
        query, debt = DebtQuery().build(today)
        for key, column in (("course_id", Enrollment.course_id), ("student_id", Enrollment.student_id), ("status", Enrollment.status)):
            if filters.get(key) is not None:
                query = query.where(column == filters[key])
        query = query.where(debt >= filters["min_debt"] if filters.get("min_debt") is not None else debt > 0)
        if filters.get("overdue_days") is not None:
            query = query.where(query.selected_columns.overdue_days >= filters["overdue_days"])
        total: int = await self._session.scalar(select(func.count()).select_from(query.subquery())) or 0
        latest: Any = (
            select(func.max(DebtReminderNotification.created_at))
            .where(DebtReminderNotification.student_id == User.id,
                   DebtReminderNotification.status.in_(self.counted_statuses)).correlate(User).scalar_subquery()
        )
        rows: Any = (await self._session.execute(
            query.add_columns(latest.label("last_reminder_at"))
            .order_by(debt.desc(), Enrollment.id).offset((page - 1) * page_size).limit(page_size)
        )).all()
        items: list[dict[str, Any]] = []
        row: Any
        for row in rows:
            enrollment, student, course, billed, allocated, amount, overdue, last_reminder = row
            items.append({
                "student": {"id": student.id, "first_name": student.first_name, "last_name": student.last_name,
                            "email": student.email, "payment_day_of_month": student.payment_day_of_month},
                "course": {"id": course.id, "title": course.title},
                "price_at_enrollment": enrollment.price_at_enrollment, "billed_to_date": billed,
                "total_paid": allocated, "debt": amount, "overdue_days": max(0, int(overdue or 0)),
                "parent_telegram_linked": student.parent_telegram_chat_id is not None,
                "last_reminder_at": last_reminder,
            })
        return {"items": items, "total": total, "page": page, "page_size": page_size,
                "total_pages": (total + page_size - 1) // page_size}
