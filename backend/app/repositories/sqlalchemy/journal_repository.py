from sqlalchemy import Numeric, case, cast, func, select
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
        percentage: ColumnElement = case(
            (
                JournalStudentSummary.max_period_score > 0,
                func.round(cast(
                    JournalStudentSummary.sum_score * 100.0 / JournalStudentSummary.max_period_score,
                    Numeric,
                ), 2),
            ),
            else_=0,
        )
        ranked_students: Subquery = select(
            JournalStudentSummary.student_id,
            func.row_number().over(
                order_by=(percentage.desc(), JournalStudentSummary.student_id.asc()),
            ).label("student_rank"),
        ).where(JournalStudentSummary.journal_id == journal_id).subquery()
        statistics_query: Select = select(
            func.avg(case((JournalStudentSummary.max_period_score > 0, percentage))),
            func.avg(JournalStudentSummary.sum_score),
            func.count(JournalStudentSummary.id),
            select(ranked_students.c.student_rank)
            .where(ranked_students.c.student_id == student_id)
            .scalar_subquery(),
        ).where(JournalStudentSummary.journal_id == journal_id)
        statistics_result: Result = await self.session.execute(statistics_query)
        statistics: Row = statistics_result.one()
        return JournalClassStatistics(
            average_percentage=round(float(statistics[0] or 0.0), 1),
            average_score=round(float(statistics[1] or 0.0), 1),
            student_rank=int(statistics[3]) if statistics[3] is not None else int(statistics[2]) + 1,
        )
