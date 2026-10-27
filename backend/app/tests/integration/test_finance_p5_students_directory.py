from datetime import timedelta
from decimal import Decimal
from typing import Any

import pytest
from sqlalchemy import event
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.school_calendar import SchoolCalendar
from app.models.charge import Charge, ChargeStatus, ChargeType
from app.models.course import Course, CourseExamType, CourseStatus
from app.models.enrollment import Enrollment, EnrollmentStatus
from app.models.user import User, UserRole
from app.repositories.sqlalchemy.user_repository import SQLAlchemyUserRepository
from app.services.finance_service import FinanceService


@pytest.mark.asyncio
async def test_student_directory_filters_balances_and_debtor_agreement(
    db_session: AsyncSession, test_mentor: User,
) -> None:
    today: Any = SchoolCalendar.today()
    students: list[User] = [User(first_name=name, last_name="P5", email=f"{name}@p5.com", role=UserRole.STUDENT)
                            for name in ("active", "withdrawn", "grant", "mixed", "empty")]
    courses: list[Course] = [Course(title=title, description="P5 course", start_date=today, end_date=today + timedelta(days=90),
                                  exam_type=CourseExamType.MONTHLY, price=Decimal("100.00"), mentor_id=test_mentor.id)
                             for title in ("Zulu", "Alpha")]
    db_session.add_all(students + courses)
    await db_session.flush()
    enrollments: list[Enrollment] = [
        Enrollment(student_id=students[0].id, course_id=courses[0].id, price_at_enrollment=Decimal("100"), color_hex="#112233", status=EnrollmentStatus.ACTIVE),
        Enrollment(student_id=students[1].id, course_id=courses[0].id, price_at_enrollment=Decimal("100"), color_hex="#112233", status=EnrollmentStatus.WITHDRAWN),
        Enrollment(student_id=students[2].id, course_id=courses[0].id, price_at_enrollment=Decimal("100"), color_hex="#112233", billing_mode="grant"),
        Enrollment(student_id=students[3].id, course_id=courses[0].id, price_at_enrollment=Decimal("100"), color_hex="#112233", billing_mode="grant"),
        Enrollment(student_id=students[3].id, course_id=courses[1].id, price_at_enrollment=Decimal("100"), color_hex="#112233", billing_mode="paid"),
    ]
    db_session.add_all(enrollments)
    await db_session.flush()
    for enrollment, sequence, due, amount in ((enrollments[0], 1, -1, "10"), (enrollments[0], 2, 0, "20"),
                                               (enrollments[0], 3, 1, "40"), (enrollments[1], 1, 0, "50")):
        db_session.add(Charge(enrollment_id=enrollment.id, student_id=enrollment.student_id, sequence_no=sequence,
                              due_date=today + timedelta(days=due), amount=Decimal(amount),
                              type=ChargeType.TUITION, status=ChargeStatus.OPEN))
    await db_session.flush()
    repository: SQLAlchemyUserRepository = SQLAlchemyUserRepository(db_session)
    result: Any = await repository.get_student_directory(1, 20, None, None, None, None)
    items: dict[int, Any] = {item["id"]: item for item in result["items"]}
    assert Decimal(items[students[0].id]["debt_amount"]) == Decimal("30")
    assert Decimal(items[students[1].id]["debt_amount"]) == Decimal("50")
    assert items[students[1].id]["courses"] == []
    assert [course["title"] for course in items[students[3].id]["courses"]] == ["Alpha", "Zulu"]
    assert [items[student.id]["payment_status"] for student in students] == ["debt", "debt", "grant", "ok", "ok"]
    debts: Any = await FinanceService(db_session).get_debts({}, 1, 100)
    debtor_ids: set[int] = {item["student"]["id"] for item in debts["items"]}
    assert debtor_ids == {student.id for student in students if items[student.id]["payment_status"] == "debt"}
    for status, expected in (("debt", 2), ("grant", 1), ("ok", 2)):
        filtered: Any = await repository.get_student_directory(1, 1, None, None, None, status)
        assert filtered["total"] == expected
        assert len(filtered["items"]) == 1
        assert filtered["items"][0]["payment_status"] == status
    filtered_course: Any = await repository.get_student_directory(1, 1, None, None, courses[0].id, None)
    assert filtered_course["total"] == 3
    assert len(filtered_course["items"]) == 1
    assert (await repository.get_student_directory(2, 1, None, None, courses[0].id, None))["items"][0]["id"] != filtered_course["items"][0]["id"]
    counts: list[int] = []
    statements: list[str] = []
    def count_statement(connection: Any, cursor: Any, statement: str, parameters: Any, context: Any, executemany: bool) -> None:
        statements.append(statement)
    event.listen(db_session.bind.sync_engine, "before_cursor_execute", count_statement)
    try:
        for size in (1, 20):
            statements.clear()
            await repository.get_student_directory(1, size, None, None, None, None)
            counts.append(len(statements))
    finally:
        event.remove(db_session.bind.sync_engine, "before_cursor_execute", count_statement)
    assert counts == [3, 3]


@pytest.mark.asyncio
async def test_student_directory_excludes_archived_courses_but_keeps_their_debt(
    db_session: AsyncSession, test_mentor: User,
) -> None:
    today: Any = SchoolCalendar.today()
    students: list[User] = [User(first_name=name, last_name="Archived", email=f"{name}@archived.com", role=UserRole.STUDENT)
                            for name in ("debtor", "grant", "mixed")]
    courses: list[Course] = [Course(title=title, description="Course", start_date=today, end_date=today + timedelta(days=90),
                                  exam_type=CourseExamType.MONTHLY, price=Decimal("100.00"), mentor_id=test_mentor.id,
                                  status=status)
                             for title, status in (("Archived", CourseStatus.ARCHIVED), ("Active", CourseStatus.ACTIVE))]
    db_session.add_all(students + courses)
    await db_session.flush()
    enrollments: list[Enrollment] = [
        Enrollment(student_id=students[0].id, course_id=courses[0].id, price_at_enrollment=Decimal("100"), color_hex="#112233", status=EnrollmentStatus.ACTIVE),
        Enrollment(student_id=students[1].id, course_id=courses[0].id, price_at_enrollment=Decimal("100"), color_hex="#112233", status=EnrollmentStatus.ACTIVE, billing_mode="grant"),
        Enrollment(student_id=students[2].id, course_id=courses[0].id, price_at_enrollment=Decimal("100"), color_hex="#112233", status=EnrollmentStatus.ACTIVE, billing_mode="paid"),
        Enrollment(student_id=students[2].id, course_id=courses[1].id, price_at_enrollment=Decimal("100"), color_hex="#112233", status=EnrollmentStatus.ACTIVE, billing_mode="grant"),
    ]
    db_session.add_all(enrollments)
    await db_session.flush()
    db_session.add(Charge(enrollment_id=enrollments[0].id, student_id=students[0].id, sequence_no=1,
                          due_date=today, amount=Decimal("50"), type=ChargeType.TUITION, status=ChargeStatus.OPEN))
    await db_session.flush()
    repository: SQLAlchemyUserRepository = SQLAlchemyUserRepository(db_session)
    result: Any = await repository.get_student_directory(1, 20, None, None, None, None)
    items: dict[int, Any] = {item["id"]: item for item in result["items"]}
    assert items[students[0].id]["courses"] == []
    assert Decimal(items[students[0].id]["debt_amount"]) == Decimal("50")
    assert items[students[0].id]["payment_status"] == "debt"
    assert items[students[1].id]["courses"] == []
    assert items[students[1].id]["payment_status"] == "ok"
    assert [course["course_id"] for course in items[students[2].id]["courses"]] == [courses[1].id]
    assert items[students[2].id]["payment_status"] == "grant"
    archived: Any = await repository.get_student_directory(1, 20, None, None, courses[0].id, None)
    assert archived["total"] == 0
    grants: Any = await repository.get_student_directory(1, 20, None, None, None, "grant")
    assert {item["id"] for item in grants["items"]} == {students[2].id}


@pytest.mark.asyncio
async def test_student_directory_access_rules(client: Any, test_admin: User, test_mentor: User, test_student: User) -> None:
    from app.core.security import create_access_token

    for user, expected in ((test_admin, 200), (test_mentor, 200), (test_student, 403)):
        token: str = create_access_token(user.id, user.role)
        response: Any = await client.get("/api/v1/students/", headers={"Authorization": f"Bearer {token}"})
        assert response.status_code == expected
    response = await client.get("/api/v1/students/", headers={"Authorization": f"Bearer {create_access_token(test_admin.id, test_admin.role)}"})
    assert response.json()["items"][0]["courses"] == []
    assert response.json()["items"][0]["payment_status"] == "ok"
    assert "parent_linked" in response.json()["items"][0]
