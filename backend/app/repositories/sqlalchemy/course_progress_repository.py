from typing import Dict, List, Optional
from datetime import date
from sqlalchemy import Float, case, cast, func, or_, select
from sqlalchemy.engine import Result, Row
from sqlalchemy.sql import Select
from sqlalchemy.sql.selectable import Subquery
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
                    Enrollment.student_id == always_include_student_id,
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

    async def get_course_chart_snapshot(
        self, course_id: int, student_id: Optional[int] = None, *,
        period_offset: int = 0, period_limit: int = 12,
        student_offset: int = 0, student_limit: int = 30,
    ) -> CourseChartSnapshot:
        journals_query: Select = (
            select(Journal).where(Journal.course_id == course_id)
            .order_by(Journal.period_start.desc(), Journal.id.desc())
            .offset(period_offset).limit(period_limit)
        )
        journals_result: Result = await self.session.execute(journals_query)
        journals: list[Journal] = list(reversed(journals_result.scalars().all()))
        journal_ids: list[int] = [journal.id for journal in journals]
        periods_total: int = int(await self.session.scalar(
            select(func.count()).select_from(Journal).where(Journal.course_id == course_id)
        ) or 0)
        roster: Select = (
            select(User.id.label("student_id"), User.first_name, User.last_name, Enrollment.color_hex, Enrollment.status)
            .join(Enrollment, Enrollment.student_id == User.id)
            .where(
                Enrollment.course_id == course_id,
                Enrollment.is_deleted.is_(False),
                User.role == UserRole.STUDENT,
                User.is_deleted.is_(False),
            )
        )
        active_roster: Select = roster.where(Enrollment.status == EnrollmentStatus.ACTIVE)
        class_size: int = int(await self.session.scalar(
            select(func.count()).select_from(active_roster.subquery())
        ) or 0)
        series_query: Select = (
            active_roster.order_by(User.id.asc()).offset(student_offset).limit(student_limit)
            if student_id is None else roster.where(User.id == student_id).limit(1)
        )
        series_result: Result = await self.session.execute(series_query)
        students: list[ProgressStudentRecord] = [
            ProgressStudentRecord(row.student_id, row.first_name, row.last_name, row.color_hex, row.status == EnrollmentStatus.ACTIVE)
            for row in series_result.all()
        ]
        student_ids: list[int] = [student.student_id for student in students]
        summaries: list[ProgressSummaryRecord] = []
        if journal_ids and student_ids:
            summaries_result: Result = await self.session.execute(
                select(JournalStudentSummary).where(
                    JournalStudentSummary.journal_id.in_(journal_ids),
                    JournalStudentSummary.student_id.in_(student_ids),
                )
            )
            summaries = [
                ProgressSummaryRecord(summary.student_id, summary.journal_id, summary.sum_score, summary.max_period_score, summary.is_graded)
                for summary in summaries_result.scalars().all()
            ]
        progress: CourseProgressSnapshot = CourseProgressSnapshot(
            course_id=course_id,
            periods=[self._build_period_record(journal, None) for journal in journals],
            students=students,
            summaries=summaries,
        )
        if not journal_ids:
            return CourseChartSnapshot(progress, [], [], {}, None, class_size, periods_total)
        eligible: Subquery = (
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
                Journal.id.in_(journal_ids),
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
        averages: Subquery = (
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
        rows: list[Row] = (await self.session.execute(
            select(averages).where(averages.c.student_id.in_(student_ids))
        )).all()
        student_aggregates: List[ChartStudentAggregate] = [
            ChartStudentAggregate(row.student_id, float(row.mean_percentage), float(row.mean_score), float(row.mean_maximum), row.eligible_count)
            for row in rows
        ]
        period_rows: list[Row] = (
            await self.session.execute(
                select(eligible.c.journal_id, func.avg(eligible.c.percentage).label("mean_percentage"), func.count().label("eligible_count"))
                .where(eligible.c.status == EnrollmentStatus.ACTIVE)
                .group_by(eligible.c.journal_id)
            )
        ).all()
        period_aggregates: List[ChartPeriodAggregate] = [
            ChartPeriodAggregate(row.journal_id, float(row.mean_percentage), row.eligible_count) for row in period_rows
        ]
        class_mean: float | None = await self.session.scalar(
            select(func.avg(averages.c.mean_percentage)).where(averages.c.status == EnrollmentStatus.ACTIVE)
        )
        ranks: dict[int, int] = {}
        if student_id is not None:
            ranked: Subquery = select(
                averages.c.student_id,
                func.row_number().over(order_by=(averages.c.mean_percentage.desc(), averages.c.student_id.asc())).label("rank"),
            ).where(averages.c.status == EnrollmentStatus.ACTIVE).subquery()
            own_rank: int | None = await self.session.scalar(
                select(ranked.c.rank).where(ranked.c.student_id == student_id)
            )
            if own_rank is not None:
                ranks[student_id] = own_rank
        return CourseChartSnapshot(
            progress=progress,
            student_aggregates=student_aggregates,
            period_aggregates=period_aggregates,
            ranks=ranks,
            class_mean=float(class_mean) if class_mean is not None else None,
            class_size=class_size,
            periods_total=periods_total,
        )
