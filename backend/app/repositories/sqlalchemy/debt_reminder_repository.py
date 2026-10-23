from datetime import date, datetime
from decimal import Decimal
from typing import Any
from sqlalchemy import Select, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.org_settings import OrgSettings
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

    async def notifications_enabled(self) -> bool:
        enabled: bool | None = await self._session.scalar(select(OrgSettings.notify_debts).where(OrgSettings.id == 1))
        return enabled is not False

    async def commit(self) -> None:
        await self._session.commit()

    async def lock_students(self, student_ids: list[int]) -> None:
        await self._session.execute(
            select(User.id).where(User.id.in_(student_ids)).order_by(User.id).with_for_update()
        )

    async def last_reminder_times(self, student_ids: list[int]) -> dict[int, datetime]:
        rows: Any = (await self._session.execute(
            select(DebtReminderNotification.student_id, func.max(DebtReminderNotification.created_at))
            .where(DebtReminderNotification.student_id.in_(student_ids),
                   DebtReminderNotification.status.in_(self.counted_statuses))
            .group_by(DebtReminderNotification.student_id)
        )).all()
        return {row[0]: row[1] for row in rows}

    async def queue(self, student_id: int, now: datetime) -> None:
        self._session.add(DebtReminderNotification(student_id=student_id, due_at=now, created_at=now))
        await self._session.flush()

    async def load_source(self, student_id: int, today: date) -> DebtReminderSource | None:
        return (await self.load_sources([student_id], today)).get(student_id)

    async def load_sources(self, student_ids: list[int], today: date) -> dict[int, DebtReminderSource]:
        query: Select[Any]
        debt: Any
        query, debt = DebtQuery().build(today)
        balances: Any = (
            query.with_only_columns(
                Enrollment.student_id, Course.id.label("course_id"), Course.title, func.sum(debt).label("debt")
            ).where(Enrollment.student_id.in_(student_ids))
            .group_by(Enrollment.student_id, Course.id, Course.title).subquery()
        )
        rows: Any = (await self._session.execute(
            select(
                User.id.label("student_id"), User.first_name, User.last_name,
                User.parent_telegram_chat_id, func.coalesce(User.preferred_language, TelegramChatPreference.language).label("language"),
                balances.c.title, balances.c.debt,
                func.coalesce(func.sum(balances.c.debt).over(partition_by=User.id), 0).label("total_debt"),
            )
            .outerjoin(TelegramChatPreference, TelegramChatPreference.chat_id == User.parent_telegram_chat_id)
            .outerjoin(balances, balances.c.student_id == User.id)
            .where(User.id.in_(student_ids), User.role == UserRole.STUDENT, User.is_deleted.is_(False))
            .order_by(User.id, balances.c.course_id)
        )).all()
        students: dict[int, Any] = {}
        courses: dict[int, list[tuple[str, Decimal]]] = {}
        row: Any
        for row in rows:
            students[row.student_id] = row
            courses.setdefault(row.student_id, [])
            if row.debt is not None and row.debt > 0:
                courses[row.student_id].append((row.title, row.debt))
        return {
            student_id: DebtReminderSource(
                student_id, f"{student.first_name} {student.last_name}".strip(), student.parent_telegram_chat_id,
                student.language, student.total_debt, tuple(courses[student_id]),
            )
            for student_id, student in students.items()
        }

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
