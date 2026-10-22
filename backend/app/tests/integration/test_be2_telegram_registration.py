from typing import Any
import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.security import create_access_token
from app.core.telegram_link_codes import TelegramLinkCodeGenerator
from app.models.telegram_link import TelegramLinkCode
from app.models.user import User, UserRole
from be2_telegram_support import TelegramConversation


from be2_link_fixtures import admin_headers, bind_handler_sessions, conversation, reload_student


class TestEndpoints:
    @pytest.mark.asyncio
    async def test_admin_generates_code_once_and_student_exposes_only_flag_and_expiry(
        self, client: AsyncClient, test_admin: User, test_student: User
    ) -> None:
        response = await client.post(
            f"/api/v1/students/{test_student.id}/telegram-link-code", headers=admin_headers(test_admin)
        )
        assert response.status_code == 201
        body: dict[str, Any] = response.json()
        assert TelegramLinkCodeGenerator().normalize(body["code"]) == body["code"]
        listing = await client.get("/api/v1/students/", headers=admin_headers(test_admin))
        item: dict[str, Any] = listing.json()["items"][0]
        assert item["parent_linked"] is False
        assert item["parent_link_code_expires_at"] is not None
        assert body["code"] not in listing.text
        assert "code_hash" not in listing.text
        profile = await client.get(f"/api/v1/students/{test_student.id}/profile", headers=admin_headers(test_admin))
        assert profile.json()["user"]["parent_linked"] is False
        assert body["code"] not in profile.text

    @pytest.mark.asyncio
    async def test_endpoint_is_superadmin_only(
        self, client: AsyncClient, test_mentor: User, test_student: User, test_accountant: User
    ) -> None:
        url: str = f"/api/v1/students/{test_student.id}/telegram-link-code"
        assert (await client.post(url)).status_code in (401, 403)
        mentor = await client.post(url, headers={"Authorization": f"Bearer {create_access_token(test_mentor.id, UserRole.MENTOR)}"})
        student = await client.post(url, headers={"Authorization": f"Bearer {create_access_token(test_student.id, UserRole.STUDENT)}"})
        accountant = await client.post(url, headers={"Authorization": f"Bearer {create_access_token(test_accountant.id, UserRole.ACCOUNTANT)}"})
        assert mentor.status_code == 403
        assert student.status_code == 403
        assert accountant.status_code == 403

    @pytest.mark.asyncio
    async def test_unknown_or_non_student_target_is_404(
        self, client: AsyncClient, test_admin: User, test_mentor: User
    ) -> None:
        missing = await client.post("/api/v1/students/999999/telegram-link-code", headers=admin_headers(test_admin))
        not_student = await client.post(
            f"/api/v1/students/{test_mentor.id}/telegram-link-code", headers=admin_headers(test_admin)
        )
        assert missing.status_code == 404
        assert not_student.status_code == 404

    @pytest.mark.asyncio
    async def test_registering_a_student_generates_a_code_and_mentor_gets_none(
        self, client: AsyncClient, test_admin: User, db_session: AsyncSession
    ) -> None:
        student_response = await client.post(
            "/api/v1/users/",
            headers=admin_headers(test_admin),
            json={"email": "new-student@example.com", "first_name": "New", "last_name": "Kid", "role": "student", "phone": "+992900000999"},
        )
        mentor_response = await client.post(
            "/api/v1/users/",
            headers=admin_headers(test_admin),
            json={"email": "new-mentor@example.com", "first_name": "New", "last_name": "Mentor", "role": "mentor"},
        )
        assert student_response.status_code == 201
        assert student_response.json()["parent_link_code_expires_at"] is not None
        assert student_response.json()["parent_linked"] is False
        assert mentor_response.json()["parent_link_code_expires_at"] is None
        rows: list[TelegramLinkCode] = list((await db_session.execute(select(TelegramLinkCode))).scalars())
        assert [row.student_id for row in rows] == [student_response.json()["id"]]


class TestRegistrationDelivery:
    @pytest.mark.asyncio
    async def test_create_response_carries_a_code_that_links_and_reads_never_do(
        self, client: AsyncClient, test_admin: User, conversation: TelegramConversation
    ) -> None:
        created = await client.post(
            "/api/v1/users/",
            headers=admin_headers(test_admin),
            json={"email": "delivered@example.com", "first_name": "Del", "last_name": "Ivered", "role": "student", "phone": "+992900000999"},
        )
        body: dict[str, Any] = created.json()
        code: str = body["parent_link_code"]
        assert TelegramLinkCodeGenerator().normalize(code) == code
        listing = await client.get("/api/v1/students/", headers=admin_headers(test_admin))
        profile = await client.get(f"/api/v1/students/{body['id']}/profile", headers=admin_headers(test_admin))
        patched = await client.patch(
            f"/api/v1/users/{body['id']}", headers=admin_headers(test_admin), json={"first_name": "Dell"}
        )
        for read in (listing, profile, patched):
            assert '"parent_link_code"' not in read.text
            assert code not in read.text
        await conversation.press_language(600, "en")
        await conversation.send_text(600, code)
        assert (await reload_student(body["id"])).parent_telegram_chat_id == 600

    @pytest.mark.asyncio
    async def test_mentor_creation_has_no_link_code(self, client: AsyncClient, test_admin: User) -> None:
        created = await client.post(
            "/api/v1/users/",
            headers=admin_headers(test_admin),
            json={"email": "m2@example.com", "first_name": "M", "last_name": "Two", "role": "mentor"},
        )
        assert created.json()["parent_link_code"] is None

    @pytest.mark.asyncio
    async def test_credentials_email_contains_code_row_and_bot_hint(
        self, client: AsyncClient, test_admin: User, db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        import json
        from app.core.config import settings
        from app.models.outbox_event import OutboxEvent, OutboxEventKind
        from app.services.email_templates import OutboxEmailTemplateFactory, RenderedEmail

        monkeypatch.setattr(settings, "TELEGRAM_BOT_USERNAME", "kitob_test_bot")
        created = await client.post(
            "/api/v1/users/",
            headers=admin_headers(test_admin),
            json={"email": "mailed@example.com", "first_name": "Mail", "last_name": "Ed", "role": "student", "phone": "+992900000999"},
        )
        code: str = created.json()["parent_link_code"]
        assert code
        credentials_events = (
            await db_session.execute(select(OutboxEvent).where(OutboxEvent.kind == OutboxEventKind.CREDENTIALS_EMAIL))
        ).scalars().all()
        assert [event.recipient_email for event in credentials_events] == ["mailed@example.com"]
        payload: str = json.dumps({"first_name": "Mail", "temporary_password": "123456", "parent_link_code": code})
        rendered: RenderedEmail = OutboxEmailTemplateFactory().create(
            OutboxEventKind.CREDENTIALS_EMAIL, "mailed@example.com", payload
        ).render()
        assert "Код для Telegram родителя" in rendered.html_body
        assert rendered.html_body.count(code) == 1
        assert "Передайте код родителю, чтобы подключить уведомления в боте @kitob_test_bot." in rendered.html_body
        assert code in rendered.plain_text

    def test_email_without_code_is_unchanged(self) -> None:
        from app.services.email_templates import CredentialsEmailTemplate, RenderedEmail

        rendered: RenderedEmail = CredentialsEmailTemplate("A", "a@example.com", "123456", "https://x.example").render()
        assert "Telegram" not in rendered.html_body
