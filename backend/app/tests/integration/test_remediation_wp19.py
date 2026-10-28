import asyncio
from collections.abc import AsyncIterator
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

import pytest
import pytest_asyncio
from redis.exceptions import ConnectionError as RedisConnectionError
from sqlalchemy import delete, select, text
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine

import app.services.finance_service as finance_module
from app.models.charge import Charge, ChargeStatus
from app.models.course import Course, CourseExamType
from app.models.enrollment import Enrollment
from app.models.ledger import LedgerEntry
from app.models.payment import PaymentMethod
from app.models.user import User
from app.schemas.ledger import (
    AdjustmentCreatePayload,
    AllocationCreatePayload,
    DiscountCreatePayload,
    RefundPaymentPayload,
    VoidPaymentPayload,
)
from app.services.enrollment_service import EnrollmentService
from app.services.finance_service import FinanceService
from app.tests.conftest import RedisNamespaceClient, TEST_DATABASE_URL, TestingSessionLocal


@dataclass(frozen=True)
class FinanceScenario:
    student_id: int
    course_id: int
    enrollment_id: int
    charge_id: int
    admin: User

    async def payment(self, session: AsyncSession, amount: str = "10.00") -> LedgerEntry:
        return await FinanceService(session).create_payment(
            self.student_id, self.course_id, Decimal(amount), datetime.now(timezone.utc),
            PaymentMethod.CASH, None, self.admin,
        )

    async def analytics(self) -> dict[str, object]:
        session: AsyncSession
        async with TestingSessionLocal() as session:
            return await FinanceService(session).get_analytics(date(2020, 1, 1), date(2099, 12, 31))


class RedisProbe:
    def __init__(self, client: RedisNamespaceClient) -> None:
        self.client: RedisNamespaceClient = client
        self.calls: list[str] = []
        self.network_calls: list[str] = []
        self.owned_cache_keys: set[str] = set()
        self.get_keys: list[str] = []
        self.set_keys: list[str] = []
        self.denied: bool = False
        self.outage: bool = False
        self.paused_task: asyncio.Task[dict[str, object]] | None = None
        self.pause_operation: str | None = None
        self.paused: asyncio.Event = asyncio.Event()
        self.proceed: asyncio.Event = asyncio.Event()

    async def _record(self, operation: str) -> None:
        self.network_calls.append(operation)
        if operation in {"get", "set", "scan", "delete"}:
            self.calls.append(operation)
        if self.denied:
            raise AssertionError("Redis accessed while a student account transaction is locked")
        if self.outage:
            raise RedisConnectionError("disposable Redis outage")
        if operation == self.pause_operation and asyncio.current_task() is self.paused_task:
            self.paused.set()
            await asyncio.wait_for(self.proceed.wait(), timeout=15)

    async def get(self, key: str) -> str | None:
        self.get_keys.append(key)
        await self._record("recheck" if key in self.owned_cache_keys else "get")
        return await self.client.get(key)

    async def set(self, key: str, value: str, **options: object) -> bool | None:
        await self._record("lease" if options.get("nx") else "set")
        if not options.get("nx"):
            self.set_keys.append(key)
        acquired: bool | None = await self.client.set(key, value, **options)
        if acquired and options.get("nx"):
            self.owned_cache_keys.add(key.removesuffix(":lease"))
        return acquired

    async def eval(self, script: str, numkeys: int, *keys_and_args: str | int) -> object:
        if numkeys == 2:
            self.set_keys.append(str(keys_and_args[1]))
            await self._record("set")
        else:
            await self._record("release")
        result: object = await self.client.eval(script, numkeys, *keys_and_args)
        if numkeys == 1:
            self.owned_cache_keys.discard(str(keys_and_args[0]).removesuffix(":lease"))
        return result

    async def scan(self, cursor: int = 0, match: str | None = None, count: int | None = None) -> tuple[int, list[str]]:
        await self._record("scan")
        return await self.client.scan(cursor=cursor, match=match, count=count)

    async def delete(self, *keys: str) -> int:
        await self._record("delete")
        return await self.client.delete(*keys)


@pytest_asyncio.fixture
async def scenario(db_session: AsyncSession, test_admin: User, test_mentor: User, test_student: User) -> FinanceScenario:
    today: date = date.today()
    start_date: date = today.replace(day=1)
    fourth_month_index: int = start_date.year * 12 + start_date.month - 1 + 3
    end_date: date = date(fourth_month_index // 12, fourth_month_index % 12 + 1, 1) - timedelta(days=1)
    course: Course = Course(
        title="Generation race", description="Transactional analytics", mentor_id=test_mentor.id,
        price=Decimal("100.00"), start_date=start_date, end_date=end_date,
        exam_type=CourseExamType.MONTHLY,
    )
    db_session.add(course)
    await db_session.flush()
    enrollment: Enrollment = await EnrollmentService(db_session).enroll_student(test_student.id, course.id, test_admin)
    charge_id: int = (await db_session.scalars(select(Charge.id).where(Charge.enrollment_id == enrollment.id).order_by(Charge.id))).first()
    await db_session.commit()
    return FinanceScenario(test_student.id, course.id, enrollment.id, charge_id, test_admin)


@pytest.fixture
async def cache_probe(monkeypatch: pytest.MonkeyPatch) -> AsyncIterator[RedisProbe]:
    probe: RedisProbe = RedisProbe(finance_module.redis_client)
    monkeypatch.setattr(finance_module, "redis_client", probe)
    yield probe
    probe.proceed.set()


@pytest.mark.asyncio
@pytest.mark.parametrize("commit_writer", [True, False])
async def test_precommit_reader_cannot_poison_committed_analytics(
    scenario: FinanceScenario, cache_probe: RedisProbe, commit_writer: bool,
) -> None:
    ready: asyncio.Event = asyncio.Event()
    commit_gate: asyncio.Event = asyncio.Event()

    async def writer() -> None:
        session: AsyncSession
        async with TestingSessionLocal() as session:
            await scenario.payment(session)
            ready.set()
            await asyncio.wait_for(commit_gate.wait(), timeout=15)
            if commit_writer:
                await session.commit()
            else:
                await session.rollback()

    task: asyncio.Task[None] = asyncio.create_task(writer())
    try:
        await asyncio.wait_for(ready.wait(), timeout=15)
        before_commit: dict[str, object] = await scenario.analytics()
        assert before_commit["collected_in_period"] == "0.00"
    finally:
        commit_gate.set()
    await asyncio.wait_for(task, timeout=15)
    after_commit: dict[str, object] = await scenario.analytics()
    assert after_commit["collected_in_period"] == ("10.00" if commit_writer else "0.00")
    assert "scan" not in cache_probe.calls


@pytest.mark.asyncio
@pytest.mark.parametrize("pause_operation", ["get", "set"])
async def test_delayed_reader_keeps_original_generation_key(
    scenario: FinanceScenario, cache_probe: RedisProbe, pause_operation: str,
) -> None:
    session: AsyncSession
    cache_probe.pause_operation = pause_operation
    reader: asyncio.Task[dict[str, object]] = asyncio.create_task(scenario.analytics())
    cache_probe.paused_task = reader
    try:
        await asyncio.wait_for(cache_probe.paused.wait(), timeout=15)
        original_key: str = cache_probe.get_keys[0]
        async with TestingSessionLocal() as session:
            await scenario.payment(session)
            await session.commit()
    finally:
        cache_probe.proceed.set()
    await asyncio.wait_for(reader, timeout=15)
    current: dict[str, object] = await scenario.analytics()
    assert current["collected_in_period"] == "10.00"
    assert cache_probe.get_keys[-1] != original_key
    assert cache_probe.set_keys[0] == original_key
    assert "scan" not in cache_probe.calls


@pytest.mark.asyncio
async def test_own_uncommitted_mutation_never_reads_or_publishes_shared_cache(
    scenario: FinanceScenario, cache_probe: RedisProbe,
) -> None:
    session: AsyncSession
    await scenario.analytics()
    cache_probe.calls.clear()
    cache_probe.network_calls.clear()
    async with TestingSessionLocal() as session:
        await scenario.payment(session)
        own_result: dict[str, object] = await FinanceService(session).get_analytics(date(2020, 1, 1), date(2099, 12, 31))
        assert own_result["collected_in_period"] == "10.00"
        assert cache_probe.calls == []
        assert cache_probe.network_calls == []
        await session.rollback()
        await scenario.payment(session, "20.00")
        await session.commit()
        cache_probe.calls.clear()
        committed_result: dict[str, object] = await FinanceService(session).get_analytics(date(2020, 1, 1), date(2099, 12, 31))
        assert committed_result["collected_in_period"] == "20.00"
        assert cache_probe.calls == ["get", "set"]


@pytest.mark.asyncio
async def test_account_lock_bypasses_redis_and_cache_outage_does_not_abort_finance(
    scenario: FinanceScenario, cache_probe: RedisProbe,
) -> None:
    session: AsyncSession
    cache_probe.denied = True
    async with TestingSessionLocal() as session:
        await FinanceService(session).lock_student_accounts([scenario.student_id])
        locked_read: dict[str, object] = await FinanceService(session).get_analytics(date(2020, 1, 1), date(2099, 12, 31))
        assert locked_read["collected_in_period"] == "0.00"
        await scenario.payment(session)
        await session.commit()
    assert cache_probe.calls == []
    assert cache_probe.network_calls == []
    cache_probe.denied = False
    cache_probe.outage = True
    result: dict[str, object] = await scenario.analytics()
    assert result["collected_in_period"] == "10.00"


@pytest.mark.asyncio
@pytest.mark.parametrize("commit_first", [True, False])
async def test_generation_advance_is_atomic_committed_and_rollback_safe(scenario: FinanceScenario, commit_first: bool) -> None:
    from app.repositories.sqlalchemy.cache_generation_repository import SQLAlchemyCacheGenerationRepository

    first: AsyncSession
    second: AsyncSession
    reader: AsyncSession
    async with TestingSessionLocal() as first, TestingSessionLocal() as second, TestingSessionLocal() as reader:
        first_repo: SQLAlchemyCacheGenerationRepository = SQLAlchemyCacheGenerationRepository(first)
        second_repo: SQLAlchemyCacheGenerationRepository = SQLAlchemyCacheGenerationRepository(second)
        reader_repo: SQLAlchemyCacheGenerationRepository = SQLAlchemyCacheGenerationRepository(reader)
        original: int = await reader_repo.read_committed_generation()
        second_pid: int = await second.scalar(text("SELECT pg_backend_pid()"))
        await first_repo.advance()
        assert await reader_repo.read_committed_generation() == original
        second_started: asyncio.Event = asyncio.Event()

        async def advance_second() -> None:
            second_started.set()
            await second_repo.advance()
            await second.commit()

        waiter: asyncio.Task[None] = asyncio.create_task(advance_second())
        await asyncio.wait_for(second_started.wait(), timeout=15)

        async def wait_until_database_reports_blocking() -> None:
            while not await reader.scalar(text("SELECT cardinality(pg_blocking_pids(:pid)) > 0"), {"pid": second_pid}):
                await asyncio.sleep(0)

        await asyncio.wait_for(wait_until_database_reports_blocking(), timeout=15)
        if commit_first:
            await first.commit()
        else:
            await first.rollback()
        await asyncio.wait_for(waiter, timeout=15)
        assert await reader_repo.read_committed_generation() == original + (2 if commit_first else 1)
        await first_repo.advance()
        await first.commit()
        assert await reader_repo.read_committed_generation() == original + (3 if commit_first else 2)


@pytest.mark.asyncio
@pytest.mark.parametrize("workflow", [
    "payment", "discount", "adjustment", "void", "refund_wallet", "refund_cash",
    "allocation", "auto_allocation", "schedule", "enrollment", "withdrawal", "charge_status",
])
async def test_all_finance_mutations_advance_generation_without_redis(
    scenario: FinanceScenario, cache_probe: RedisProbe, workflow: str,
) -> None:
    from app.repositories.sqlalchemy.cache_generation_repository import SQLAlchemyCacheGenerationRepository

    session: AsyncSession
    observer: AsyncSession
    payment: LedgerEntry | None = None
    async with TestingSessionLocal() as session, TestingSessionLocal() as observer:
        service: FinanceService = FinanceService(session)
        if workflow in {"void", "refund_wallet", "refund_cash", "allocation", "auto_allocation"}:
            payment = await scenario.payment(session)
            await session.commit()
        if workflow in {"allocation", "auto_allocation"}:
            await service.refund_payment(payment.id, RefundPaymentPayload(amount=Decimal("10.00"), to_wallet=True, reason_code="setup"), scenario.admin)
            await session.commit()
        if workflow == "schedule":
            await session.execute(delete(Charge).where(Charge.enrollment_id == scenario.enrollment_id))
            await session.commit()
        if workflow == "charge_status":
            charge: Charge | None = await session.get(Charge, scenario.charge_id)
            charge.status = ChargeStatus.SETTLED
            await session.commit()
        generation_repo: SQLAlchemyCacheGenerationRepository = SQLAlchemyCacheGenerationRepository(observer)
        original: int = await generation_repo.read_committed_generation()
        await scenario.analytics()
        cache_probe.calls.clear()
        cache_probe.denied = True
        if workflow == "payment":
            await scenario.payment(session)
        elif workflow == "discount":
            await service.create_discount(DiscountCreatePayload(student_id=scenario.student_id, amount=Decimal("1.00")), scenario.admin)
        elif workflow == "adjustment":
            await service.create_adjustment(AdjustmentCreatePayload(student_id=scenario.student_id, amount=Decimal("1.00"), reason_code="generation"), scenario.admin)
        elif workflow == "void":
            await service.void_payment(payment.id, VoidPaymentPayload(reason_code="generation"), scenario.admin)
        elif workflow in {"refund_wallet", "refund_cash"}:
            await service.refund_payment(payment.id, RefundPaymentPayload(amount=Decimal("1.00"), to_wallet=workflow == "refund_wallet", reason_code="generation"), scenario.admin)
        elif workflow == "allocation":
            target_id: int | None = await session.scalar(select(Charge.id).where(Charge.enrollment_id == scenario.enrollment_id, Charge.status == ChargeStatus.OPEN).order_by(Charge.id))
            await service.allocate_credit(AllocationCreatePayload(student_id=scenario.student_id, charge_id=target_id, amount=Decimal("1.00")), scenario.admin)
        elif workflow == "auto_allocation":
            await service.auto_allocate_student_credit(scenario.student_id)
        elif workflow == "schedule":
            await service.generate_schedule_for_enrollment(scenario.enrollment_id)
        elif workflow == "enrollment":
            original_course: Course | None = await session.get(Course, scenario.course_id)
            new_course: Course = Course(title="Additional", description="Generation", mentor_id=original_course.mentor_id, price=Decimal("10.00"), start_date=original_course.start_date, end_date=original_course.end_date, exam_type=CourseExamType.MONTHLY)
            session.add(new_course)
            await session.flush()
            await EnrollmentService(session).enroll_student(scenario.student_id, new_course.id, scenario.admin)
        elif workflow == "withdrawal":
            await EnrollmentService(session).withdraw_student(scenario.enrollment_id)
        else:
            await service.lock_student_accounts([scenario.student_id])
            await service._recompute_charge_status([scenario.charge_id])
        assert cache_probe.calls == []
        assert await generation_repo.read_committed_generation() == original
        await session.commit()
        assert await generation_repo.read_committed_generation() == original + 1
        cache_probe.denied = False
        await scenario.analytics()
        assert cache_probe.calls == ["get", "set"]


@pytest.mark.asyncio
async def test_savepoint_rollback_does_not_suppress_later_generation_advance(scenario: FinanceScenario) -> None:
    from app.repositories.sqlalchemy.cache_generation_repository import SQLAlchemyCacheGenerationRepository
    from sqlalchemy.ext.asyncio import AsyncSessionTransaction

    session: AsyncSession
    async with TestingSessionLocal() as session:
        repository: SQLAlchemyCacheGenerationRepository = SQLAlchemyCacheGenerationRepository(session)
        original: int = await repository.read_committed_generation()
        await session.rollback()
        await session.begin()
        savepoint: AsyncSessionTransaction = await session.begin_nested()
        await repository.advance()
        await savepoint.rollback()
        assert not repository.can_use_shared_cache()
        await repository.advance()
        await session.commit()
        assert repository.can_use_shared_cache()
        assert await repository.read_committed_generation() == original + 1


@pytest.mark.asyncio
async def test_analytics_uses_existing_auth_checkout_in_a_single_connection_pool(scenario: FinanceScenario) -> None:
    engine: AsyncEngine = create_async_engine(TEST_DATABASE_URL, pool_size=1, max_overflow=0, pool_timeout=0.5)
    sessions: async_sessionmaker[AsyncSession] = async_sessionmaker(engine, expire_on_commit=False, autoflush=False)
    session: AsyncSession
    try:
        async with sessions() as session:
            await session.get(User, scenario.admin.id)
            result: dict[str, object] = await asyncio.wait_for(
                FinanceService(session).get_analytics(date(2020, 1, 1), date(2099, 12, 31)), timeout=3,
            )
            assert result["gross_contract_value"] == "300.00"
    finally:
        await engine.dispose()
