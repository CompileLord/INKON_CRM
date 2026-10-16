import asyncio
from datetime import datetime, timezone
from typing import Any

import pytest
from aiogram.types import Message
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.engine import Result
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token
from app.db.session import AsyncSessionLocal
from app.models.user import User, UserRole
from app.telegram_bot.bot import bot
from app.telegram_bot.handlers.start import process_contact


def build_contact_message(
    chat_id: int,
    sender_id: int,
    phone_number: str,
    contact_user_id: int | None = None,
    chat_type: str = "private",
) -> Message:
    message_data: dict[str, Any] = {
        "message_id": abs(chat_id) + abs(sender_id),
        "date": int(datetime.now(timezone.utc).timestamp()),
        "chat": {"id": chat_id, "type": chat_type, "first_name": "Guardian"},
        "from": {"id": sender_id, "is_bot": False, "first_name": "Guardian"},
        "contact": {
            "phone_number": phone_number,
            "first_name": "Guardian",
            "user_id": contact_user_id if contact_user_id is not None else sender_id,
        },
    }
    return Message.model_validate(message_data, context={"bot": bot})


@pytest.mark.parametrize(
    ("payload", "attempted_field"),
    [
        ({"parent_phone": "+992900000002"}, "parent_phone"),
        ({"parent_phone": None}, "parent_phone"),
        ({"parent_telegram_chat_id": 902}, "parent_telegram_chat_id"),
        ({"parent_telegram_chat_id": None}, "parent_telegram_chat_id"),
    ],
    ids=["change-parent-phone", "clear-parent-phone", "replace-chat", "clear-chat"],
)
@pytest.mark.asyncio
async def test_student_cannot_change_guardian_destination_through_self_update(
    payload: dict[str, Any],
    attempted_field: str,
    client: AsyncClient,
    db_session: AsyncSession,
    test_student: User,
) -> None:
    test_student.parent_phone = "+992900000001"
    test_student.parent_telegram_chat_id = 901
    db_session.add(test_student)
    await db_session.commit()
    headers: dict[str, str] = {
        "Authorization": f"Bearer {create_access_token(test_student.id, UserRole.STUDENT)}"
    }

    response = await client.patch(
        "/api/v1/users/me",
        headers=headers,
        json=payload,
    )

    assert response.status_code == 422
    assert attempted_field in payload
    await db_session.refresh(test_student)
    assert test_student.parent_phone == "+992900000001"
    assert test_student.parent_telegram_chat_id == 901


@pytest.mark.asyncio
async def test_parent_contact_matches_configured_parent_phone_not_student_phone(
    db_session: AsyncSession,
    test_student: User,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    test_student.phone = "+992900000101"
    test_student.parent_phone = "+992900000202"
    db_session.add(test_student)
    await db_session.commit()
    answers: list[tuple[int, str]] = []

    async def record_answer(self: Message, text: str, *args: Any, **kwargs: Any) -> None:
        answers.append((self.chat.id, text))

    monkeypatch.setattr(Message, "answer", record_answer)
    await process_contact(build_contact_message(7001, 7001, "992900000101"))
    await db_session.refresh(test_student)
    assert test_student.parent_telegram_chat_id is None

    await process_contact(build_contact_message(7002, 7002, "+992 900 000 202"))
    await db_session.refresh(test_student)
    assert test_student.parent_telegram_chat_id == 7002
    assert any("успешно" in text.casefold() for _, text in answers)


@pytest.mark.parametrize(
    ("chat_type", "sender_id", "contact_user_id"),
    [
        ("group", 7101, 7101),
        ("private", 7102, 7999),
    ],
    ids=["group-chat", "foreign-contact"],
)
@pytest.mark.asyncio
async def test_group_or_foreign_contact_cannot_bind_parent_chat(
    chat_type: str,
    sender_id: int,
    contact_user_id: int,
    db_session: AsyncSession,
    test_student: User,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    test_student.parent_phone = "+992900000303"
    test_student.phone = "+992900000303"
    db_session.add(test_student)
    await db_session.commit()
    answers: list[tuple[int, str]] = []

    async def record_answer(self: Message, text: str, *args: Any, **kwargs: Any) -> None:
        answers.append((self.chat.id, text))

    monkeypatch.setattr(Message, "answer", record_answer)
    chat_id: int = -sender_id if chat_type == "group" else sender_id
    message = build_contact_message(
        chat_id,
        sender_id,
        "+992900000303",
        contact_user_id=contact_user_id,
        chat_type=chat_type,
    )

    await process_contact(message)

    await db_session.refresh(test_student)
    assert test_student.parent_telegram_chat_id is None
    assert not any("успешно" in text.casefold() for _, text in answers)


@pytest.mark.asyncio
async def test_existing_parent_binding_cannot_be_replaced_by_another_sender(
    db_session: AsyncSession,
    test_student: User,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    test_student.parent_phone = "+992900000404"
    test_student.parent_telegram_chat_id = 7201
    test_student.phone = "+992900000404"
    db_session.add(test_student)
    await db_session.commit()
    answers: list[tuple[int, str]] = []

    async def record_answer(self: Message, text: str, *args: Any, **kwargs: Any) -> None:
        answers.append((self.chat.id, text))

    monkeypatch.setattr(Message, "answer", record_answer)

    await process_contact(build_contact_message(7202, 7202, "+992900000404"))

    await db_session.refresh(test_student)
    assert test_student.parent_telegram_chat_id == 7201
    assert not any("успешно" in text.casefold() for _, text in answers)


@pytest.mark.asyncio
async def test_verified_parent_contact_binds_all_matching_siblings(
    db_session: AsyncSession,
    test_student: User,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    shared_parent_phone = "+992900000505"
    test_student.phone = "+992900000105"
    test_student.parent_phone = shared_parent_phone
    sibling = User(
        email="sibling-wp15@example.com",
        first_name="Sibling",
        last_name="Student",
        role=UserRole.STUDENT,
        phone="+992900000106",
        parent_phone=shared_parent_phone,
        must_set_password=False,
    )
    db_session.add(test_student)
    db_session.add(sibling)
    await db_session.commit()
    sibling_id = sibling.id
    answers: list[tuple[int, str]] = []

    async def record_answer(self: Message, text: str, *args: Any, **kwargs: Any) -> None:
        answers.append((self.chat.id, text))

    monkeypatch.setattr(Message, "answer", record_answer)

    await process_contact(build_contact_message(7301, 7301, "992 900 000 505"))

    await db_session.refresh(test_student)
    sibling_after = await db_session.get(User, sibling_id)
    assert sibling_after is not None
    await db_session.refresh(sibling_after)
    assert test_student.parent_telegram_chat_id == 7301
    assert sibling_after.parent_telegram_chat_id == 7301
    assert any("Sibling" in text for _, text in answers)


@pytest.mark.asyncio
async def test_conflicting_sibling_binding_preserves_all_rows_and_releases_locks_before_reply(
    db_session: AsyncSession,
    test_student: User,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    shared_parent_phone: str = "+992900000515"
    test_student.parent_phone = shared_parent_phone
    test_student.parent_telegram_chat_id = 7311
    sibling = User(
        email="sibling-conflict-wp15@example.com",
        first_name="Unbound",
        last_name="Sibling",
        role=UserRole.STUDENT,
        parent_phone=shared_parent_phone,
        must_set_password=False,
    )
    db_session.add(test_student)
    db_session.add(sibling)
    await db_session.commit()
    sibling_id: int = sibling.id
    observed_locked_ids: list[set[int]] = []

    async def verify_independent_writer_can_lock(
        self: Message,
        text: str,
        *args: Any,
        **kwargs: Any,
    ) -> None:
        async with AsyncSessionLocal() as independent_session:
            lock_result: Result[tuple[int]] = await independent_session.execute(
                select(User.id)
                .where(User.id.in_([test_student.id, sibling_id]))
                .order_by(User.id)
                .with_for_update(nowait=True)
            )
            observed_locked_ids.append(set(lock_result.scalars().all()))
            await independent_session.rollback()

    monkeypatch.setattr(Message, "answer", verify_independent_writer_can_lock)

    await process_contact(build_contact_message(7312, 7312, shared_parent_phone))

    await db_session.refresh(test_student)
    sibling_after = await db_session.get(User, sibling_id)
    assert sibling_after is not None
    await db_session.refresh(sibling_after)
    assert test_student.parent_telegram_chat_id == 7311
    assert sibling_after.parent_telegram_chat_id is None
    assert observed_locked_ids == [{test_student.id, sibling_id}]


@pytest.mark.asyncio
async def test_admin_can_provision_and_phone_change_clears_stale_binding(
    client: AsyncClient,
    db_session: AsyncSession,
    test_admin: User,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    headers: dict[str, str] = {
        "Authorization": f"Bearer {create_access_token(test_admin.id, UserRole.SUPERADMIN)}"
    }
    create_response = await client.post(
        "/api/v1/users/",
        headers=headers,
        json={
            "email": "wp15-admin-provision@example.com",
            "first_name": "Provisioned",
            "last_name": "Student",
            "role": "student",
            "phone": "+992900000601",
            "parent_phone": "+992900000602",
            "parent_telegram_chat_id": 7401,
        },
    )
    assert create_response.status_code == 201
    student_id = create_response.json()["id"]
    assert create_response.json()["parent_phone"] == "+992900000602"
    assert create_response.json()["parent_telegram_chat_id"] == 7401

    change_response = await client.patch(
        f"/api/v1/users/{student_id}",
        headers=headers,
        json={"parent_phone": "+992900000603"},
    )
    assert change_response.status_code == 200
    assert change_response.json()["parent_phone"] == "+992900000603"
    assert change_response.json()["parent_telegram_chat_id"] is None

    reset_response = await client.patch(
        f"/api/v1/users/{student_id}",
        headers=headers,
        json={"parent_telegram_chat_id": 7402},
    )
    assert reset_response.status_code == 200
    assert reset_response.json()["parent_telegram_chat_id"] == 7402

    clear_response = await client.patch(
        f"/api/v1/users/{student_id}",
        headers=headers,
        json={"parent_telegram_chat_id": None},
    )
    assert clear_response.status_code == 200
    assert clear_response.json()["parent_telegram_chat_id"] is None

    answers: list[tuple[int, str]] = []

    async def record_answer(self: Message, text: str, *args: Any, **kwargs: Any) -> None:
        answers.append((self.chat.id, text))

    monkeypatch.setattr(Message, "answer", record_answer)
    await process_contact(build_contact_message(7403, 7403, "+992900000603"))

    provisioned_student = await db_session.get(User, student_id)
    assert provisioned_student is not None
    await db_session.refresh(provisioned_student)
    assert provisioned_student.parent_phone == "+992900000603"
    assert provisioned_student.parent_telegram_chat_id == 7403
    assert any("успешно" in text.casefold() for _, text in answers)


@pytest.mark.asyncio
async def test_concurrent_guardian_binding_allows_one_verified_sender(
    db_session: AsyncSession,
    test_student: User,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    test_student.phone = "+992900000701"
    test_student.parent_phone = "+992900000701"
    db_session.add(test_student)
    await db_session.commit()
    answers: list[tuple[int, str]] = []
    statement_barrier: asyncio.Barrier = asyncio.Barrier(2)
    original_execute = AsyncSession.execute
    sessions_waited: set[int] = set()

    async def synchronized_execute(
        self: AsyncSession,
        statement: Any,
        *args: Any,
        **kwargs: Any,
    ) -> Any:
        statement_text = str(statement).lower()
        session_id = id(self)
        if "from users" in statement_text and session_id not in sessions_waited:
            sessions_waited.add(session_id)
            await statement_barrier.wait()
        return await original_execute(self, statement, *args, **kwargs)

    async def record_answer(self: Message, text: str, *args: Any, **kwargs: Any) -> None:
        answers.append((self.chat.id, text))

    monkeypatch.setattr(AsyncSession, "execute", synchronized_execute)
    monkeypatch.setattr(Message, "answer", record_answer)
    await asyncio.gather(
        process_contact(build_contact_message(7501, 7501, "+992900000701")),
        process_contact(build_contact_message(7502, 7502, "+992900000701")),
    )

    assert len(sessions_waited) == 2
    await db_session.refresh(test_student)
    successful_senders: set[int] = {
        chat_id for chat_id, text in answers if "успешно" in text.casefold()
    }
    answered_senders: set[int] = {chat_id for chat_id, _ in answers}
    assert successful_senders in ({7501}, {7502})
    assert len(answers) == 2
    assert answered_senders == {7501, 7502}
    assert test_student.parent_telegram_chat_id in successful_senders
