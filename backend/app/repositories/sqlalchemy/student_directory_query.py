from datetime import date
from decimal import Decimal
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.sql.selectable import Subquery

from app.models.allocation import Allocation
from app.models.charge import Charge, ChargeStatus
from app.models.enrollment import Enrollment


class StudentDirectoryQuery:
    def debts(self, today: date) -> Subquery:
        billed: Any = (
            select(Charge.enrollment_id.label("enrollment_id"), func.sum(Charge.amount).label("billed"))
            .where(Charge.due_date <= today, Charge.status != ChargeStatus.CANCELLED, Charge.is_deleted.is_(False))
            .group_by(Charge.enrollment_id).subquery()
        )
        allocated: Any = (
            select(Charge.enrollment_id.label("enrollment_id"), func.sum(Allocation.amount).label("allocated"))
            .join(Allocation, Allocation.charge_id == Charge.id)
            .where(Charge.due_date <= today, Charge.status != ChargeStatus.CANCELLED, Charge.is_deleted.is_(False),
                   Allocation.reversed_by_entry_id.is_(None))
            .group_by(Charge.enrollment_id).subquery()
        )
        balance: Any = func.coalesce(billed.c.billed, Decimal("0.00")) - func.coalesce(allocated.c.allocated, Decimal("0.00"))
        return (
            select(Enrollment.student_id.label("student_id"), func.sum(balance).label("debt"))
            .outerjoin(billed, billed.c.enrollment_id == Enrollment.id)
            .outerjoin(allocated, allocated.c.enrollment_id == Enrollment.id)
            .where(Enrollment.is_deleted.is_(False), balance > Decimal("0.00"))
            .group_by(Enrollment.student_id).subquery()
        )
