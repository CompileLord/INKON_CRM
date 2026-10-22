import asyncio
from datetime import datetime, timedelta, timezone
from typing import Any

import pytest
from httpx import AsyncClient, Response
from sqlalchemy import select, text, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.redis import redis_client
from app.models.user import User
from app.models.outbox_event import OutboxEvent, OutboxEventStatus
from app.services.sms.sender import PayomchiSmsSender, SmsSendResult
from app.tests.sms_test_support import SmsPasswordTestSupport
from app.tests.sms_fakes import FakeSmsSender


@pytest.mark.asyncio
class TestPendingStudentPassword:
    async def test_requests_only_queue_and_worker_transport_has_no_open_database_transaction(
        self, client: AsyncClient, test_admin: User, monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        async def reject_request_transport(*args: Any, **kwargs: Any) -> SmsSendResult:
            raise AssertionError("Request handlers must only enqueue SMS")

        monkeypatch.setattr(PayomchiSmsSender, "send", reject_request_transport)
        created: Response = await SmsPasswordTestSupport.create_student_via_api(client, test_admin, None)
        assert created.status_code == 201

        class TransactionCheckingSender(FakeSmsSender):
            async def send(self, phone_e164: str, message: str, idempotency_key: str) -> SmsSendResult:
                session: AsyncSession
                async with SmsPasswordTestSupport.build_session_factory()() as session:
                    open_transactions: int = (await session.execute(text(
                        "SELECT count(*) FROM pg_stat_activity WHERE datname = current_database() "
                        "AND pid <> pg_backend_pid() AND state = 'idle in transaction'"
                    ))).scalar_one()
                    assert open_transactions == 0
                return await super().send(phone_e164, message, idempotency_key)

        sender: TransactionCheckingSender = TransactionCheckingSender()
        await SmsPasswordTestSupport.build_worker(sender).run_once(SmsPasswordTestSupport.build_session_factory())
        assert len(sender.sends) == 1

    async def test_concurrent_pending_logins_promote_credential_once(
        self, client: AsyncClient, test_student: User, db_session: AsyncSession,
    ) -> None:
        await client.post("/api/v1/auth/password-reset/request", json={"email": test_student.email, "channel": "student_phone"})
        code: str = SmsPasswordTestSupport.read_code((await SmsPasswordTestSupport.sms_events(db_session, test_student.id))[0])
        responses: list[Response] = list(await asyncio.gather(
            SmsPasswordTestSupport.login(client, test_student.email, code), SmsPasswordTestSupport.login(client, test_student.email, code),
        ))
        assert [response.status_code for response in responses] == [200, 200]
        for response in responses:
            assert (await client.get("/api/v1/users/me", headers={"Authorization": f"Bearer {response.json()['access_token']}"})).status_code == 200
        db_session.expire_all()
        student: User = (await db_session.execute(select(User).where(User.id == test_student.id))).scalar_one()
        assert student.auth_version == test_student.auth_version + 1

    async def test_self_update_cannot_remove_last_student_login_identifier(
        self, client: AsyncClient, test_student: User, db_session: AsyncSession,
    ) -> None:
        test_student.email = None
        db_session.add(test_student)
        await db_session.commit()
        response: Response = await client.patch("/api/v1/users/me", headers=SmsPasswordTestSupport.bearer(test_student), json={"phone": None})
        assert response.status_code == 422

    async def test_contact_change_cancels_pending_code_and_prevents_delivery_to_old_phone(
        self, client: AsyncClient, test_admin: User, test_student: User, db_session: AsyncSession,
    ) -> None:
        await client.post("/api/v1/auth/password-reset/request", json={"email": test_student.email, "channel": "student_phone"})
        code: str = SmsPasswordTestSupport.read_code((await SmsPasswordTestSupport.sms_events(db_session, test_student.id))[0])
        response: Response = await client.patch(f"/api/v1/users/{test_student.id}", headers=SmsPasswordTestSupport.bearer(test_admin), json={"phone": "+992900001111"})
        assert response.status_code == 200
        assert (await SmsPasswordTestSupport.login(client, test_student.email, code)).status_code == 401
        assert (await SmsPasswordTestSupport.login(client, test_student.email, "student_pass123")).status_code == 200
        sender: FakeSmsSender = FakeSmsSender()
        await SmsPasswordTestSupport.build_worker(sender).run_once(SmsPasswordTestSupport.build_session_factory())
        event: OutboxEvent = (await SmsPasswordTestSupport.sms_events(db_session, test_student.id))[0]
        assert sender.sends == [] and event.encrypted_payload is None
        assert event.status == OutboxEventStatus.EXPIRED and event.last_error == "sms_destination_changed"

    async def test_email_and_phone_update_of_active_student_sends_nothing(
        self, client: AsyncClient, test_admin: User, test_student: User, db_session: AsyncSession,
    ) -> None:
        response: Response = await client.patch(f"/api/v1/users/{test_student.id}", headers=SmsPasswordTestSupport.bearer(test_admin), json={
            "email": "new-email@example.com", "phone": "+992900002222",
        })
        assert response.status_code == 200
        assert await SmsPasswordTestSupport.sms_events(db_session, test_student.id) == []
        assert (await SmsPasswordTestSupport.login(client, "new-email@example.com", "student_pass123")).status_code == 200
        assert (await SmsPasswordTestSupport.login(client, "+992900002222", "student_pass123")).status_code == 200

    async def test_staff_sms_routes_share_an_ip_budget(
        self, client: AsyncClient, test_admin: User, monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        monkeypatch.setattr(settings, "SMS_PASSWORD_IP_LIMIT", 1)
        created: Response = await SmsPasswordTestSupport.create_student_via_api(client, test_admin, None)
        assert created.status_code == 201
        assert (await client.post(f"/api/v1/users/{created.json()['id']}/resend-password-sms", json={"channel": "student_phone"}, headers=SmsPasswordTestSupport.bearer(test_admin))).status_code == 429

    async def test_attacker_reset_preserves_password_access_and_refresh_sessions(
        self, client: AsyncClient, test_student: User, db_session: AsyncSession,
    ) -> None:
        original: Response = await SmsPasswordTestSupport.login(client, test_student.email, "student_pass123")
        requested: Response = await client.post("/api/v1/auth/password-reset/request", json={"email": test_student.email, "channel": "student_phone"})
        assert requested.status_code == 200
        assert (await SmsPasswordTestSupport.login(client, test_student.email, "student_pass123")).status_code == 200
        assert (await client.get("/api/v1/users/me", headers={"Authorization": f"Bearer {original.json()['access_token']}"})).status_code == 200
        assert (await client.post("/api/v1/auth/refresh", json={"refresh_token": original.json()["refresh_token"]})).status_code == 200
        db_session.expire_all()
        student: User = (await db_session.execute(select(User).where(User.id == test_student.id))).scalar_one()
        assert student.auth_version == test_student.auth_version
        assert student.pending_password_hash is not None
        assert student.pending_password_expires_at is not None
        assert student.pending_password_expires_at < datetime.now(timezone.utc) + timedelta(minutes=11)

    async def test_pending_login_promotes_code_revokes_older_sessions_and_is_normal_login(
        self, client: AsyncClient, test_student: User, db_session: AsyncSession,
    ) -> None:
        original: Response = await SmsPasswordTestSupport.login(client, test_student.email, "student_pass123")
        await client.post("/api/v1/auth/password-reset/request", json={"email": test_student.email, "channel": "student_phone"})
        code: str = SmsPasswordTestSupport.read_code((await SmsPasswordTestSupport.sms_events(db_session, test_student.id))[0])
        activated: Response = await SmsPasswordTestSupport.login(client, test_student.email, code)
        assert activated.status_code == 200 and activated.json()["must_set_password"] is False
        assert (await client.get("/api/v1/users/me", headers={"Authorization": f"Bearer {activated.json()['access_token']}"})).status_code == 200
        assert (await SmsPasswordTestSupport.login(client, test_student.email, "student_pass123")).status_code == 401
        assert (await client.get("/api/v1/users/me", headers={"Authorization": f"Bearer {original.json()['access_token']}"})).status_code == 401
        assert (await client.post("/api/v1/auth/refresh", json={"refresh_token": original.json()["refresh_token"]})).status_code == 401
        assert (await SmsPasswordTestSupport.login(client, test_student.email, code)).status_code == 200
        db_session.expire_all()
        student: User = (await db_session.execute(select(User).where(User.id == test_student.id))).scalar_one()
        assert student.pending_password_hash is None and student.pending_password_expires_at is None
        assert student.auth_version == test_student.auth_version + 1

    async def test_expired_pending_code_cannot_log_in_or_be_delivered_and_old_password_works(
        self, client: AsyncClient, test_student: User, db_session: AsyncSession,
    ) -> None:
        await client.post("/api/v1/auth/password-reset/request", json={"email": test_student.email, "channel": "student_phone"})
        code: str = SmsPasswordTestSupport.read_code((await SmsPasswordTestSupport.sms_events(db_session, test_student.id))[0])
        await db_session.execute(update(User).where(User.id == test_student.id).values(
            pending_password_expires_at=datetime.now(timezone.utc) - timedelta(seconds=1),
        ))
        await db_session.commit()
        assert (await SmsPasswordTestSupport.login(client, test_student.email, code)).status_code == 401
        assert (await SmsPasswordTestSupport.login(client, test_student.email, "student_pass123")).status_code == 200
        sender: FakeSmsSender = FakeSmsSender()
        await SmsPasswordTestSupport.build_worker(sender).run_once(SmsPasswordTestSupport.build_session_factory())
        event: OutboxEvent = (await SmsPasswordTestSupport.sms_events(db_session, test_student.id))[0]
        assert sender.sends == []
        assert event.status == OutboxEventStatus.EXPIRED and event.encrypted_payload is None

    async def test_resend_supersedes_only_pending_code_and_worker_purges_stale_payload(
        self, client: AsyncClient, test_admin: User, test_student: User, db_session: AsyncSession,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        for _ in range(2):
            await redis_client.delete(f"sms:cooldown:password:{test_student.id}")
            assert (await client.post(f"/api/v1/users/{test_student.id}/resend-password-sms", json={"channel": "student_phone"}, headers=SmsPasswordTestSupport.bearer(test_admin))).status_code == 200
        events: list[OutboxEvent] = await SmsPasswordTestSupport.sms_events(db_session, test_student.id)
        stale_code: str = SmsPasswordTestSupport.read_code(events[0])
        newest_code: str = SmsPasswordTestSupport.read_code(events[1])
        assert (await SmsPasswordTestSupport.login(client, test_student.email, stale_code)).status_code == 401
        assert (await SmsPasswordTestSupport.login(client, test_student.email, "student_pass123")).status_code == 200
        sender: FakeSmsSender = FakeSmsSender()
        await SmsPasswordTestSupport.build_worker(sender).run_once(SmsPasswordTestSupport.build_session_factory())
        events = await SmsPasswordTestSupport.sms_events(db_session, test_student.id)
        assert events[0].status == OutboxEventStatus.EXPIRED and events[0].encrypted_payload is None
        assert events[1].status == OutboxEventStatus.DELIVERED and newest_code in sender.sends[0].message
        assert len(sender.sends) == 1

    async def test_password_change_cancels_pending_recovery(
        self, client: AsyncClient, test_student: User, db_session: AsyncSession,
    ) -> None:
        original: Response = await SmsPasswordTestSupport.login(client, test_student.email, "student_pass123")
        await client.post("/api/v1/auth/password-reset/request", json={"email": test_student.email, "channel": "student_phone"})
        code: str = SmsPasswordTestSupport.read_code((await SmsPasswordTestSupport.sms_events(db_session, test_student.id))[0])
        changed: Response = await client.post("/api/v1/auth/change-password", headers={"Authorization": f"Bearer {original.json()['access_token']}"}, json={
            "current_password": "student_pass123", "new_password": "own-password-123",
        })
        assert changed.status_code == 200
        assert (await SmsPasswordTestSupport.login(client, test_student.email, code)).status_code == 401
        assert (await SmsPasswordTestSupport.login(client, test_student.email, "own-password-123")).status_code == 200

    async def test_initial_creation_counts_towards_phone_and_global_toll_fraud_caps(
        self, client: AsyncClient, test_admin: User, monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        monkeypatch.setattr(settings, "SMS_PASSWORD_PHONE_DAILY_LIMIT", 1)
        shared_parent_phone: str = "+992900001234"
        assert (await SmsPasswordTestSupport.create_student_via_api(client, test_admin, None, "+99211", shared_parent_phone)).status_code == 201
        assert (await SmsPasswordTestSupport.create_student_via_api(client, test_admin, None, "+99212", shared_parent_phone)).status_code == 429
        monkeypatch.setattr(settings, "SMS_PASSWORD_GLOBAL_DAILY_LIMIT", 1)
        assert (await SmsPasswordTestSupport.create_student_via_api(client, test_admin, None, "+992900001235")).status_code == 429

    async def test_reset_phone_budget_denial_is_indistinguishable_from_unknown_account(
        self, client: AsyncClient, test_student: User, monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        monkeypatch.setattr(settings, "SMS_PASSWORD_PHONE_LIMIT", 1)
        await client.post("/api/v1/auth/password-reset/request", json={"email": test_student.email, "channel": "student_phone"})
        known: Response = await client.post("/api/v1/auth/password-reset/request", json={"email": test_student.email, "channel": "student_phone"})
        unknown: Response = await client.post("/api/v1/auth/password-reset/request", json={"email": "unknown@example.com"})
        assert known.status_code == unknown.status_code == 200 and known.json() == unknown.json()

    async def test_validation_response_does_not_echo_a_password_code(
        self, client: AsyncClient, test_student: User,
    ) -> None:
        original: Response = await SmsPasswordTestSupport.login(client, test_student.email, "student_pass123")
        response: Response = await client.post("/api/v1/auth/change-password", headers={"Authorization": f"Bearer {original.json()['access_token']}"}, json={
            "current_password": "student_pass123", "new_password": "12345Z",
        })
        assert response.status_code == 422 and "12345Z" not in response.text
        errors: list[dict[str, Any]] = response.json()["detail"]
        assert errors[0]["loc"] == ["body", "new_password"]
