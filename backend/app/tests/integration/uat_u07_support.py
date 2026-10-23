import json
from typing import Any

from httpx import AsyncClient, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token
from app.models.audit_log import AuditLog
from app.models.user import User
from app.tests.conftest import TestingSessionLocal


class U07AuditSupport:
    @staticmethod
    def headers(actor: User) -> dict[str, str]:
        return {"Authorization": f"Bearer {create_access_token(actor.id, actor.role)}"}

    async def events(self, client: AsyncClient, actor: User, **filters: Any) -> list[dict[str, Any]]:
        response: Response = await client.get("/api/v1/audit-log/events/", params=filters, headers=self.headers(actor))
        assert response.status_code == 200, response.text
        return response.json()["items"]

    async def course(self, client: AsyncClient, actor: User, mentor: User) -> int:
        response: Response = await client.post("/api/v1/courses/", headers=self.headers(actor), json={
            "title": "Web Frontend", "description": "Audit course", "start_date": "2027-01-01",
            "end_date": "2027-03-01", "exam_type": "weekly", "price": "300.00", "mentor_id": mentor.id,
            "schedules": [{"day_of_week": 1, "time_start": "10:00", "time_end": "11:00"}],
        })
        assert response.status_code == 201, response.text
        return response.json()["id"]

    async def assert_change(
        self, client: AsyncClient, actor: User, entity: str, identifier: int, action: str,
        label: str, fields: set[str] | dict[str, tuple[str | None, str | None]],
    ) -> None:
        events: list[dict[str, Any]] = await self.events(client, actor, entity_type=entity, entity_id=identifier, action=action)
        assert len(events) == 1, events
        event: dict[str, Any] = events[0]
        changes: list[dict[str, Any]] = event["changes"]
        if isinstance(fields, dict):
            assert len(changes) == len(fields), events
            actual_values: dict[str, tuple[str | None, str | None]] = {change["field_name"]: (change["old_value"], change["new_value"]) for change in changes}
            assert actual_values == fields, (actual_values, fields)
        else:
            assert len(changes) == 1, events
            assert changes[0]["field_name"] == "changed_fields"
            assert json.loads(changes[0]["new_value"]) == sorted(fields)
        assert event["user_id"] == actor.id
        assert event["entity_label"] == label
        session: AsyncSession
        async with TestingSessionLocal() as session:
            rows: list[AuditLog] = list((await session.execute(select(AuditLog).where(AuditLog.id.in_([change["id"] for change in changes])))).scalars().all())
            assert len(rows) == len(changes)
            assert {row.entity_label for row in rows} == {label}
            assert len({row.created_at for row in rows}) == 1
        assert not {change["field_name"] for change in changes} & {"password", "password_hash", "token", "refresh_token"}
