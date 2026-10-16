from typing import List, Optional
from sqlalchemy import or_, select
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

        periods = [
            ProgressPeriodRecord(
                id=j.id,
                period_label=j.period_label,
                period_start=j.period_start,
                period_end=j.period_end,
            )
            for j in journals
        ]

        journal_ids = [j.id for j in journals]
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
