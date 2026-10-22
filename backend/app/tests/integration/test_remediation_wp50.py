from datetime import date, timedelta
from decimal import Decimal
from typing import Any

import pytest
from httpx import AsyncClient, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token
from app.models.course import Course, CourseExamType, CourseStatus
from app.models.enrollment import Enrollment, EnrollmentStatus
from app.models.journal import Journal, JournalPeriodType
from app.models.journal_student_summary import JournalStudentSummary
from app.models.user import User, UserRole


class StudentRegressionFixture:
    @staticmethod
    async def course(db_session: AsyncSession, mentor: User, title: str) -> Course:
        course: Course = Course(
            title=title,
            description=title,
            start_date=date.today() - timedelta(days=30),
            end_date=date.today() + timedelta(days=30),
            exam_type=CourseExamType.WEEKLY,
            price=Decimal("100.00"),
            mentor_id=mentor.id,
            status=CourseStatus.ACTIVE,
        )
        db_session.add(course)
        await db_session.flush()
        return course


@pytest.mark.asyncio
async def test_student_rank_excludes_ungraded_periods_with_distinct_peers(
    client: AsyncClient, test_student: User, test_mentor: User, db_session: AsyncSession
) -> None:
    peers: list[User] = [
        User(email=f"rank-peer-{index}@example.test", password_hash="unused", first_name="Peer",
             last_name=str(index), role=UserRole.STUDENT, must_set_password=False)
        for index in range(2)
    ]
    db_session.add_all(peers)
    await db_session.flush()
    course: Course = await StudentRegressionFixture.course(db_session, test_mentor, "Rank adversary")
    participants: list[User] = [test_student, *peers]
    participant: User
    for participant in participants:
        db_session.add(Enrollment(
            color_hex="#123456", price_at_enrollment=Decimal("100.00"), student_id=participant.id,
            course_id=course.id, status=EnrollmentStatus.ACTIVE,
        ))
    journals: list[Journal] = [
        Journal(course_id=course.id, period_label=f"Period {index}",
                period_start=date.today() - timedelta(days=21 - index * 7),
                period_end=date.today() - timedelta(days=15 - index * 7), period_type=JournalPeriodType.WEEK)
        for index in range(3)
    ]
    db_session.add_all(journals)
    await db_session.flush()
    scores: list[tuple[User, list[int]]] = [
        (test_student, [80, 100, 0]), (peers[0], [90, 180, 0]), (peers[1], [40, 80, 100]),
    ]
    participant_scores: list[int]
    for participant, participant_scores in scores:
        period_index: int
        score: int
        for period_index, score in enumerate(participant_scores):
            db_session.add(JournalStudentSummary(
                journal_id=journals[period_index].id, student_id=participant.id,
                sum_score=score, max_period_score=200 if period_index == 1 else 100,
                is_graded=period_index != 2,
                attendance_count=1 if period_index != 2 else 0,
                total_lessons=2 if period_index != 2 else 20,
            ))
    await db_session.commit()
    response: Response = await client.get(
        "/api/v1/students/me/profile",
        headers={"Authorization": f"Bearer {create_access_token(test_student.id, test_student.role)}"},
    )
    assert response.status_code == 200
    entries: list[dict[str, Any]] = response.json()["courses"]
    assert len(entries) == 1
    entry: dict[str, Any] = entries[0]
    assert entry["course"]["id"] == course.id
    assert entry["class_size"] == 3
    assert entry["my_rank"] == 2
    assert entry["my_avg_percentage"] == 65.0
    assert entry["class_avg_percentage"] == 65.0
    assert entry["my_total_score"] == 180
    assert entry["my_total_max_score"] == 300
    assert entry["periods_total"] == 3
    assert entry["periods_graded"] == 2
    assert entry["attendance_percentage"] == 50.0
    assert entry["absences"] == 2


@pytest.mark.asyncio
async def test_student_bucket_archives_withdrawn_and_archived_courses(
    client: AsyncClient, test_student: User, test_mentor: User, db_session: AsyncSession
) -> None:
    active: Course = await StudentRegressionFixture.course(db_session, test_mentor, "Active")
    archived: Course = await StudentRegressionFixture.course(db_session, test_mentor, "Archived")
    withdrawn: Course = await StudentRegressionFixture.course(db_session, test_mentor, "Withdrawn")
    archived.status = CourseStatus.ARCHIVED
    db_session.add_all([
        Enrollment(
            color_hex="#123456", price_at_enrollment=Decimal("100.00"), student_id=test_student.id,
            course_id=active.id, status=EnrollmentStatus.ACTIVE,
        ),
        Enrollment(
            color_hex="#123456", price_at_enrollment=Decimal("100.00"), student_id=test_student.id,
            course_id=archived.id, status=EnrollmentStatus.ACTIVE,
        ),
        Enrollment(
            color_hex="#123456", price_at_enrollment=Decimal("100.00"), student_id=test_student.id,
            course_id=withdrawn.id, status=EnrollmentStatus.WITHDRAWN,
        ),
    ])
    await db_session.commit()
    response: Response = await client.get(
        "/api/v1/students/me/profile",
        headers={"Authorization": f"Bearer {create_access_token(test_student.id, test_student.role)}"},
    )
    assert response.status_code == 200
    entries: list[dict[str, Any]] = response.json()["courses"]
    buckets: dict[int, str] = {entry["course"]["id"]: entry["bucket"] for entry in entries}
    assert buckets == {active.id: "active", archived.id: "archive", withdrawn.id: "archive"}
    assert response.json()["totals"]["active_course_count"] == 1
    assert response.json()["totals"]["archived_course_count"] == 2
