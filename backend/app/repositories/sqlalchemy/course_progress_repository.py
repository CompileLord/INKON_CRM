from typing import Any, List, Optional
from datetime import date
from sqlalchemy import Float, cast, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload
from app.models.course import Course
from app.models.enrollment import Enrollment, EnrollmentStatus
from app.models.journal import Journal
from app.models.journal_student_summary import JournalStudentSummary
from app.models.user import User, UserRole
from app.repositories.interfaces.course_progress_repository import (
    ChartPeriodAggregate,
    ChartStudentAggregate,
    CourseChartSnapshot,
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
                        last_name=st.last_name,
                        color_hex=enroll.color_hex,
                        is_active=enroll.status == EnrollmentStatus.ACTIVE,
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
                        max_period_score=s.max_period_score,
                        is_graded=s.is_graded,
                    )
                )

        return CourseProgressSnapshot(
            course_id=course_id,
            periods=periods,
            students=students,
            summaries=summaries
        )

    async def get_course_chart_snapshot(
        self, course_id: int, student_id: Optional[int] = None
    ) -> CourseChartSnapshot:
        progress: CourseProgressSnapshot = await self.get_course_progress_snapshot(course_id, student_id)
        eligible: Any = (
            select(
                JournalStudentSummary.student_id.label("student_id"),
                JournalStudentSummary.journal_id.label("journal_id"),
                JournalStudentSummary.sum_score.label("score"),
                JournalStudentSummary.max_period_score.label("maximum"),
                (cast(JournalStudentSummary.sum_score, Float) * 100.0 / JournalStudentSummary.max_period_score).label("percentage"),
                Enrollment.status.label("status"),
            )
            .join(Journal, Journal.id == JournalStudentSummary.journal_id)
            .join(Enrollment, (Enrollment.course_id == Journal.course_id) & (Enrollment.student_id == JournalStudentSummary.student_id))
            .join(User, User.id == JournalStudentSummary.student_id)
            .where(
                Journal.course_id == course_id,
                Journal.period_start <= date.today(),
                JournalStudentSummary.is_graded.is_(True),
                JournalStudentSummary.max_period_score > 0,
                Enrollment.is_deleted.is_(False),
                or_(Enrollment.status == EnrollmentStatus.ACTIVE, Enrollment.student_id == student_id),
                User.role == UserRole.STUDENT,
                User.is_deleted.is_(False),
            )
            .subquery()
        )
        averages: Any = (
            select(
                eligible.c.student_id,
                eligible.c.status,
                func.avg(eligible.c.percentage).label("mean_percentage"),
                func.avg(eligible.c.score).label("mean_score"),
                func.avg(eligible.c.maximum).label("mean_maximum"),
                func.count().label("eligible_count"),
            )
            .group_by(eligible.c.student_id, eligible.c.status)
            .subquery()
        )
        rows: Any = (await self.session.execute(select(averages))).all()
        student_aggregates: List[ChartStudentAggregate] = [
            ChartStudentAggregate(row.student_id, float(row.mean_percentage), float(row.mean_score), float(row.mean_maximum), row.eligible_count)
            for row in rows
        ]
        period_rows: Any = (
            await self.session.execute(
                select(eligible.c.journal_id, func.avg(eligible.c.percentage).label("mean_percentage"), func.count().label("eligible_count"))
                .where(eligible.c.status == EnrollmentStatus.ACTIVE)
                .group_by(eligible.c.journal_id)
            )
        ).all()
        period_aggregates: List[ChartPeriodAggregate] = [
            ChartPeriodAggregate(row.journal_id, float(row.mean_percentage), row.eligible_count) for row in period_rows
        ]
        ranked_rows: Any = (
            await self.session.execute(
                select(
                    averages.c.student_id,
                    func.row_number().over(order_by=(averages.c.mean_percentage.desc(), averages.c.student_id.asc())).label("rank"),
                    func.avg(averages.c.mean_percentage).over().label("class_mean"),
                ).where(averages.c.status == EnrollmentStatus.ACTIVE)
            )
        ).all()
        return CourseChartSnapshot(
            progress=progress,
            student_aggregates=student_aggregates,
            period_aggregates=period_aggregates,
            ranks={row.student_id: row.rank for row in ranked_rows},
            class_mean=float(ranked_rows[0].class_mean) if ranked_rows else None,
        )
