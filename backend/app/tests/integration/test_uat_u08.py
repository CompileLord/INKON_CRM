from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Any

import pytest
import pytest_asyncio
from httpx import AsyncClient, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.redis import redis_client
from app.core.security import create_access_token
from app.models.charge import Charge
from app.models.course import Course, CourseExamType
from app.models.enrollment import Enrollment
from app.models.user import User, UserRole


class SearchFixture:
    def __init__(self, target: User, course: Course, candidate_course: Course) -> None:
        self.target: User = target
        self.course: Course = course
        self.candidate_course: Course = candidate_course

    def endpoint(self, population: str) -> str:
        if population == "roster":
            return f"/api/v1/enrollments/courses/{self.course.id}/roster"
        if population == "candidates":
            return f"/api/v1/enrollments/courses/{self.candidate_course.id}/eligible-candidates"
        if population == "debtors":
            return "/api/v1/finance/debts/"
        return f"/api/v1/{population}/"

    @staticmethod
    def headers(user: User) -> dict[str, str]:
        return {"Authorization": f"Bearer {create_access_token(user.id, user.role)}"}


@pytest_asyncio.fixture
async def people(db_session: AsyncSession, test_mentor: User) -> SearchFixture:
    course: Course = Course(
        title="Alpha", description="Search fixture", mentor_id=test_mentor.id,
        start_date=date(2020, 1, 1), end_date=date(2030, 1, 1),
        price=Decimal("100.00"), exam_type=CourseExamType.MONTHLY,
    )
    candidate_course: Course = Course(
        title="Beta", description="Candidates", mentor_id=test_mentor.id,
        start_date=date(2021, 1, 1), end_date=date(2030, 1, 1),
        price=Decimal("300.00"), exam_type=CourseExamType.MONTHLY,
    )
    db_session.add_all([course, candidate_course])
    await db_session.flush()
    target: User
    index: int
    for index in range(3):
        target = User(
            first_name="Zarina" if index == 2 else f"Amina{index}",
            last_name="Zarifova" if index == 2 else f"Abdullo{index}",
            email=f"person{index}@example.com", phone=f"+99290000100{index}",
            password_hash="unused", role=UserRole.STUDENT, must_set_password=False,
        )
        db_session.add(target)
        await db_session.flush()
        enrollment: Enrollment = Enrollment(
            course_id=course.id, student_id=target.id,
            price_at_enrollment=Decimal("100.00"), color_hex="#123456",
        )
        db_session.add(enrollment)
        await db_session.flush()
        db_session.add(Charge(
            enrollment_id=enrollment.id, student_id=target.id,
            sequence_no=1, amount=Decimal("10.00"), due_date=date(2020, 1, 1),
        ))
    await db_session.commit()
    return SearchFixture(target, course, candidate_course)


@pytest.mark.asyncio
@pytest.mark.parametrize("population", ["students", "mentors", "roster", "candidates", "debtors"])
@pytest.mark.parametrize("term", ["Zarina Zarifova", "Zarifova Zarina", "zArInA zArIfOvA", "  Zarina   Zarifova  ", "Zarina", "Zarifova", "person2@", "+992900001002"])
async def test_people_search_before_pagination(
    client: AsyncClient, db_session: AsyncSession, test_admin: User,
    people: SearchFixture, population: str, term: str,
) -> None:
    if population == "mentors":
        people.target.role = UserRole.MENTOR
        await db_session.commit()
    endpoint: str = people.endpoint(population)
    headers: dict[str, str] = people.headers(test_admin)
    unfiltered_page_size: int = 1 if population == "mentors" else 2
    first: Response = await client.get(endpoint, headers=headers, params={"page_size": unfiltered_page_size})
    assert first.status_code == 200, first.text
    assert first.json()["total"] > 1
    first_item: dict[str, Any] = first.json()["items"][0]
    assert (first_item.get("student", first_item))["id"] != people.target.id
    assert all(item.get("student", item)["id"] != people.target.id for item in first.json()["items"])
    second: Response = await client.get(endpoint, headers=headers, params={"page_size": unfiltered_page_size, "page": 2})
    assert second.status_code == 200, second.text
    assert any(item.get("student", item)["id"] == people.target.id for item in second.json()["items"])
    response: Response = await client.get(endpoint, headers=headers, params={"search": term, "page_size": 1})
    assert response.status_code == 200, response.text
    assert response.json()["total"] == 1
    item: dict[str, Any] = response.json()["items"][0]
    assert item.get("student", item)["id"] == people.target.id


@pytest.mark.asyncio
@pytest.mark.parametrize("population", ["students", "mentors", "roster", "candidates", "debtors"])
@pytest.mark.parametrize("term", ["%", "_", "\\"])
async def test_people_search_escapes_wildcards(
    client: AsyncClient, test_admin: User, people: SearchFixture, population: str, term: str,
) -> None:
    response: Response = await client.get(
        people.endpoint(population), headers=people.headers(test_admin), params={"search": term},
    )
    assert response.status_code == 200, response.text
    assert response.json()["total"] == 0


@pytest.mark.asyncio
@pytest.mark.parametrize("sort", ["title_asc", "title_desc", "price_asc", "price_desc", "start_date_asc", "start_date_desc"])
async def test_course_sort(
    client: AsyncClient, db_session: AsyncSession, test_admin: User, people: SearchFixture, sort: str,
) -> None:
    if sort.startswith("title"):
        people.course.title = "Zulu"
    elif sort.startswith("price"):
        people.course.price = Decimal("400.00")
    else:
        people.course.start_date = date(2022, 1, 1)
    await db_session.commit()
    response: Response = await client.get("/api/v1/courses/", headers=people.headers(test_admin), params={"sort": sort})
    assert response.status_code == 200, response.text
    expected: list[int] = [people.candidate_course.id, people.course.id]
    if sort.endswith("desc"):
        expected.reverse()
    assert [item["id"] for item in response.json()["items"]] == expected


@pytest.mark.asyncio
async def test_course_search_and_invalid_sort(client: AsyncClient, test_admin: User, people: SearchFixture) -> None:
    headers: dict[str, str] = people.headers(test_admin)
    response: Response = await client.get("/api/v1/courses/", headers=headers, params={"search": " bEtA ", "page_size": 1})
    assert response.status_code == 200, response.text
    assert response.json()["total"] == 1
    assert response.json()["items"][0]["id"] == people.candidate_course.id
    invalid: Response = await client.get("/api/v1/courses/", headers=headers, params={"sort": "password_hash"})
    assert invalid.status_code == 422


@pytest.mark.asyncio
@pytest.mark.parametrize("sort", ["default", "created_at_asc", "created_at_desc", "price_asc", "price_desc", "title_asc", "title_desc", "start_date_asc", "start_date_desc"])
async def test_equal_course_values_have_id_tiebreaker(
    client: AsyncClient, db_session: AsyncSession, test_admin: User, people: SearchFixture, sort: str,
) -> None:
    people.candidate_course.created_at = people.course.created_at
    people.candidate_course.price = people.course.price
    people.candidate_course.title = people.course.title
    people.candidate_course.start_date = people.course.start_date
    await db_session.commit()
    seen: list[int] = []
    page: int
    for page in (1, 2):
        parameters: dict[str, str | int] = {"page": page, "page_size": 1}
        if sort != "default":
            parameters["sort"] = sort
        response: Response = await client.get(
            "/api/v1/courses/", headers=people.headers(test_admin),
            params=parameters,
        )
        assert response.status_code == 200, response.text
        seen.extend(item["id"] for item in response.json()["items"])
    assert seen == sorted([people.course.id, people.candidate_course.id])


@pytest.mark.asyncio
async def test_debtor_search_after_cached_unfiltered_page(
    client: AsyncClient, test_accountant: User, people: SearchFixture,
) -> None:
    headers: dict[str, str] = people.headers(test_accountant)
    endpoint: str = people.endpoint("debtors")
    initial: Response = await client.get(endpoint, headers=headers, params={"page_size": 1})
    assert initial.status_code == 200, initial.text
    await redis_client.set("finance:debts:1:1", initial.text, ex=600)
    await redis_client.set("finance:debts", initial.text, ex=600)
    response: Response = await client.get(endpoint, headers=headers, params={"search": "Zarifova Zarina", "page_size": 1})
    assert response.status_code == 200, response.text
    assert response.json()["total"] == 1
    assert response.json()["items"][0]["student"]["id"] == people.target.id
    missing: Response = await client.get(endpoint, headers=headers, params={"search": "Nobody Here", "page_size": 1})
    assert missing.status_code == 200, missing.text
    assert missing.json()["total"] == 0


@pytest.mark.asyncio
@pytest.mark.parametrize("role", ["mentor", "student", "accountant", "superadmin"])
async def test_course_search_preserves_role_scope(
    client: AsyncClient, db_session: AsyncSession, test_admin: User,
    test_mentor: User, test_student: User, test_accountant: User,
    people: SearchFixture, role: str,
) -> None:
    people.candidate_course.mentor_id = test_admin.id
    db_session.add(Enrollment(
        course_id=people.course.id, student_id=test_student.id,
        price_at_enrollment=Decimal("100.00"), color_hex="#123456",
    ))
    await db_session.commit()
    users: dict[str, User] = {"mentor": test_mentor, "student": test_student, "accountant": test_accountant, "superadmin": test_admin}
    response: Response = await client.get(
        "/api/v1/courses/", headers=people.headers(users[role]), params={"search": "bEtA", "sort": "price_desc"},
    )
    assert response.status_code == 200, response.text
    assert response.json()["total"] == (0 if role in ("mentor", "student") else 1)


@pytest.mark.asyncio
@pytest.mark.parametrize("term", ["%", "_", "\\"])
async def test_course_search_escapes_wildcards(
    client: AsyncClient, test_admin: User, people: SearchFixture, term: str,
) -> None:
    response: Response = await client.get(
        "/api/v1/courses/", headers=people.headers(test_admin), params={"search": term},
    )
    assert response.status_code == 200, response.text
    assert response.json()["total"] == 0


@pytest.mark.asyncio
@pytest.mark.parametrize("population", ["students", "mentors", "roster", "candidates", "debtors"])
@pytest.mark.parametrize("term", ["%", "_", "\\", "full_name"])
async def test_literal_wildcard_name_can_be_found(
    client: AsyncClient, db_session: AsyncSession, test_admin: User, people: SearchFixture, population: str, term: str,
) -> None:
    people.target.first_name = "Zar%_\\ina"
    if population == "mentors":
        people.target.role = UserRole.MENTOR
    await db_session.commit()
    response: Response = await client.get(
        people.endpoint(population), headers=people.headers(test_admin),
        params={"search": f"{people.target.first_name} {people.target.last_name}" if term == "full_name" else term},
    )
    assert response.status_code == 200, response.text
    assert response.json()["total"] == 1
    item: dict[str, Any] = response.json()["items"][0]
    assert item.get("student", item)["id"] == people.target.id


@pytest.mark.asyncio
@pytest.mark.parametrize("sort", ["default", "created_at_desc", "created_at_asc"])
async def test_course_creation_order(
    client: AsyncClient, db_session: AsyncSession, test_admin: User, people: SearchFixture, sort: str,
) -> None:
    people.course.title = "Zulu"
    people.course.created_at = datetime(2024, 1, 1, tzinfo=timezone.utc)
    people.candidate_course.title = "Alpha"
    people.candidate_course.created_at = datetime(2020, 1, 1, tzinfo=timezone.utc)
    await db_session.commit()
    expected: list[int] = [people.course.id, people.candidate_course.id]
    if sort == "created_at_asc":
        expected.reverse()
    seen: list[int] = []
    page: int
    for page in (1, 2):
        parameters: dict[str, str | int] = {"page": page, "page_size": 1}
        if sort != "default":
            parameters["sort"] = sort
        response: Response = await client.get(
            "/api/v1/courses/", headers=people.headers(test_admin), params=parameters,
        )
        assert response.status_code == 200, response.text
        assert response.json()["total"] == 2
        seen.extend(item["id"] for item in response.json()["items"])
    assert seen == expected
