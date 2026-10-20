from datetime import date, timedelta
from decimal import Decimal
from typing import Any

import pytest
from httpx import AsyncClient
from sqlalchemy import event
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token
from app.models.course import Course, CourseExamType, CourseStatus
from app.models.enrollment import Enrollment, EnrollmentStatus
from app.models.journal import Journal, JournalPeriodType
from app.models.journal_student_summary import JournalStudentSummary
from app.models.user import User, UserRole
from app.repositories.sqlalchemy.user_repository import SQLAlchemyUserRepository
from app.tests.conftest import test_engine


class RankingFixture:
    @classmethod
    async def peers(cls, session: AsyncSession, count: int) -> list[User]:
        students: list[User] = [
            User(email=f"rank-{index}@example.test", first_name="Ranking", last_name=str(index),
                 role=UserRole.STUDENT, must_set_password=False)
            for index in range(count)
        ]
        session.add_all(students)
        await session.flush()
        return students

    @classmethod
    async def course(
        cls, session: AsyncSession, mentor: User, students: list[User],
        scores: list[tuple[int, int, bool | None]], future: bool = False,
    ) -> Course:
        today: date = date.today()
        course: Course = Course(
            title="Ranking course", description="Synthetic", start_date=today - timedelta(days=14),
            end_date=today + timedelta(days=14), exam_type=CourseExamType.WEEKLY,
            price=Decimal("100.00"), mentor_id=mentor.id, status=CourseStatus.ACTIVE,
        )
        session.add(course)
        await session.flush()
        student: User
        for student in students:
            session.add(Enrollment(course_id=course.id, student_id=student.id,
                                   price_at_enrollment=Decimal("100.00"), color_hex="#123456", status=EnrollmentStatus.ACTIVE))
        journal: Journal = Journal(
            course_id=course.id, period_label="Ranking period",
            period_start=today + timedelta(days=1) if future else today - timedelta(days=7),
            period_end=today + timedelta(days=7), period_type=JournalPeriodType.WEEK,
        )
        session.add(journal)
        await session.flush()
        score: tuple[int, int, bool | None]
        for student, score in zip(students, scores, strict=True):
            session.add(JournalStudentSummary(journal_id=journal.id, student_id=student.id,
                        sum_score=score[0], max_period_score=score[1], is_graded=score[2]))
        await session.commit()
        return course


class RankingQueryProbe:
    def __init__(self) -> None:
        self.statements: list[str] = []

    def capture(self, connection: Any, cursor: Any, statement: str, parameters: Any,
                context: Any, executemany: bool) -> None:
        self.statements.append(statement)


@pytest.mark.asyncio
@pytest.mark.parametrize("course_count", [1, 10, 100])
async def test_profile_rank_query_count_is_constant_across_courses(
    db_session: AsyncSession, test_student: User, test_mentor: User, course_count: int,
) -> None:
    peers: list[User] = await RankingFixture.peers(db_session, 1)
    index: int
    for index in range(course_count):
        await RankingFixture.course(db_session, test_mentor, [test_student, *peers],
                                    [(60, 100, True), (90, 100, True)])
    probe: RankingQueryProbe = RankingQueryProbe()
    event.listen(test_engine.sync_engine, "after_cursor_execute", probe.capture)
    try:
        result: dict[str, Any] = await SQLAlchemyUserRepository(db_session).get_student_profile_stats(test_student.id)
    finally:
        event.remove(test_engine.sync_engine, "after_cursor_execute", probe.capture)
    assert len(probe.statements) == 8
    assert len(result["courses"]) == course_count
    assert {row["my_rank"] for row in result["courses"]} == {2}


@pytest.mark.asyncio
async def test_ranking_partitions_courses_and_uses_ordinal_id_ties_without_rounding(
    db_session: AsyncSession, test_mentor: User,
) -> None:
    students: list[User] = await RankingFixture.peers(db_session, 3)
    first: Course = await RankingFixture.course(db_session, test_mentor, students,
                                               [(80, 100, True), (80, 100, True), (20, 100, True)])
    second: Course = await RankingFixture.course(db_session, test_mentor, students,
                                                [(20, 100, True), (80, 100, True), (90, 100, True)])
    near: Course = await RankingFixture.course(db_session, test_mentor, students,
                                              [(8000, 10000, True), (8001, 10000, True), (0, 100, True)])
    expected: list[dict[int, int]] = [
        {first.id: 1, second.id: 3, near.id: 2},
        {first.id: 2, second.id: 2, near.id: 1},
        {first.id: 3, second.id: 1, near.id: 3},
    ]
    student: User
    ranks: dict[int, int]
    for student, ranks in zip(students, expected, strict=True):
        result: dict[str, Any] = await SQLAlchemyUserRepository(db_session).get_student_profile_stats(student.id)
        assert {row["course"].id: row["my_rank"] for row in result["courses"]} == ranks
        near_row: dict[str, Any] = next(row for row in result["courses"] if row["course"].id == near.id)
        if student.id in (students[0].id, students[1].id):
            assert near_row["my_avg_percentage"] == 80.0


@pytest.mark.asyncio
async def test_rank_includes_graded_zero_and_excludes_unproven_nonpositive_and_future_periods(
    db_session: AsyncSession, test_mentor: User,
) -> None:
    students: list[User] = await RankingFixture.peers(db_session, 6)
    course: Course = await RankingFixture.course(db_session, test_mentor, students, [
        (0, 100, True), (100, 100, False), (100, 100, None),
        (0, 0, True), (100, 100, True), (0, -1, True),
    ])
    future: Course = await RankingFixture.course(db_session, test_mentor, students,
                                                 [(100, 100, True)] * 6, future=True)
    student: User
    expected_rank: int
    for student, expected_rank in zip(students, [2, 0, 0, 0, 1, 0], strict=True):
        result: dict[str, Any] = await SQLAlchemyUserRepository(db_session).get_student_profile_stats(student.id)
        assert {row["course"].id: row["my_rank"] for row in result["courses"]} == {
            course.id: expected_rank, future.id: 0,
        }


@pytest.mark.asyncio
async def test_profile_ranking_preserves_authorization_and_does_not_expose_peer_identity(
    client: AsyncClient, db_session: AsyncSession, test_student: User, test_mentor: User,
) -> None:
    peers: list[User] = await RankingFixture.peers(db_session, 1)
    await RankingFixture.course(db_session, test_mentor, [test_student, *peers],
                                [(60, 100, True), (90, 100, True)])
    headers: dict[str, str] = {"Authorization": f"Bearer {create_access_token(test_student.id, test_student.role)}"}
    response: Any = await client.get("/api/v1/students/me/profile", headers=headers)
    assert response.status_code == 200
    payload: dict[str, Any] = response.json()
    assert set(payload) == {"user", "totals", "performance", "courses", "avg_score", "absences", "total_lessons"}
    assert payload["courses"][0]["my_rank"] == 2
    assert peers[0].email not in response.text
    assert "student_ids" not in response.text
    denied: Any = await client.get(f"/api/v1/students/{peers[0].id}/profile", headers=headers)
    assert denied.status_code == 403
    anonymous: Any = await client.get("/api/v1/students/me/profile")
    assert anonymous.status_code == 401
