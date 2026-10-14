import asyncio
from datetime import date, datetime, timedelta, timezone, tzinfo
from decimal import Decimal

import pytest
from fastapi import HTTPException
from httpx import AsyncClient, Response
from jose import jwt
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core import security
from app.core.config import settings
from app.core.security import create_access_token
from app.models.allocation import Allocation
from app.models.charge import Charge
from app.models.course import Course, CourseExamType
from app.models.enrollment import Enrollment
from app.models.ledger import LedgerEntry, LedgerEntryType
from app.models.user import User, UserRole
from app.schemas.ledger import AllocationCreatePayload, RefundPaymentPayload
from app.services.finance_service import FinanceService


class FrozenTokenDatetime(datetime):
    instant: datetime = datetime.now(timezone.utc).replace(microsecond=0)

    @classmethod
    def now(cls, tz: tzinfo | None = None) -> datetime:
        return cls.instant.astimezone(tz) if tz else cls.instant.replace(tzinfo=None)


class ConcurrentLedgerScenario:
    def __init__(self, session: AsyncSession) -> None:
        self.session_factory: async_sessionmaker[AsyncSession] = async_sessionmaker(
            session.bind, expire_on_commit=False
        )
        self.barrier: asyncio.Barrier = asyncio.Barrier(2)
        self.connection_identities: set[int] = set()

    async def seed(
        self, session: AsyncSession, student: User, mentor: User, administrator: User
    ) -> tuple[int, int]:
        today: date = date.today()
        course: Course = Course(
            title="Concurrent ledger regression",
            description="Synthetic regression data",
            start_date=today,
            end_date=today + timedelta(days=60),
            exam_type=CourseExamType.MONTHLY,
            price=Decimal("100.00"),
            mentor_id=mentor.id,
        )
        session.add(course)
        await session.flush()
        enrollment: Enrollment = Enrollment(
            student_id=student.id,
            course_id=course.id,
            price_at_enrollment=Decimal("100.00"),
            color_hex="#000000",
        )
        session.add(enrollment)
        await session.flush()
        charge: Charge = Charge(
            enrollment_id=enrollment.id,
            student_id=student.id,
            sequence_no=1,
            amount=Decimal("100.00"),
            due_date=today,
        )
        payment: LedgerEntry = LedgerEntry(
            student_id=student.id,
            type=LedgerEntryType.PAYMENT,
            amount=Decimal("100.00"),
            occurred_at=datetime.now(timezone.utc),
            recorded_by_id=administrator.id,
        )
        session.add_all([charge, payment])
        await session.commit()
        return charge.id, payment.id

    async def write_allocation(self, student_id: int, charge_id: int, administrator: User) -> None:
        async with self.session_factory() as session:
            connection_identity: int = (
                await session.execute(text("SELECT pg_backend_pid()"))
            ).scalar_one()
            self.connection_identities.add(connection_identity)
            await self.barrier.wait()
            try:
                await FinanceService(session).allocate_credit(
                    AllocationCreatePayload(
                        student_id=student_id, charge_id=charge_id, amount=Decimal("75.00")
                    ),
                    administrator,
                )
                await session.commit()
            except HTTPException as exception:
                await session.rollback()
                assert exception.status_code == 400

    async def write_refund(self, payment_id: int, administrator: User) -> None:
        async with self.session_factory() as session:
            connection_identity: int = (
                await session.execute(text("SELECT pg_backend_pid()"))
            ).scalar_one()
            self.connection_identities.add(connection_identity)
            await self.barrier.wait()
            try:
                await FinanceService(session).refund_payment(
                    payment_id,
                    RefundPaymentPayload(
                        amount=Decimal("75.00"), to_wallet=False, reason_code="REGRESSION"
                    ),
                    administrator,
                )
                await session.commit()
            except HTTPException as exception:
                await session.rollback()
                assert exception.status_code == 400


@pytest.mark.asyncio
async def test_refresh_cross_user_same_second(
    client: AsyncClient,
    db_session: AsyncSession,
    test_admin: User,
    test_student: User,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(security, "datetime", FrozenTokenDatetime)
    administrator_login: Response = await client.post(
        "/api/v1/auth/login", json={"email": test_admin.email, "password": "admin_pass123"}
    )
    student_login: Response = await client.post(
        "/api/v1/auth/login", json={"email": test_student.email, "password": "student_pass123"}
    )
    assert administrator_login.status_code == 200
    assert student_login.status_code == 200
    administrator_refresh: str = administrator_login.json()["refresh_token"]
    student_refresh: str = student_login.json()["refresh_token"]
    student_rotation: Response = await client.post(
        "/api/v1/auth/refresh", json={"refresh_token": student_refresh}
    )
    assert student_rotation.status_code == 200
    student_claims: dict[str, object] = jwt.decode(
        student_rotation.json()["access_token"], settings.JWT_SECRET_KEY, algorithms=["HS256"]
    )
    secure_identity: dict[str, bool] = {
        "distinct_refresh_credentials": administrator_refresh != student_refresh,
        "student_access_subject": student_claims["sub"] == str(test_student.id),
        "student_access_role": student_claims["role"] == UserRole.STUDENT.value,
    }
    assert all(secure_identity.values()), secure_identity


@pytest.mark.asyncio
async def test_private_document_download(
    client: AsyncClient,
    db_session: AsyncSession,
    test_admin: User,
    test_student: User,
) -> None:
    other_student: User = User(
        email="other-document-owner@example.com",
        first_name="Other",
        last_name="Student",
        role=UserRole.STUDENT,
        must_set_password=False,
    )
    db_session.add(other_student)
    await db_session.commit()
    private_bytes: bytes = b"%PDF-1.5\nSynthetic private document\n%%EOF"
    upload: Response = await client.post(
        "/api/v1/documents/",
        data={"owner_type": "student", "owner_id": str(test_student.id)},
        files={"file": ("private-regression.pdf", private_bytes, "application/pdf")},
        headers={"Authorization": f"Bearer {create_access_token(test_admin.id, test_admin.role)}"},
    )
    assert upload.status_code == 201
    legacy_path: str = upload.json()["file_path"]
    anonymous_download: Response = await client.get(legacy_path)
    other_owner_download: Response = await client.get(
        legacy_path,
        headers={
            "Authorization": f"Bearer {create_access_token(other_student.id, other_student.role)}"
        },
    )
    private_access_blocked: dict[str, bool] = {
        "anonymous_request_denied": anonymous_download.is_client_error,
        "other_owner_request_denied": other_owner_download.is_client_error,
        "anonymous_bytes_withheld": private_bytes not in anonymous_download.content,
        "other_owner_bytes_withheld": private_bytes not in other_owner_download.content,
    }
    assert all(private_access_blocked.values()), private_access_blocked


@pytest.mark.asyncio
async def test_concurrent_allocation(
    db_session: AsyncSession, test_student: User, test_mentor: User, test_admin: User
) -> None:
    scenario: ConcurrentLedgerScenario = ConcurrentLedgerScenario(db_session)
    charge_id, payment_id = await scenario.seed(db_session, test_student, test_mentor, test_admin)
    async with asyncio.timeout(15):
        await asyncio.gather(
            scenario.write_allocation(test_student.id, charge_id, test_admin),
            scenario.write_allocation(test_student.id, charge_id, test_admin),
        )
    assert len(scenario.connection_identities) == 2
    async with scenario.session_factory() as verification_session:
        charge_allocated: Decimal = (
            await verification_session.execute(
                select(func.coalesce(func.sum(Allocation.amount), 0)).where(
                    Allocation.charge_id == charge_id,
                    Allocation.reversed_by_entry_id.is_(None),
                )
            )
        ).scalar_one()
        payment_allocated: Decimal = (
            await verification_session.execute(
                select(func.coalesce(func.sum(Allocation.amount), 0)).where(
                    Allocation.ledger_entry_id == payment_id,
                    Allocation.reversed_by_entry_id.is_(None),
                )
            )
        ).scalar_one()
    assert charge_allocated > Decimal("0.00")
    assert payment_allocated > Decimal("0.00")
    assert charge_allocated <= Decimal("100.00"), f"charge allocated {charge_allocated}"
    assert payment_allocated <= Decimal("100.00"), f"payment allocated {payment_allocated}"


@pytest.mark.asyncio
async def test_concurrent_refund(
    db_session: AsyncSession, test_student: User, test_mentor: User, test_admin: User
) -> None:
    scenario: ConcurrentLedgerScenario = ConcurrentLedgerScenario(db_session)
    _, payment_id = await scenario.seed(db_session, test_student, test_mentor, test_admin)
    async with asyncio.timeout(15):
        await asyncio.gather(
            scenario.write_refund(payment_id, test_admin),
            scenario.write_refund(payment_id, test_admin),
        )
    assert len(scenario.connection_identities) == 2
    async with scenario.session_factory() as verification_session:
        refunded: Decimal = (
            await verification_session.execute(
                select(func.coalesce(func.sum(LedgerEntry.amount), 0)).where(
                    LedgerEntry.reverses_entry_id == payment_id,
                    LedgerEntry.type == LedgerEntryType.REFUND,
                )
            )
        ).scalar_one()
    assert refunded > Decimal("0.00")
    assert refunded <= Decimal("100.00"), f"payment refunded {refunded}"
