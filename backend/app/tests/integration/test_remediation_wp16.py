from datetime import date
from decimal import Decimal

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token
from app.models.course import Course, CourseExamType
from app.models.enrollment import Enrollment, EnrollmentStatus
from app.models.user import User, UserRole


def _authorization_headers(user: User) -> dict[str, str]:
    token: str = create_access_token(user.id, user.role)
    return {"Authorization": f"Bearer {token}"}


async def _create_student(
    session: AsyncSession,
    email: str,
    first_name: str,
    parent_phone: str,
    parent_chat_id: int,
) -> User:
    student: User = User(
        email=email,
        password_hash="test-hash",
        first_name=first_name,
        last_name="Directory",
        role=UserRole.STUDENT,
        parent_phone=parent_phone,
        parent_telegram_chat_id=parent_chat_id,
        must_set_password=False,
    )
    session.add(student)
    await session.flush()
    return student


async def _create_course(
    session: AsyncSession,
    mentor: User,
    title: str,
    is_deleted: bool = False,
) -> Course:
    course: Course = Course(
        title=title,
        description="Directory ownership fixture",
        start_date=date(2026, 1, 1),
        end_date=date(2026, 12, 31),
        exam_type=CourseExamType.WEEKLY,
        price=Decimal("100.00"),
        mentor_id=mentor.id,
        is_deleted=is_deleted,
    )
    session.add(course)
    await session.flush()
    return course


async def _enroll(
    session: AsyncSession,
    student: User,
    course: Course,
    status: EnrollmentStatus = EnrollmentStatus.ACTIVE,
    is_deleted: bool = False,
) -> Enrollment:
    enrollment: Enrollment = Enrollment(
        student_id=student.id,
        course_id=course.id,
        price_at_enrollment=course.price,
        color_hex="#123456",
        status=status,
        is_deleted=is_deleted,
    )
    session.add(enrollment)
    await session.flush()
    return enrollment


@pytest.mark.asyncio
async def test_mentor_directory_scopes_items_search_count_and_page_to_owned_students(
    client: AsyncClient,
    db_session: AsyncSession,
    test_mentor: User,
) -> None:
    other_mentor: User = User(
        email="wp16_other_mentor@example.com",
        password_hash="test-hash",
        first_name="Other",
        last_name="Mentor",
        role=UserRole.MENTOR,
        must_set_password=False,
    )
    db_session.add(other_mentor)
    await db_session.flush()

    owned_student: User = await _create_student(
        db_session,
        "wp16_owned@example.com",
        "Owned",
        "+992900000101",
        9916101,
    )
    unrelated_student: User = await _create_student(
        db_session,
        "wp16_unrelated@example.com",
        "Unrelated",
        "+992900000102",
        9916102,
    )
    owned_course: Course = await _create_course(db_session, test_mentor, "Owned course")
    unrelated_course: Course = await _create_course(db_session, other_mentor, "Unrelated course")
    await _enroll(db_session, owned_student, owned_course)
    await _enroll(db_session, unrelated_student, unrelated_course)
    await db_session.commit()

    response = await client.get(
        "/api/v1/students/?page=1&page_size=1&mentor_id=%d" % other_mentor.id,
        headers=_authorization_headers(test_mentor),
    )
    assert response.status_code == 200
    page_data: dict[str, object] = response.json()
    page_items: list[dict[str, object]] = page_data["items"]
    assert page_data["total"] == 1
    assert page_data["total_pages"] == 1
    assert [item["id"] for item in page_items] == [owned_student.id]
    assert page_items[0]["parent_phone"] == owned_student.parent_phone
    assert "parent_telegram_chat_id" not in page_items[0]
    assert "parent_link_code_expires_at" not in page_items[0]
    assert unrelated_student.email not in response.text
    assert unrelated_student.parent_phone not in response.text
    assert str(unrelated_student.parent_telegram_chat_id) not in response.text

    unrelated_search = await client.get(
        "/api/v1/students/?search=wp16_unrelated",
        headers=_authorization_headers(test_mentor),
    )
    assert unrelated_search.status_code == 200
    assert unrelated_search.json() == {
        "items": [],
        "total": 0,
        "page": 1,
        "page_size": 20,
        "total_pages": 0,
    }

    zero_course_mentor: User = User(
        email="wp16_zero_courses@example.com",
        password_hash="test-hash",
        first_name="Zero",
        last_name="Courses",
        role=UserRole.MENTOR,
        must_set_password=False,
    )
    db_session.add(zero_course_mentor)
    await db_session.commit()
    zero_course_response = await client.get(
        "/api/v1/students/",
        headers=_authorization_headers(zero_course_mentor),
    )
    assert zero_course_response.status_code == 200
    assert zero_course_response.json()["items"] == []
    assert zero_course_response.json()["total"] == 0


@pytest.mark.asyncio
async def test_mentor_directory_applies_each_enrollment_status_and_deletion_boundary(
    client: AsyncClient,
    db_session: AsyncSession,
    test_mentor: User,
) -> None:
    active_student: User = await _create_student(
        db_session,
        "wp16_active_only@example.com",
        "ActiveOnly",
        "+992900000103",
        9916103,
    )
    withdrawn_student: User = await _create_student(
        db_session,
        "wp16_withdrawn_only@example.com",
        "WithdrawnOnly",
        "+992900000106",
        9916106,
    )
    completed_student: User = await _create_student(
        db_session,
        "wp16_completed_only@example.com",
        "CompletedOnly",
        "+992900000107",
        9916107,
    )
    deleted_enrollment_student: User = await _create_student(
        db_session,
        "wp16_deleted_enrollment_only@example.com",
        "DeletedEnrollmentOnly",
        "+992900000108",
        9916108,
    )
    deleted_course_student: User = await _create_student(
        db_session,
        "wp16_deleted_course_only@example.com",
        "DeletedCourseOnly",
        "+992900000109",
        9916109,
    )
    duplicate_student: User = await _create_student(
        db_session,
        "wp16_duplicate_owned_courses@example.com",
        "DuplicateOwned",
        "+992900000110",
        9916110,
    )
    active_course: Course = await _create_course(db_session, test_mentor, "Active history")
    withdrawn_course: Course = await _create_course(db_session, test_mentor, "Withdrawn history")
    completed_course: Course = await _create_course(db_session, test_mentor, "Completed history")
    deleted_enrollment_course: Course = await _create_course(db_session, test_mentor, "Deleted enrollment")
    duplicate_course: Course = await _create_course(db_session, test_mentor, "Duplicate owned course")
    deleted_course: Course = await _create_course(
        db_session,
        test_mentor,
        "Deleted course",
        is_deleted=True,
    )
    await _enroll(db_session, active_student, active_course)
    await _enroll(db_session, withdrawn_student, withdrawn_course, EnrollmentStatus.WITHDRAWN)
    await _enroll(db_session, completed_student, completed_course, EnrollmentStatus.COMPLETED)
    await _enroll(db_session, deleted_enrollment_student, deleted_enrollment_course, is_deleted=True)
    await _enroll(db_session, deleted_course_student, deleted_course)
    await _enroll(db_session, duplicate_student, active_course)
    await _enroll(db_session, duplicate_student, duplicate_course)
    await db_session.commit()

    response = await client.get(
        "/api/v1/students/?search=wp16_",
        headers=_authorization_headers(test_mentor),
    )
    assert response.status_code == 200
    assert response.json()["total"] == 4
    assert {item["id"] for item in response.json()["items"]} == {
        active_student.id,
        withdrawn_student.id,
        completed_student.id,
        duplicate_student.id,
    }

    deleted_enrollment_search = await client.get(
        "/api/v1/students/?search=wp16_deleted_enrollment_only",
        headers=_authorization_headers(test_mentor),
    )
    assert deleted_enrollment_search.status_code == 200
    assert deleted_enrollment_search.json()["items"] == []
    assert deleted_enrollment_search.json()["total"] == 0

    deleted_course_search = await client.get(
        "/api/v1/students/?search=wp16_deleted_course_only",
        headers=_authorization_headers(test_mentor),
    )
    assert deleted_course_search.status_code == 200
    assert deleted_course_search.json()["items"] == []
    assert deleted_course_search.json()["total"] == 0


@pytest.mark.asyncio
async def test_mentor_directory_paginates_by_stable_user_id_order(
    client: AsyncClient,
    db_session: AsyncSession,
    test_mentor: User,
) -> None:
    first_student: User = await _create_student(
        db_session,
        "wp16_order_first@example.com",
        "OrderFirst",
        "+992900000111",
        9916111,
    )
    unrelated_student: User = await _create_student(
        db_session,
        "wp16_order_unrelated@example.com",
        "OrderUnrelated",
        "+992900000112",
        9916112,
    )
    second_student: User = await _create_student(
        db_session,
        "wp16_order_second@example.com",
        "OrderSecond",
        "+992900000113",
        9916113,
    )
    third_student: User = await _create_student(
        db_session,
        "wp16_order_third@example.com",
        "OrderThird",
        "+992900000114",
        9916114,
    )
    owned_course: Course = await _create_course(db_session, test_mentor, "Ordered owned course")
    other_mentor: User = User(
        email="wp16_order_other_mentor@example.com",
        password_hash="test-hash",
        first_name="OrderOther",
        last_name="Mentor",
        role=UserRole.MENTOR,
        must_set_password=False,
    )
    db_session.add(other_mentor)
    await db_session.flush()
    unrelated_course: Course = await _create_course(db_session, other_mentor, "Ordered unrelated course")
    await _enroll(db_session, first_student, owned_course)
    await _enroll(db_session, unrelated_student, unrelated_course)
    await _enroll(db_session, second_student, owned_course)
    await _enroll(db_session, third_student, owned_course)

    reverse_insert_first: User = User(
        id=900002,
        email="wp16_order_reverse_first@example.com",
        password_hash="test-hash",
        first_name="OrderReverseFirst",
        last_name="Directory",
        role=UserRole.STUDENT,
        must_set_password=False,
    )
    reverse_insert_second: User = User(
        id=900001,
        email="wp16_order_reverse_second@example.com",
        password_hash="test-hash",
        first_name="OrderReverseSecond",
        last_name="Directory",
        role=UserRole.STUDENT,
        must_set_password=False,
    )
    db_session.add_all([reverse_insert_first, reverse_insert_second])
    await db_session.flush()
    await _enroll(db_session, reverse_insert_first, owned_course)
    await _enroll(db_session, reverse_insert_second, owned_course)
    await db_session.commit()

    expected_student_ids: list[int] = [
        first_student.id,
        second_student.id,
        third_student.id,
        reverse_insert_second.id,
        reverse_insert_first.id,
    ]
    for page_number, expected_student_id in enumerate(expected_student_ids, start=1):
        response = await client.get(
            f"/api/v1/students/?search=wp16_order_&page={page_number}&page_size=1",
            headers=_authorization_headers(test_mentor),
        )
        assert response.status_code == 200
        assert response.json()["total"] == len(expected_student_ids)
        assert response.json()["total_pages"] == len(expected_student_ids)
        assert [item["id"] for item in response.json()["items"]] == [expected_student_id]

    beyond_last_page = await client.get(
        "/api/v1/students/?search=wp16_order_&page=6&page_size=1",
        headers=_authorization_headers(test_mentor),
    )
    assert beyond_last_page.status_code == 200
    assert beyond_last_page.json()["items"] == []
    assert beyond_last_page.json()["total"] == len(expected_student_ids)


@pytest.mark.asyncio
async def test_admin_and_accountant_keep_unscoped_student_directory_access(
    client: AsyncClient,
    db_session: AsyncSession,
    test_admin: User,
    test_accountant: User,
    test_mentor: User,
) -> None:
    unassigned_student: User = await _create_student(
        db_session,
        "wp16_unassigned@example.com",
        "Unassigned",
        "+992900000104",
        9916104,
    )
    course: Course = await _create_course(db_session, test_mentor, "Owned by mentor")
    linked_student: User = await _create_student(
        db_session,
        "wp16_linked@example.com",
        "Linked",
        "+992900000105",
        9916105,
    )
    await _enroll(db_session, linked_student, course)
    await db_session.commit()

    for user in (test_admin, test_accountant):
        response = await client.get(
            "/api/v1/students/?search=wp16_",
            headers=_authorization_headers(user),
        )
        assert response.status_code == 200
        assert response.json()["total"] == 2
        assert {item["id"] for item in response.json()["items"]} == {
            unassigned_student.id,
            linked_student.id,
        }
