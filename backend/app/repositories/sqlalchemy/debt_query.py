from datetime import date
from decimal import Decimal
from typing import Any
from sqlalchemy import Date, Select, case, cast, func, literal, select
from sqlalchemy.sql.elements import ColumnElement
from app.models.allocation import Allocation
from app.models.charge import Charge, ChargeStatus
from app.models.course import Course
from app.models.enrollment import Enrollment, EnrollmentStatus
from app.models.user import User


class DebtQuery:
    def build(self, today: date) -> tuple[Select[Any], ColumnElement[Decimal]]:
        zero: Decimal = Decimal("0.00")
        billed: Any = (
            select(
                Charge.enrollment_id,
                func.sum(Charge.amount).label("billed"),
                func.min(case((Charge.status == ChargeStatus.OPEN, Charge.due_date), else_=None)).label("oldest_due"),
            )
            .where(Charge.due_date <= today, Charge.status != ChargeStatus.CANCELLED, Charge.is_deleted.is_(False))
            .group_by(Charge.enrollment_id).subquery()
        )
        allocated: Any = (
            select(Charge.enrollment_id, func.sum(Allocation.amount).label("allocated"))
            .join(Allocation, Allocation.charge_id == Charge.id)
            .where(
                Charge.due_date <= today, Charge.status != ChargeStatus.CANCELLED,
                Charge.is_deleted.is_(False), Allocation.reversed_by_entry_id.is_(None),
            ).group_by(Charge.enrollment_id).subquery()
        )
        billed_amount: Any = func.coalesce(billed.c.billed, zero)
        allocated_amount: Any = func.coalesce(allocated.c.allocated, zero)
        debt: ColumnElement[Decimal] = billed_amount - allocated_amount
        overdue: Any = case(
            (billed.c.oldest_due.is_(None), 0), (debt <= zero, 0),
            else_=cast(literal(today), Date) - billed.c.oldest_due,
        )
        query: Select[Any] = (
            select(Enrollment, User, Course, billed_amount.label("billed"), allocated_amount.label("allocated"),
                   debt.label("debt"), overdue.label("overdue_days"))
            .join(User, User.id == Enrollment.student_id).join(Course, Course.id == Enrollment.course_id)
            .outerjoin(billed, billed.c.enrollment_id == Enrollment.id)
            .outerjoin(allocated, allocated.c.enrollment_id == Enrollment.id)
            .where(Enrollment.is_deleted.is_(False), Enrollment.status.in_([EnrollmentStatus.ACTIVE, EnrollmentStatus.WITHDRAWN]), User.is_deleted.is_(False))
        )
        return query, debt
