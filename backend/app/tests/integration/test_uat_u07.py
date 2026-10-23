from datetime import datetime, timezone
from typing import Any

import pytest
from httpx import AsyncClient, Response
from sqlalchemy import select

from app.models.audit_log import AuditAction, AuditLog
from app.models.user import User
from app.tests.integration.uat_u07_support import U07AuditSupport
from app.tests.conftest import TestingSessionLocal


@pytest.mark.asyncio
class TestU07(U07AuditSupport):
    @pytest.mark.parametrize("role", ["student", "mentor", "accountant"])
    async def test_user_created(self, client: AsyncClient, test_admin: User, role: str) -> None:
        response: Response = await client.post("/api/v1/users/", headers=self.headers(test_admin), json={
            "first_name": "Mehrangiz", "last_name": "Hamidova", "email": "mehrangiz@example.com", "role": role,
        })
        assert response.status_code == 201, response.text
        await self.assert_change(client, test_admin, "user", response.json()["id"], "create", "Mehrangiz Hamidova", {"first_name", "last_name", "email", "role"})

    @pytest.mark.parametrize("target", ["test_student", "test_mentor", "test_accountant"])
    async def test_user_edited(self, client: AsyncClient, test_admin: User, target: str, test_student: User, test_mentor: User, test_accountant: User) -> None:
        user: User = {"test_student": test_student, "test_mentor": test_mentor, "test_accountant": test_accountant}[target]
        response: Response = await client.patch(f"/api/v1/users/{user.id}", headers=self.headers(test_admin), json={
            "first_name": "Mehrangiz", "last_name": "Hamidova", "phone": "+992901234567", "email": "changed@example.com",
        })
        assert response.status_code == 200, response.text
        await self.assert_change(client, test_admin, "user", user.id, "update", "Mehrangiz Hamidova", {
            "first_name": (user.first_name, "Mehrangiz"), "last_name": (user.last_name, "Hamidova"),
            "phone": (user.phone, "+992901234567"), "email": (user.email, "changed@example.com"),
        })

    @pytest.mark.parametrize("target", ["test_student", "test_mentor", "test_accountant"])
    async def test_user_deleted(self, client: AsyncClient, test_admin: User, target: str, test_student: User, test_mentor: User, test_accountant: User) -> None:
        user: User = {"test_student": test_student, "test_mentor": test_mentor, "test_accountant": test_accountant}[target]
        response: Response = await client.delete(f"/api/v1/users/{user.id}", headers=self.headers(test_admin))
        assert response.status_code == 204, response.text
        await self.assert_change(client, test_admin, "user", user.id, "delete", f"{user.first_name} {user.last_name}", {"is_deleted"})

    async def test_course_created(self, client: AsyncClient, test_admin: User, test_mentor: User) -> None:
        identifier: int = await self.course(client, test_admin, test_mentor)
        await self.assert_change(client, test_admin, "course", identifier, "create", "Web Frontend", {"title", "description", "start_date", "end_date", "exam_type", "price", "mentor_id", "schedules"})

    async def test_course_edited(self, client: AsyncClient, test_admin: User, test_mentor: User) -> None:
        identifier: int = await self.course(client, test_admin, test_mentor)
        response: Response = await client.patch(f"/api/v1/courses/{identifier}", headers=self.headers(test_admin), json={"title": "Edited Frontend", "description": "Updated"})
        assert response.status_code == 200, response.text
        await self.assert_change(client, test_admin, "course", identifier, "update", "Edited Frontend", {"title": ("Web Frontend", "Edited Frontend"), "description": ("Audit course", "Updated")})

    async def test_course_deleted(self, client: AsyncClient, test_admin: User, test_mentor: User) -> None:
        identifier: int = await self.course(client, test_admin, test_mentor)
        response: Response = await client.delete(f"/api/v1/courses/{identifier}", headers=self.headers(test_admin))
        assert response.status_code == 204, response.text
        await self.assert_change(client, test_admin, "course", identifier, "delete", "Web Frontend", {"is_deleted"})

    @pytest.mark.parametrize("withdraw", [False, True])
    async def test_enrollment_changed(self, client: AsyncClient, test_admin: User, test_mentor: User, test_student: User, withdraw: bool) -> None:
        identifier: int = await self.course(client, test_admin, test_mentor)
        response: Response = await client.post("/api/v1/enrollments/", headers=self.headers(test_admin), json={"student_id": test_student.id, "course_id": identifier})
        assert response.status_code == 201, response.text
        enrollment_id: int = response.json()["id"]
        if withdraw:
            response = await client.patch(f"/api/v1/enrollments/{enrollment_id}/withdraw", headers=self.headers(test_admin))
            assert response.status_code == 200, response.text
        await self.assert_change(client, test_admin, "enrollment", enrollment_id, "update" if withdraw else "create", "Student One", {"status"} if withdraw else {"student_id", "course_id"})

    @pytest.mark.parametrize("payload", [{"org_name": "Audit Academy"}, {"notify_payments": False, "notify_debts": False}])
    async def test_settings_changed(self, client: AsyncClient, test_admin: User, payload: dict[str, Any]) -> None:
        response: Response = await client.patch("/api/v1/settings/org", headers=self.headers(test_admin), json=payload)
        assert response.status_code == 200, response.text
        await self.assert_change(client, test_admin, "settings", 1, "update", response.json()["org_name"], {key: ("Учебный центр ИМКОН" if key == "org_name" else "True", str(value)) for key, value in payload.items()})

    @pytest.mark.parametrize("search", ["mehrangiz", "MEHRANGIZ HAMIDOVA", "web frontend", "summary text", "admin super"])
    async def test_search(self, client: AsyncClient, test_admin: User, test_mentor: User, search: str) -> None:
        identifier: int = await self.course(client, test_admin, test_mentor)
        async with TestingSessionLocal() as session:
            session.add(AuditLog(user_id=test_admin.id, action=AuditAction.UPDATE, entity_type="course", entity_id=identifier,
                                 entity_label="Mehrangiz Hamidova", field_name="summary", new_value="Summary text", created_at=datetime.now(timezone.utc)))
            await session.commit()
        events: list[dict[str, Any]] = await self.events(client, test_admin, search=search)
        assert any(any(change["field_name"] == "summary" for change in event["changes"]) for event in events)

    async def test_older_rows_resolve_target_labels(self, client: AsyncClient, test_admin: User, test_student: User) -> None:
        async with TestingSessionLocal() as session:
            session.add(AuditLog(user_id=test_admin.id, action=AuditAction.UPDATE, entity_type="user", entity_id=test_student.id,
                                 field_name="name", new_value="Changed"))
            await session.commit()
        events: list[dict[str, Any]] = await self.events(client, test_admin, search="student one")
        assert len(events) == 1
        assert events[0]["entity_label"] == "Student One"

    @pytest.mark.parametrize("operation", ["user_create", "user_update", "user_delete", "course_create", "course_update", "course_delete", "enroll", "withdraw", "organisation", "notifications"])
    async def test_audit_failure_rolls_back_change(
        self, client: AsyncClient, test_admin: User, test_mentor: User, test_student: User,
        operation: str, monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        from app.models.course import Course
        from app.models.enrollment import Enrollment, EnrollmentStatus
        from app.models.org_settings import OrgSettings
        from app.services.audit_service import AuditService

        course_id: int = await self.course(client, test_admin, test_mentor)
        enrollment_id: int | None = None
        if operation == "withdraw":
            response: Response = await client.post("/api/v1/enrollments/", headers=self.headers(test_admin), json={"student_id": test_student.id, "course_id": course_id})
            assert response.status_code == 201, response.text
            enrollment_id = response.json()["id"]

        async def fail_audit(self: AuditService, *arguments: Any, **keywords: Any) -> None:
            raise RuntimeError("Injected audit failure")

        monkeypatch.setattr(AuditService, "log_change", fail_audit)
        with pytest.raises(RuntimeError, match="Injected audit failure"):
            if operation == "user_create":
                await client.post("/api/v1/users/", headers=self.headers(test_admin), json={"first_name": "Audit", "last_name": "Failure", "email": "failure@example.com", "role": "mentor"})
            elif operation == "user_update":
                await client.patch(f"/api/v1/users/{test_student.id}", headers=self.headers(test_admin), json={"first_name": "Changed"})
            elif operation == "user_delete":
                await client.delete(f"/api/v1/users/{test_student.id}", headers=self.headers(test_admin))
            elif operation == "course_create":
                await self.course(client, test_admin, test_mentor)
            elif operation == "course_update":
                await client.patch(f"/api/v1/courses/{course_id}", headers=self.headers(test_admin), json={"title": "Changed"})
            elif operation == "course_delete":
                await client.delete(f"/api/v1/courses/{course_id}", headers=self.headers(test_admin))
            elif operation == "enroll":
                await client.post("/api/v1/enrollments/", headers=self.headers(test_admin), json={"student_id": test_student.id, "course_id": course_id})
            elif operation == "withdraw":
                await client.patch(f"/api/v1/enrollments/{enrollment_id}/withdraw", headers=self.headers(test_admin))
            else:
                await client.patch("/api/v1/settings/org", headers=self.headers(test_admin), json={"org_name": "Changed"} if operation == "organisation" else {"notify_debts": False})
        async with TestingSessionLocal() as session:
            user: User | None = await session.get(User, test_student.id)
            course: Course | None = await session.get(Course, course_id)
            assert user is not None and user.first_name == "Student" and not user.is_deleted
            assert course is not None and course.title == "Web Frontend" and not course.is_deleted
            assert (await session.execute(select(User).where(User.email == "failure@example.com"))).scalar_one_or_none() is None
            assert len((await session.execute(select(Course))).scalars().all()) == 1
            if enrollment_id is not None:
                enrollment: Enrollment | None = await session.get(Enrollment, enrollment_id)
                assert enrollment is not None and enrollment.status == EnrollmentStatus.ACTIVE
            else:
                assert (await session.execute(select(Enrollment))).scalar_one_or_none() is None
            settings: OrgSettings | None = await session.get(OrgSettings, 1)
            assert settings is None

    @pytest.mark.parametrize("operation", ["user", "course", "settings"])
    async def test_unchanged_fields_do_not_create_audit(
        self, client: AsyncClient, test_admin: User, test_student: User, test_mentor: User, operation: str,
    ) -> None:
        course_id: int = await self.course(client, test_admin, test_mentor)
        entity: str = operation
        identifier: int = test_student.id if operation == "user" else course_id
        url: str = f"/api/v1/users/{test_student.id}" if operation == "user" else f"/api/v1/courses/{course_id}"
        payload: dict[str, Any] = {"first_name": "Student"} if operation == "user" else {"title": "Web Frontend"}
        if operation == "settings":
            identifier = 1
            url = "/api/v1/settings/org"
            payload = {"notify_payments": True}
        response: Response = await client.patch(url, headers=self.headers(test_admin), json=payload)
        assert response.status_code == 200, response.text
        assert await self.events(client, test_admin, entity_type=entity, entity_id=identifier, action="update") == []

    async def test_failed_change_leaves_no_audit(self, client: AsyncClient, test_admin: User, test_mentor: User) -> None:
        identifier: int = await self.course(client, test_admin, test_mentor)
        response: Response = await client.patch(f"/api/v1/courses/{identifier}", headers=self.headers(test_admin), json={"mentor_id": 999999})
        assert response.status_code == 404, response.text
        assert await self.events(client, test_admin, entity_type="course", entity_id=identifier, action="update") == []

    async def test_historical_label_survives_rename(self, client: AsyncClient, test_admin: User) -> None:
        response: Response = await client.post("/api/v1/users/", headers=self.headers(test_admin), json={"first_name": "Mehrangiz", "last_name": "Hamidova", "email": "history@example.com", "role": "mentor"})
        assert response.status_code == 201, response.text
        identifier: int = response.json()["id"]
        response = await client.patch(f"/api/v1/users/{identifier}", headers=self.headers(test_admin), json={"first_name": "Renamed"})
        assert response.status_code == 200, response.text
        events: list[dict[str, Any]] = await self.events(client, test_admin, entity_type="user", entity_id=identifier, action="create", search="Mehrangiz Hamidova")
        assert len(events) == 1
        assert events[0]["entity_label"] == "Mehrangiz Hamidova"

    async def test_older_finance_rows_search_by_person(self, client: AsyncClient, test_admin: User, test_accountant: User, test_mentor: User, test_student: User) -> None:
        identifier: int = await self.course(client, test_admin, test_mentor)
        enrollment_response: Response = await client.post("/api/v1/enrollments/", headers=self.headers(test_admin), json={"student_id": test_student.id, "course_id": identifier})
        assert enrollment_response.status_code == 201, enrollment_response.text
        response: Response = await client.post("/api/v1/finance/payments/", headers=self.headers(test_accountant), json={
            "student_id": test_student.id, "course_id": identifier, "amount": "75.50", "paid_at": datetime.now(timezone.utc).isoformat(), "method": "cash",
        })
        assert response.status_code == 201, response.text
        events: list[dict[str, Any]] = await self.events(client, test_admin, entity_type="payment", search="STUDENT ONE")
        assert len(events) == 1
        assert events[0]["entity_label"] == "Student One"
        assert len(events[0]["changes"]) > 1

    async def test_missing_older_target_still_renders(self, client: AsyncClient, test_admin: User) -> None:
        async with TestingSessionLocal() as session:
            session.add(AuditLog(user_id=test_admin.id, action=AuditAction.DELETE, entity_type="course", entity_id=999999, field_name="summary", new_value="Old summary"))
            await session.commit()
        events: list[dict[str, Any]] = await self.events(client, test_admin, search="old summary")
        assert len(events) == 1
        assert events[0]["entity_label"] is None

    async def test_search_treats_wildcards_literally(self, client: AsyncClient, test_admin: User, test_mentor: User) -> None:
        await self.course(client, test_admin, test_mentor)
        assert await self.events(client, test_admin, search="%") == []
