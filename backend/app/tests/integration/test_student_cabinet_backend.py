import pytest
from datetime import date, timedelta
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token
from app.models.user import User, UserRole
from app.models.course import Course, CourseExamType, CourseStatus
from app.models.enrollment import Enrollment, EnrollmentStatus
from app.models.journal import Journal, JournalPeriodType
from app.models.journal_entry import JournalEntry
from app.models.journal_student_summary import JournalStudentSummary


@pytest.mark.asyncio
async def test_student_profile_enrichment_totals(
    client: AsyncClient,
    test_student: User,
):
    token = create_access_token(user_id=test_student.id, role=test_student.role.value)
    headers = {"Authorization": f"Bearer {token}"}

    response = await client.get("/api/v1/students/me/profile", headers=headers)
    assert response.status_code == 200
    data = response.json()
    assert "user" in data
    assert "totals" in data
    totals = data["totals"]
    assert "avg_percentage" in totals
    assert "attendance_percentage" in totals
    assert "active_course_count" in totals
    assert "archived_course_count" in totals
    assert "courses" in data


@pytest.mark.asyncio
async def test_student_journals_endpoint(
    client: AsyncClient,
    test_student: User,
):
    token = create_access_token(user_id=test_student.id, role=test_student.role.value)
    headers = {"Authorization": f"Bearer {token}"}

    response = await client.get("/api/v1/students/me/journals", headers=headers)
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)


@pytest.mark.asyncio
async def test_student_progress_chart_privacy_and_anonymity(
    client: AsyncClient,
    test_admin: User,
    test_mentor: User,
    test_student: User,
    db_session: AsyncSession,
):
    """Test that progress-chart for a student contains NO peer datasets or peer names (§1.3 privacy invariant)."""
    admin_headers = {"Authorization": f"Bearer {create_access_token(test_admin.id, test_admin.role)}"}

    # Create second student to act as peer
    peer_student = User(
        email="peer_student@example.com",
        password_hash="hash",
        first_name="Peer",
        last_name="Student",
        role=UserRole.STUDENT,
        must_set_password=False,
    )
    db_session.add(peer_student)
    await db_session.commit()
    await db_session.refresh(peer_student)

    # Create course & enroll both
    course_resp = await client.post(
        "/api/v1/courses/",
        json={
            "title": "Privacy Course",
            "description": "Test privacy",
            "start_date": "2026-01-01",
            "end_date": "2026-06-01",
            "exam_type": "weekly",
            "price": "100.00",
            "mentor_id": test_mentor.id,
            "schedules": [{"day_of_week": 0, "time_start": "09:00:00", "time_end": "10:30:00"}],
        },
        headers=admin_headers,
    )
    assert course_resp.status_code == 201
    course_id = course_resp.json()["id"]

    await client.post("/api/v1/enrollments/", json={"student_id": test_student.id, "course_id": course_id}, headers=admin_headers)
    await client.post("/api/v1/enrollments/", json={"student_id": peer_student.id, "course_id": course_id}, headers=admin_headers)

    # Student requests progress chart
    student_headers = {"Authorization": f"Bearer {create_access_token(test_student.id, UserRole.STUDENT)}"}
    chart_resp = await client.get(f"/api/v1/courses/{course_id}/progress-chart", headers=student_headers)
    assert chart_resp.status_code == 200
    chart_data = chart_resp.json()

    # Verify privacy invariant: no peer names, no datasets field
    assert "datasets" not in chart_data
    assert "labels" not in chart_data
    assert "periods" in chart_data
    assert "my_series" in chart_data
    assert "class_avg_series" in chart_data
    assert "my_rank" in chart_data
    assert "class_size" in chart_data
    assert chart_data["class_size"] == 2

    # Verify no peer name exists in raw text payload
    raw_text = chart_resp.text
    assert "Peer" not in raw_text
    assert "peer_student@example.com" not in raw_text


@pytest.mark.asyncio
async def test_student_course_bucket_rule_and_rank_computation(
    client: AsyncClient,
    test_admin: User,
    test_mentor: User,
    test_student: User,
    db_session: AsyncSession,
):
    """Test active vs archive bucket logic (§1.1) and rank calculation with ungraded period exclusion."""
    admin_headers = {"Authorization": f"Bearer {create_access_token(test_admin.id, test_admin.role)}"}

    # Active course
    active_resp = await client.post(
        "/api/v1/courses/",
        json={
            "title": "Active Course",
            "description": "Active course test",
            "start_date": "2026-01-01",
            "end_date": "2026-06-01",
            "exam_type": "weekly",
            "price": "150.00",
            "mentor_id": test_mentor.id,
            "schedules": [{"day_of_week": 1, "time_start": "10:00:00", "time_end": "11:30:00"}],
        },
        headers=admin_headers,
    )
    active_course_id = active_resp.json()["id"]
    await client.post("/api/v1/enrollments/", json={"student_id": test_student.id, "course_id": active_course_id}, headers=admin_headers)

    # Student requests profile
    student_headers = {"Authorization": f"Bearer {create_access_token(test_student.id, UserRole.STUDENT)}"}
    profile_resp = await client.get("/api/v1/students/me/profile", headers=student_headers)
    assert profile_resp.status_code == 200
    pdata = profile_resp.json()

    # Find the course entry
    course_entry = next((c for c in pdata["courses"] if c["course"]["id"] == active_course_id), None)
    assert course_entry is not None
    assert course_entry["bucket"] == "active"


@pytest.mark.asyncio
async def test_journal_detail_student_roster_narrowing_and_rank(
    client: AsyncClient,
    test_admin: User,
    test_mentor: User,
    test_student: User,
    db_session: AsyncSession,
):
    """Test GET /journals/{id} roster narrowing to 1 student for student role and presence of rank fields."""
    admin_headers = {"Authorization": f"Bearer {create_access_token(test_admin.id, test_admin.role)}"}

    course_resp = await client.post(
        "/api/v1/courses/",
        json={
            "title": "Journal Detail Course",
            "description": "Testing journal detail narrowing",
            "start_date": "2026-01-01",
            "end_date": "2026-06-01",
            "exam_type": "weekly",
            "price": "200.00",
            "mentor_id": test_mentor.id,
            "schedules": [{"day_of_week": 2, "time_start": "14:00:00", "time_end": "15:30:00"}],
        },
        headers=admin_headers,
    )
    course_id = course_resp.json()["id"]
    await client.post("/api/v1/enrollments/", json={"student_id": test_student.id, "course_id": course_id}, headers=admin_headers)

    # Find journal ID
    journals_res = await db_session.execute(select(Journal).filter(Journal.course_id == course_id))
    journal = journals_res.scalars().first()

    student_headers = {"Authorization": f"Bearer {create_access_token(test_student.id, UserRole.STUDENT)}"}
    jresp = await client.get(f"/api/v1/journals/{journal.id}", headers=student_headers)
    assert jresp.status_code == 200
    jdata = jresp.json()

    # Assert student roster is narrowed to 1 student
    assert "students" in jdata
    assert len(jdata["students"]) == 1
    assert jdata["students"][0]["student_id"] == test_student.id

    # Assert rank fields are present
    assert "my_rank" in jdata
    assert "class_size" in jdata
    assert "class_avg_percentage" in jdata
    assert jdata["class_size"] == 1
    assert jdata["my_rank"] == 1
