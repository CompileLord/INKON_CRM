from datetime import date
from decimal import Decimal
from typing import Any

from sqlalchemy import Select, func
from sqlalchemy.sql.elements import ColumnElement
from sqlalchemy.sql.selectable import Subquery

from app.models.enrollment import Enrollment
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
