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
        ("test_mentor", "POST", "/api/v1/users/", user_payload, (403,)),
        *[(role, method, "/api/v1/courses/", course_payload if method == "POST" else None, (status,))
          for role, post_status in [("test_admin", 201), ("test_mentor", 403), ("test_student", 403)]
          for method, status in [("GET", 200), ("POST", post_status)]],
        ("test_admin", "GET", "/api/v1/mentors/", None, (200,)),
        ("test_mentor", "GET", "/api/v1/mentors/me/profile", None, (200,)),
        ("test_student", "GET", "/api/v1/mentors/", None, (403,)),
        ("test_admin", "GET", "/api/v1/students/", None, (200,)),
        ("test_mentor", "GET", "/api/v1/students/", None, (200,)),
        *[(role, "GET", path, None, status) for path, statuses in [
            ("/api/v1/enrollments/", ((200,), (403,), (403,))),
            ("/api/v1/finance/payments/", ((200,), (403,), (403,))),
            ("/api/v1/documents/", ((200,), (200,), (200,))),
            ("/api/v1/journals/9999", ((404,), (404,), (403, 404))),
        ] for role, status in zip(("test_admin", "test_mentor", "test_student"), statuses)],
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
