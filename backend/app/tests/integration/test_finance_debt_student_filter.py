from datetime import date, timedelta

import pytest
from httpx import AsyncClient

from app.core.security import create_access_token
from app.models.user import User
from app.tests.integration.test_finance import _setup_student_course

DEBTS_URL: str = "/api/v1/finance/debts/"


def _headers(user: User) -> dict[str, str]:
    return {"Authorization": f"Bearer {create_access_token(user.id, user.role)}"}


async def _enroll_in_new_course(
    client: AsyncClient, admin_headers: dict[str, str], mentor_id: int, student_id: int, title: str
) -> int:
    today: date = date.today()
    course_response = await client.post(
        "/api/v1/courses/",
        json={
            "title": title,
            "description": title,
            "start_date": today.replace(day=1).isoformat(),
            "end_date": (today.replace(day=28) + timedelta(days=40)).isoformat(),
            "exam_type": "weekly",
            "price": "400.00",
            "mentor_id": mentor_id,
            "schedules": [{"day_of_week": 2, "time_start": "10:00:00", "time_end": "12:00:00"}],
        },
        headers=admin_headers,
    )
    assert course_response.status_code == 201
    course_id: int = course_response.json()["id"]
    enrollment_response = await client.post(
        "/api/v1/enrollments/", json={"student_id": student_id, "course_id": course_id}, headers=admin_headers
    )
    assert enrollment_response.status_code == 201
    return course_id


@pytest.mark.asyncio
async def test_student_filter_returns_only_that_students_course_balances(
    client: AsyncClient, test_admin: User, test_accountant: User, test_mentor: User
) -> None:
    admin_headers: dict[str, str] = _headers(test_admin)
    accountant_headers: dict[str, str] = _headers(test_accountant)
    first_student_id, first_course_id = await _setup_student_course(
        client, admin_headers, test_mentor.id, email="debt-filter-a@example.com"
    )
    second_student_id, _ = await _setup_student_course(
        client, admin_headers, test_mentor.id, email="debt-filter-b@example.com"
    )
    second_course_id: int = await _enroll_in_new_course(client, admin_headers, test_mentor.id, first_student_id, "Second")

    unfiltered = (await client.get(DEBTS_URL, headers=accountant_headers)).json()
    filtered = (await client.get(DEBTS_URL, params={"student_id": first_student_id}, headers=accountant_headers)).json()

    assert unfiltered["total"] > filtered["total"]
    assert filtered["total"] == 2
    assert {item["student"]["id"] for item in filtered["items"]} == {first_student_id}
    assert {item["course"]["id"] for item in filtered["items"]} == {first_course_id, second_course_id}
    assert second_student_id not in {item["student"]["id"] for item in filtered["items"]}


@pytest.mark.asyncio
async def test_student_filter_intersects_with_course_filter(
    client: AsyncClient, test_admin: User, test_accountant: User, test_mentor: User
) -> None:
    admin_headers: dict[str, str] = _headers(test_admin)
    accountant_headers: dict[str, str] = _headers(test_accountant)
    student_id, first_course_id = await _setup_student_course(
        client, admin_headers, test_mentor.id, email="debt-intersect-a@example.com"
    )
    other_student_id, other_student_course_id = await _setup_student_course(
        client, admin_headers, test_mentor.id, email="debt-intersect-b@example.com"
    )
    await _enroll_in_new_course(client, admin_headers, test_mentor.id, student_id, "Another")

    both = (
        await client.get(DEBTS_URL, params={"student_id": student_id, "course_id": first_course_id}, headers=accountant_headers)
    ).json()
    mismatched = (
        await client.get(
            DEBTS_URL, params={"student_id": student_id, "course_id": other_student_course_id}, headers=accountant_headers
        )
    ).json()

    assert both["total"] == 1
    assert both["items"][0]["student"]["id"] == student_id
    assert both["items"][0]["course"]["id"] == first_course_id
    assert mismatched["total"] == 0
    assert mismatched["items"] == []
    assert other_student_id != student_id


@pytest.mark.asyncio
async def test_student_filter_counts_before_pagination(
    client: AsyncClient, test_admin: User, test_accountant: User, test_mentor: User
) -> None:
    admin_headers: dict[str, str] = _headers(test_admin)
    student_id, _ = await _setup_student_course(client, admin_headers, test_mentor.id, email="debt-page@example.com")
    await _setup_student_course(client, admin_headers, test_mentor.id, email="debt-page-other@example.com")
    await _enroll_in_new_course(client, admin_headers, test_mentor.id, student_id, "Paged")

    first_page = (
        await client.get(DEBTS_URL, params={"student_id": student_id, "page_size": 1}, headers=_headers(test_accountant))
    ).json()

    assert first_page["total"] == 2
    assert first_page["total_pages"] == 2
    assert len(first_page["items"]) == 1


@pytest.mark.asyncio
async def test_student_filter_unknown_student_is_empty_and_invalid_is_rejected(
    client: AsyncClient, test_accountant: User
) -> None:
    unknown = await client.get(DEBTS_URL, params={"student_id": 987654}, headers=_headers(test_accountant))
    invalid = await client.get(DEBTS_URL, params={"student_id": 0}, headers=_headers(test_accountant))

    assert unknown.status_code == 200
    assert unknown.json()["total"] == 0
    assert invalid.status_code == 422


@pytest.mark.asyncio
async def test_student_filter_keeps_role_guard(
    client: AsyncClient, test_mentor: User, test_student: User
) -> None:
    mentor_response = await client.get(DEBTS_URL, params={"student_id": test_student.id}, headers=_headers(test_mentor))
    student_response = await client.get(DEBTS_URL, params={"student_id": test_student.id}, headers=_headers(test_student))

    assert mentor_response.status_code == 403
    assert student_response.status_code == 403
