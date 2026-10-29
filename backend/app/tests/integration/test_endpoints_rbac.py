from typing import Callable

import pytest
from httpx import AsyncClient

from app.core.security import create_access_token
from app.models.user import User


def user_payload(mentor: User) -> dict[str, object]:
    return {"email": "mentor_bad_create@example.com", "first_name": "New", "last_name": "User", "role": "student", "phone": "+992900000999"}


def course_payload(mentor: User) -> dict[str, object]:
    return {
        "title": "Course", "description": "Course Desc", "start_date": "2025-01-01",
        "end_date": "2025-03-01", "exam_type": "weekly", "price": 1000.0,
        "mentor_id": mentor.id,
        "schedules": [{"day_of_week": 1, "time_start": "10:00:00", "time_end": "12:00:00"}],
    }


@pytest.fixture
def role_fixture(request: pytest.FixtureRequest) -> User:
    return request.getfixturevalue(request.param)


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("role_fixture", "method", "path", "payload_builder", "expected_status"),
    [
        pytest.param("test_mentor", "POST", "/api/v1/users/", user_payload, (403,), id="mentor-post-users"),
        pytest.param("test_admin", "GET", "/api/v1/courses/", None, (200,), id="admin-get-courses"),
        pytest.param("test_admin", "POST", "/api/v1/courses/", course_payload, (201,), id="admin-post-courses"),
        pytest.param("test_mentor", "GET", "/api/v1/courses/", None, (200,), id="mentor-get-courses"),
        pytest.param("test_mentor", "POST", "/api/v1/courses/", course_payload, (403,), id="mentor-post-courses"),
        pytest.param("test_student", "GET", "/api/v1/courses/", None, (200,), id="student-get-courses"),
        pytest.param("test_student", "POST", "/api/v1/courses/", course_payload, (403,), id="student-post-courses"),
        pytest.param("test_admin", "GET", "/api/v1/mentors/", None, (200,), id="admin-get-mentors"),
        pytest.param("test_mentor", "GET", "/api/v1/mentors/me/profile", None, (200,), id="mentor-get-mentors-me-profile"),
        pytest.param("test_student", "GET", "/api/v1/mentors/", None, (403,), id="student-get-mentors"),
        pytest.param("test_admin", "GET", "/api/v1/students/", None, (200,), id="admin-get-students"),
        pytest.param("test_mentor", "GET", "/api/v1/students/", None, (200,), id="mentor-get-students"),
        pytest.param("test_admin", "GET", "/api/v1/enrollments/", None, (200,), id="admin-get-enrollments"),
        pytest.param("test_mentor", "GET", "/api/v1/enrollments/", None, (403,), id="mentor-get-enrollments"),
        pytest.param("test_student", "GET", "/api/v1/enrollments/", None, (403,), id="student-get-enrollments"),
        pytest.param("test_admin", "GET", "/api/v1/finance/payments/", None, (200,), id="admin-get-finance-payments"),
        pytest.param("test_mentor", "GET", "/api/v1/finance/payments/", None, (403,), id="mentor-get-finance-payments"),
        pytest.param("test_student", "GET", "/api/v1/finance/payments/", None, (403,), id="student-get-finance-payments"),
        pytest.param("test_admin", "GET", "/api/v1/documents/", None, (200,), id="admin-get-documents"),
        pytest.param("test_mentor", "GET", "/api/v1/documents/", None, (200,), id="mentor-get-documents"),
        pytest.param("test_student", "GET", "/api/v1/documents/", None, (200,), id="student-get-documents"),
        pytest.param("test_admin", "GET", "/api/v1/journals/9999", None, (404,), id="admin-get-journals-9999"),
        pytest.param("test_mentor", "GET", "/api/v1/journals/9999", None, (404,), id="mentor-get-journals-9999"),
        pytest.param("test_student", "GET", "/api/v1/journals/9999", None, (403, 404), id="student-get-journals-9999"),
    ],
    indirect=["role_fixture"],
)
async def test_endpoint_permissions(
    client: AsyncClient,
    test_mentor: User,
    role_fixture: User,
    method: str,
    path: str,
    payload_builder: Callable[[User], dict[str, object]] | None,
    expected_status: tuple[int, ...],
) -> None:
    user: User = role_fixture
    token: str = create_access_token(user.id, user.role)
    response = await client.request(method, path, headers={"Authorization": f"Bearer {token}"}, json=payload_builder(test_mentor) if payload_builder else None)
    assert response.status_code in expected_status
