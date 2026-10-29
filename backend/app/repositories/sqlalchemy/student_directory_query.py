from datetime import date
from decimal import Decimal
from typing import Any

from sqlalchemy import Select, case, func, select
from sqlalchemy.sql.elements import ColumnElement
from sqlalchemy.sql.selectable import Subquery

from app.models.enrollment import Enrollment, EnrollmentStatus
from app.models.course import Course, CourseStatus
from app.repositories.sqlalchemy.debt_query import DebtQuery


class StudentDirectoryQuery:
    def debts(self, today: date) -> Subquery:
        query: Select[Any]
        balance: ColumnElement[Decimal]
        query, balance = DebtQuery().build(today)
        return (
            query.with_only_columns(Enrollment.student_id.label("student_id"), func.sum(balance).label("debt"))
            .where(balance > Decimal("0.00"))
            .group_by(Enrollment.student_id).subquery()
        )

    def active_enrollments(self) -> Subquery:
        return (select(Enrollment.student_id.label("student_id"), func.count(Enrollment.id).label("count"),
                       func.sum(case((func.coalesce(Enrollment.billing_mode, "paid") != "grant", 1), else_=0)).label("paid"))
                .join(Course, Course.id == Enrollment.course_id)
                .where(Enrollment.is_deleted.is_(False), Enrollment.status == EnrollmentStatus.ACTIVE,
                       Course.is_deleted.is_(False), Course.status == CourseStatus.ACTIVE)
                .group_by(Enrollment.student_id).subquery())

    def payment_status(self, debt: Any, active: Subquery) -> Any:
        return case((debt > 0, "debt"),
                    ((func.coalesce(active.c.count, 0) > 0) & (active.c.paid == 0), "grant"), else_="ok")
