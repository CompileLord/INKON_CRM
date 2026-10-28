from datetime import date, timedelta
from decimal import Decimal
from typing import Any
from sqlalchemy import Select, String, and_, case, cast, exists, func, literal, or_, select, true
from sqlalchemy.sql.elements import ColumnElement
from app.models.allocation import Allocation
from app.models.charge import Charge, ChargeStatus
from app.models.course import Course
from app.models.enrollment import Enrollment, EnrollmentStatus
from app.models.notification_log import NotificationLog, NotificationType
from app.models.org_settings import OrgSettings
from app.models.telegram_link import TelegramChatPreference
from app.models.user import User, UserRole


class ChargeBalanceQuery:
    reminder_types: tuple[NotificationType, ...] = (
        NotificationType.PAYMENT_REMINDER_1D,
        NotificationType.PAYMENT_REMINDER_2D,
    )

    def payment_notifications_enabled(self) -> ColumnElement[bool]:
        return func.coalesce(select(OrgSettings.notify_payments).where(OrgSettings.id == 1).scalar_subquery(), true())

    def balances(self, require_chat: bool = True) -> Select[Any]:
        allocations: Any = (
            select(Allocation.charge_id, func.sum(Allocation.amount).label("allocated"))
            .where(Allocation.reversed_by_entry_id.is_(None))
            .group_by(Allocation.charge_id)
            .subquery()
        )
        remaining: ColumnElement[Decimal] = func.greatest(
            Charge.amount - func.coalesce(allocations.c.allocated, Decimal("0.00")), Decimal("0.00")
        )
        return (
            select(
                Enrollment.id.label("enrollment_id"),
                User.id.label("student_id"),
                User.parent_telegram_chat_id.label("chat_id"),
                User.first_name,
                User.last_name,
                Course.title.label("course_title"),
                Charge.due_date,
                func.sum(remaining).label("balance"),
                func.coalesce(User.preferred_language, TelegramChatPreference.language).label("language"),
            )
            .select_from(Charge)
            .join(Enrollment, Enrollment.id == Charge.enrollment_id)
            .join(User, and_(User.id == Enrollment.student_id, Charge.student_id == User.id))
            .join(Course, Course.id == Enrollment.course_id)
            .outerjoin(allocations, allocations.c.charge_id == Charge.id)
            .outerjoin(TelegramChatPreference, TelegramChatPreference.chat_id == User.parent_telegram_chat_id)
            .where(
                Charge.is_deleted.is_(False),
                Charge.status != ChargeStatus.CANCELLED,
                Enrollment.is_deleted.is_(False),
                Enrollment.status == EnrollmentStatus.ACTIVE,
                User.is_deleted.is_(False),
                User.role == UserRole.STUDENT,
                true() if not require_chat else User.parent_telegram_chat_id.is_not(None),
                Course.is_deleted.is_(False),
            )
            .group_by(
                Enrollment.id,
                User.id,
                User.parent_telegram_chat_id,
                User.first_name,
                User.last_name,
                Course.title,
                Charge.due_date,
                TelegramChatPreference.language,
            )
            .having(func.sum(remaining) > Decimal("0.00"))
        )

    def source_for_identity(
        self,
        recipient: str,
        notification_type: NotificationType,
        enrollment_id: int,
        notification_date: date,
        user_id: int | None,
    ) -> Select[Any]:
        due_date: date = notification_date + timedelta(
            days=1 if notification_type == NotificationType.PAYMENT_REMINDER_1D else 2
        )
        return self.balances().where(
            Enrollment.id == enrollment_id,
            User.id == user_id,
            cast(User.parent_telegram_chat_id, String) == recipient,
            Charge.due_date == due_date,
            self.payment_notifications_enabled(),
        )

    def notification_source(self) -> Select[Any]:
        balances: Any = self.balances().subquery()
        offset: ColumnElement[int] = case((NotificationLog.type == NotificationType.PAYMENT_REMINDER_1D, 1), else_=2)
        return select(balances).where(
            balances.c.enrollment_id == NotificationLog.related_entity_id,
            balances.c.student_id == NotificationLog.user_id,
            cast(balances.c.chat_id, String) == NotificationLog.recipient,
            balances.c.due_date == NotificationLog.notification_date + offset,
            NotificationLog.type.in_(self.reminder_types),
        )

    def eligible_notification(self) -> ColumnElement[bool]:
        return or_(
            NotificationLog.type.not_in(self.reminder_types),
            and_(self.payment_notifications_enabled(), self.notification_source().correlate(NotificationLog).exists()),
        )

    def owned_notification_source(self) -> ColumnElement[bool]:
        return or_(
            NotificationLog.type.not_in(self.reminder_types),
            exists().where(
                User.id == NotificationLog.user_id,
                User.role == UserRole.STUDENT,
                User.is_deleted.is_(False),
                cast(User.parent_telegram_chat_id, String) == NotificationLog.recipient,
                Enrollment.id == NotificationLog.related_entity_id,
                Enrollment.student_id == User.id,
                Enrollment.status == EnrollmentStatus.ACTIVE,
                Enrollment.is_deleted.is_(False),
                Course.id == Enrollment.course_id,
                Course.is_deleted.is_(False),
            ),
        )
