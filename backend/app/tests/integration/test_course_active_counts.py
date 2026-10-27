from datetime import date, timedelta
from decimal import Decimal
from typing import Any

import pytest
import pytest_asyncio
from httpx import AsyncClient, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token
from app.models.course import Course, CourseExamType
from app.models.enrollment import Enrollment, EnrollmentStatus
from app.models.journal import Journal, JournalPeriodType
from app.models.journal_entry import JournalEntry
from app.models.journal_student_summary import JournalStudentSummary
from app.models.user import User, UserRole
from app.repositories.interfaces.journal_repository import JournalClassStatistics, MentorJournalBatch
from app.repositories.sqlalchemy.course_repository import SQLAlchemyCourseRepository
from app.repositories.sqlalchemy.journal_repository import SQLAlchemyJournalRepository
from app.repositories.sqlalchemy.user_repository import SQLAlchemyUserRepository


@pytest_asyncio.fixture
async def active_cohort(db_session: AsyncSession, test_mentor: User) -> tuple[Course, Journal, list[User]]:
    today: date = date.today()
    course: Course = Course(
        title="Active cohort", description="Counts and history", start_date=today - timedelta(days=10),
        end_date=today + timedelta(days=20), exam_type=CourseExamType.MONTHLY,
        price=Decimal("500.00"), mentor_id=test_mentor.id,
    )
    students: list[User] = [
        User(first_name="Student", last_name=str(index), email=f"active-count-{index}@example.test",
             role=UserRole.STUDENT, is_deleted=index == 4)
        for index in range(5)
    ]
    db_session.add_all([course, *students])
    await db_session.flush()
    journal: Journal = Journal(
        course_id=course.id, period_label="Current", period_start=today - timedelta(days=7),
        period_end=today, period_type=JournalPeriodType.WEEK,
    )
    db_session.add(journal)
    await db_session.flush()
    index: int
    student: User
    for index, student in enumerate(students):
        db_session.add(Enrollment(
            student_id=student.id, course_id=course.id, price_at_enrollment=course.price, color_hex="#112233",
            status=EnrollmentStatus.WITHDRAWN if index == 3 else EnrollmentStatus.ACTIVE,
        ))
        db_session.add(JournalEntry(journal_id=journal.id, student_id=student.id, lesson_date=today, score=1, is_graded=True))
        db_session.add(JournalStudentSummary(
            journal_id=journal.id, student_id=student.id, sum_score=90 if index >= 3 else 30,
            max_period_score=100, is_graded=True,
        ))
    await db_session.commit()
    return course, journal, students


@pytest.mark.asyncio
async def test_course_overview_and_card_count_only_active_students(
    client: AsyncClient, db_session: AsyncSession, test_admin: User, test_mentor: User,
    active_cohort: tuple[Course, Journal, list[User]],
) -> None:
    course: Course = active_cohort[0]
    headers: dict[str, str] = {"Authorization": f"Bearer {create_access_token(test_admin.id, test_admin.role)}"}
    response: Response = await client.get(f"/api/v1/enrollments/?course_id={course.id}&page=1&page_size=1", headers=headers)
    assert response.status_code == 200
    assert response.json()["total"] == 3
    roster: Response = await client.get(f"/api/v1/enrollments/courses/{course.id}/roster", headers=headers)
    assert roster.status_code == 200
    assert roster.json()["total"] == 4
    assert roster.json()["active_count"] == 3
    assert (await SQLAlchemyCourseRepository(db_session).count_active_students_by_course([course.id]))[course.id] == 3
    assert (await SQLAlchemyUserRepository(db_session).get_mentor_profile_stats(test_mentor.id))["active_students_count"] == 3


@pytest.mark.asyncio
async def test_journal_counts_use_active_students_but_grid_retains_withdrawn_history(
    client: AsyncClient, db_session: AsyncSession, test_admin: User, test_mentor: User,
    active_cohort: tuple[Course, Journal, list[User]],
) -> None:
    course: Course
    journal: Journal
    students: list[User]
    course, journal, students = active_cohort
    headers: dict[str, str] = {"Authorization": f"Bearer {create_access_token(test_admin.id, test_admin.role)}"}
    response: Response = await client.get(f"/api/v1/enrollments/?course_id={course.id}&page=1&page_size=1", headers=headers)
    assert response.json()["total"] == 3
    journals: Response = await client.get(f"/api/v1/courses/{course.id}/journals", headers=headers)
    assert journals.status_code == 200
    assert journals.json()[0]["student_count"] == 3
    batch: MentorJournalBatch = await SQLAlchemyJournalRepository(db_session).get_mentor_journal_batch(test_mentor.id, date.today())
    assert batch.student_counts[course.id] == 3
    assert batch.graded_entry_counts[journal.id] == 3
    grid: Response = await client.get(f"/api/v1/journals/{journal.id}", headers=headers)
    assert grid.status_code == 200
    visible: set[int] = {record["student_id"] for record in grid.json()["students"]}
    assert visible == {student.id for student in students[:4]}


@pytest.mark.asyncio
async def test_journal_progress_uses_active_students_for_series_averages_and_rank(
    client: AsyncClient, db_session: AsyncSession, test_admin: User,
    active_cohort: tuple[Course, Journal, list[User]],
) -> None:
    course: Course
    journal: Journal
    students: list[User]
    course, journal, students = active_cohort
    headers: dict[str, str] = {"Authorization": f"Bearer {create_access_token(test_admin.id, test_admin.role)}"}
    response: Response = await client.get(f"/api/v1/courses/{course.id}/staff-progress", headers=headers)
    assert response.status_code == 200
    payload: dict[str, Any] = response.json()
    assert {student["student_id"] for student in payload["students"]} == {student.id for student in students[:3]}
    assert payload["periods"][0]["class_avg_score"] == 30
    assert payload["periods"][0]["graded_count"] == 3
    metrics: Response = await client.get(f"/api/v1/courses/{course.id}/journal-metrics", headers=headers)
    assert metrics.status_code == 200
    assert metrics.json()["class_avg_percentage"] == 30
    statistics: JournalClassStatistics = await SQLAlchemyJournalRepository(db_session).get_class_statistics(journal.id, students[0].id)
    assert statistics.average_percentage == 30
    assert statistics.student_rank == 1
