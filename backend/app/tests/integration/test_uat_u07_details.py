from datetime import date
from decimal import Decimal
from typing import Any

import pytest
from httpx import AsyncClient, Response
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit_log import AuditLog
from app.models.course import Course, CourseExamType, CourseStatus
from app.models.user import User, UserRole
from app.services.audit_service import AuditService
from app.tests.conftest import TestingSessionLocal
from app.tests.integration.uat_u07_support import U07AuditSupport


@pytest.mark.asyncio
class TestU07Details(U07AuditSupport):
    async def test_user_optional_values_and_clearing(self, client: AsyncClient, test_admin: User, test_student: User) -> None:
        response: Response = await client.patch(f"/api/v1/users/{test_student.id}", headers=self.headers(test_admin), json={
            "parent_phone": "+992901234567", "date_of_birth": "2005-02-03", "payment_day_of_month": 12,
        })
        assert response.status_code == 200, response.text
        expected: dict[str, tuple[str | None, str | None]] = {
            "parent_phone": (None, "+992901234567"), "date_of_birth": (None, "2005-02-03"), "payment_day_of_month": (None, "12"),
        }
        await self.assert_change(client, test_admin, "user", test_student.id, "update", "Student One", expected)
        response = await client.patch(f"/api/v1/users/{test_student.id}", headers=self.headers(test_admin), json={key: None for key in expected})
        assert response.status_code == 200, response.text
        events: list[dict[str, Any]] = await self.events(client, test_admin, entity_type="user", entity_id=test_student.id, action="update")
        assert len(events) == 2
        assert {change["field_name"]: (change["old_value"], change["new_value"]) for change in events[0]["changes"]} == {key: (values[1], None) for key, values in expected.items()}

    async def test_course_values_include_mentor_dates_and_status(self, client: AsyncClient, test_admin: User, test_mentor: User) -> None:
        session: AsyncSession
        async with TestingSessionLocal() as session:
            new_mentor: User = User(first_name="Next", last_name="Mentor", email="next@example.com", role=UserRole.MENTOR, must_set_password=False)
            session.add(new_mentor)
            await session.flush()
            course: Course = Course(title="Original", description="Original description", start_date=date(2027, 1, 1), end_date=date(2027, 3, 1), exam_type=CourseExamType.WEEKLY, price=Decimal("300.00"), mentor_id=test_mentor.id, status=CourseStatus.ACTIVE)
            session.add(course)
            await session.commit()
        response: Response = await client.patch(f"/api/v1/courses/{course.id}", headers=self.headers(test_admin), json={
            "title": "Updated", "description": "Updated description", "start_date": "2027-01-02", "end_date": "2027-04-01", "status": "archived", "mentor_id": new_mentor.id,
        })
        assert response.status_code == 200, response.text
        await self.assert_change(client, test_admin, "course", course.id, "update", "Updated", {
            "title": ("Original", "Updated"), "description": ("Original description", "Updated description"),
            "start_date": ("2027-01-01", "2027-01-02"), "end_date": ("2027-03-01", "2027-04-01"),
            "status": (CourseStatus.ACTIVE.value, str(CourseStatus.ARCHIVED)), "mentor_id": (str(test_mentor.id), str(new_mentor.id)),
        })

    @pytest.mark.parametrize("entity,field,previous,current", [
        ("user", "role", UserRole.STUDENT, UserRole.MENTOR),
        ("course", "price", Decimal("300.00"), Decimal("350.50")),
    ])
    async def test_writer_preserves_role_and_decimal_values(
        self, client: AsyncClient, test_admin: User, test_student: User, test_mentor: User,
        entity: str, field: str, previous: UserRole | Decimal, current: UserRole | Decimal,
    ) -> None:
        identifier: int = test_student.id if entity == "user" else await self.course(client, test_admin, test_mentor)
        label: str = "Student One" if entity == "user" else "Web Frontend"
        session: AsyncSession
        async with TestingSessionLocal() as session:
            await AuditService(session).log_change(test_admin.id, "update", entity, identifier, label, {field: (previous, current)})
            await session.commit()
        await self.assert_change(client, test_admin, entity, identifier, "update", label, {field: (str(previous), str(current))})

    async def test_labelled_and_legacy_rows_share_database_timestamp(self, test_admin: User, test_student: User) -> None:
        session: AsyncSession
        async with TestingSessionLocal() as session:
            await AuditService(session).log(test_admin.id, "update", "user", test_student.id, {"first_name": ("Student", "Updated"), "last_name": ("One", "Two")}, entity_label="Updated Two")
            await AuditService(session).log(test_admin.id, "update", "user", test_student.id, {"phone": (None, "+992901234567")})
            await session.flush()
            rows: list[AuditLog] = list((await session.execute(select(AuditLog))).scalars().all())
            assert len(rows) == 3
            assert {row.created_at for row in rows} == {(await session.execute(select(func.now()))).scalar_one()}
            events: dict[str, Any] = await AuditService(session).list_events(1, 20)
            assert events["total"] == 1
            assert len(events["items"][0]["changes"]) == 3
