import json
from typing import Any

from httpx import AsyncClient, Response
from sqlalchemy import Select, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.config import settings
from app.core.security import create_access_token
from app.models.outbox_event import OutboxEvent, OutboxEventKind
from app.models.user import User
from app.services.outbox_service import OutboxPayloadEncryptor
from app.tests.conftest import TestingSessionLocal
from app.tests.sms_fakes import FakeSmsSender
from app.workers.outbox import OutboxWorkerManager


class SmsPasswordTestSupport:
    @staticmethod
    def build_session_factory() -> async_sessionmaker[AsyncSession]:
        return TestingSessionLocal

    @staticmethod
    def bearer(user: User) -> dict[str, str]:
        return {"Authorization": f"Bearer {create_access_token(user.id, user.role)}"}

    @staticmethod
    def build_worker(sender: FakeSmsSender, **overrides: Any) -> OutboxWorkerManager:
        return OutboxWorkerManager(
            settings.DATABASE_URL,
            settings.JWT_SECRET_KEY,
            sms_sender=sender,
            sms_send_interval_seconds=0,
            sms_jitter_fraction=0,
            backoff_base_seconds=overrides.pop("backoff_base_seconds", 10),
            **overrides,
        )

    @staticmethod
    async def create_student_via_api(
        client: AsyncClient,
        admin: User,
        email: str,
        phone: str | None = "+992900000001",
        parent_phone: str | None = None,
    ) -> Response:
        payload: dict[str, Any] = {"email": email, "first_name": "Sam", "last_name": "Student", "role": "student"}
        if phone is not None:
            payload["phone"] = phone
        if parent_phone is not None:
            payload["parent_phone"] = parent_phone
        return await client.post("/api/v1/users/", json=payload, headers=SmsPasswordTestSupport.bearer(admin))

    @staticmethod
    async def sms_events(db_session: AsyncSession, user_id: int | None = None) -> list[OutboxEvent]:
        db_session.expire_all()
        statement: Select[tuple[OutboxEvent]] = select(OutboxEvent).where(OutboxEvent.kind == OutboxEventKind.STUDENT_PASSWORD_SMS).order_by(OutboxEvent.id)
        if user_id is not None:
            statement = statement.where(OutboxEvent.target_user_id == user_id)
        return list((await db_session.execute(statement)).scalars().all())

    @staticmethod
    def read_code(event: OutboxEvent) -> str:
        assert event.encrypted_payload is not None
        decrypted: dict[str, Any] = json.loads(OutboxPayloadEncryptor(settings.JWT_SECRET_KEY).decrypt(event.encrypted_payload))
        return str(decrypted["code"])

    @staticmethod
    async def login(client: AsyncClient, email: str, password: str) -> Response:
        return await client.post("/api/v1/auth/login", json={"email": email, "password": password})
