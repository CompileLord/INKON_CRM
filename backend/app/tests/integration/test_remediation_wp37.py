import asyncio
from datetime import date
from decimal import Decimal
from importlib.machinery import ModuleSpec
import importlib.util
import subprocess
from pathlib import Path
from types import ModuleType
from typing import Any

import pytest
from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import func, select, text
from sqlalchemy.engine import Connection
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncConnection, AsyncSession

from app.models.allocation import Allocation
from app.models.charge import Charge, ChargeStatus, ChargeType
from app.models.course import Course, CourseExamType
from app.models.enrollment import Enrollment
from app.models.user import User
from app.services.finance_service import FinanceService
from app.tests.conftest import TestingSessionLocal
from app.tests.integration.test_remediation_wp07 import seed_ledger_scenario
from app.tests.migrations.test_migration_chain import DisposableMigrationDatabase


class InstallmentFixture:
    index_name: str = "uq_charges_active_tuition_installment"

    @staticmethod
    async def enrollment(session: AsyncSession, student: User, mentor: User) -> Enrollment:
        course: Course = Course(
            title="Installment identity",
            description="Disposable installment identity fixture",
            start_date=date(2026, 1, 1),
            end_date=date(2026, 3, 31),
            exam_type=CourseExamType.MONTHLY,
            price=Decimal("100.00"),
            mentor_id=mentor.id,
        )
        session.add(course)
        await session.flush()
        enrollment: Enrollment = Enrollment(
            student_id=student.id,
            course_id=course.id,
            price_at_enrollment=course.price,
            color_hex="#000000",
        )
        session.add(enrollment)
        await session.commit()
        return enrollment

    @staticmethod
    def charge(
        enrollment: Enrollment,
        charge_type: ChargeType = ChargeType.TUITION,
        charge_status: ChargeStatus = ChargeStatus.OPEN,
        deleted: bool = False,
        sequence: int = 1,
    ) -> Charge:
        return Charge(
            enrollment_id=enrollment.id,
            student_id=enrollment.student_id,
            sequence_no=sequence,
            amount=Decimal("25.00"),
            due_date=date(2026, 1, 1),
            type=charge_type,
            status=charge_status,
            is_deleted=deleted,
        )

    @staticmethod
    def migration() -> ModuleType:
        spec: ModuleSpec | None = importlib.util.spec_from_file_location(
            "wp37_migration", Path("alembic/versions/rwp37_installment_identity.py")
        )
        assert spec is not None and spec.loader is not None
        migration: ModuleType = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(migration)
        assert migration.down_revision == "rwp33_grading_state"
        return migration

    @staticmethod
    async def migrate(session: AsyncSession, migration: ModuleType, direction: str) -> None:
        def execute(connection: Connection) -> None:
            with Operations.context(MigrationContext.configure(connection)):
                getattr(migration, direction)()

        connection: AsyncConnection = await session.connection()
        await connection.run_sync(execute)

    @staticmethod
    async def snapshot(session: AsyncSession) -> dict[str, Any]:
        snapshot: dict[str, Any] = {}
        table: str
        for table in ("charges", "ledger_entries", "allocations", "enrollments"):
            snapshot[table] = (
                await session.execute(text(f"SELECT jsonb_agg(to_jsonb(record) ORDER BY id) FROM {table} record"))
            ).scalar_one()
        return snapshot


@pytest.mark.asyncio
@pytest.mark.parametrize("existing_status", [ChargeStatus.OPEN, ChargeStatus.SETTLED])
@pytest.mark.parametrize("replacement_status", [ChargeStatus.OPEN, ChargeStatus.SETTLED])
async def test_active_tuition_identity_includes_open_and_settled_installments(
    db_session: AsyncSession, test_student: User, test_mentor: User,
    existing_status: ChargeStatus, replacement_status: ChargeStatus,
) -> None:
    enrollment: Enrollment = await InstallmentFixture.enrollment(db_session, test_student, test_mentor)
    db_session.add(InstallmentFixture.charge(enrollment, charge_status=existing_status))
    await db_session.commit()
    with pytest.raises(IntegrityError) as error:
        async with db_session.begin_nested():
            db_session.add(InstallmentFixture.charge(enrollment, charge_status=replacement_status))
            await db_session.flush()
    assert InstallmentFixture.index_name in str(error.value)
    assert (await db_session.scalar(select(func.count()).select_from(Charge))) == 1


@pytest.mark.asyncio
async def test_identity_allows_other_charge_types_cancelled_deleted_and_other_enrollments(
    db_session: AsyncSession, test_student: User, test_mentor: User,
) -> None:
    enrollment: Enrollment = await InstallmentFixture.enrollment(db_session, test_student, test_mentor)
    another_enrollment: Enrollment = await InstallmentFixture.enrollment(db_session, test_student, test_mentor)
    charges: list[Charge] = [InstallmentFixture.charge(enrollment), InstallmentFixture.charge(another_enrollment)]
    charge_type: ChargeType
    for charge_type in (ChargeType.FEE, ChargeType.LATE_FEE):
        charges.extend([InstallmentFixture.charge(enrollment, charge_type), InstallmentFixture.charge(enrollment, charge_type)])
    charges.extend([
        InstallmentFixture.charge(enrollment, charge_status=ChargeStatus.CANCELLED),
        InstallmentFixture.charge(enrollment, charge_status=ChargeStatus.CANCELLED),
        InstallmentFixture.charge(enrollment, deleted=True),
        InstallmentFixture.charge(enrollment, deleted=True),
        InstallmentFixture.charge(enrollment, sequence=2),
    ])
    db_session.add_all(charges)
    await db_session.commit()
    assert (await db_session.scalar(select(func.count()).select_from(Charge))) == 11


@pytest.mark.asyncio
async def test_concurrent_first_schedule_waits_on_account_and_returns_winning_schedule_idempotently(
    db_session: AsyncSession, test_student: User, test_mentor: User,
) -> None:
    enrollment: Enrollment = await InstallmentFixture.enrollment(db_session, test_student, test_mentor)
    barrier: asyncio.Barrier = asyncio.Barrier(2)
    release: asyncio.Event = asyncio.Event()
    generated: asyncio.Event = asyncio.Event()
    connection_ids: set[int] = set()

    async def generate() -> list[int]:
        session: AsyncSession
        async with TestingSessionLocal() as session:
            connection_ids.add((await session.execute(text("SELECT pg_backend_pid()"))).scalar_one())
            await barrier.wait()
            charges: list[Charge] = await FinanceService(session).generate_schedule_for_enrollment(enrollment.id)
            generated.set()
            await asyncio.wait_for(release.wait(), timeout=15)
            await session.commit()
            return sorted(charge.id for charge in charges)

    tasks: list[asyncio.Task[list[int]]] = [asyncio.create_task(generate()), asyncio.create_task(generate())]
    blocked_on_account: bool = False
    try:
        await asyncio.wait_for(generated.wait(), timeout=10)
        deadline: float = asyncio.get_running_loop().time() + 5
        while asyncio.get_running_loop().time() < deadline:
            await db_session.execute(text("SELECT pg_stat_clear_snapshot()"))
            blocked_on_account = bool(await db_session.scalar(text(
                "SELECT EXISTS (SELECT 1 FROM pg_stat_activity WHERE pid = ANY(:pids) "
                "AND cardinality(pg_blocking_pids(pid)) > 0 AND query LIKE '%FROM users%' "
                "AND query LIKE '%FOR UPDATE%')"
            ), {"pids": list(connection_ids)}))
            if blocked_on_account:
                break
            await asyncio.sleep(0.02)
    finally:
        release.set()
        results: list[list[int]] = await asyncio.wait_for(asyncio.gather(*tasks), timeout=15)
    assert len(connection_ids) == 2
    assert blocked_on_account
    assert results[0] == results[1]
    assert len(results[0]) == 3
    repeated: list[Charge] = await FinanceService(db_session).generate_schedule_for_enrollment(enrollment.id)
    assert sorted(charge.id for charge in repeated) == results[0]
    assert (await db_session.scalar(select(func.count()).select_from(Charge))) == 3
    assert (await db_session.scalar(select(func.sum(Charge.amount)))) == Decimal("100.00")


@pytest.mark.asyncio
async def test_concurrent_direct_insert_has_one_committed_winner(
    db_session: AsyncSession, test_student: User, test_mentor: User,
) -> None:
    enrollment: Enrollment = await InstallmentFixture.enrollment(db_session, test_student, test_mentor)
    barrier: asyncio.Barrier = asyncio.Barrier(2)
    connection_ids: set[int] = set()

    async def insert() -> bool:
        session: AsyncSession
        async with TestingSessionLocal() as session:
            connection_ids.add((await session.execute(text("SELECT pg_backend_pid()"))).scalar_one())
            await barrier.wait()
            session.add(InstallmentFixture.charge(enrollment))
            try:
                await session.commit()
                return True
            except IntegrityError as error:
                await session.rollback()
                assert InstallmentFixture.index_name in str(error)
                return False

    results: list[bool] = await asyncio.wait_for(asyncio.gather(insert(), insert()), timeout=15)
    assert len(connection_ids) == 2
    assert sorted(results) == [False, True]
    assert (await db_session.scalar(select(func.count()).select_from(Charge))) == 1


@pytest.mark.asyncio
async def test_migration_preserves_financial_data_and_supports_previous_schema_sql_while_applied(
    db_session: AsyncSession, test_student: User, test_mentor: User, test_admin: User,
) -> None:
    enrollment_id: int
    payment_id: int
    charge_ids: list[int]
    enrollment_id, payment_id, charge_ids = await seed_ledger_scenario(db_session, test_student, test_mentor, test_admin)
    allocation: Allocation = Allocation(ledger_entry_id=payment_id, charge_id=charge_ids[0], amount=Decimal("20.00"))
    db_session.add(allocation)
    await db_session.commit()
    enrollment: Enrollment = (await db_session.scalars(select(Enrollment).where(Enrollment.id == enrollment_id))).one()
    db_session.add_all([
        InstallmentFixture.charge(enrollment, ChargeType.FEE),
        InstallmentFixture.charge(enrollment, ChargeType.FEE),
        InstallmentFixture.charge(enrollment, ChargeType.LATE_FEE),
        InstallmentFixture.charge(enrollment, ChargeType.LATE_FEE),
        InstallmentFixture.charge(enrollment, charge_status=ChargeStatus.CANCELLED),
        InstallmentFixture.charge(enrollment, charge_status=ChargeStatus.CANCELLED),
        InstallmentFixture.charge(enrollment, deleted=True),
        InstallmentFixture.charge(enrollment, deleted=True),
    ])
    await db_session.commit()
    migration: ModuleType = InstallmentFixture.migration()
    await db_session.execute(text(f"DROP INDEX IF EXISTS {InstallmentFixture.index_name}"))
    before: dict[str, Any] = await InstallmentFixture.snapshot(db_session)
    await InstallmentFixture.migrate(db_session, migration, "upgrade")
    assert await InstallmentFixture.snapshot(db_session) == before
    default_row: Any = (await db_session.execute(text(
        "INSERT INTO charges (enrollment_id,student_id,sequence_no,amount,due_date) "
        "VALUES (:enrollment,:student,2,25.00,'2026-01-01') RETURNING type,status,is_deleted"
    ), {"enrollment": enrollment_id, "student": test_student.id})).one()
    assert tuple(default_row) == ("tuition", "open", False)
    after_sql_insert: dict[str, Any] = await InstallmentFixture.snapshot(db_session)
    read_amount: Decimal = (await db_session.execute(text(
        "SELECT amount FROM charges WHERE enrollment_id=:enrollment AND sequence_no=2"
    ), {"enrollment": enrollment_id})).scalar_one()
    assert read_amount == Decimal("25.00")
    existing: list[Charge] = await FinanceService(db_session).generate_schedule_for_enrollment(enrollment_id)
    expected_ids: list[int] = [row["id"] for row in after_sql_insert["charges"] if not row["is_deleted"]]
    assert sorted(row.id for row in existing) == sorted(expected_ids)
    assert await InstallmentFixture.snapshot(db_session) == after_sql_insert
    with pytest.raises(IntegrityError):
        async with db_session.begin_nested():
            await db_session.execute(text(
                "INSERT INTO charges (enrollment_id,student_id,sequence_no,amount,due_date) "
                "VALUES (:enrollment,:student,2,25.00,'2026-01-01')"
            ), {"enrollment": enrollment_id, "student": test_student.id})
    await InstallmentFixture.migrate(db_session, migration, "downgrade")
    assert await InstallmentFixture.snapshot(db_session) == after_sql_insert
    await InstallmentFixture.migrate(db_session, migration, "upgrade")
    assert await InstallmentFixture.snapshot(db_session) == after_sql_insert


@pytest.mark.asyncio
async def test_migration_duplicate_preflight_requires_reconciliation_without_changing_debt(
    db_session: AsyncSession, test_student: User, test_mentor: User,
) -> None:
    enrollment: Enrollment = await InstallmentFixture.enrollment(db_session, test_student, test_mentor)
    migration: ModuleType = InstallmentFixture.migration()
    await db_session.execute(text(f"DROP INDEX IF EXISTS {InstallmentFixture.index_name}"))
    db_session.add_all([
        InstallmentFixture.charge(enrollment),
        InstallmentFixture.charge(enrollment, charge_status=ChargeStatus.SETTLED),
    ])
    await db_session.flush()
    before: dict[str, Any] = await InstallmentFixture.snapshot(db_session)
    with pytest.raises(RuntimeError, match="(?i)reconcil") as error:
        async with db_session.begin_nested():
            await InstallmentFixture.migrate(db_session, migration, "upgrade")
    assert str(enrollment.id) in str(error.value)
    assert await InstallmentFixture.snapshot(db_session) == before
    assert await db_session.scalar(text("SELECT to_regclass(:index)"), {"index": InstallmentFixture.index_name}) is None


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("charge_type", "charge_status"),
    [(ChargeType.FEE, ChargeStatus.OPEN), (ChargeType.TUITION, ChargeStatus.CANCELLED)],
)
async def test_generation_preserves_existing_nondeleted_charge_lookup(
    db_session: AsyncSession, test_student: User, test_mentor: User,
    charge_type: ChargeType, charge_status: ChargeStatus,
) -> None:
    enrollment: Enrollment = await InstallmentFixture.enrollment(db_session, test_student, test_mentor)
    charge: Charge = InstallmentFixture.charge(enrollment, charge_type, charge_status)
    db_session.add(charge)
    await db_session.commit()
    existing: list[Charge] = await FinanceService(db_session).generate_schedule_for_enrollment(enrollment.id)
    assert [row.id for row in existing] == [charge.id]
    assert (await db_session.scalar(select(func.count()).select_from(Charge))) == 1


@pytest.mark.asyncio
async def test_alembic_parent_head_downgrade_parent_head_preserves_existing_charge() -> None:
    backend_root: str = str(Path(__file__).resolve().parents[3])
    async with DisposableMigrationDatabase(backend_root) as database:
        result: subprocess.CompletedProcess[str] = database.upgrade("rwp33_grading_state")
        assert result.returncode == 0, result.stdout + result.stderr
        assert await database.fetchval("SELECT version_num FROM alembic_version") == "rwp33_grading_state"
        student_id: int = await database.fetchval(
            "INSERT INTO users (email,first_name,last_name,role) "
            "VALUES ('wp37@example.invalid','Synthetic','Student','student') RETURNING id"
        )
        course_id: int = await database.fetchval(
            "INSERT INTO courses (title,description,start_date,end_date,exam_type,price,mentor_id) "
            "VALUES ('Synthetic course','','2026-01-01','2026-03-31','monthly',100.00,$1) RETURNING id",
            student_id,
        )
        enrollment_id: int = await database.fetchval(
            "INSERT INTO enrollments (student_id,course_id,price_at_enrollment,color_hex) "
            "VALUES ($1,$2,100.00,'#000000') RETURNING id", student_id, course_id,
        )
        await database.execute(
            "INSERT INTO charges (student_id,enrollment_id,sequence_no,amount,due_date) "
            "VALUES ($1,$2,1,100.00,'2026-01-01')", student_id, enrollment_id,
        )
        before: Any = await database.fetchval("SELECT jsonb_agg(to_jsonb(record) ORDER BY id) FROM charges record")
        direction: str
        revision: str
        for direction, revision in (("upgrade", "head"), ("downgrade", "rwp33_grading_state"), ("upgrade", "head")):
            result = database.run_alembic(direction, revision)
            assert result.returncode == 0, result.stdout + result.stderr
            expected_revision: str = "rwp33_grading_state" if direction == "downgrade" else "rwp37_installment_identity"
            assert await database.fetchval("SELECT version_num FROM alembic_version") == expected_revision
            assert await database.fetchval("SELECT jsonb_agg(to_jsonb(record) ORDER BY id) FROM charges record") == before
            index_exists: bool = await database.fetchval("SELECT to_regclass($1) IS NOT NULL", InstallmentFixture.index_name)
            assert index_exists is (direction != "downgrade")
