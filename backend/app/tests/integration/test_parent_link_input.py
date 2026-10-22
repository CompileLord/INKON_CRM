from datetime import datetime, timezone

import pytest
from httpx import AsyncClient, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token
from app.models.user import User
from app.services.telegram_link_service import LinkOutcome, LinkResult, TelegramLinkService


class TestParentLinkInput:
    @pytest.mark.asyncio
    @pytest.mark.parametrize("chat_id", [None, 902])
    async def test_create_rejects_raw_chat_id(
        self, client: AsyncClient, db_session: AsyncSession, test_admin: User, test_student: User,
        chat_id: int | None,
    ) -> None:
        test_student.parent_telegram_chat_id = 901
        db_session.add(test_student)
        await db_session.commit()
        response: Response = await client.post(
            "/api/v1/users/",
            headers={"Authorization": f"Bearer {create_access_token(test_admin.id, test_admin.role)}"},
            json={"email": "parent-link@example.com", "first_name": "New", "last_name": "Student",
                  "role": "student", "phone": "+992900000601", "parent_telegram_chat_id": chat_id},
        )
        assert response.status_code == 422
        assert any(error["loc"] == ["body", "parent_telegram_chat_id"] for error in response.json()["detail"])
        await db_session.refresh(test_student)
        assert test_student.parent_telegram_chat_id == 901

    @pytest.mark.asyncio
    @pytest.mark.parametrize("chat_id", [None, 902])
    async def test_update_rejects_raw_chat_id_and_preserves_stored_link(
        self, client: AsyncClient, db_session: AsyncSession, test_admin: User, test_student: User,
        chat_id: int | None,
    ) -> None:
        test_student.parent_telegram_chat_id = 901
        db_session.add(test_student)
        await db_session.commit()
        response: Response = await client.patch(
            f"/api/v1/users/{test_student.id}",
            headers={"Authorization": f"Bearer {create_access_token(test_admin.id, test_admin.role)}"},
            json={"parent_telegram_chat_id": chat_id},
        )
        assert response.status_code == 422
        assert any(error["loc"] == ["body", "parent_telegram_chat_id"] for error in response.json()["detail"])
        await db_session.refresh(test_student)
        assert test_student.parent_telegram_chat_id == 901

    @pytest.mark.asyncio
    async def test_phone_change_clears_link_and_new_bot_code_relinks(
        self, client: AsyncClient, db_session: AsyncSession, test_admin: User, test_student: User,
    ) -> None:
        test_student.parent_phone = "+992900000601"
        test_student.parent_telegram_chat_id = 901
        db_session.add(test_student)
        await db_session.commit()
        headers: dict[str, str] = {"Authorization": f"Bearer {create_access_token(test_admin.id, test_admin.role)}"}
        unchanged: Response = await client.patch(
            f"/api/v1/users/{test_student.id}", headers=headers, json={"parent_phone": "+992900000601"},
        )
        assert unchanged.status_code == 200
        assert unchanged.json()["parent_linked"] is True
        changed: Response = await client.patch(
            f"/api/v1/users/{test_student.id}", headers=headers, json={"parent_phone": "+992900000602"},
        )
        assert changed.status_code == 200
        assert changed.json()["parent_linked"] is False
        assert changed.json()["parent_telegram_chat_id"] is None
        issued: Response = await client.post(f"/api/v1/students/{test_student.id}/telegram-link-code", headers=headers)
        assert issued.status_code == 201
        assert datetime.fromisoformat(issued.json()["expires_at"]) > datetime.now(timezone.utc)
        result: LinkResult = await TelegramLinkService(db_session).link_parent_chat(902, issued.json()["code"])
        assert result.outcome == LinkOutcome.LINKED
        await db_session.commit()
        await db_session.refresh(test_student)
        assert test_student.parent_telegram_chat_id == 902
        assert test_student.parent_link_code_expires_at is None
        reused: LinkResult = await TelegramLinkService(db_session).link_parent_chat(903, issued.json()["code"])
        assert reused.outcome == LinkOutcome.INVALID
