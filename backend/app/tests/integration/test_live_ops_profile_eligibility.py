from typing import Any
import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.enrollment import Enrollment, EnrollmentStatus
from app.models.course import Course
from app.models.user import User
from app.repositories.sqlalchemy.user_repository import SQLAlchemyUserRepository
from app.tests.integration.test_remediation_wp39 import RankingFixture


@pytest.mark.asyncio
async def test_profile_stats_exclude_withdrawn_and_deleted_students(db_session: AsyncSession, test_student: User, test_mentor: User) -> None:
    peers: list[User] = await RankingFixture.peers(db_session, 2)
    course: Course = await RankingFixture.course(db_session, test_mentor, [test_student, *peers], [(50, 100, True), (90, 100, True), (100, 100, True)])
    enrollment: Enrollment = (await db_session.execute(select(Enrollment).where(Enrollment.course_id == course.id, Enrollment.student_id == peers[0].id))).scalar_one()
    enrollment.status = EnrollmentStatus.WITHDRAWN
    peers[1].is_deleted = True
    await db_session.flush()
    stats: dict[str, Any] = await SQLAlchemyUserRepository(db_session).get_student_profile_stats(test_student.id)
    row: dict[str, Any] = stats["courses"][0]
    assert (row["class_size"], row["my_rank"], row["class_avg_percentage"], row["class_avg_score"]) == (1, 1, 50.0, 50.0)
