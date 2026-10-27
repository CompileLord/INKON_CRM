from datetime import datetime, timedelta, timezone
from typing import Any

import pytest
from httpx import AsyncClient, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.audit_log import AuditAction, AuditLog
from app.models.user import User
from app.tests.integration.plink_support import PlinkApi
from app.tests.sms_test_support import SmsPasswordTestSupport


@pytest.mark.asyncio
async def test_admin_student_creation_records_audit_actor(
    client: AsyncClient, test_admin: User, db_session: AsyncSession
) -> None:
    response: Response = await PlinkApi.create_user(client, test_admin, {
        "first_name": "Audit", "last_name": "Student", "role": "student", "email": "audit-p8@example.com",
    })
    assert response.status_code == 201
    student_id: int = response.json()["id"]
    rows: list[AuditLog] = list((await db_session.scalars(select(AuditLog).where(
        AuditLog.entity_id == student_id,
        AuditLog.field_name.in_(("link_code_expires_at", "credentials_queued")),
    ))).all())
    assert {row.field_name for row in rows} == {"link_code_expires_at", "credentials_queued"}
    assert all(row.user_id == test_admin.id for row in rows)


@pytest.mark.asyncio
async def test_admin_student_sms_records_audit_actor(
    client: AsyncClient, test_admin: User, db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(settings, "ALLOW_EMAILLESS_USERS", True)
    response: Response = await PlinkApi.create_user(client, test_admin, {
        "first_name": "Audit", "last_name": "SMS", "role": "student", "phone": "+992900003478",
    })
    assert response.status_code == 201
    student_id: int = response.json()["id"]
    rows: list[AuditLog] = list((await db_session.scalars(select(AuditLog).where(
        AuditLog.entity_id == student_id, AuditLog.field_name == "password_sms_queued",
    ))).all())
    assert len(rows) == 1
    assert rows[0].user_id == test_admin.id


@pytest.mark.asyncio
@pytest.mark.parametrize("endpoint", ["/api/v1/audit-log/", "/api/v1/audit-log/events/"])
async def test_audit_category_filter(client: AsyncClient, test_admin: User, db_session: AsyncSession, endpoint: str) -> None:
    entries: list[tuple[str, str, int | None, str]] = [
        ("payment", "amount", test_admin.id, "payments"),
        ("user", "name", test_admin.id, "students"),
        ("course", "title", test_admin.id, "courses"),
        ("journal_entry", "score", test_admin.id, "journal"),
        ("settings", "name", test_admin.id, "system"),
        ("student_telegram_link", "link_code_expires_at", test_admin.id, "system"),
        ("user", "credentials_queued", test_admin.id, "system"),
        ("user", "password_sms_queued", test_admin.id, "system"),
        ("payment", "amount", None, "system"),
    ]
    now: datetime = datetime.now(timezone.utc)
    for index, (entity_type, field_name, actor_id, category) in enumerate(entries):
        db_session.add(AuditLog(user_id=actor_id, action=AuditAction.UPDATE, entity_type=entity_type,
                                entity_id=1000 + index, field_name=field_name, new_value=category,
                                created_at=now + timedelta(seconds=index)))
    await db_session.commit()
    headers: dict[str, str] = SmsPasswordTestSupport.bearer(test_admin)
    for category in ("payments", "students", "courses", "journal", "system"):
        response: Response = await client.get(endpoint, params={"category": category}, headers=headers)
        assert response.status_code == 200
        body: dict[str, Any] = response.json()
        assert {item["entity_id"] for item in body["items"]} == {
            1000 + index for index, entry in enumerate(entries) if entry[3] == category
        }
    invalid: Response = await client.get(endpoint, params={"category": "unknown"}, headers=headers)
    assert invalid.status_code == 422
