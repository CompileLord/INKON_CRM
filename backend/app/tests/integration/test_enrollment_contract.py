import zlib
from datetime import date, time
from decimal import Decimal
from typing import List
import pytest
from httpx import AsyncClient
from sqlalchemy import event
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.security import create_access_token, hash_password
from app.models.course import Course, CourseExamType, CourseStatus
from app.models.course_schedule import CourseSchedule
from app.models.user import User, UserRole
from app.tests.conftest import test_engine


async def create_helper_course(
    db: AsyncSession,
    mentor_id: int,
    price: Decimal = Decimal("250.00"),
    title: str = "Test Course",
    status: CourseStatus = CourseStatus.ACTIVE,
) -> Course:
    course = Course(
        title=title,
        description="Course description",
        start_date=date(2026, 8, 1),
        end_date=date(2026, 8, 31),
        exam_type=CourseExamType.WEEKLY,
        price=price,
        mentor_id=mentor_id,
        status=status,
    )
    db.add(course)
    await db.flush()

    schedule = CourseSchedule(
        course_id=course.id,
        day_of_week=0,
        time_start=time(10, 0, 0),
        time_end=time(12, 0, 0),
    )
    db.add(schedule)
    await db.flush()

    from app.services.journal_generation_service import JournalGenerationService
    journal_service = JournalGenerationService(db)
    await journal_service.generate_journals(course)
    await db.flush()
    return course


async def create_helper_student(
    db: AsyncSession,
    email: str,
    first_name: str,
    last_name: str,
    phone: str | None = None
) -> User:
    resolved_phone: str = phone or f"+99280{zlib.crc32(email.encode()) % 10_000_000:07d}"
    student = User(
        email=email,
        password_hash=hash_password("student_pass123"),
        first_name=first_name,
        last_name=last_name,
        role=UserRole.STUDENT,
        phone=resolved_phone,
        must_set_password=False,
    )
    db.add(student)
    await db.flush()
    return student


@pytest.mark.asyncio
async def test_roster_rbac(
    client: AsyncClient,
    test_admin: User,
    test_mentor: User,
    test_student: User,
    test_accountant: User,
    db_session: AsyncSession,
) -> None:
    course = await create_helper_course(db_session, test_mentor.id)
    await db_session.commit()

    other_mentor = User(
        email="other_mentor@example.com",
        password_hash=hash_password("mentor_pass123"),
        first_name="Other",
        last_name="Mentor",
        role=UserRole.MENTOR,
        must_set_password=False,
    )
    db_session.add(other_mentor)
    await db_session.commit()

    admin_headers = {"Authorization": f"Bearer {create_access_token(test_admin.id, test_admin.role)}"}
    mentor_headers = {"Authorization": f"Bearer {create_access_token(test_mentor.id, test_mentor.role)}"}
    other_mentor_headers = {"Authorization": f"Bearer {create_access_token(other_mentor.id, other_mentor.role)}"}
    student_headers = {"Authorization": f"Bearer {create_access_token(test_student.id, test_student.role)}"}
    accountant_headers = {"Authorization": f"Bearer {create_access_token(test_accountant.id, test_accountant.role)}"}

    res_admin = await client.get(f"/api/v1/enrollments/courses/{course.id}/roster", headers=admin_headers)
    assert res_admin.status_code == 200

    res_mentor = await client.get(f"/api/v1/enrollments/courses/{course.id}/roster", headers=mentor_headers)
    assert res_mentor.status_code == 200

    res_other_mentor = await client.get(f"/api/v1/enrollments/courses/{course.id}/roster", headers=other_mentor_headers)
    assert res_other_mentor.status_code == 403

    res_student = await client.get(f"/api/v1/enrollments/courses/{course.id}/roster", headers=student_headers)
    assert res_student.status_code == 403

    res_accountant = await client.get(f"/api/v1/enrollments/courses/{course.id}/roster", headers=accountant_headers)
    assert res_accountant.status_code == 403

    res_unauth = await client.get(f"/api/v1/enrollments/courses/{course.id}/roster")
    assert res_unauth.status_code == 401


@pytest.mark.asyncio
async def test_roster_snapshot_fields_and_privacy(
    client: AsyncClient,
    test_admin: User,
    test_mentor: User,
    db_session: AsyncSession,
) -> None:
    admin_headers = {"Authorization": f"Bearer {create_access_token(test_admin.id, test_admin.role)}"}
    course = await create_helper_course(db_session, test_mentor.id, price=Decimal("350.00"))
    student = await create_helper_student(db_session, "privacy_student@example.com", "Farrukh", "Vohidov", "+992920000001")
    await db_session.commit()

    enroll_res = await client.post(
        "/api/v1/enrollments/",
        json={"student_id": student.id, "course_id": course.id},
        headers=admin_headers,
    )
    assert enroll_res.status_code == 201

    roster_res = await client.get(f"/api/v1/enrollments/courses/{course.id}/roster", headers=admin_headers)
    assert roster_res.status_code == 200
    roster_json = roster_res.json()

    assert roster_json["total"] == 1
    assert roster_json["active_count"] == 1
    assert len(roster_json["items"]) == 1

    item = roster_json["items"][0]
    assert item["student_id"] == student.id
    assert item["course_id"] == course.id
    assert item["price_at_enrollment"] == "350.00"
    assert item["status"] == "active"
    assert item["color_hex"] == "#E53E3E"
    assert "enrolled_at" in item

    student_identity = item["student"]
    assert student_identity["id"] == student.id
    assert student_identity["first_name"] == "Farrukh"
    assert student_identity["last_name"] == "Vohidov"
    assert student_identity["email"] == "privacy_student@example.com"
    assert student_identity["phone"] == "+992920000001"

    forbidden_fields = [
        "password_hash",
        "avg_score",
        "homework_score",
        "attendance_score",
        "exam_score",
        "bonus_score",
        "sum_score",
        "balance",
        "must_set_password",
        "parent_telegram_chat_id",
        "parent_phone",
        "date_of_birth",
        "payment_day_of_month",
    ]
    for field in forbidden_fields:
        assert field not in student_identity
        assert field not in item


@pytest.mark.asyncio
async def test_roster_pagination_sorting_and_exact_totals(
    client: AsyncClient,
    test_admin: User,
    test_mentor: User,
    db_session: AsyncSession,
) -> None:
    admin_headers = {"Authorization": f"Bearer {create_access_token(test_admin.id, test_admin.role)}"}
    course = await create_helper_course(db_session, test_mentor.id, price=Decimal("100.00"))

    students_data = [
        ("c_adams@example.com", "Charlie", "Adams", "+992900000001"),
        ("a_brown@example.com", "Alice", "Brown", "+992900000002"),
        ("d_clark@example.com", "David", "Clark", "+992900000003"),
        ("e_davis@example.com", "Eve", "Davis", "+992900000004"),
        ("b_smith@example.com", "Bob", "Smith", "+992900000005"),
    ]

    created_students: List[User] = []
    for email, first, last, phone in students_data:
        s = await create_helper_student(db_session, email, first, last, phone)
        created_students.append(s)
    await db_session.commit()

    created_enrollments: List[dict] = []
    for s in created_students:
        enroll_res = await client.post(
            "/api/v1/enrollments/",
            json={"student_id": s.id, "course_id": course.id},
            headers=admin_headers,
        )
        assert enroll_res.status_code == 201
        created_enrollments.append(enroll_res.json())

    p1_res = await client.get(
        f"/api/v1/enrollments/courses/{course.id}/roster?page=1&page_size=2",
        headers=admin_headers,
    )
    assert p1_res.status_code == 200
    p1_data = p1_res.json()
    assert p1_data["total"] == 5
    assert p1_data["total_pages"] == 3
    assert p1_data["active_count"] == 5
    assert len(p1_data["items"]) == 2

    p2_res = await client.get(
        f"/api/v1/enrollments/courses/{course.id}/roster?page=2&page_size=2",
        headers=admin_headers,
    )
    assert p2_res.status_code == 200
    p2_data = p2_res.json()
    assert len(p2_data["items"]) == 2

    p3_res = await client.get(
        f"/api/v1/enrollments/courses/{course.id}/roster?page=3&page_size=2",
        headers=admin_headers,
    )
    assert p3_res.status_code == 200
    p3_data = p3_res.json()
    assert len(p3_data["items"]) == 1

    p4_res = await client.get(
        f"/api/v1/enrollments/courses/{course.id}/roster?page=4&page_size=2",
        headers=admin_headers,
    )
    assert p4_res.status_code == 200
    p4_data = p4_res.json()
    assert len(p4_data["items"]) == 0
    assert p4_data["total"] == 5
    assert p4_data["total_pages"] == 3

    sort_name_asc = await client.get(
        f"/api/v1/enrollments/courses/{course.id}/roster?sort=name_asc&page_size=10",
        headers=admin_headers,
    )
    asc_items = sort_name_asc.json()["items"]
    asc_last_names = [item["student"]["last_name"] for item in asc_items]
    assert asc_last_names == ["Adams", "Brown", "Clark", "Davis", "Smith"]

    sort_name_desc = await client.get(
        f"/api/v1/enrollments/courses/{course.id}/roster?sort=name_desc&page_size=10",
        headers=admin_headers,
    )
    desc_items = sort_name_desc.json()["items"]
    desc_last_names = [item["student"]["last_name"] for item in desc_items]
    assert desc_last_names == ["Smith", "Davis", "Clark", "Brown", "Adams"]

    search_res = await client.get(
        f"/api/v1/enrollments/courses/{course.id}/roster?search=Clark",
        headers=admin_headers,
    )
    assert search_res.status_code == 200
    search_data = search_res.json()
    assert search_data["total"] == 1
    assert search_data["items"][0]["student"]["last_name"] == "Clark"

    withdraw_target = created_enrollments[0]["id"]
    withdraw_res = await client.patch(
        f"/api/v1/enrollments/{withdraw_target}/withdraw",
        headers=admin_headers,
    )
    assert withdraw_res.status_code == 200

    active_res = await client.get(
        f"/api/v1/enrollments/courses/{course.id}/roster?status=active",
        headers=admin_headers,
    )
    assert active_res.status_code == 200
    assert active_res.json()["total"] == 4
    assert active_res.json()["active_count"] == 4

    withdrawn_res = await client.get(
        f"/api/v1/enrollments/courses/{course.id}/roster?status=withdrawn",
        headers=admin_headers,
    )
    assert withdrawn_res.status_code == 200
    assert withdrawn_res.json()["total"] == 1
    assert withdrawn_res.json()["active_count"] == 4

    invalid_sort_res = await client.get(
        f"/api/v1/enrollments/courses/{course.id}/roster?sort=invalid_sort",
        headers=admin_headers,
    )
    assert invalid_sort_res.status_code == 422

    invalid_status_res = await client.get(
        f"/api/v1/enrollments/courses/{course.id}/roster?status=invalid_status",
        headers=admin_headers,
    )
    assert invalid_status_res.status_code == 422


@pytest.mark.asyncio
async def test_roster_location_advanced(
    client: AsyncClient,
    test_admin: User,
    test_mentor: User,
    db_session: AsyncSession,
) -> None:
    admin_headers = {"Authorization": f"Bearer {create_access_token(test_admin.id, test_admin.role)}"}
    course = await create_helper_course(db_session, test_mentor.id)

    students = [
        await create_helper_student(db_session, f"tie_{i}@example.com", "SameFirst", "SameLast")
        for i in range(5)
    ]
    await db_session.commit()

    created_ids: List[int] = []
    for s in students:
        res = await client.post(
            "/api/v1/enrollments/",
            json={"student_id": s.id, "course_id": course.id},
            headers=admin_headers,
        )
        created_ids.append(res.json()["id"])

    target_student = students[3]
    locate_res = await client.get(
        f"/api/v1/enrollments/courses/{course.id}/roster/locate?student_id={target_student.id}&page_size=2",
        headers=admin_headers,
    )
    assert locate_res.status_code == 200
    loc_data = locate_res.json()
    assert loc_data["student_id"] == target_student.id
    assert loc_data["page"] == 2
    assert loc_data["index"] == 3
    assert loc_data["total"] == 5

    search_locate_res = await client.get(
        f"/api/v1/enrollments/courses/{course.id}/roster/locate?student_id={target_student.id}&search=SameLast",
        headers=admin_headers,
    )
    assert search_locate_res.status_code == 200
    assert search_locate_res.json()["student_id"] == target_student.id

    no_match_search_res = await client.get(
        f"/api/v1/enrollments/courses/{course.id}/roster/locate?student_id={target_student.id}&search=NonExistent",
        headers=admin_headers,
    )
    assert no_match_search_res.status_code == 404

    await client.patch(
        f"/api/v1/enrollments/{created_ids[3]}/withdraw",
        headers=admin_headers,
    )
    status_locate_withdrawn = await client.get(
        f"/api/v1/enrollments/courses/{course.id}/roster/locate?student_id={target_student.id}&status=withdrawn",
        headers=admin_headers,
    )
    assert status_locate_withdrawn.status_code == 200
    assert status_locate_withdrawn.json()["student_id"] == target_student.id

    status_locate_active_mismatch = await client.get(
        f"/api/v1/enrollments/courses/{course.id}/roster/locate?student_id={target_student.id}&status=active",
        headers=admin_headers,
    )
    assert status_locate_active_mismatch.status_code == 404

    captured_statements: List[str] = []
    def before_execute(conn, cursor, statement, parameters, context, executemany):
        captured_statements.append(statement)

    event.listen(test_engine.sync_engine, "before_cursor_execute", before_execute)
    try:
        query_count_res = await client.get(
            f"/api/v1/enrollments/courses/{course.id}/roster/locate?student_id={students[0].id}",
            headers=admin_headers,
        )
        assert query_count_res.status_code == 200
    finally:
        event.remove(test_engine.sync_engine, "before_cursor_execute", before_execute)

    select_queries = [
        s for s in captured_statements
        if "SELECT" in s.upper() and not s.upper().startswith("ROLLBACK")
    ]
    assert len(select_queries) <= 4
