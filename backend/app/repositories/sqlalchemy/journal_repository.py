from datetime import date
from typing import Optional
from sqlalchemy import case, func, select
from sqlalchemy.engine import Result, Row
from sqlalchemy.sql import Select, ColumnElement
from sqlalchemy.sql.selectable import Subquery
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.journal import Journal
from app.models.journal_student_summary import JournalStudentSummary
from app.repositories.interfaces.journal_repository import JournalClassStatistics, JournalRepository
from app.repositories.sqlalchemy.base_repository import SQLAlchemyBaseRepository


class SQLAlchemyJournalRepository(SQLAlchemyBaseRepository[Journal], JournalRepository):
    def __init__(self, session: AsyncSession) -> None:
        super().__init__(Journal, session)

    async def get_class_statistics(self, journal_id: int, student_id: int) -> JournalClassStatistics:
        eligible: tuple[ColumnElement, ...] = (
            JournalStudentSummary.journal_id == journal_id,
            JournalStudentSummary.is_graded.is_(True),
            Journal.period_start <= date.today(),
        )
        averages_result: Result = await self.session.execute(select(
            func.avg(case((
                JournalStudentSummary.max_period_score > 0,
                JournalStudentSummary.sum_score * 100.0 / JournalStudentSummary.max_period_score,
            ))),
            func.avg(JournalStudentSummary.sum_score),
        ).join(Journal, Journal.id == JournalStudentSummary.journal_id).where(*eligible))
        averages: Row = averages_result.one()
        ranked_students: Subquery = select(
            JournalStudentSummary.student_id.label("student_id"),
            func.row_number().over(order_by=(
                (JournalStudentSummary.sum_score * 100.0 / JournalStudentSummary.max_period_score).desc(),
                JournalStudentSummary.student_id.asc(),
            )).label("student_rank"),
        ).join(Journal, Journal.id == JournalStudentSummary.journal_id).where(
            *eligible, JournalStudentSummary.max_period_score > 0,
        ).subquery()
        rank_result: Result = await self.session.execute(
            select(ranked_students.c.student_rank).where(ranked_students.c.student_id == student_id)
        )
        student_rank: Optional[int] = rank_result.scalar_one_or_none()
        return JournalClassStatistics(
            average_percentage=round(float(averages[0]), 1) if averages[0] is not None else 0.0,
            average_score=round(float(averages[1]), 1) if averages[1] is not None else 0.0,
            student_rank=int(student_rank) if student_rank is not None else 0,
        )
