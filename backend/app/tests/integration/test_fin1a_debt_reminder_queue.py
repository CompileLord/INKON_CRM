import asyncio
from collections import Counter
from datetime import datetime, timedelta, timezone
from typing import Any
import pytest
from fastapi import HTTPException
from httpx import AsyncClient, Response
from sqlalchemy import event, select, update
from app.models.audit_log import AuditLog
from app.models.debt_reminder_notification import DebtReminderNotification
from app.models.user import User
from app.repositories.sqlalchemy.debt_reminder_repository import SQLAlchemyDebtReminderRepository
from app.services.audit_service import AuditService
from app.services.debt_reminder_service import DebtReminderService
from app.services.finance_service import FinanceService
from app.tests.integration.debt_reminder_support import (
    MutableClock, add_debt, all_reminders, bearer, create_student, days_ago,
)
from conftest import TestingSessionLocal, test_engine

REMINDERS_URL: str = "/api/v1/finance/debts/reminders"
DEBTS_URL: str = "/api/v1/finance/debts/"
CHAT_ID: int = 777001


async def post_reminders(client: AsyncClient, actor: User, student_ids: list[int]) -> Response:
    return await client.post(REMINDERS_URL, json={"student_ids": student_ids}, headers=bearer(actor))


def outcomes(response: Response) -> dict[int, str]:
    return {item["student_id"]: item["outcome"] for item in response.json()["results"]}


async def build_service(clock: MutableClock) -> tuple[DebtReminderService, Any]:
    session: Any = TestingSessionLocal()
    service: DebtReminderService = DebtReminderService(
        SQLAlchemyDebtReminderRepository(session), AuditService(session), clock
    )
    return service, session


@pytest.mark.asyncio
async def test_each_outcome_is_reported_and_only_queued_is_audited(
    client: AsyncClient, test_accountant: User, test_mentor: User
) -> None:
    queued_id: int = await create_student("queued@example.com", CHAT_ID, "ru")
    await add_debt(queued_id, test_mentor.id, "Python", "120.50", days_ago(5))
    unlinked_id: int = await create_student("unlinked@example.com")
    await add_debt(unlinked_id, test_mentor.id, "Python", "10.00", days_ago(5))
    clear_id: int = await create_student("clear@example.com", CHAT_ID, "ru")
    response: Response = await post_reminders(client, test_accountant, [queued_id, unlinked_id, clear_id, 987654])
    assert response.status_code == 200
    assert outcomes(response) == {
        queued_id: "queued", unlinked_id: "no_channel", clear_id: "no_debt", 987654: "not_found",
    }
    assert all(item["next_allowed_at"] is None for item in response.json()["results"])
    reminders: list[DebtReminderNotification] = await all_reminders()
    assert [(row.student_id, row.status) for row in reminders] == [(queued_id, "pending")]
    session: Any
    async with TestingSessionLocal() as session:
        logs: list[AuditLog] = list((await session.execute(select(AuditLog))).scalars().all())
    assert [(log.user_id, log.entity_type, log.entity_id, log.new_value) for log in logs] == [
        (test_accountant.id, "debt_reminder", queued_id, "120.50")
    ]


@pytest.mark.asyncio
async def test_second_request_within_24_hours_reports_next_allowed_time(
    client: AsyncClient, test_accountant: User, test_mentor: User
) -> None:
    student_id: int = await create_student("twice@example.com", CHAT_ID, "tg")
    await add_debt(student_id, test_mentor.id, "Python", "50.00", days_ago(3))
    assert outcomes(await post_reminders(client, test_accountant, [student_id])) == {student_id: "queued"}
    second: Response = await post_reminders(client, test_accountant, [student_id])
    assert second.status_code == 429
    assert second.json()["detail"]["code"] == "debt_reminder_rate_limited"
    created_at: datetime = (await all_reminders())[0].created_at
    assert 0 < int(second.headers["Retry-After"]) <= 86400
    assert len(await all_reminders()) == 1


@pytest.mark.asyncio
async def test_rate_limit_boundary_is_exactly_24_hours_from_previous_reminder(
    test_mentor: User, test_accountant: User
) -> None:
    student_id: int = await create_student("boundary@example.com", CHAT_ID, "en")
    await add_debt(student_id, test_mentor.id, "Python", "50.00", days_ago(3))
    start: datetime = datetime.now(timezone.utc)
    clock: MutableClock = MutableClock(start)
    steps: list[tuple[timedelta, str]] = [
        (timedelta(0), "queued"), (timedelta(hours=23, minutes=59), "recently_reminded"),
        (timedelta(hours=24), "queued"),
    ]
    delta: timedelta
    expected: str
    for delta, expected in steps:
        clock.moment = start + delta
        service: DebtReminderService
        session: Any
        service, session = await build_service(clock)
        try:
            if expected == "recently_reminded":
                error: pytest.ExceptionInfo[HTTPException]
                with pytest.raises(HTTPException) as error:
                    await service.queue([student_id], test_accountant.id)
                assert error.value.status_code == 429
            else:
                response: Any = await service.queue([student_id], test_accountant.id)
                assert response.results[0].outcome == expected
        finally:
            await session.close()
    assert len(await all_reminders()) == 2


@pytest.mark.asyncio
async def test_failed_reminders_still_count_toward_the_interval(
    client: AsyncClient, test_accountant: User, test_mentor: User
) -> None:
    student_id: int = await create_student("failed@example.com", CHAT_ID, "ru")
    await add_debt(student_id, test_mentor.id, "Python", "50.00", days_ago(3))
    assert outcomes(await post_reminders(client, test_accountant, [student_id])) == {student_id: "queued"}
    session: Any
    async with TestingSessionLocal() as session:
        await session.execute(update(DebtReminderNotification).values(status="failed"))
        await session.commit()
    assert (await post_reminders(client, test_accountant, [student_id])).status_code == 429


@pytest.mark.asyncio
async def test_concurrent_requests_for_one_student_queue_exactly_one_reminder(
    client: AsyncClient, test_accountant: User, test_mentor: User
) -> None:
    student_id: int = await create_student("race@example.com", CHAT_ID, "ru")
    await add_debt(student_id, test_mentor.id, "Python", "75.00", days_ago(4))
    responses: list[Response] = await asyncio.gather(
        *(post_reminders(client, test_accountant, [student_id]) for _ in range(12))
    )
    assert Counter(response.status_code for response in responses) == Counter({200: 1, 429: 11})
    assert len(await all_reminders()) == 1
    session: Any
    async with TestingSessionLocal() as session:
        audit_rows: list[AuditLog] = list((await session.execute(select(AuditLog))).scalars().all())
    assert len(audit_rows) == 1


@pytest.mark.asyncio
async def test_overlapping_bulk_requests_in_opposite_order_do_not_deadlock_or_duplicate(
    client: AsyncClient, test_accountant: User, test_mentor: User
) -> None:
    first_id: int = await create_student("bulk-a@example.com", CHAT_ID, "ru")
    second_id: int = await create_student("bulk-b@example.com", CHAT_ID, "ru")
    for student_id in (first_id, second_id):
        await add_debt(student_id, test_mentor.id, "Python", "30.00", days_ago(4))
    responses: list[Response] = await asyncio.gather(
        *(post_reminders(client, test_accountant, ids) for ids in ([first_id, second_id], [second_id, first_id]) * 4)
    )
    assert {response.status_code for response in responses}.issubset({200, 429})
    queued: Counter[int] = Counter(
        item["student_id"] for response in responses if response.status_code == 200 for item in response.json()["results"] if item["outcome"] == "queued"
    )
    assert queued == Counter({first_id: 1, second_id: 1})
    assert len(await all_reminders()) == 2


@pytest.mark.asyncio
async def test_debt_is_summed_over_all_enrollments(
    client: AsyncClient, test_accountant: User, test_mentor: User
) -> None:
    student_id: int = await create_student("sum@example.com", CHAT_ID, "ru")
    await add_debt(student_id, test_mentor.id, "Python", "20.00", days_ago(4))
    await add_debt(student_id, test_mentor.id, "SQL", "30.25", days_ago(4))
    assert outcomes(await post_reminders(client, test_accountant, [student_id])) == {student_id: "queued"}
    session: Any
    async with TestingSessionLocal() as session:
        amount: str | None = await session.scalar(select(AuditLog.new_value))
    assert amount == "50.25"


@pytest.mark.asyncio
@pytest.mark.parametrize("body", [
    {"student_ids": []}, {"student_ids": [1, 1]}, {"student_ids": list(range(1, 102))},
    {"student_ids": [0]}, {"student_ids": [1], "extra": 1}, {"student_ids": ["1"]}, {},
])
async def test_invalid_request_bodies_are_rejected(client: AsyncClient, test_accountant: User, body: dict[str, Any]) -> None:
    response: Response = await client.post(REMINDERS_URL, json=body, headers=bearer(test_accountant))
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_hundred_students_are_accepted(client: AsyncClient, test_accountant: User) -> None:
    response: Response = await post_reminders(client, test_accountant, list(range(5000, 5100)))
    assert response.status_code == 200
    assert set(outcomes(response).values()) == {"not_found"}


@pytest.mark.asyncio
async def test_only_accountant_roles_may_queue_reminders(
    client: AsyncClient, test_mentor: User, test_student: User, test_admin: User
) -> None:
    assert (await post_reminders(client, test_mentor, [1])).status_code == 403
    assert (await post_reminders(client, test_student, [1])).status_code == 403
    assert (await client.post(REMINDERS_URL, json={"student_ids": [1]})).status_code in (401, 403)
    assert (await post_reminders(client, test_admin, [1])).status_code == 200


@pytest.mark.asyncio
async def test_debts_list_carries_link_flag_and_last_reminder_time(
    client: AsyncClient, test_accountant: User, test_mentor: User
) -> None:
    linked_id: int = await create_student("linked@example.com", CHAT_ID, "ru")
    unlinked_id: int = await create_student("plain@example.com")
    await add_debt(linked_id, test_mentor.id, "Python", "60.00", days_ago(4))
    await add_debt(unlinked_id, test_mentor.id, "Python", "40.00", days_ago(4))
    await post_reminders(client, test_accountant, [linked_id])
    items: dict[int, dict[str, Any]] = {
        item["student"]["id"]: item
        for item in (await client.get(DEBTS_URL, headers=bearer(test_accountant))).json()["items"]
    }
    assert items[linked_id]["parent_telegram_linked"] is True
    assert datetime.fromisoformat(items[linked_id]["last_reminder_at"]) == (await all_reminders())[0].created_at
    assert items[unlinked_id]["parent_telegram_linked"] is False
    assert items[unlinked_id]["last_reminder_at"] is None


@pytest.mark.asyncio
async def test_debts_list_query_count_does_not_grow_with_page_size(
    client: AsyncClient, test_accountant: User, test_mentor: User
) -> None:
    for index in range(6):
        student_id: int = await create_student(f"many-{index}@example.com", CHAT_ID + index, "ru")
        await add_debt(student_id, test_mentor.id, f"Course {index}", "10.00", days_ago(4))
    statement_counts: list[int] = []
    page_size: int
    for page_size in (1, 6):
        captured: list[str] = []

        def record(connection: Any, cursor: Any, statement: str, *rest: Any) -> None:
            captured.append(statement)

        event.listen(test_engine.sync_engine, "before_cursor_execute", record)
        try:
            response: Response = await client.get(
                DEBTS_URL, params={"page_size": page_size}, headers=bearer(test_accountant)
            )
        finally:
            event.remove(test_engine.sync_engine, "before_cursor_execute", record)
        assert len(response.json()["items"]) == page_size
        statement_counts.append(len(captured))
    assert statement_counts[0] == statement_counts[1]


@pytest.mark.asyncio
async def test_bulk_queue_select_count_does_not_grow_with_student_count(
    client: AsyncClient, test_accountant: User, test_mentor: User
) -> None:
    student_ids: list[int] = []
    index: int
    for index in range(33):
        student_id: int = await create_student(f"bulk-count-{index}@example.com", CHAT_ID, "ru")
        await add_debt(student_id, test_mentor.id, f"Course {index}", "10.00", days_ago(4))
        student_ids.append(student_id)
    select_counts: list[int] = []
    requested_ids: list[int]
    for requested_ids in (list(reversed(student_ids[:3])), list(reversed(student_ids[3:]))):
        captured: list[str] = []

        def record(connection: Any, cursor: Any, statement: str, *rest: Any) -> None:
            if statement.lstrip().upper().startswith("SELECT"):
                captured.append(statement)

        event.listen(test_engine.sync_engine, "before_cursor_execute", record)
        try:
            response: Response = await post_reminders(client, test_accountant, requested_ids)
        finally:
            event.remove(test_engine.sync_engine, "before_cursor_execute", record)
        assert response.status_code == 200
        assert [item["student_id"] for item in response.json()["results"]] == requested_ids
        assert list(outcomes(response).values()) == ["queued"] * len(requested_ids)
        select_counts.append(len(captured))
    assert select_counts[0] >= 3
    assert select_counts[0] == select_counts[1], select_counts


@pytest.mark.asyncio
async def test_debt_list_matches_the_original_finance_service_calculation(
    client: AsyncClient, test_accountant: User, test_mentor: User
) -> None:
    for index in range(3):
        student_id: int = await create_student(f"parity-{index}@example.com", CHAT_ID, "ru")
        await add_debt(student_id, test_mentor.id, f"Course {index}", f"{10 + index}.10", days_ago(index * 20 + 2))
    reference: dict[str, Any]
    session: Any
    async with TestingSessionLocal() as session:
        reference = await FinanceService(session).get_debts({}, 1, 20)
    served: dict[str, Any] = (await client.get(DEBTS_URL, headers=bearer(test_accountant))).json()
    assert served["total"] == reference["total"] == 3
    assert served["total_pages"] == reference["total_pages"]
    comparable: list[tuple[Any, ...]] = [
        (item["student"]["id"], item["course"]["id"], item["debt"], item["overdue_days"], item["billed_to_date"])
        for item in served["items"]
    ]
    expected: list[tuple[Any, ...]] = [
        (item["student"]["id"], item["course"]["id"], format(item["debt"], ".2f"), item["overdue_days"],
         format(item["billed_to_date"], ".2f"))
        for item in reference["items"]
    ]
    assert [(a, b, str(c), d, str(e)) for a, b, c, d, e in comparable] == [(a, b, str(c), d, str(e)) for a, b, c, d, e in expected]
