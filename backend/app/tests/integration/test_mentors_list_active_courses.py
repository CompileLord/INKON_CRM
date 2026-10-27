from datetime import date
from decimal import Decimal
from typing import Any, Dict, List
import pytest
from httpx import AsyncClient, Response
from sqlalchemy import event
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.security import create_access_token
from app.models.course import Course, CourseExamType, CourseStatus
from app.models.user import User, UserRole
from app.tests.conftest import test_engine


@pytest.mark.asyncio
async def test_mentors_list_returns_active_courses_and_bounded_queries(
    client: AsyncClient,
    db_session: AsyncSession,
    test_admin: User,
) -> None:
    admin_token: str = create_access_token(test_admin.id, test_admin.role)
    headers: Dict[str, str] = {"Authorization": f"Bearer {admin_token}"}

    mentors: List[User] = []
    for i in range(5):
        m: User = User(
            email=f"list_mentor_{i}@example.com",
            password_hash="hash",
            first_name=f"Mentor{i}",
            last_name="Test",
            role=UserRole.MENTOR,
            must_set_password=False,
        )
        mentors.append(m)
    db_session.add_all(mentors)
    await db_session.commit()

    courses: List[Course] = []
    for m in mentors:
        for c_idx in range(3):
            c_active: Course = Course(
                title=f"Course {c_idx} for {m.first_name}",
                description="Active course",
                start_date=date(2026, 9, 1),
                end_date=date(2026, 12, 1),
                exam_type=CourseExamType.MONTHLY,
                price=Decimal("300.00"),
                mentor_id=m.id,
                status=CourseStatus.ACTIVE,
            )
            courses.append(c_active)
        c_archived: Course = Course(
            title=f"Archived Course for {m.first_name}",
            description="Archived course",
            start_date=date(2026, 1, 1),
            end_date=date(2026, 4, 1),
            exam_type=CourseExamType.MONTHLY,
            price=Decimal("300.00"),
            mentor_id=m.id,
            status=CourseStatus.ARCHIVED,
        )
        c_deleted: Course = Course(
            title=f"Deleted Course for {m.first_name}",
            description="Deleted course",
            start_date=date(2026, 5, 1),
            end_date=date(2026, 8, 1),
            exam_type=CourseExamType.MONTHLY,
            price=Decimal("300.00"),
            mentor_id=m.id,
            status=CourseStatus.ACTIVE,
            is_deleted=True,
        )
        courses.extend([c_archived, c_deleted])
    db_session.add_all(courses)
    await db_session.commit()

    query_count: int = 0

    def before_cursor_execute(conn: Any, cursor: Any, statement: Any, parameters: Any, context: Any, executemany: Any) -> None:
        nonlocal query_count
        query_count += 1

    event.listen(test_engine.sync_engine, "before_cursor_execute", before_cursor_execute)

    try:
        query_count = 0
        resp_2: Response = await client.get("/api/v1/mentors/?page=1&page_size=2", headers=headers)
        assert resp_2.status_code == 200
        count_for_2: int = query_count

        query_count = 0
        resp_5: Response = await client.get("/api/v1/mentors/?page=1&page_size=5", headers=headers)
        assert resp_5.status_code == 200
        count_for_5: int = query_count
        data_5: Dict[str, Any] = resp_5.json()

        assert len(data_5["items"]) == 5
        for item in data_5["items"]:
            assert "active_courses" in item
            assert len(item["active_courses"]) == 3
            for c in item["active_courses"]:
                assert "id" in c
                assert "title" in c
                assert "Archived" not in c["title"]
                assert "Deleted" not in c["title"]

        assert count_for_5 == count_for_2
        assert count_for_5 <= 4
    finally:
        event.remove(test_engine.sync_engine, "before_cursor_execute", before_cursor_execute)
