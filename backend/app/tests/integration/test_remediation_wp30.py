from app.repositories.sqlalchemy.notification_log_repository import SQLAlchemyNotificationLogRepository
import asyncio
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock
import pytest
from sqlalchemy import Row, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from app.repositories.interfaces.notification_log_repository import NotificationClaim
from app.models.notification_log import NotificationLog, NotificationType
from app.services.notification_service import NotificationService
from app.tests.conftest import TestingSessionLocal
from app.workers import tasks
from app.tests.integration.wp30_delivery_support import DeliveryFixture


@pytest.mark.asyncio
@pytest.mark.parametrize("starting_status,score", [("failed", None), ("sent", 10)])
async def test_independent_workers_claim_failed_or_revised_row_once(
    db_session: AsyncSession, starting_status: str, score: int | None
) -> None:
    log: NotificationLog = NotificationLog(
        recipient="998877",
        type=NotificationType.EXAM_RESULT,
        related_entity_id=41,
        notification_date=DeliveryFixture.notification_date,
        status=starting_status,
        attempts=1,
        error_message="score:5" if score is not None else None,
    )
    db_session.add(log)
    await db_session.commit()
    barrier: asyncio.Barrier = asyncio.Barrier(2)
    entered: asyncio.Event = asyncio.Event()
    release: asyncio.Event = asyncio.Event()
    sends: list[bool] = []

    async def send(is_update: bool) -> None:
        sends.append(is_update)
        entered.set()
        await release.wait()

    async def revised() -> bool:
        return True

    async def worker() -> bool:
        async with TestingSessionLocal() as session:
            await barrier.wait()
            return await NotificationService(
                SQLAlchemyNotificationLogRepository(session)
            ).send_notification_with_idempotency(
                "998877",
                NotificationType.EXAM_RESULT,
                41,
                DeliveryFixture.notification_date,
                send,
                check_revision_func=revised,
                score_val=score,
            )

    workers: list[asyncio.Task[bool]] = [asyncio.create_task(worker()), asyncio.create_task(worker())]
    await asyncio.wait_for(entered.wait(), 5)
    await asyncio.sleep(0.1)
    release.set()
    results: list[bool] = await asyncio.gather(*workers)
    assert sorted(results) == [False, True]
    assert len(sends) == 1
    assert (await DeliveryFixture.load()).status == "sent"


@pytest.mark.asyncio
async def test_expired_claim_recovered_and_stale_owner_cannot_finalize(db_session: AsyncSession) -> None:
    notification_id: int
    revision: int
    notification_id, revision = await DeliveryFixture.reserve(
        NotificationService(SQLAlchemyNotificationLogRepository(db_session))
    )
    service: NotificationService = NotificationService(SQLAlchemyNotificationLogRepository(db_session))
    old_claim: NotificationClaim | None = await service.claim_notification(notification_id, revision)
    assert old_claim is not None
    await db_session.execute(
        update(NotificationLog).values(lease_expires_at=datetime.now(timezone.utc) - timedelta(seconds=1))
    )
    await db_session.commit()
    async with TestingSessionLocal() as session:
        replacement: NotificationService = NotificationService(SQLAlchemyNotificationLogRepository(session))
        new_claim: NotificationClaim | None = await replacement.claim_notification(notification_id, revision)
        assert new_claim is not None
        assert new_claim.claim_token != old_claim.claim_token
        assert await service.finalize_notification(old_claim, None) is False
        assert await replacement.finalize_notification(new_claim, None) is True
    assert (await DeliveryFixture.load()).attempts == 2


@pytest.mark.asyncio
async def test_expired_claims_have_finite_attempts(db_session: AsyncSession) -> None:
    notification_id: int
    revision: int
    notification_id, revision = await DeliveryFixture.reserve(
        NotificationService(SQLAlchemyNotificationLogRepository(db_session))
    )
    service: NotificationService = NotificationService(SQLAlchemyNotificationLogRepository(db_session))
    attempt: int
    for attempt in range(3):
        claim: NotificationClaim | None = await service.claim_notification(notification_id, revision)
        assert claim is not None
        await db_session.execute(
            update(NotificationLog).values(lease_expires_at=datetime.now(timezone.utc) - timedelta(seconds=1))
        )
        await db_session.commit()
    assert await service.claim_notification(notification_id, revision) is None
    exhausted: NotificationLog = await DeliveryFixture.load()
    assert exhausted.attempts == 3
    assert exhausted.status == "failed"


@pytest.mark.asyncio
async def test_revision_rejects_old_queued_task(db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch) -> None:
    old_id: int
    old_revision: int
    new_id: int
    new_revision: int
    old_id, old_revision = await DeliveryFixture.reserve(
        NotificationService(SQLAlchemyNotificationLogRepository(db_session)), 10
    )
    new_id, new_revision = await DeliveryFixture.reserve(
        NotificationService(SQLAlchemyNotificationLogRepository(db_session)), 20
    )
    assert old_id == new_id
    assert new_revision > old_revision
    sender: AsyncMock = AsyncMock()
    monkeypatch.setattr(tasks.bot, "send_message", sender)
    await tasks.send_telegram_message({}, 998877, "old", notification_id=old_id, revision=old_revision)
    sender.assert_not_awaited()
    await tasks.send_telegram_message({}, 998877, "new", notification_id=new_id, revision=new_revision)
    sender.assert_awaited_once_with(998877, "new")


@pytest.mark.asyncio
async def test_expired_owner_cannot_finalize_without_replacement(db_session: AsyncSession) -> None:
    notification_id: int
    revision: int
    notification_id, revision = await DeliveryFixture.reserve(
        NotificationService(SQLAlchemyNotificationLogRepository(db_session))
    )
    service: NotificationService = NotificationService(SQLAlchemyNotificationLogRepository(db_session))
    claim: NotificationClaim | None = await service.claim_notification(notification_id, revision)
    assert claim is not None
    await db_session.execute(
        update(NotificationLog).values(lease_expires_at=datetime.now(timezone.utc) - timedelta(seconds=1))
    )
    await db_session.commit()
    assert await service.finalize_notification(claim, None) is False
    assert (await DeliveryFixture.load()).status == "failed"


@pytest.mark.asyncio
async def test_claim_revision_guard_rejects_matching_token_for_wrong_revision(db_session: AsyncSession) -> None:
    from dataclasses import replace

    notification_id: int
    revision: int
    notification_id, revision = await DeliveryFixture.reserve(
        NotificationService(SQLAlchemyNotificationLogRepository(db_session))
    )
    service: NotificationService = NotificationService(SQLAlchemyNotificationLogRepository(db_session))
    claim: NotificationClaim | None = await service.claim_notification(notification_id, revision)
    assert claim is not None
    assert await service.finalize_notification(replace(claim, revision=revision + 1), None) is False
    assert await service.finalize_notification(claim, None) is True


@pytest.mark.asyncio
async def test_nullable_expand_columns_are_normalized_at_claim_boundary(
    db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    notification_id: int
    revision: int
    notification_id, revision = await DeliveryFixture.reserve(
        NotificationService(SQLAlchemyNotificationLogRepository(db_session))
    )
    await db_session.execute(update(NotificationLog).values(revision=None, is_terminal=None))
    await db_session.commit()
    sender: AsyncMock = AsyncMock()
    monkeypatch.setattr(tasks.bot, "send_message", sender)
    await tasks.send_telegram_message({}, 998877, "message", notification_id, revision)
    sender.assert_awaited_once_with(998877, "message")
    delivered: NotificationLog = await DeliveryFixture.load()
    assert delivered.status == "sent"
    assert delivered.revision == 1
    assert delivered.is_terminal is False


@pytest.mark.asyncio
async def test_exhaustion_sweep_is_bounded_and_does_not_rewrite_failed_rows(db_session: AsyncSession) -> None:
    from sqlalchemy import text

    log: NotificationLog
    index: int
    for index in range(3):
        log = NotificationLog(
            recipient=str(998877 + index),
            type=NotificationType.PAYMENT_REMINDER_1D,
            related_entity_id=41,
            notification_date=DeliveryFixture.notification_date,
            status="failed",
            delivery_state="inflight",
            attempts=3,
            lease_expires_at=datetime.now(timezone.utc) - timedelta(seconds=1),
            claim_token=f"expired-{index}",
            delivery_text="message",
        )
        db_session.add(log)
    await db_session.commit()
    repository: SQLAlchemyNotificationLogRepository = SQLAlchemyNotificationLogRepository(db_session)
    assert await repository.recoverable(datetime.now(timezone.utc), 2, 3) == []
    await repository.commit()
    first: list[Row[tuple[int, str, str]]] = list(
        (
            await db_session.execute(text("SELECT id, delivery_state, xmin::text FROM notification_logs ORDER BY id"))
        ).all()
    )
    assert [row[1] for row in first] == ["failed", "failed", "inflight"]
    assert await repository.recoverable(datetime.now(timezone.utc), 2, 3) == []
    await repository.commit()
    second: list[Row[tuple[int, str, str]]] = list(
        (
            await db_session.execute(text("SELECT id, delivery_state, xmin::text FROM notification_logs ORDER BY id"))
        ).all()
    )
    assert [row[1] for row in second] == ["failed", "failed", "failed"]
    assert first[:2] == second[:2]
    assert await repository.recoverable(datetime.now(timezone.utc), 2, 3) == []
    await repository.commit()
    third: list[Row[tuple[int, str, str]]] = list(
        (
            await db_session.execute(text("SELECT id, delivery_state, xmin::text FROM notification_logs ORDER BY id"))
        ).all()
    )
    assert second == third


@pytest.mark.asyncio
async def test_blocked_exhaustion_update_preserves_concurrently_renewed_owner(db_session: AsyncSession) -> None:
    from sqlalchemy import text

    row: NotificationLog = NotificationLog(
        recipient="998877",
        type=NotificationType.EXAM_RESULT,
        related_entity_id=41,
        notification_date=DeliveryFixture.notification_date,
        status="failed",
        delivery_state="inflight",
        attempts=3,
        claim_token="expired-owner",
        lease_expires_at=datetime.now(timezone.utc) - timedelta(seconds=1),
        delivery_text="message",
    )
    db_session.add(row)
    await db_session.commit()
    barrier: asyncio.Barrier = asyncio.Barrier(2)
    waiter_pid: asyncio.Future[int] = asyncio.get_running_loop().create_future()

    async def sweep() -> list[NotificationLog]:
        async with TestingSessionLocal() as session:
            process_id: int = (await session.execute(text("SELECT pg_backend_pid()"))).scalar_one()
            waiter_pid.set_result(process_id)
            await barrier.wait()
            result: list[NotificationLog] = await SQLAlchemyNotificationLogRepository(session).recoverable(
                datetime.now(timezone.utc), 100, 3
            )
            await session.commit()
            return result

    async with TestingSessionLocal() as owner:
        await owner.execute(select(NotificationLog).where(NotificationLog.id == row.id).with_for_update())
        waiter: asyncio.Task[list[NotificationLog]] = asyncio.create_task(sweep())
        await barrier.wait()
        process_id: int = await waiter_pid
        blocked: bool = False
        async with TestingSessionLocal() as monitor:
            async with asyncio.timeout(5):
                while not blocked:
                    wait_type: str | None = (
                        await monitor.execute(
                            text("SELECT wait_event_type FROM pg_stat_activity WHERE pid=:pid"), {"pid": process_id}
                        )
                    ).scalar_one_or_none()
                    blocked = wait_type == "Lock"
                    if not blocked:
                        await asyncio.sleep(0.01)
        assert blocked
        await owner.execute(
            update(NotificationLog)
            .where(NotificationLog.id == row.id)
            .values(
                revision=2,
                attempts=1,
                delivery_state="inflight",
                claim_token="new-owner",
                lease_expires_at=datetime.now(timezone.utc) + timedelta(seconds=90),
            )
        )
        await owner.commit()
        assert await asyncio.wait_for(waiter, 5) == []
    renewed: NotificationLog = await DeliveryFixture.load()
    assert renewed.delivery_state == "inflight"
    assert renewed.claim_token == "new-owner"
    assert renewed.attempts == 1
    assert renewed.revision == 2
