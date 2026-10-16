from typing import Any, Dict, List
import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.security import create_access_token, hash_password
from app.models.enrollment import Enrollment, EnrollmentStatus
from app.models.journal import Journal
from app.models.user import User, UserRole

OWN_COMMENT: str = "Own private feedback"
CLASSMATE_COMMENT: str = "Classmate private feedback"
CLASSMATE_PHONE: str = "+992900000111"
CLASSMATE_PARENT_PHONE: str = "+992900000222"
CLASSMATE_EMAIL: str = "classmate.secret@example.com"


def authorization(user: User) -> Dict[str, str]:
    return {"Authorization": f"Bearer {create_access_token(user.id, user.role)}"}


async def create_student(db_session: AsyncSession, email: str, first_name: str, phone: str, parent_phone: str) -> User:
    student = User(
        email=email,
        password_hash=hash_password("student_pass123"),
        first_name=first_name,
        last_name="Learner",
        role=UserRole.STUDENT,
        must_set_password=False,
        phone=phone,
        parent_phone=parent_phone,
    )
    db_session.add(student)
    await db_session.commit()
    await db_session.refresh(student)
    return student


class ClassRoom:
    def __init__(self, course_id: int, journal_id: int, lesson_date: str, own: User, classmate: User, outsider: User) -> None:
        self.course_id: int = course_id
        self.journal_id: int = journal_id
        self.lesson_date: str = lesson_date
        self.own: User = own
        self.classmate: User = classmate
        self.outsider: User = outsider


@pytest_asyncio.fixture
async def classroom(
    client: AsyncClient,
    db_session: AsyncSession,
    test_admin: User,
    test_mentor: User,
    test_student: User,
) -> ClassRoom:
    classmate: User = await create_student(db_session, CLASSMATE_EMAIL, "Classmate", CLASSMATE_PHONE, CLASSMATE_PARENT_PHONE)
    outsider: User = await create_student(db_session, "outsider@example.com", "Outsider", "+992900000333", "+992900000444")
    course_response = await client.post(
        "/api/v1/courses/",
        json={
            "title": "Class Journal Course",
            "description": "Read only class view",
            "start_date": "2026-08-01",
            "end_date": "2026-08-31",
            "exam_type": "weekly",
            "price": "300.00",
            "mentor_id": test_mentor.id,
            "schedules": [{"day_of_week": 0, "time_start": "18:00:00", "time_end": "20:00:00"}],
        },
        headers=authorization(test_admin),
    )
    course_id: int = course_response.json()["id"]
    for enrolled in (test_student, classmate):
        enroll_response = await client.post(
            "/api/v1/enrollments/",
            json={"student_id": enrolled.id, "course_id": course_id},
            headers=authorization(test_admin),
        )
        assert enroll_response.status_code == 201
    journals = list((await db_session.execute(select(Journal).filter(Journal.course_id == course_id).order_by(Journal.period_start))).scalars().all())
    journal_id: int = journals[0].id
    mentor_view = (await client.get(f"/api/v1/journals/{journal_id}", headers=authorization(test_mentor))).json()
    lesson_date: str = mentor_view["lesson_dates"][0]
    payload: List[Dict[str, Any]] = []
    for student_record, comment, score in zip(sorted(mentor_view["students"], key=lambda record: record["student_id"]), (OWN_COMMENT, CLASSMATE_COMMENT), (4, 2)):
        entry = student_record["entries"][0]
        payload.append({
            "student_id": student_record["student_id"],
            "lesson_date": entry["lesson_date"],
            "attendance": True,
            "score": score,
            "comment": comment,
            "version": entry["version"],
        })
    own_first: List[Dict[str, Any]] = sorted(payload, key=lambda item: item["student_id"] != test_student.id)
    own_first[0]["comment"], own_first[1]["comment"] = OWN_COMMENT, CLASSMATE_COMMENT
    saved = await client.put(f"/api/v1/journals/{journal_id}/entries", json=own_first, headers=authorization(test_mentor))
    assert saved.status_code == 200
    return ClassRoom(course_id, journal_id, lesson_date, test_student, classmate, outsider)


@pytest.mark.asyncio
async def test_enrolled_student_sees_classmates_names_and_scores_read_only(client: AsyncClient, classroom: ClassRoom) -> None:
    response = await client.get(f"/api/v1/journals/{classroom.journal_id}/class", headers=authorization(classroom.own))
    assert response.status_code == 200
    body = response.json()
    by_id = {record["student_id"]: record for record in body["students"]}
    assert set(by_id) == {classroom.own.id, classroom.classmate.id}
    assert by_id[classroom.classmate.id]["first_name"] == "Classmate"
    assert by_id[classroom.classmate.id]["entries"][0]["score"] == 2
    assert by_id[classroom.classmate.id]["summary"]["sum_score"] > 0
    assert by_id[classroom.own.id]["is_self"] is True
    assert by_id[classroom.classmate.id]["is_self"] is False
    assert body["class_size"] == 2


@pytest.mark.asyncio
async def test_class_journal_hides_other_students_comments_but_keeps_own(client: AsyncClient, classroom: ClassRoom) -> None:
    response = await client.get(f"/api/v1/journals/{classroom.journal_id}/class", headers=authorization(classroom.own))
    by_id = {record["student_id"]: record for record in response.json()["students"]}
    own_entry = by_id[classroom.own.id]["entries"][0]
    classmate_entry = by_id[classroom.classmate.id]["entries"][0]
    assert own_entry["comment"] == OWN_COMMENT
    assert own_entry["has_comment"] is True
    assert classmate_entry["comment"] is None
    assert classmate_entry["has_comment"] is False
    assert CLASSMATE_COMMENT not in response.text


@pytest.mark.asyncio
async def test_class_journal_exposes_no_contact_data(client: AsyncClient, classroom: ClassRoom) -> None:
    response = await client.get(f"/api/v1/journals/{classroom.journal_id}/class", headers=authorization(classroom.own))
    for forbidden in (CLASSMATE_EMAIL, CLASSMATE_PHONE, CLASSMATE_PARENT_PHONE, classroom.own.email, "email", "phone", "telegram"):
        assert forbidden not in response.text
    for record in response.json()["students"]:
        assert set(record) == {"student_id", "first_name", "last_name", "color_hex", "is_self", "entries", "summary"}


@pytest.mark.asyncio
async def test_non_enrolled_student_is_denied_class_journal(client: AsyncClient, classroom: ClassRoom) -> None:
    response = await client.get(f"/api/v1/journals/{classroom.journal_id}/class", headers=authorization(classroom.outsider))
    assert response.status_code == 403
    assert CLASSMATE_COMMENT not in response.text


@pytest.mark.asyncio
async def test_class_journal_requires_authentication_and_known_journal(client: AsyncClient, classroom: ClassRoom) -> None:
    assert (await client.get(f"/api/v1/journals/{classroom.journal_id}/class")).status_code == 401
    assert (await client.get("/api/v1/journals/999999/class", headers=authorization(classroom.own))).status_code == 404


@pytest.mark.asyncio
async def test_staff_do_not_use_the_student_class_journal(client: AsyncClient, classroom: ClassRoom, test_mentor: User, test_admin: User) -> None:
    for staff in (test_mentor, test_admin):
        response = await client.get(f"/api/v1/journals/{classroom.journal_id}/class", headers=authorization(staff))
        assert response.status_code == 403


@pytest.mark.asyncio
async def test_student_cannot_write_journal_entries_summaries_or_exam_maximum(client: AsyncClient, classroom: ClassRoom) -> None:
    headers = authorization(classroom.own)
    entries = await client.put(
        f"/api/v1/journals/{classroom.journal_id}/entries",
        json=[{"student_id": classroom.own.id, "lesson_date": classroom.lesson_date, "attendance": True, "score": 5, "comment": "self", "version": 1}],
        headers=headers,
    )
    summary = await client.patch(
        f"/api/v1/journals/{classroom.journal_id}/students/{classroom.own.id}/summary",
        json={"exam_score": 50, "bonus_score": 10, "version": 1},
        headers=headers,
    )
    exam_maximum = await client.patch(f"/api/v1/journals/{classroom.journal_id}/exam-max-score", json={"exam_max_score": 10}, headers=headers)
    assert (entries.status_code, summary.status_code, exam_maximum.status_code) == (403, 403, 403)


@pytest.mark.asyncio
async def test_archived_student_still_reads_class_journal_but_removed_enrollment_cannot(
    client: AsyncClient, classroom: ClassRoom, db_session: AsyncSession
) -> None:
    await db_session.execute(
        update(Enrollment)
        .where(Enrollment.student_id == classroom.own.id, Enrollment.course_id == classroom.course_id)
        .values(status=EnrollmentStatus.COMPLETED)
    )
    await db_session.commit()
    completed = await client.get(f"/api/v1/journals/{classroom.journal_id}/class", headers=authorization(classroom.own))
    assert completed.status_code == 200
    await db_session.execute(
        update(Enrollment)
        .where(Enrollment.student_id == classroom.own.id, Enrollment.course_id == classroom.course_id)
        .values(is_deleted=True)
    )
    await db_session.commit()
    removed = await client.get(f"/api/v1/journals/{classroom.journal_id}/class", headers=authorization(classroom.own))
    assert removed.status_code == 403


@pytest.mark.asyncio
async def test_class_progress_lists_classmate_names_without_contacts(client: AsyncClient, classroom: ClassRoom) -> None:
    response = await client.get(f"/api/v1/courses/{classroom.course_id}/class-progress", headers=authorization(classroom.own))
    assert response.status_code == 200
    students = response.json()["students"]
    assert {record["student_id"] for record in students} == {classroom.own.id, classroom.classmate.id}
    assert {key for record in students for key in record} == {"student_id", "first_name", "last_name", "period_results", "grading_provenance"}
    for forbidden in (CLASSMATE_EMAIL, CLASSMATE_PHONE, CLASSMATE_PARENT_PHONE):
        assert forbidden not in response.text


@pytest.mark.asyncio
async def test_class_progress_denies_outsiders_and_staff_and_keeps_archived_self(
    client: AsyncClient, classroom: ClassRoom, test_mentor: User, db_session: AsyncSession
) -> None:
    url: str = f"/api/v1/courses/{classroom.course_id}/class-progress"
    assert (await client.get(url, headers=authorization(classroom.outsider))).status_code == 403
    assert (await client.get(url, headers=authorization(test_mentor))).status_code == 403
    assert (await client.get(url)).status_code == 401
    await db_session.execute(
        update(Enrollment)
        .where(Enrollment.student_id == classroom.own.id, Enrollment.course_id == classroom.course_id)
        .values(status=EnrollmentStatus.COMPLETED)
    )
    await db_session.commit()
    archived = await client.get(url, headers=authorization(classroom.own))
    assert archived.status_code == 200
    assert classroom.own.id in {record["student_id"] for record in archived.json()["students"]}
    staff_view = await client.get(f"/api/v1/courses/{classroom.course_id}/staff-progress", headers=authorization(test_mentor))
    assert classroom.own.id not in {record["student_id"] for record in staff_view.json()["students"]}
