from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import List

import pytest
from httpx import AsyncClient
from sqlalchemy import event, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token
from app.models.ledger import LedgerEntry, LedgerEntryType
from app.models.payment import PaymentMethod
from app.models.user import User, UserRole
from app.services.finance_service import FinanceService
from app.tests.conftest import test_engine

PAYMENTS_URL: str = "/api/v1/finance/payments/"


def authorization_headers(user: User) -> dict:
    return {"Authorization": f"Bearer {create_access_token(user.id, user.role)}"}


async def create_student(db_session: AsyncSession, first_name: str, last_name: str, email: str) -> User:
    student = User(
        email=email,
        password_hash="x",
        first_name=first_name,
        last_name=last_name,
        role=UserRole.STUDENT,
        must_set_password=False,
    )
    db_session.add(student)
    await db_session.commit()
    return student


async def create_payment_entry(db_session: AsyncSession, student: User, recorder: User, day_offset: int) -> LedgerEntry:
    entry = LedgerEntry(
        student_id=student.id,
        type=LedgerEntryType.PAYMENT,
        amount=Decimal("100.00"),
        method=PaymentMethod.CASH,
        occurred_at=datetime(2026, 9, 1, tzinfo=timezone.utc) + timedelta(days=day_offset),
        recorded_by_id=recorder.id,
    )
    db_session.add(entry)
    await db_session.commit()
    return entry


async def count_statements_for(client: AsyncClient, url: str, headers: dict) -> int:
    captured: List[str] = []

    def record(conn, cursor, statement, parameters, context, executemany) -> None:
        captured.append(statement)

    event.listen(test_engine.sync_engine, "before_cursor_execute", record)
    try:
        response = await client.get(url, headers=headers)
        assert response.status_code == 200
    finally:
        event.remove(test_engine.sync_engine, "before_cursor_execute", record)
    return len(captured)


@pytest.mark.asyncio
async def test_payment_list_items_carry_student_names(
    client: AsyncClient, db_session: AsyncSession, test_accountant: User
) -> None:
    student = await create_student(db_session, "Aziza", "Karimova", "aziza@example.com")
    await create_payment_entry(db_session, student, test_accountant, 0)

    response = await client.get(PAYMENTS_URL, headers=authorization_headers(test_accountant))

    assert response.status_code == 200
    item = response.json()["items"][0]
    assert item["student_id"] == student.id
    assert item["student_first_name"] == "Aziza"
    assert item["student_last_name"] == "Karimova"


@pytest.mark.asyncio
async def test_soft_deleted_student_payments_keep_the_student_name(
    client: AsyncClient, db_session: AsyncSession, test_accountant: User
) -> None:
    student = await create_student(db_session, "Gone", "Student", "gone@example.com")
    await create_payment_entry(db_session, student, test_accountant, 0)
    await db_session.execute(update(User).where(User.id == student.id).values(is_deleted=True))
    await db_session.commit()

    response = await client.get(PAYMENTS_URL, headers=authorization_headers(test_accountant))

    assert response.status_code == 200
    item = response.json()["items"][0]
    assert item["student_id"] == student.id
    assert item["student_first_name"] == "Gone"
    assert item["student_last_name"] == "Student"


@pytest.mark.asyncio
async def test_unknown_student_row_yields_null_names_without_error(
    client: AsyncClient, db_session: AsyncSession, test_accountant: User
) -> None:
    student = await create_student(db_session, "Ghost", "Student", "ghost@example.com")
    entry = await create_payment_entry(db_session, student, test_accountant, 0)
    original_decorate = FinanceService._decorate_entries

    async def decorate_with_vanished_user(self: FinanceService, entries: list) -> list:
        for ledger_entry in entries:
            self.db.expunge(ledger_entry)
            ledger_entry.student_id = 999999
        return await original_decorate(self, entries)

    with pytest.MonkeyPatch.context() as patch:
        patch.setattr(FinanceService, "_decorate_entries", decorate_with_vanished_user)
        response = await client.get(PAYMENTS_URL, headers=authorization_headers(test_accountant))

    assert response.status_code == 200
    item = response.json()["items"][0]
    assert item["id"] == entry.id
    assert item["student_first_name"] is None
    assert item["student_last_name"] is None


@pytest.mark.asyncio
async def test_statement_count_does_not_grow_with_page_size(
    client: AsyncClient, db_session: AsyncSession, test_accountant: User
) -> None:
    for index in range(8):
        student = await create_student(db_session, f"First{index}", f"Last{index}", f"s{index}@example.com")
        await create_payment_entry(db_session, student, test_accountant, index)
    headers = authorization_headers(test_accountant)

    small_page_count = await count_statements_for(client, f"{PAYMENTS_URL}?page=1&page_size=2", headers)
    large_page_count = await count_statements_for(client, f"{PAYMENTS_URL}?page=1&page_size=8", headers)

    assert small_page_count == large_page_count


@pytest.mark.asyncio
async def test_mentor_and_student_remain_denied(
    client: AsyncClient, test_mentor: User, test_student: User
) -> None:
    assert (await client.get(PAYMENTS_URL, headers=authorization_headers(test_mentor))).status_code == 403
    assert (await client.get(PAYMENTS_URL, headers=authorization_headers(test_student))).status_code == 403
