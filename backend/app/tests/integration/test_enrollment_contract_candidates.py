import asyncio
from typing import List, Optional, Tuple
import pytest
from httpx import AsyncClient
from sqlalchemy import event, select, func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import HTTPException
from app.core.security import create_access_token
from app.models.course import CourseStatus
from app.models.enrollment import Enrollment
from app.models.charge import Charge
from app.models.journal_entry import JournalEntry
from app.models.journal_student_summary import JournalStudentSummary
from app.models.user import User
from app.services.enrollment_service import EnrollmentConflictClassifier, EnrollmentService
from app.tests.conftest import test_engine, TestingSessionLocal
from app.tests.integration.test_enrollment_contract import create_helper_course, create_helper_student


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

    lock_acquisition_barrier = asyncio.Barrier(2)

    async def run_enroll_session(session_index: int) -> Tuple[int, Optional[Enrollment], Optional[Exception]]:
        async with TestingSessionLocal() as session:
            service = EnrollmentService(session)
            original_execute = session.execute
            synchronized = False

            async def patched_execute(statement, *args, **kwargs):
                nonlocal synchronized
                sql_string = str(statement)
                if not synchronized and "users.id" in sql_string and "FOR UPDATE" in sql_string:
                    synchronized = True
                    await asyncio.wait_for(lock_acquisition_barrier.wait(), timeout=10.0)
                return await original_execute(statement, *args, **kwargs)

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

        charges_summary = await check_session.execute(
            select(func.count(Charge.id), func.sum(Charge.amount)).filter(
                Charge.enrollment_id == successes[0][1].id
            )
        )
        charge_count, total_charged_amount = charges_summary.one()
        assert charge_count == 1
        assert total_charged_amount == course.price


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
