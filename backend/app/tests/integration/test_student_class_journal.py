import json
from typing import Any, Dict, List
import pytest
import pytest_asyncio
from httpx import AsyncClient, Response
from sqlalchemy import delete, event, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.security import create_access_token, hash_password
from app.models.enrollment import Enrollment, EnrollmentStatus
from app.models.journal import Journal
from app.models.journal_student_summary import JournalStudentSummary
from app.models.user import User, UserRole

OWN_COMMENT: str = "Own private feedback"
CLASSMATE_COMMENT: str = "Classmate private feedback"
CLASSMATE_PHONE: str = "+992900000111"
CLASSMATE_PARENT_PHONE: str = "+992900000222"
CLASSMATE_EMAIL: str = "classmate.secret@example.com"


def authorization(user: User) -> Dict[str, str]:
    return {"Authorization": f"Bearer {create_access_token(user.id, user.role)}"}


async def create_student(db_session: AsyncSession, email: str, first_name: str, phone: str, parent_phone: str, student_id: int | None = None) -> User:
    student: User = User(
        id=student_id,
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
    def __init__(self, course_id: int, journal_id: int, lesson_date: str, own: User, classmate: User, second_classmate: User, outsider: User) -> None:
        self.course_id: int = course_id
        self.journal_id: int = journal_id
        self.lesson_date: str = lesson_date
        self.own: User = own
        self.classmate: User = classmate
        self.second_classmate: User = second_classmate
        self.outsider: User = outsider


@pytest_asyncio.fixture
async def classroom(
    client: AsyncClient,
    db_session: AsyncSession,
    test_admin: User,
    test_mentor: User,
    test_student: User,
) -> ClassRoom:
    classmate: User = await create_student(db_session, CLASSMATE_EMAIL, "Classmate", CLASSMATE_PHONE, CLASSMATE_PARENT_PHONE, 810001)
    second_classmate: User = await create_student(db_session, "second@example.com", "SecondClassmate", "+992900000555", "+992900000666", 820002)
    outsider: User = await create_student(db_session, "outsider@example.com", "Outsider", "+992900000333", "+992900000444")
    course_response: Response = await client.post(
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
    for enrolled in (test_student, classmate, second_classmate):
        enroll_response: Response = await client.post(
            "/api/v1/enrollments/",
            json={"student_id": enrolled.id, "course_id": course_id},
            headers=authorization(test_admin),
        )
        assert enroll_response.status_code == 201
    journals: List[Journal] = list((await db_session.execute(select(Journal).filter(Journal.course_id == course_id).order_by(Journal.period_start))).scalars().all())
    journal_id: int = journals[0].id
    mentor_view: Dict[str, Any] = (await client.get(f"/api/v1/journals/{journal_id}", headers=authorization(test_mentor))).json()
    lesson_date: str = mentor_view["lesson_dates"][0]
    payload: List[Dict[str, Any]] = []
    for student_record, comment, score in zip(sorted(mentor_view["students"], key=lambda record: record["student_id"]), (OWN_COMMENT, CLASSMATE_COMMENT, "Second private feedback"), (4, 2, 1)):
        entry: Dict[str, Any] = student_record["entries"][0]
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
    saved: Response = await client.put(f"/api/v1/journals/{journal_id}/entries", json=own_first, headers=authorization(test_mentor))
    assert saved.status_code == 200
    return ClassRoom(course_id, journal_id, lesson_date, test_student, classmate, second_classmate, outsider)


@pytest.mark.asyncio
@pytest.mark.parametrize("endpoint", ["journal", "progress"])
async def test_student_json_contains_no_classmate_identity_or_feedback(
    client: AsyncClient, classroom: ClassRoom, endpoint: str, db_session: AsyncSession,
) -> None:
    if endpoint == "progress":
        db_session.add(JournalStudentSummary(
            journal_id=classroom.journal_id, student_id=classroom.outsider.id, sum_score=999, max_period_score=120,
        ))
        await db_session.commit()
    url: str = (
        f"/api/v1/journals/{classroom.journal_id}/class"
        if endpoint == "journal"
        else f"/api/v1/courses/{classroom.course_id}/class-progress"
    )
    login_response: Response = await client.post(
        "/api/v1/auth/login",
        json={"email": classroom.own.email, "password": "student_pass123"},
    )
    assert login_response.status_code == 200
    student_headers: Dict[str, str] = {"Authorization": f"Bearer {login_response.json()['access_token']}"}
    aggregate_queries: List[str] = []

    def record_aggregate_query(connection: Any, cursor: Any, statement: str, parameters: Any, context: Any, executemany: bool) -> None:
        if "group by" in statement.lower() and "journal_student_summaries" in statement.lower():
            aggregate_queries.append(statement)

    from app.tests.conftest import test_engine
    event.listen(test_engine.sync_engine, "before_cursor_execute", record_aggregate_query)
    try:
        response: Response = await client.get(url, headers=student_headers)
    finally:
        event.remove(test_engine.sync_engine, "before_cursor_execute", record_aggregate_query)
    assert response.status_code == 200
    body: Dict[str, Any] = response.json()
    serialized: str = json.dumps(body, ensure_ascii=False)
    assert [record["student_id"] for record in body["students"]] == [classroom.own.id]
    for classmate in (classroom.classmate, classroom.second_classmate):
        assert str(classmate.id) not in serialized
        assert f"{classmate.first_name} {classmate.last_name}" not in serialized
        assert classmate.first_name not in serialized
        assert classmate.last_name not in serialized
    assert CLASSMATE_COMMENT not in serialized
    assert "Second private feedback" not in serialized
    if endpoint == "journal":
        assert body["students"][0]["summary"]["student_id"] == classroom.own.id
        assert body["students"][0]["is_self"] is True
        assert body["class_size"] == 3
    else:
        assert len(body["periods"]) > 1
        assert len(aggregate_queries) == 1
        assert any(result["score"] is not None for result in body["students"][0]["period_results"])
        expected_averages: Any = (await db_session.execute(
            select(
                JournalStudentSummary.journal_id,
                func.avg(JournalStudentSummary.sum_score),
                func.avg(JournalStudentSummary.max_period_score),
                func.avg(JournalStudentSummary.sum_score * 100.0 / JournalStudentSummary.max_period_score),
                func.count(JournalStudentSummary.id),
            ).join(Journal).join(Enrollment, Enrollment.student_id == JournalStudentSummary.student_id)
            .where(Journal.course_id == classroom.course_id, Enrollment.course_id == classroom.course_id)
            .group_by(JournalStudentSummary.journal_id)
        )).all()
        for expected in expected_averages:
            period: Dict[str, Any] = next(period for period in body["periods"] if period["id"] == expected[0])
            assert period["class_avg_score"] == pytest.approx(float(expected[1]))
            assert period["class_avg_max_score"] == pytest.approx(float(expected[2]))
            assert period["class_avg_percentage"] == pytest.approx(float(expected[3]))
            assert period["graded_count"] == expected[4] == 3
        scored_period: Dict[str, Any] = next(period for period in body["periods"] if period["id"] == classroom.journal_id)
        own_result: Dict[str, Any] = body["students"][0]["period_results"][0]
        assert scored_period["class_avg_score"] != own_result["score"]


@pytest.mark.asyncio
async def test_class_journal_keeps_own_comments(client: AsyncClient, classroom: ClassRoom) -> None:
    response: Response = await client.get(f"/api/v1/journals/{classroom.journal_id}/class", headers=authorization(classroom.own))
    own_entry: Dict[str, Any] = response.json()["students"][0]["entries"][0]
    assert own_entry["comment"] == OWN_COMMENT
    assert own_entry["has_comment"] is True


@pytest.mark.asyncio
async def test_student_class_average_still_uses_all_three_students(
    client: AsyncClient, classroom: ClassRoom, db_session: AsyncSession,
) -> None:
    expected_score: float = float((await db_session.execute(
        select(func.avg(JournalStudentSummary.sum_score)).where(JournalStudentSummary.journal_id == classroom.journal_id)
    )).scalar_one())
    response: Response = await client.get(f"/api/v1/journals/{classroom.journal_id}/class", headers=authorization(classroom.own))
    body: Dict[str, Any] = response.json()
    assert body["class_avg_score"] == round(expected_score, 1)
    assert body["class_avg_score"] != body["students"][0]["summary"]["sum_score"]
    assert body["my_rank"] == 1
    journal_list: Response = await client.get(f"/api/v1/courses/{classroom.course_id}/journals", headers=authorization(classroom.own))
    current_period: Dict[str, Any] = next(period for period in journal_list.json() if period["id"] == classroom.journal_id)
    assert current_period["avg_score"] == round(expected_score, 1)
    assert body["class_avg_percentage"] == current_period["avg_percentage"]
    metrics: Response = await client.get(f"/api/v1/courses/{classroom.course_id}/journal-metrics", headers=authorization(classroom.own))
    expected_maximum: float = float((await db_session.execute(
        select(func.avg(JournalStudentSummary.max_period_score)).join(Journal).where(Journal.course_id == classroom.course_id)
    )).scalar_one())
    assert metrics.json()["class_avg_max_score"] == round(expected_maximum, 1)


@pytest.mark.asyncio
async def test_staff_endpoints_keep_all_students_and_comments(
    client: AsyncClient, classroom: ClassRoom, test_mentor: User, test_admin: User,
) -> None:
    expected_ids: set[int] = {classroom.own.id, classroom.classmate.id, classroom.second_classmate.id}
    student_progress: Response = await client.get(f"/api/v1/courses/{classroom.course_id}/class-progress", headers=authorization(classroom.own))
    for staff in (test_mentor, test_admin):
        journal_response: Response = await client.get(f"/api/v1/journals/{classroom.journal_id}", headers=authorization(staff))
        progress_response: Response = await client.get(f"/api/v1/courses/{classroom.course_id}/staff-progress", headers=authorization(staff))
        assert journal_response.status_code == progress_response.status_code == 200
        for response in (journal_response, progress_response):
            assert {record["student_id"] for record in response.json()["students"]} == expected_ids
        assert CLASSMATE_COMMENT in journal_response.text
        assert "Second private feedback" in journal_response.text
        assert progress_response.json()["periods"] == student_progress.json()["periods"]


@pytest.mark.asyncio
async def test_class_journal_exposes_no_contact_data(client: AsyncClient, classroom: ClassRoom) -> None:
    response: Response = await client.get(f"/api/v1/journals/{classroom.journal_id}/class", headers=authorization(classroom.own))
    for forbidden in (CLASSMATE_EMAIL, CLASSMATE_PHONE, CLASSMATE_PARENT_PHONE, classroom.own.email, "email", "phone", "telegram"):
        assert forbidden not in response.text
    for record in response.json()["students"]:
        assert set(record) == {"student_id", "first_name", "last_name", "color_hex", "is_self", "entries", "summary"}


@pytest.mark.asyncio
async def test_non_enrolled_student_is_denied_class_journal(client: AsyncClient, classroom: ClassRoom) -> None:
    response: Response = await client.get(f"/api/v1/journals/{classroom.journal_id}/class", headers=authorization(classroom.outsider))
    assert response.status_code == 403
    assert CLASSMATE_COMMENT not in response.text


@pytest.mark.asyncio
async def test_class_journal_requires_authentication_and_known_journal(client: AsyncClient, classroom: ClassRoom) -> None:
    assert (await client.get(f"/api/v1/journals/{classroom.journal_id}/class")).status_code == 401
    assert (await client.get("/api/v1/journals/999999/class", headers=authorization(classroom.own))).status_code == 404


@pytest.mark.asyncio
async def test_staff_do_not_use_the_student_class_journal(client: AsyncClient, classroom: ClassRoom, test_mentor: User, test_admin: User) -> None:
    for staff in (test_mentor, test_admin):
        response: Response = await client.get(f"/api/v1/journals/{classroom.journal_id}/class", headers=authorization(staff))
        assert response.status_code == 403


@pytest.mark.asyncio
async def test_student_cannot_write_journal_entries_summaries_or_exam_maximum(client: AsyncClient, classroom: ClassRoom) -> None:
    headers: Dict[str, str] = authorization(classroom.own)
    entries: Response = await client.put(
        f"/api/v1/journals/{classroom.journal_id}/entries",
        json=[{"student_id": classroom.own.id, "lesson_date": classroom.lesson_date, "attendance": True, "score": 5, "comment": "self", "version": 1}],
        headers=headers,
    )
    summary: Response = await client.patch(
        f"/api/v1/journals/{classroom.journal_id}/students/{classroom.own.id}/summary",
        json={"exam_score": 50, "bonus_score": 10, "version": 1},
        headers=headers,
    )
    exam_maximum: Response = await client.patch(f"/api/v1/journals/{classroom.journal_id}/exam-max-score", json={"exam_max_score": 10}, headers=headers)
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
    completed: Response = await client.get(f"/api/v1/journals/{classroom.journal_id}/class", headers=authorization(classroom.own))
    assert completed.status_code == 200
    await db_session.execute(
        update(Enrollment)
        .where(Enrollment.student_id == classroom.own.id, Enrollment.course_id == classroom.course_id)
        .values(is_deleted=True)
    )
    await db_session.commit()
    removed: Response = await client.get(f"/api/v1/journals/{classroom.journal_id}/class", headers=authorization(classroom.own))
    assert removed.status_code == 403


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
    archived: Response = await client.get(url, headers=authorization(classroom.own))
    assert archived.status_code == 200
    assert classroom.own.id in {record["student_id"] for record in archived.json()["students"]}
    staff_view: Response = await client.get(f"/api/v1/courses/{classroom.course_id}/staff-progress", headers=authorization(test_mentor))
    assert classroom.own.id not in {record["student_id"] for record in staff_view.json()["students"]}


@pytest.mark.asyncio
@pytest.mark.parametrize("summary_state", ["empty", "missing_self", "zero_maximum"])
async def test_student_class_statistics_handle_missing_and_unscored_summaries(
    client: AsyncClient, classroom: ClassRoom, db_session: AsyncSession, summary_state: str,
) -> None:
    if summary_state == "zero_maximum":
        await db_session.execute(
            update(JournalStudentSummary)
            .where(JournalStudentSummary.journal_id == classroom.journal_id)
            .values(max_period_score=0)
        )
    elif summary_state == "missing_self":
        await db_session.execute(
            delete(JournalStudentSummary).where(
                JournalStudentSummary.journal_id == classroom.journal_id,
                JournalStudentSummary.student_id == classroom.own.id,
            )
        )
    else:
        await db_session.execute(
            delete(JournalStudentSummary).where(JournalStudentSummary.journal_id == classroom.journal_id)
        )
    await db_session.commit()
    response: Response = await client.get(f"/api/v1/journals/{classroom.journal_id}/class", headers=authorization(classroom.own))
    assert response.status_code == 200
    body: Dict[str, Any] = response.json()
    assert [record["student_id"] for record in body["students"]] == [classroom.own.id]
    assert body["class_size"] == 3
    if summary_state == "missing_self":
        assert body["students"][0]["summary"] is None
        assert body["class_avg_score"] == 2.5
        assert body["my_rank"] == 3
    else:
        assert body["class_avg_percentage"] == 0.0
        assert body["my_rank"] == 1
        assert body["class_avg_score"] == (0.0 if summary_state == "empty" else 3.3)
    progress: Response = await client.get(f"/api/v1/courses/{classroom.course_id}/class-progress", headers=authorization(classroom.own))
    period: Dict[str, Any] = next(period for period in progress.json()["periods"] if period["id"] == classroom.journal_id)
    if summary_state == "empty":
        assert period["graded_count"] == 0
        assert all(period[field] is None for field in ("class_avg_score", "class_avg_max_score", "class_avg_percentage"))
    elif summary_state == "zero_maximum":
        assert period["graded_count"] == 3
        assert period["class_avg_score"] == pytest.approx(10 / 3)
        assert period["class_avg_max_score"] == 0
        assert period["class_avg_percentage"] is None
    else:
        assert period["graded_count"] == 2
        assert period["class_avg_score"] == 2.5
