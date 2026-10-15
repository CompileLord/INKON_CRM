from datetime import datetime, timezone
import logging
from typing import Any

import pytest
from aiogram.types import Message
from httpx import AsyncClient
from sqlalchemy import event, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.user import User, UserRole


class TelegramWebhookTestData:
    @staticmethod
    def contact_update(phone_number: str, sender_id: int, update_id: int) -> dict[str, Any]:
        return {
            "update_id": update_id,
            "message": {
                "message_id": update_id + 100,
                "date": int(datetime.now(timezone.utc).timestamp()),
                "chat": {"id": sender_id, "type": "private", "first_name": "Guardian"},
                "from": {"id": sender_id, "is_bot": False, "first_name": "Guardian"},
                "contact": {
                    "phone_number": phone_number,
                    "first_name": "Guardian",
                    "user_id": sender_id,
                },
            },
        }


class ContactBindingAfterFlushFailure:
    def __init__(self, student_id: int, sender_id: int, failure_text: str) -> None:
        self.student_id: int = student_id
        self.sender_id: int = sender_id
        self.failure_text: str = failure_text
        self.attempted: bool = False

    def __call__(self, session: Session, flush_context: object) -> None:
        if self.attempted:
            return
        if any(
            isinstance(instance, User)
            and instance.id == self.student_id
            and instance.parent_telegram_chat_id == self.sender_id
            for instance in session.identity_map.values()
        ):
            self.attempted = True
            raise RuntimeError(self.failure_text)


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "body",
    [b'{"update_id":', b"\xff"],
    ids=["malformed-json", "invalid-utf8"],
)
async def test_telegram_webhook_returns_400_for_malformed_json(
    client: AsyncClient,
    body: bytes,
) -> None:
    response = await client.post(
        "/api/v1/telegram/webhook",
        content=body,
        headers={
            "Content-Type": "application/json",
            "X-Telegram-Bot-Api-Secret-Token": settings.TELEGRAM_BOT_SECRET_TOKEN,
        },
    )

    assert response.status_code == 400
    assert response.json() == {"detail": "Malformed JSON body"}


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "payload",
    [
        {"update_id": "invalid-update-id"},
        [],
    ],
    ids=["invalid-field", "invalid-top-level-value"],
)
async def test_telegram_webhook_returns_422_for_invalid_update_schema(
    client: AsyncClient,
    payload: Any,
) -> None:
    response = await client.post(
        "/api/v1/telegram/webhook",
        json=payload,
        headers={"X-Telegram-Bot-Api-Secret-Token": settings.TELEGRAM_BOT_SECRET_TOKEN},
    )

    assert response.status_code == 422
    assert response.json() == {"detail": "Invalid Telegram update"}


@pytest.mark.parametrize(
    "secret_headers",
    [
        {},
        {"X-Telegram-Bot-Api-Secret-Token": "wrong-synthetic-webhook-secret"},
    ],
    ids=["missing-secret", "wrong-secret"],
)
@pytest.mark.asyncio
async def test_telegram_webhook_rejects_missing_or_wrong_secret_before_parsing(
    client: AsyncClient,
    secret_headers: dict[str, str],
) -> None:
    response = await client.post(
        "/api/v1/telegram/webhook",
        content=b'{"update_id":',
        headers=secret_headers,
    )

    assert response.status_code == 403
    assert response.json() == {"detail": "Invalid secret token"}


@pytest.mark.asyncio
async def test_telegram_webhook_retries_processing_failure_without_duplicate_binding(
    client: AsyncClient,
    db_session: AsyncSession,
    test_student: User,
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
) -> None:
    phone_number: str = "+992900000828"
    sender_id: int = 8280001
    update: dict[str, Any] = TelegramWebhookTestData.contact_update(
        phone_number,
        sender_id,
        8280002,
    )
    test_student.parent_phone = phone_number
    test_student.parent_telegram_chat_id = None
    db_session.add(test_student)
    await db_session.commit()
    replies: list[str] = []

    async def record_reply(message: Message, text: str, *args: Any, **kwargs: Any) -> None:
        replies.append(text)

    monkeypatch.setattr(Message, "answer", record_reply)
    commit_failure: ContactBindingAfterFlushFailure = ContactBindingAfterFlushFailure(
        test_student.id,
        sender_id,
        f"controlled persistence failure {phone_number}",
    )
    event.listen(Session, "after_flush", commit_failure)
    caplog.set_level(logging.ERROR, logger="app.api.v1.telegram")
    caplog.clear()
    headers: dict[str, str] = {
        "X-Telegram-Bot-Api-Secret-Token": settings.TELEGRAM_BOT_SECRET_TOKEN,
    }

    try:
        failed_attempt = await client.post(
            "/api/v1/telegram/webhook",
            json=update,
            headers=headers,
        )
        assert commit_failure.attempted
        assert failed_attempt.status_code == 503
        assert failed_attempt.json() == {"detail": "Telegram update processing failed"}
        await db_session.refresh(test_student)
        assert test_student.parent_telegram_chat_id is None
        assert phone_number not in caplog.text
        assert "controlled persistence failure" not in caplog.text

        successful_retry = await client.post(
            "/api/v1/telegram/webhook",
            json=update,
            headers=headers,
        )

        assert successful_retry.status_code == 200
        assert successful_retry.json() == {"status": "ok"}
        assert len(replies) == 1
        assert "успешно" in replies[0].casefold()
        await db_session.refresh(test_student)
        assert test_student.parent_telegram_chat_id == sender_id
        binding_count: int = await db_session.scalar(
            select(func.count(User.id)).where(
                User.parent_telegram_chat_id == sender_id,
                User.role == UserRole.STUDENT,
                User.is_deleted.is_(False),
            )
        )
        assert binding_count == 1
    finally:
        event.remove(Session, "after_flush", commit_failure)
