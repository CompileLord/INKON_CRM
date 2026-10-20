from typing import Dict, List, Optional
from sqlalchemy import case, func, or_, select
from sqlalchemy.engine import Result, Row
from sqlalchemy.sql import Select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload
from app.models.course import Course
from app.models.enrollment import Enrollment, EnrollmentStatus
from app.models.journal import Journal
from app.models.journal_student_summary import JournalStudentSummary
from app.models.user import User, UserRole
from app.repositories.interfaces.course_progress_repository import (
    CourseAccessRecord,
    CourseProgressRepositoryInterface,
    CourseProgressSnapshot,
    ProgressPeriodRecord,
    ProgressStudentRecord,
    ProgressSummaryRecord,
)


class SqlAlchemyCourseProgressRepository(CourseProgressRepositoryInterface):
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get_course_access_record(self, course_id: int) -> Optional[CourseAccessRecord]:
        stmt = select(Course.id, Course.mentor_id, Course.is_deleted).filter(Course.id == course_id)
        res = await self.session.execute(stmt)
        row = res.first()
        if not row:
            return None
        return CourseAccessRecord(
            id=row.id,
            mentor_id=row.mentor_id,
            is_deleted=row.is_deleted
        )

    async def get_course_progress_snapshot(
        self,
        course_id: int,
        always_include_student_id: Optional[int] = None
    ) -> CourseProgressSnapshot:
        journals_stmt = (
            select(Journal)
            .filter(Journal.course_id == course_id)
            .order_by(Journal.period_start.asc(), Journal.id.asc())
        )
        journals_res = await self.session.execute(journals_stmt)
        journals = list(journals_res.scalars().all())

        enrollments_stmt = (
            select(Enrollment)
            .options(joinedload(Enrollment.student))
            .filter(
                Enrollment.course_id == course_id,
                or_(
                    Enrollment.status == EnrollmentStatus.ACTIVE,
                    Enrollment.student_id == always_include_student_id
                ),
                Enrollment.is_deleted == False
            )
            .join(User, Enrollment.student_id == User.id)
            .filter(
                User.role == UserRole.STUDENT,
                User.is_deleted == False
            )
            .order_by(Enrollment.id.asc())
        )
        enrollments_res = await self.session.execute(enrollments_stmt)
        enrollments = list(enrollments_res.scalars().all())

        seen_student_ids = set()
        students: List[ProgressStudentRecord] = []
        student_ids: List[int] = []
        for enroll in enrollments:
            st = enroll.student
            if st.id not in seen_student_ids:
                seen_student_ids.add(st.id)
                student_ids.append(st.id)
                students.append(
                    ProgressStudentRecord(
                        student_id=st.id,
                        first_name=st.first_name,
                        last_name=st.last_name
                    )
                )

        journal_ids: List[int] = [journal.id for journal in journals]
        aggregates_by_journal: Dict[int, Row] = {}
        if journal_ids:
            enrolled_student_ids: Select = select(Enrollment.student_id).join(
                User, Enrollment.student_id == User.id,
            ).where(
                Enrollment.course_id == course_id,
                Enrollment.is_deleted == False,
                User.role == UserRole.STUDENT,
                User.is_deleted == False,
            )
            aggregates_query: Select = select(
                JournalStudentSummary.journal_id,
                func.avg(JournalStudentSummary.sum_score).label("class_avg_score"),
                func.avg(JournalStudentSummary.max_period_score).label("class_avg_max_score"),
                func.avg(case((
                    JournalStudentSummary.max_period_score > 0,
                    JournalStudentSummary.sum_score * 100.0 / JournalStudentSummary.max_period_score,
                ))).label("class_avg_percentage"),
                func.count(JournalStudentSummary.id).label("graded_count"),
            ).where(
                JournalStudentSummary.journal_id.in_(journal_ids),
                JournalStudentSummary.student_id.in_(enrolled_student_ids),
            ).group_by(JournalStudentSummary.journal_id)
            aggregates_result: Result = await self.session.execute(aggregates_query)
            aggregates_by_journal = {row.journal_id: row for row in aggregates_result.all()}

        periods: List[ProgressPeriodRecord] = [
            self._build_period_record(journal, aggregates_by_journal.get(journal.id))
            for journal in journals
        ]

        summaries: List[ProgressSummaryRecord] = []

        if journal_ids and student_ids:
            summary_stmt = select(JournalStudentSummary).filter(
                JournalStudentSummary.journal_id.in_(journal_ids),
                JournalStudentSummary.student_id.in_(student_ids)
            )
            summary_res = await self.session.execute(summary_stmt)
            for s in summary_res.scalars().all():
                summaries.append(
                    ProgressSummaryRecord(
                        student_id=s.student_id,
                        journal_id=s.journal_id,
                        sum_score=s.sum_score,
                        max_period_score=s.max_period_score
                    )
                )

        return CourseProgressSnapshot(
            course_id=course_id,
            periods=periods,
            students=students,
            summaries=summaries
        )

    @staticmethod
    def _build_period_record(journal: Journal, aggregate: Optional[Row]) -> ProgressPeriodRecord:
        if aggregate is None:
            return ProgressPeriodRecord(
                id=journal.id,
                period_label=journal.period_label,
                period_start=journal.period_start,
                period_end=journal.period_end,
            )
        return ProgressPeriodRecord(
            id=journal.id,
            period_label=journal.period_label,
            period_start=journal.period_start,
            period_end=journal.period_end,
            class_avg_score=float(aggregate.class_avg_score),
            class_avg_max_score=float(aggregate.class_avg_max_score),
            class_avg_percentage=(
                float(aggregate.class_avg_percentage) if aggregate.class_avg_percentage is not None else None
            ),
            graded_count=int(aggregate.graded_count),
        )
