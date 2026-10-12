import asyncio
from datetime import date, datetime, time, timezone
from decimal import Decimal
from typing import List, Optional, Tuple
import pytest
from httpx import AsyncClient
from sqlalchemy import event, select, func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import HTTPException
from app.core.security import create_access_token, hash_password
from app.models.course import Course, CourseExamType, CourseStatus
from app.models.course_schedule import CourseSchedule
from app.models.enrollment import Enrollment, EnrollmentStatus
from app.models.charge import Charge
from app.models.journal_entry import JournalEntry
from app.models.journal_student_summary import JournalStudentSummary
from app.models.user import User, UserRole
from app.services.enrollment_service import EnrollmentConflictClassifier, EnrollmentService
from app.tests.conftest import test_engine, TestingSessionLocal


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
    phone: str = "+992900000000"
) -> User:
    student = User(
        email=email,
        password_hash=hash_password("student_pass123"),
        first_name=first_name,
        last_name=last_name,
        role=UserRole.STUDENT,
        phone=phone,
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


@pytest.mark.asyncio
async def test_eligible_candidates_rbac_pagination_and_coherence(
    client: AsyncClient,
    test_admin: User,
    test_mentor: User,
    test_student: User,
    test_accountant: User,
    db_session: AsyncSession,
) -> None:
    admin_headers = {"Authorization": f"Bearer {create_access_token(test_admin.id, test_admin.role)}"}
    mentor_headers = {"Authorization": f"Bearer {create_access_token(test_mentor.id, test_mentor.role)}"}
    student_headers = {"Authorization": f"Bearer {create_access_token(test_student.id, test_student.role)}"}
    accountant_headers = {"Authorization": f"Bearer {create_access_token(test_accountant.id, test_accountant.role)}"}

    course = await create_helper_course(db_session, test_mentor.id)

    students = [
        await create_helper_student(db_session, f"cand_{i}@example.com", f"Candidate{i}", f"LastName{i}", f"+99291111111{i}")
        for i in range(5)
    ]
    await db_session.commit()

    res_mentor = await client.get(f"/api/v1/enrollments/courses/{course.id}/eligible-candidates", headers=mentor_headers)
    assert res_mentor.status_code == 403

    res_student = await client.get(f"/api/v1/enrollments/courses/{course.id}/eligible-candidates", headers=student_headers)
    assert res_student.status_code == 403

    res_accountant = await client.get(f"/api/v1/enrollments/courses/{course.id}/eligible-candidates", headers=accountant_headers)
    assert res_accountant.status_code == 403

    p1_res = await client.get(
        f"/api/v1/enrollments/courses/{course.id}/eligible-candidates?page=1&page_size=2",
        headers=admin_headers,
    )
    assert p1_res.status_code == 200
    p1_data = p1_res.json()
    assert len(p1_data["items"]) == 2
    assert p1_data["total"] >= 5

    p2_res = await client.get(
        f"/api/v1/enrollments/courses/{course.id}/eligible-candidates?page=2&page_size=2",
        headers=admin_headers,
    )
    assert p2_res.status_code == 200
    assert len(p2_res.json()["items"]) == 2

    p_exhaustion = await client.get(
        f"/api/v1/enrollments/courses/{course.id}/eligible-candidates?page=999&page_size=2",
        headers=admin_headers,
    )
    assert p_exhaustion.status_code == 200
    assert len(p_exhaustion.json()["items"]) == 0

    enroll_res = await client.post(
        "/api/v1/enrollments/",
        json={"student_id": students[0].id, "course_id": course.id},
        headers=admin_headers,
    )
    assert enroll_res.status_code == 201
    enrollment_id = enroll_res.json()["id"]

    after_enroll = await client.get(
        f"/api/v1/enrollments/courses/{course.id}/eligible-candidates",
        headers=admin_headers,
    )
    assert after_enroll.status_code == 200
    after_ids = [c["id"] for c in after_enroll.json()["items"]]
    assert students[0].id not in after_ids

    await client.patch(
        f"/api/v1/enrollments/{enrollment_id}/withdraw",
        headers=admin_headers,
    )

    after_withdraw = await client.get(
        f"/api/v1/enrollments/courses/{course.id}/eligible-candidates",
        headers=admin_headers,
    )
    assert after_withdraw.status_code == 200
    withdrawn_ids = [c["id"] for c in after_withdraw.json()["items"]]
    assert students[0].id not in withdrawn_ids

    re_enroll_res = await client.post(
        "/api/v1/enrollments/",
        json={"student_id": students[0].id, "course_id": course.id},
        headers=admin_headers,
    )
    assert re_enroll_res.status_code == 409
    assert re_enroll_res.json()["detail"] == "Student is already enrolled in this course"

    course.status = CourseStatus.ARCHIVED
    await db_session.commit()

    archived_candidates_res = await client.get(
        f"/api/v1/enrollments/courses/{course.id}/eligible-candidates",
        headers=admin_headers,
    )
    assert archived_candidates_res.status_code == 400
    assert archived_candidates_res.json()["detail"] == "Course is archived/inactive"

    archived_enroll_res = await client.post(
        "/api/v1/enrollments/",
        json={"student_id": students[1].id, "course_id": course.id},
        headers=admin_headers,
    )
    assert archived_enroll_res.status_code == 400
    assert archived_enroll_res.json()["detail"] == "Course is archived/inactive"


@pytest.mark.asyncio
async def test_duplicate_enrollment_simultaneous_race(
    test_admin: User,
    test_mentor: User,
    test_student: User,
    db_session: AsyncSession,
) -> None:
    course = await create_helper_course(db_session, test_mentor.id)
    await db_session.commit()

    precheck1_event = asyncio.Event()
    precheck2_event = asyncio.Event()

    async def run_enroll_session(session_index: int) -> Tuple[int, Optional[Enrollment], Optional[Exception]]:
        async with TestingSessionLocal() as session:
            service = EnrollmentService(session)
            original_execute = session.execute

            prechecked = False
            async def patched_execute(statement, *args, **kwargs):
                nonlocal prechecked
                result = await original_execute(statement, *args, **kwargs)
                sql_str = str(statement)
                if not prechecked and "enrollments.student_id" in sql_str and "enrollments.course_id" in sql_str and "SELECT" in sql_str.upper():
                    prechecked = True
                    if session_index == 1:
                        precheck1_event.set()
                        await asyncio.wait_for(precheck2_event.wait(), timeout=10.0)
                    elif session_index == 2:
                        await asyncio.wait_for(precheck1_event.wait(), timeout=10.0)
                        precheck2_event.set()
                return result

            session.execute = patched_execute
            try:
                enrollment = await service.enroll_student(test_student.id, course.id, test_admin)
                await session.commit()
                return (session_index, enrollment, None)
            except Exception as exc:
                probe_result = await session.execute(select(User).filter(User.id == test_student.id))
                assert probe_result.scalars().first() is not None
                return (session_index, None, exc)

    results = await asyncio.gather(
        run_enroll_session(1),
        run_enroll_session(2),
        return_exceptions=False,
    )

    successes = [r for r in results if r[1] is not None]
    conflicts = [r for r in results if r[2] is not None]

    assert len(successes) == 1
    assert len(conflicts) == 1

    conflict_exception = conflicts[0][2]
    assert isinstance(conflict_exception, HTTPException)
    assert conflict_exception.status_code == 409
    assert conflict_exception.detail == "Student is already enrolled in this course"

    async with TestingSessionLocal() as check_session:
        enr_count_res = await check_session.execute(
            select(func.count(Enrollment.id)).filter(
                Enrollment.student_id == test_student.id,
                Enrollment.course_id == course.id,
            )
        )
        assert enr_count_res.scalar() == 1

        entries_count_res = await check_session.execute(
            select(func.count(JournalEntry.id)).filter(JournalEntry.student_id == test_student.id)
        )
        assert entries_count_res.scalar() == 5

        summaries_count_res = await check_session.execute(
            select(func.count(JournalStudentSummary.id)).filter(JournalStudentSummary.student_id == test_student.id)
        )
        assert summaries_count_res.scalar() == 5

        charges_count_res = await check_session.execute(
            select(func.count(Charge.id)).filter(
                Charge.enrollment_id == successes[0][1].id
            )
        )
        assert charges_count_res.scalar() > 0


@pytest.mark.asyncio
async def test_unrelated_integrity_error_not_converted(
    test_admin: User,
    test_mentor: User,
    test_student: User,
    db_session: AsyncSession,
) -> None:
    course = await create_helper_course(db_session, test_mentor.id)
    await db_session.commit()

    async with TestingSessionLocal() as session:
        service = EnrollmentService(session)

        async def flush_raising_foreign_key_violation(*args, **kwargs):
            raise IntegrityError(
                statement="INSERT INTO enrollments ...",
                params={},
                orig=Exception("violates foreign key constraint \"enrollments_course_id_fkey\""),
            )

        session.flush = flush_raising_foreign_key_violation

        with pytest.raises(IntegrityError) as exc_info:
            await service.enroll_student(test_student.id, course.id, test_admin)

        assert "enrollments_course_id_fkey" in str(exc_info.value)

    classifier = EnrollmentConflictClassifier()
    assert classifier.is_uniqueness_conflict(
        IntegrityError("INSERT", {}, Exception("duplicate key value violates unique constraint \"uq_student_course\""))
    ) is True
    assert classifier.is_uniqueness_conflict(
        IntegrityError("INSERT", {}, Exception("violates foreign key constraint \"enrollments_student_id_fkey\""))
    ) is False


@pytest.mark.asyncio
async def test_roster_bounded_db_queries_no_n_plus_one(
    client: AsyncClient,
    test_admin: User,
    test_mentor: User,
    db_session: AsyncSession,
) -> None:
    admin_headers = {"Authorization": f"Bearer {create_access_token(test_admin.id, test_admin.role)}"}
    course = await create_helper_course(db_session, test_mentor.id)

    students = [
        await create_helper_student(db_session, f"query_test_{i}@example.com", f"Student{i}", f"LastName{i}")
        for i in range(10)
    ]
    await db_session.commit()

    for s in students:
        await client.post(
            "/api/v1/enrollments/",
            json={"student_id": s.id, "course_id": course.id},
            headers=admin_headers,
        )

    captured_statements: List[str] = []

    def before_execute(conn, cursor, statement, parameters, context, executemany):
        captured_statements.append(statement)

    event.listen(test_engine.sync_engine, "before_cursor_execute", before_execute)
    try:
        res = await client.get(
            f"/api/v1/enrollments/courses/{course.id}/roster?page=1&page_size=10",
            headers=admin_headers,
        )
        assert res.status_code == 200
        assert len(res.json()["items"]) == 10
    finally:
        event.remove(test_engine.sync_engine, "before_cursor_execute", before_execute)

    query_statements = [
        stmt for stmt in captured_statements
        if "SELECT" in stmt.upper() and not stmt.upper().startswith("ROLLBACK")
    ]
    assert len(query_statements) <= 6
