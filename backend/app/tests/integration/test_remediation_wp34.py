from datetime import date, timedelta
from decimal import Decimal
from typing import Any
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.security import create_access_token
from app.models.course import Course, CourseExamType, CourseStatus
from app.models.enrollment import Enrollment, EnrollmentStatus
from app.models.journal import Journal, JournalPeriodType
from app.models.journal_student_summary import JournalStudentSummary
from app.models.user import User, UserRole


class ChartFixture:
    @staticmethod
    def headers(user: User) -> dict[str, str]:
        return {"Authorization": f"Bearer {create_access_token(user.id, user.role)}"}

    @classmethod
    async def create(cls, session: AsyncSession, student: User, mentor: User) -> tuple[Course, list[Journal], User]:
        course: Course = Course(
            title="Chart cohort",
            description="Synthetic",
            start_date=date.today() - timedelta(days=90),
            end_date=date.today() + timedelta(days=30),
            exam_type=CourseExamType.WEEKLY,
            price=Decimal("100"),
            mentor_id=mentor.id,
            status=CourseStatus.ACTIVE,
        )
        peer: User = User(
            email="private-chart@example.invalid",
            first_name="Private",
            last_name="Peer",
            phone="+992900000876",
            password_hash="synthetic",
            must_set_password=False,
            role=UserRole.STUDENT,
        )
        session.add_all([course, peer])
        await session.flush()
        person: User
        for person in (student, peer):
            session.add(
                Enrollment(
                    course_id=course.id,
                    student_id=person.id,
                    price_at_enrollment=Decimal("100"),
                    color_hex="#123456",
                    status=EnrollmentStatus.ACTIVE,
                )
            )
        periods: list[Journal] = []
        index: int
        for index in range(6):
            start: date = (
                date.today() + timedelta(days=7) if index == 5 else date.today() - timedelta(days=42 - index * 7)
            )
            period: Journal = Journal(
                course_id=course.id,
                period_label=f"P{index}",
                period_start=start,
                period_end=start + timedelta(days=6),
                period_type=JournalPeriodType.WEEK,
            )
            periods.append(period)
            session.add(period)
        await session.flush()
        values: list[tuple[int, int, int, bool | None]] = [
            (0, 0, 100, True),
            (1, 100, 100, False),
            (2, 100, 100, None),
            (3, 0, 0, True),
            (5, 999, 100, True),
        ]
        index: int
        score: int
        maximum: int
        graded: bool | None
        for index, score, maximum, graded in values:
            session.add(
                JournalStudentSummary(
                    journal_id=periods[index].id,
                    student_id=student.id,
                    sum_score=score,
                    max_period_score=maximum,
                    is_graded=graded,
                )
            )
        session.add_all(
            [
                JournalStudentSummary(
                    journal_id=periods[0].id, student_id=peer.id, sum_score=100, max_period_score=100, is_graded=True
                ),
                JournalStudentSummary(
                    journal_id=periods[1].id, student_id=peer.id, sum_score=100, max_period_score=100, is_graded=True
                ),
            ]
        )
        await session.commit()
        return course, periods, peer


@pytest.mark.asyncio
async def test_chart_explicit_grading_cohort_unequal_coverage_and_privacy(
    client: AsyncClient, db_session: AsyncSession, test_student: User, test_mentor: User, test_admin: User
) -> None:
    course: Course
    periods: list[Journal]
    peer: User
    course, periods, peer = await ChartFixture.create(db_session, test_student, test_mentor)
    student_response: Any = await client.get(
        f"/api/v1/courses/{course.id}/progress-chart", headers=ChartFixture.headers(test_student)
    )
    assert student_response.status_code == 200
    student: dict[str, Any] = student_response.json()
    assert student["my_series"] == [0.0, None, None, None, None, None, 0.0]
    assert student["my_grading_states"] == ["graded", "ungraded", "unknown", "graded", "missing", "upcoming"]
    assert student["my_graded_periods_count"] == 2
    assert student["my_eligible_periods_count"] == 1
    assert student["class_avg_series"] == [50.0, 100.0, None, None, None, None, 50.0]
    assert student["class_eligible_counts"] == [2, 1, 0, 0, 0, 0]
    assert student["my_rank"] == 2 and student["class_size"] == 2
    assert "Private" not in student_response.text and "datasets" not in student
    staff_response: Any = await client.get(
        f"/api/v1/courses/{course.id}/progress-chart", headers=ChartFixture.headers(test_admin)
    )
    staff: dict[str, Any] = staff_response.json()
    assert staff_response.status_code == 200
    own: dict[str, Any] = next(dataset for dataset in staff["datasets"] if dataset["student_id"] == test_student.id)
    assert own["percentages"] == student["my_series"]
    assert own["grading_states"] == student["my_grading_states"]
    assert own["graded_periods_count"] == 2
    assert staff["class_avg_series"] == student["class_avg_series"]


@pytest.mark.asyncio
async def test_withdrawn_self_history_excluded_from_means_rank_and_staff_roster(
    client: AsyncClient, db_session: AsyncSession, test_student: User, test_mentor: User, test_admin: User
) -> None:
    from sqlalchemy import update

    course: Course
    periods: list[Journal]
    peer: User
    course, periods, peer = await ChartFixture.create(db_session, test_student, test_mentor)
    await db_session.execute(
        update(Enrollment).where(Enrollment.student_id == test_student.id).values(status=EnrollmentStatus.WITHDRAWN)
    )
    await db_session.commit()
    response: Any = await client.get(
        f"/api/v1/courses/{course.id}/progress-chart", headers=ChartFixture.headers(test_student)
    )
    data: dict[str, Any] = response.json()
    assert response.status_code == 200
    assert data["my_series"][-1] == 0.0 and data["my_rank"] is None
    assert data["class_size"] == 1
    assert data["class_avg_series"] == [100.0, 100.0, None, None, None, None, 100.0]
    assert data["class_eligible_counts"] == [1, 1, 0, 0, 0, 0]
    staff_response: Any = await client.get(
        f"/api/v1/courses/{course.id}/progress-chart", headers=ChartFixture.headers(test_admin)
    )
    assert [dataset["student_id"] for dataset in staff_response.json()["datasets"]] == [peer.id]
    await db_session.execute(update(Enrollment).where(Enrollment.student_id == test_student.id).values(is_deleted=True))
    await db_session.commit()
    denied: Any = await client.get(
        f"/api/v1/courses/{course.id}/progress-chart", headers=ChartFixture.headers(test_student)
    )
    assert denied.status_code == 403


@pytest.mark.asyncio
async def test_chart_ungraded_rank_ties_and_course_authorization(
    client: AsyncClient, db_session: AsyncSession, test_student: User, test_mentor: User, test_admin: User
) -> None:
    from sqlalchemy import update

    course: Course
    periods: list[Journal]
    peer: User
    course, periods, peer = await ChartFixture.create(db_session, test_student, test_mentor)
    await db_session.execute(
        update(JournalStudentSummary).where(JournalStudentSummary.student_id == test_student.id).values(is_graded=False)
    )
    await db_session.commit()
    response: Any = await client.get(
        f"/api/v1/courses/{course.id}/progress-chart", headers=ChartFixture.headers(test_student)
    )
    assert response.json()["my_rank"] is None
    assert response.json()["my_series"] == [None] * 7
    await db_session.execute(
        update(JournalStudentSummary)
        .where(JournalStudentSummary.student_id == test_student.id, JournalStudentSummary.journal_id == periods[0].id)
        .values(is_graded=True, sum_score=100, max_period_score=100)
    )
    await db_session.commit()
    response = await client.get(
        f"/api/v1/courses/{course.id}/progress-chart", headers=ChartFixture.headers(test_student)
    )
    peer_response: Any = await client.get(
        f"/api/v1/courses/{course.id}/progress-chart", headers=ChartFixture.headers(peer)
    )
    assert response.json()["my_rank"] == 1
    assert peer_response.json()["my_rank"] == 2
    other_mentor: User = User(email="other-chart-mentor@example.invalid", first_name="Other", last_name="Mentor", role=UserRole.MENTOR, must_set_password=False)
    db_session.add(other_mentor)
    await db_session.flush()
    course.mentor_id = other_mentor.id
    await db_session.commit()
    denied: Any = await client.get(
        f"/api/v1/courses/{course.id}/progress-chart", headers=ChartFixture.headers(test_mentor)
    )
    assert denied.status_code == 403
    missing: Any = await client.get("/api/v1/courses/999999/progress-chart", headers=ChartFixture.headers(test_admin))
    assert missing.status_code == 404


@pytest.mark.asyncio
async def test_chart_summary_grouping_reads_each_summary_once(
    db_session: AsyncSession, test_student: User, test_mentor: User
) -> None:
    from collections.abc import Iterator
    from app.repositories.interfaces.course_progress_repository import CourseChartSnapshot, ProgressSummaryRecord
    from app.repositories.sqlalchemy.course_progress_repository import SqlAlchemyCourseProgressRepository
    from app.services.course_progress_service import CourseProgressService

    class CountingSummaries(list[ProgressSummaryRecord]):
        inspections: int = 0

        def __iter__(self) -> Iterator[ProgressSummaryRecord]:
            record: ProgressSummaryRecord
            for record in super().__iter__():
                self.inspections += 1
                yield record

    class SnapshotRepository:
        def __init__(self, value: CourseChartSnapshot) -> None:
            self.value: CourseChartSnapshot = value

        async def get_course_chart_snapshot(self, course_id: int, student_id: int | None = None) -> CourseChartSnapshot:
            return self.value

    course: Course
    periods: list[Journal]
    peer: User
    course, periods, peer = await ChartFixture.create(db_session, test_student, test_mentor)
    snapshot: CourseChartSnapshot = await SqlAlchemyCourseProgressRepository(db_session).get_course_chart_snapshot(
        course.id, test_student.id
    )
    counted: CountingSummaries = CountingSummaries(snapshot.progress.summaries)
    object.__setattr__(snapshot.progress, "summaries", counted)
    service: CourseProgressService = CourseProgressService(SnapshotRepository(snapshot))
    await service.get_progress_chart(course.id, test_student.id)
    assert counted.inspections == len(counted)


@pytest.mark.asyncio
async def test_chart_rank_uses_unrounded_means_before_student_id_tiebreak(
    client: AsyncClient, db_session: AsyncSession, test_student: User, test_mentor: User
) -> None:
    from sqlalchemy import update

    course: Course
    periods: list[Journal]
    peer: User
    course, periods, peer = await ChartFixture.create(db_session, test_student, test_mentor)
    await db_session.execute(update(JournalStudentSummary).values(is_graded=False))
    await db_session.execute(
        update(JournalStudentSummary)
        .where(JournalStudentSummary.student_id == test_student.id, JournalStudentSummary.journal_id == periods[0].id)
        .values(is_graded=True, sum_score=10000, max_period_score=20001)
    )
    await db_session.execute(
        update(JournalStudentSummary)
        .where(JournalStudentSummary.student_id == peer.id, JournalStudentSummary.journal_id == periods[0].id)
        .values(is_graded=True, sum_score=10000, max_period_score=20000)
    )
    await db_session.commit()
    own_response: Any = await client.get(
        f"/api/v1/courses/{course.id}/progress-chart", headers=ChartFixture.headers(test_student)
    )
    peer_response: Any = await client.get(
        f"/api/v1/courses/{course.id}/progress-chart", headers=ChartFixture.headers(peer)
    )
    assert own_response.json()["my_series"][-1] == peer_response.json()["my_series"][-1] == 50.0
    assert own_response.json()["my_rank"] == 2
    assert peer_response.json()["my_rank"] == 1
