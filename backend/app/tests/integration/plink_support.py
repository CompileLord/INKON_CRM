from typing import Any, Optional

from httpx import AsyncClient, Response
from sqlalchemy import Select, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.models.outbox_event import OutboxEvent, OutboxEventKind
from app.models.user import User, UserRole
from app.tests.sms_test_support import SmsPasswordTestSupport


class PlinkUsers:
    @staticmethod
    async def create(
        db_session: AsyncSession,
        email: Optional[str],
        phone: Optional[str],
        parent_phone: Optional[str] = None,
        role: UserRole = UserRole.STUDENT,
        first_name: str = "Sam",
        password: str = "plink_pass123",
    ) -> User:
        user: User = User(
            email=email,
            password_hash=hash_password(password),
            first_name=first_name,
            last_name="Tester",
            role=role,
            phone=phone,
            parent_phone=parent_phone,
            must_set_password=False,
        )
        db_session.add(user)
        await db_session.commit()
        return user


class PlinkOutbox:
    @staticmethod
    async def events(db_session: AsyncSession, kind: OutboxEventKind, user_id: Optional[int] = None) -> list[OutboxEvent]:
        db_session.expire_all()
        statement: Select[tuple[OutboxEvent]] = select(OutboxEvent).where(OutboxEvent.kind == kind).order_by(OutboxEvent.id)
        if user_id is not None and kind == OutboxEventKind.STUDENT_PASSWORD_SMS:
            statement = statement.where(OutboxEvent.target_user_id == user_id)
        return list((await db_session.execute(statement)).scalars().all())

    @staticmethod
    async def all_kinds(db_session: AsyncSession) -> list[OutboxEventKind]:
        db_session.expire_all()
        return list((await db_session.execute(select(OutboxEvent.kind).order_by(OutboxEvent.id))).scalars().all())


class PlinkApi:
    @staticmethod
    async def create_user(client: AsyncClient, admin: User, body: dict[str, Any]) -> Response:
        return await client.post("/api/v1/users/", json=body, headers=SmsPasswordTestSupport.bearer(admin))

    @staticmethod
    async def resend(client: AsyncClient, admin: User, user_id: int, body: Optional[dict[str, Any]] = None) -> Response:
        return await client.post(
            f"/api/v1/users/{user_id}/resend-password-sms", json=body, headers=SmsPasswordTestSupport.bearer(admin)
        )

    @staticmethod
    async def reset(client: AsyncClient, body: dict[str, Any]) -> Response:
        return await client.post("/api/v1/auth/password-reset/request", json=body)
