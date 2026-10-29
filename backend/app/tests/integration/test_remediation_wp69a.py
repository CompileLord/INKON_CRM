import asyncio
import os
import subprocess
import sys
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path
from typing import Any

import pytest
from httpx import AsyncClient, Response
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token
from app.models.allocation import Allocation
from app.models.audit_log import AuditLog
from app.models.enrollment import Enrollment
from app.models.ledger import LedgerEntry, LedgerEntryType
from app.models.outbox_event import OutboxEvent
from app.models.user import User, UserRole
from app.services.payment_idempotency_service import PaymentIdempotencyService
from app.tests.migrations.test_migration_chain import DisposableMigrationDatabase

PAYMENTS_URL: str = "/api/v1/finance/payments/"
IDEMPOTENCY_HEADER: str = "Idempotency-Key"
BACKEND_ROOT: str = str(Path(__file__).resolve().parents[3])
INDEX_NAME: str = "uq_ledger_recorder_idempotency_key"


class PaymentWorld:
    def __init__(self, client: AsyncClient, admin: User, accountant: User, mentor_id: int) -> None:
        self.client: AsyncClient = client
        self.admin_headers: dict[str, str] = PaymentWorld.headers(admin)
        self.accountant: User = accountant
        self.mentor_id: int = mentor_id
        self.paid_at: str = datetime.now(timezone.utc).replace(microsecond=0).isoformat()

    @staticmethod
    def headers(user: User, key: str | None = None) -> dict[str, str]:
        result: dict[str, str] = {"Authorization": f"Bearer {create_access_token(user.id, user.role)}"}
        if key is not None:
            result[IDEMPOTENCY_HEADER] = key
        return result

    async def student(self, email: str) -> int:
        response: Response = await self.client.post(
            "/api/v1/users/",
            json={"email": email, "first_name": "Idem", "last_name": "Potent", "role": "student", "phone": f"+99290{abs(hash(email)) % 10_000_000:07d}", "payment_day_of_month": 1},
            headers=self.admin_headers,
        )
        assert response.status_code == 201
        return int(response.json()["id"])

    async def course(self, title: str, price: str = "600.00") -> int:
        today: date = date.today()
        response: Response = await self.client.post(
            "/api/v1/courses/",
            json={
                "title": title, "description": "Course", "start_date": today.replace(day=1).isoformat(),
                "end_date": (today.replace(day=28) + timedelta(days=40)).isoformat(), "exam_type": "weekly",
                "price": price, "mentor_id": self.mentor_id,
                "schedules": [{"day_of_week": 1, "time_start": "10:00:00", "time_end": "12:00:00"}],
            },
            headers=self.admin_headers,
        )
        assert response.status_code == 201
        return int(response.json()["id"])

    async def enroll(self, student_id: int, course_id: int) -> None:
        response: Response = await self.client.post(
            "/api/v1/enrollments/", json={"student_id": student_id, "course_id": course_id}, headers=self.admin_headers
        )
        assert response.status_code == 201

    def payload(self, student_id: int, course_id: int, overrides: dict[str, Any] | None = None) -> dict[str, Any]:
        body: dict[str, Any] = {
            "student_id": student_id, "course_id": course_id, "amount": "150.00",
            "paid_at": self.paid_at, "method": "cash", "comment": "first",
        }
        body.update(overrides or {})
        return body

    async def pay(self, body: dict[str, Any], key: str | None, recorder: User | None = None) -> Response:
        return await self.client.post(PAYMENTS_URL, json=body, headers=PaymentWorld.headers(recorder or self.accountant, key))


class LedgerCounts:
    @staticmethod
    async def snapshot(session: AsyncSession) -> dict[str, Any]:
        payments: int = (await session.execute(select(func.count()).select_from(LedgerEntry).filter(LedgerEntry.type == LedgerEntryType.PAYMENT))).scalar_one()
        allocated: Decimal = (await session.execute(select(func.coalesce(func.sum(Allocation.amount), 0)))).scalar_one()
        allocations: int = (await session.execute(select(func.count()).select_from(Allocation))).scalar_one()
        audits: int = (await session.execute(select(func.count()).select_from(AuditLog))).scalar_one()
        outbox: int = (await session.execute(select(func.count()).select_from(OutboxEvent))).scalar_one()
        return {"payments": payments, "allocated": Decimal(allocated), "allocations": allocations, "audits": audits, "outbox": outbox}


@pytest.fixture
def world(client: AsyncClient, test_admin: User, test_accountant: User, test_mentor: User) -> PaymentWorld:
    return PaymentWorld(client, test_admin, test_accountant, test_mentor.id)


@pytest.mark.asyncio
async def test_same_key_and_payload_returns_the_original_without_new_side_effects(world: PaymentWorld, db_session: AsyncSession) -> None:
    student_id: int = await world.student("replay@example.com")
    course_id: int = await world.course("Replay")
    await world.enroll(student_id, course_id)
    body: dict[str, Any] = world.payload(student_id, course_id)

    first: Response = await world.pay(body, "attempt-1")
    after_first: dict[str, Any] = await LedgerCounts.snapshot(db_session)
    second: Response = await world.pay(body, "attempt-1")
    after_second: dict[str, Any] = await LedgerCounts.snapshot(db_session)

    assert first.status_code == 201
    assert second.status_code == 200
    assert second.json() == first.json()
    assert after_first["payments"] == 1
    assert after_first["allocated"] == Decimal("150.00")
    assert after_second == after_first


@pytest.mark.asyncio
async def test_replay_returns_the_original_even_when_the_enrollment_is_gone_by_then(world: PaymentWorld, db_session: AsyncSession) -> None:
    student_id: int = await world.student("gone@example.com")
    course_id: int = await world.course("Gone")
    await world.enroll(student_id, course_id)
    body: dict[str, Any] = world.payload(student_id, course_id)
    first: Response = await world.pay(body, "attempt-1")
    await db_session.execute(update(Enrollment).where(Enrollment.student_id == student_id).values(is_deleted=True))
    await db_session.commit()

    replay: Response = await world.pay(body, "attempt-1")
    fresh: Response = await world.pay(body, "attempt-2")

    assert replay.status_code == 200
    assert replay.json() == first.json()
    assert fresh.status_code == 422


@pytest.mark.parametrize(
    "field,value",
    [("amount", "151.00"), ("paid_at", "YESTERDAY"), ("method", "transfer"), ("comment", "other"), ("student_id", "OTHER_STUDENT"), ("course_id", "OTHER_COURSE")],
)
@pytest.mark.asyncio
async def test_same_key_with_a_different_payload_conflicts_and_changes_nothing(world: PaymentWorld, db_session: AsyncSession, field: str, value: str) -> None:
    student_id: int = await world.student("mismatch@example.com")
    other_student_id: int = await world.student("mismatch-other@example.com")
    course_id: int = await world.course("Mismatch")
    other_course_id: int = await world.course("Mismatch other")
    for enrolled_student in (student_id, other_student_id):
        await world.enroll(enrolled_student, course_id)
    await world.enroll(student_id, other_course_id)
    resolved: str | int = {"OTHER_STUDENT": other_student_id, "OTHER_COURSE": other_course_id}.get(value, value)
    if value == "YESTERDAY":
        resolved = (datetime.fromisoformat(world.paid_at) - timedelta(days=1)).isoformat()

    first: Response = await world.pay(world.payload(student_id, course_id), "attempt-1")
    before: dict[str, Any] = await LedgerCounts.snapshot(db_session)
    conflict: Response = await world.pay(world.payload(student_id, course_id, {field: resolved}), "attempt-1")

    assert first.status_code == 201
    assert conflict.status_code == 409
    assert conflict.json()["detail"]["code"] == "idempotency_key_payload_mismatch"
    assert await LedgerCounts.snapshot(db_session) == before


@pytest.mark.asyncio
async def test_requests_without_the_header_still_record_every_payment(world: PaymentWorld, db_session: AsyncSession) -> None:
    student_id: int = await world.student("legacy@example.com")
    course_id: int = await world.course("Legacy")
    await world.enroll(student_id, course_id)
    body: dict[str, Any] = world.payload(student_id, course_id)

    responses: list[Response] = [await world.pay(body, None), await world.pay(body, None)]

    assert [response.status_code for response in responses] == [201, 201]
    assert responses[0].json()["id"] != responses[1].json()["id"]
    assert (await LedgerCounts.snapshot(db_session))["payments"] == 2


@pytest.mark.asyncio
async def test_the_same_key_from_another_recorder_is_independent(world: PaymentWorld, db_session: AsyncSession) -> None:
    other_accountant: User = User(email="second-accountant@example.com", password_hash="x", first_name="Second", last_name="Accountant", role=UserRole.ACCOUNTANT, must_set_password=False)
    db_session.add(other_accountant)
    await db_session.commit()
    student_id: int = await world.student("recorders@example.com")
    course_id: int = await world.course("Recorders")
    await world.enroll(student_id, course_id)
    body: dict[str, Any] = world.payload(student_id, course_id)

    first: Response = await world.pay(body, "shared-key")
    second: Response = await world.pay(body, "shared-key", other_accountant)

    assert first.status_code == 201
    assert second.status_code == 201
    assert first.json()["id"] != second.json()["id"]
    assert (await LedgerCounts.snapshot(db_session))["payments"] == 2


@pytest.mark.parametrize("key", ["", "k" * 129, "has space", "semi;colon", "dot.dot", "slash/key"])
@pytest.mark.asyncio
async def test_invalid_idempotency_keys_are_rejected_before_any_write(world: PaymentWorld, db_session: AsyncSession, key: str) -> None:
    student_id: int = await world.student("badkey@example.com")
    course_id: int = await world.course("Bad key")
    await world.enroll(student_id, course_id)

    response: Response = await world.pay(world.payload(student_id, course_id), key)

    assert response.status_code == 422
    assert (await LedgerCounts.snapshot(db_session))["payments"] == 0


@pytest.mark.parametrize("key", ["a", "k" * 128, "Aa09_-"])
@pytest.mark.asyncio
async def test_boundary_idempotency_keys_are_accepted(world: PaymentWorld, key: str) -> None:
    student_id: int = await world.student("goodkey@example.com")
    course_id: int = await world.course("Good key")
    await world.enroll(student_id, course_id)

    response: Response = await world.pay(world.payload(student_id, course_id), key)

    assert response.status_code == 201


@pytest.mark.asyncio
async def test_concurrent_duplicates_allocate_once_and_agree_on_one_payment(world: PaymentWorld, db_session: AsyncSession) -> None:
    student_id: int = await world.student("concurrent@example.com")
    course_id: int = await world.course("Concurrent")
    await world.enroll(student_id, course_id)
    body: dict[str, Any] = world.payload(student_id, course_id)

    responses: list[Response] = await asyncio.gather(*[world.pay(body, "double-click") for _ in range(4)])

    assert sorted(response.status_code for response in responses) == [200, 200, 200, 201]
    assert len({response.json()["id"] for response in responses}) == 1
    counts: dict[str, Any] = await LedgerCounts.snapshot(db_session)
    assert counts["payments"] == 1
    assert counts["allocated"] == Decimal("150.00")


@pytest.mark.asyncio
async def test_insert_race_loser_rolls_back_and_returns_the_original(world: PaymentWorld, db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch) -> None:
    student_id: int = await world.student("race@example.com")
    course_id: int = await world.course("Race")
    await world.enroll(student_id, course_id)
    body: dict[str, Any] = world.payload(student_id, course_id)
    first: Response = await world.pay(body, "race-key")
    original_lookup = PaymentIdempotencyService._find_original
    lookups: list[int] = []

    async def blind_first_lookup(self: PaymentIdempotencyService, recorder_id: int, idempotency_key: str) -> LedgerEntry | None:
        lookups.append(recorder_id)
        if len(lookups) == 1:
            return None
        return await original_lookup(self, recorder_id, idempotency_key)

    monkeypatch.setattr(PaymentIdempotencyService, "_find_original", blind_first_lookup)
    before: dict[str, Any] = await LedgerCounts.snapshot(db_session)
    loser: Response = await world.pay(body, "race-key")

    assert len(lookups) == 2
    assert loser.status_code == 200
    assert loser.json()["id"] == first.json()["id"]
    assert await LedgerCounts.snapshot(db_session) == before


@pytest.mark.asyncio
async def test_insert_race_with_a_different_payload_conflicts(world: PaymentWorld, db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch) -> None:
    student_id: int = await world.student("race-diff@example.com")
    course_id: int = await world.course("Race diff")
    await world.enroll(student_id, course_id)
    await world.pay(world.payload(student_id, course_id), "race-key")
    original_lookup = PaymentIdempotencyService._find_original
    lookups: list[int] = []

    async def blind_first_lookup(self: PaymentIdempotencyService, recorder_id: int, idempotency_key: str) -> LedgerEntry | None:
        lookups.append(recorder_id)
        return None if len(lookups) == 1 else await original_lookup(self, recorder_id, idempotency_key)

    monkeypatch.setattr(PaymentIdempotencyService, "_find_original", blind_first_lookup)
    before: dict[str, Any] = await LedgerCounts.snapshot(db_session)
    loser: Response = await world.pay(world.payload(student_id, course_id, {"amount": "99.00"}), "race-key")

    assert loser.status_code == 409
    assert await LedgerCounts.snapshot(db_session) == before


@pytest.mark.asyncio
async def test_migration_adds_columns_and_partial_unique_index_and_round_trips() -> None:
    database: DisposableMigrationDatabase
    async with DisposableMigrationDatabase(BACKEND_ROOT) as database:
        assert database.upgrade("plink1_optional_email_phone").returncode == 0
        assert await database.fetchval("SELECT count(*) FROM information_schema.columns WHERE table_name='ledger_entries' AND column_name LIKE 'idempotency_%'") == 0
        await database.execute("INSERT INTO users(id,email,first_name,last_name,role) VALUES (1,'a@example.test','A','B','student'),(2,'r@example.test','R','S','accountant')")
        await database.execute("INSERT INTO ledger_entries(student_id,type,amount,occurred_at,recorded_by_id) VALUES (1,'payment',10,now(),2)")
        first_upgrade = database.upgrade("wp69a_payment_idempotency")
        assert first_upgrade.returncode == 0, first_upgrade.stdout + first_upgrade.stderr
        columns: list[Any] = [row for row in await database.fetchval("SELECT array_agg(column_name || ':' || is_nullable ORDER BY column_name) FROM information_schema.columns WHERE table_name='ledger_entries' AND column_name LIKE 'idempotency_%'")]
        assert columns == ["idempotency_fingerprint:YES", "idempotency_key:YES"]
        definition: str = await database.fetchval("SELECT pg_get_indexdef(i.indexrelid) FROM pg_index i WHERE i.indexrelid=to_regclass($1)", INDEX_NAME)
        assert "UNIQUE" in definition and "(recorded_by_id, idempotency_key)" in definition and "idempotency_key IS NOT NULL" in definition
        await database.execute("INSERT INTO ledger_entries(student_id,type,amount,occurred_at,recorded_by_id) VALUES (1,'payment',10,now(),2),(1,'payment',10,now(),2)")
        await database.execute("INSERT INTO ledger_entries(student_id,type,amount,occurred_at,recorded_by_id,idempotency_key) VALUES (1,'payment',10,now(),2,'k')")
        with pytest.raises(Exception, match=INDEX_NAME):
            await database.execute("INSERT INTO ledger_entries(student_id,type,amount,occurred_at,recorded_by_id,idempotency_key) VALUES (1,'payment',10,now(),2,'k')")
        downgraded = database.run_alembic("downgrade", "-1")
        assert downgraded.returncode == 0, downgraded.stdout + downgraded.stderr
        assert await database.fetchval("SELECT to_regclass($1)::text", INDEX_NAME) is None
        assert await database.fetchval("SELECT count(*) FROM information_schema.columns WHERE table_name='ledger_entries' AND column_name LIKE 'idempotency_%'") == 0
        assert await database.fetchval("SELECT count(*) FROM ledger_entries") == 4
        reupgrade = database.upgrade("wp69a_payment_idempotency")
        assert reupgrade.returncode == 0, reupgrade.stdout + reupgrade.stderr
        assert await database.fetchval("SELECT indisvalid FROM pg_index WHERE indexrelid=to_regclass($1)", INDEX_NAME) is True


@pytest.mark.asyncio
async def test_migration_replaces_an_invalid_leftover_index() -> None:
    database: DisposableMigrationDatabase
    async with DisposableMigrationDatabase(BACKEND_ROOT) as database:
        assert database.upgrade("wp69a_payment_idempotency").returncode == 0
        await database.execute("UPDATE pg_index SET indisvalid=false WHERE indexrelid=to_regclass($1)", INDEX_NAME)
        assert database.run_alembic("stamp", "plink1_optional_email_phone").returncode == 0
        recovered = database.upgrade("wp69a_payment_idempotency")
        assert recovered.returncode == 0, recovered.stdout + recovered.stderr
        assert await database.fetchval("SELECT indisvalid FROM pg_index WHERE indexrelid=to_regclass($1)", INDEX_NAME) is True


def test_migration_sql_is_concurrent_and_expand_only() -> None:
    environment: dict[str, str] = os.environ.copy()
    environment["DATABASE_URL"] = os.environ["TEST_DATABASE_URL"]
    result: subprocess.CompletedProcess[str] = subprocess.run(
        [sys.executable, "-m", "alembic", "upgrade", "plink1_optional_email_phone:wp69a_payment_idempotency", "--sql"],
        cwd=BACKEND_ROOT, env=environment, text=True, capture_output=True, timeout=30, check=False,
    )
    assert result.returncode == 0, result.stderr
    assert "CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uq_ledger_recorder_idempotency_key ON ledger_entries (recorded_by_id, idempotency_key) WHERE idempotency_key IS NOT NULL" in result.stdout
    assert "NOT NULL" not in result.stdout.replace("IS NOT NULL", "")
    assert "DROP" not in result.stdout.replace("DROP INDEX", "")
