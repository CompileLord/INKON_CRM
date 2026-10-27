import io
from collections.abc import Awaitable, Callable
from datetime import date, timedelta
from pathlib import Path

import pytest
from httpx import AsyncClient, Response
from PIL import Image
from sqlalchemy import select, text
from sqlalchemy.engine import URL, make_url
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.config import settings
from app.core.security import create_access_token
from app.db.session import AsyncSessionLocal
from app.models.allocation import Allocation
from app.models.charge import Charge
from app.models.course import Course, CourseExamType
from app.models.course_schedule import CourseSchedule
from app.models.enrollment import Enrollment
from app.models.journal import Journal
from app.models.journal_entry import JournalEntry
from app.models.journal_student_summary import JournalStudentSummary
from app.models.ledger import LedgerEntry, LedgerEntryType
from app.models.user import User, UserRole
from scripts.reset_guard import (
    STORAGE_MARKER_NAME,
    STORAGE_MARKER_VERSION,
    ResetTarget,
    ResetTargetGuard,
)


class DemoSeedTestFixture:
    @staticmethod
    def create_disposable_reset_target(
        backend_root: Path,
    ) -> tuple[ResetTargetGuard, ResetTarget]:
        storage_root: Path = backend_root / "storage"
        storage_root.mkdir(parents=True)
        database_url: URL = make_url(settings.DATABASE_URL)
        database_identity: str = (
            f"{database_url.host}:{database_url.port or 5432}/{database_url.database}"
        )
        marker_path: Path = storage_root / STORAGE_MARKER_NAME
        marker_path.write_text(
            f"{STORAGE_MARKER_VERSION}\n{database_identity}\n",
            encoding="utf-8",
        )
        guard: ResetTargetGuard = ResetTargetGuard(
            environment=settings.ENVIRONMENT,
            database_url=settings.DATABASE_URL,
            storage_path=str(storage_root),
            backend_root=backend_root,
        )
        target: ResetTarget = guard.parse_and_validate(
            [
                "--reset",
                "--expected-database",
                database_identity,
                "--expected-storage",
                str(storage_root),
            ]
        )
        return guard, target

    @staticmethod
    def create_staged_jpeg() -> bytes:
        image_buffer: io.BytesIO = io.BytesIO()
        Image.new("RGB", (8, 8), color=(10, 30, 50)).save(image_buffer, format="JPEG")
        return image_buffer.getvalue()


@pytest.mark.asyncio
@pytest.mark.parametrize("offset_course_sequence", [False, True], ids=["default", "offset"])
async def test_seeded_course_ids_preserve_references_and_leave_api_sequence_ready(
    client: AsyncClient,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    offset_course_sequence: bool,
) -> None:
    from scripts import seed_demo_data
    from scripts.demo_seed_report import DemoSeedReport

    backend_root: Path = tmp_path / "backend"
    backend_root.mkdir()
    guard, reset_target = DemoSeedTestFixture.create_disposable_reset_target(backend_root)
    image_bytes: bytes = DemoSeedTestFixture.create_staged_jpeg()
    staged_assets: dict[str, bytes] = {
        **{
            f"mentor:{mentor_email}": image_bytes
            for mentor_email in seed_demo_data.MENTOR_PHOTO_URLS
        },
        **{
            f"course:{course_id}": image_bytes
            for course_id in seed_demo_data.COURSE_PHOTO_URLS
        },
    }
    monkeypatch.setattr(seed_demo_data, "create_reset_guard", lambda: guard)
    monkeypatch.setattr(seed_demo_data, "stage_downloadable_assets", lambda: staged_assets)
    original_populate_demo_data: Callable[..., Awaitable[None]] = (
        seed_demo_data.populate_demo_data
    )

    if offset_course_sequence:
        async def populate_after_course_sequence_offset(
            session_factory: async_sessionmaker[AsyncSession],
            storage_root: Path,
            staged_assets: dict[str, bytes],
            administrator_password: str,
            demo_password: str,
            report: DemoSeedReport | None = None,
        ) -> None:
            async with session_factory() as sequence_session:
                await sequence_session.execute(
                    text(
                        "SELECT setval(pg_get_serial_sequence('courses', 'id'), 100, true)"
                    )
                )
                await sequence_session.commit()
            await original_populate_demo_data(
                session_factory=session_factory,
                storage_root=storage_root,
                staged_assets=staged_assets,
                administrator_password=administrator_password,
                demo_password=demo_password,
                report=report,
            )

        monkeypatch.setattr(
            seed_demo_data,
            "populate_demo_data",
            populate_after_course_sequence_offset,
        )

    await seed_demo_data.seed_demo_data(
        reset_target,
        administrator_password="synthetic wp38 administrator credential",
        demo_password="synthetic wp38 demo credential",
    )
    await seed_demo_data.seed_demo_data(
        reset_target,
        administrator_password="synthetic wp38 administrator credential",
        demo_password="synthetic wp38 demo credential",
    )

    async with AsyncSessionLocal() as session:
        seeded_courses: list[Course] = list((await session.scalars(select(Course))).all())
        course_schedules: list[CourseSchedule] = list(
            (await session.scalars(select(CourseSchedule))).all()
        )
        enrollments: list[Enrollment] = list((await session.scalars(select(Enrollment))).all())
        journals: list[Journal] = list((await session.scalars(select(Journal))).all())
        journal_entries: list[JournalEntry] = list(
            (await session.scalars(select(JournalEntry))).all()
        )
        journal_summaries: list[JournalStudentSummary] = list(
            (await session.scalars(select(JournalStudentSummary))).all()
        )
        ledger_entries: list[LedgerEntry] = list(
            (await session.scalars(select(LedgerEntry))).all()
        )
        payment_entries: list[LedgerEntry] = [
            entry for entry in ledger_entries if entry.type == LedgerEntryType.PAYMENT
        ]
        allocations: list[Allocation] = list((await session.scalars(select(Allocation))).all())
        charges: list[Charge] = list((await session.scalars(select(Charge))).all())
        mentor: User | None = await session.scalar(
            select(User).where(User.email == "sukhrob.hakimov@imkon.tj")
        )
        api_administrator: User = User(
            email="wp38-course-creator@example.invalid",
            password_hash="synthetic-only",
            first_name="WP38",
            last_name="Administrator",
            role=UserRole.SUPERADMIN,
            must_set_password=False,
        )
        session.add(api_administrator)
        await session.commit()
        api_administrator_id: int = api_administrator.id

    seeded_course_ids: set[int] = {course.id for course in seeded_courses}
    assert len(seeded_course_ids) == 4
    if offset_course_sequence:
        assert min(seeded_course_ids) > 4
    else:
        assert seeded_course_ids == {1, 2, 3, 4}
    assert all(schedule.course_id in seeded_course_ids for schedule in course_schedules)
    assert all(enrollment.course_id in seeded_course_ids for enrollment in enrollments)
    assert all(journal.course_id in seeded_course_ids for journal in journals)
    journal_ids: set[int] = {journal.id for journal in journals}
    assert all(entry.journal_id in journal_ids for entry in journal_entries)
    assert all(summary.journal_id in journal_ids for summary in journal_summaries)
    assert len(payment_entries) > 0
    charge_ids: set[int] = {charge.id for charge in charges}
    ledger_entry_ids: set[int] = {entry.id for entry in ledger_entries}
    payment_entry_ids: set[int] = {entry.id for entry in payment_entries}
    ledger_entry_by_id: dict[int, LedgerEntry] = {
        entry.id: entry for entry in ledger_entries
    }
    allocated_payment_entry_ids: set[int] = {
        allocation.ledger_entry_id
        for allocation in allocations
        if allocation.ledger_entry_id in payment_entry_ids
    }
    assert all(
        allocation.ledger_entry_id in ledger_entry_ids for allocation in allocations
    )
    assert all(allocation.charge_id in charge_ids for allocation in allocations)
    assert allocated_payment_entry_ids == payment_entry_ids
    enrollment_by_id: dict[int, Enrollment] = {
        enrollment.id: enrollment for enrollment in enrollments
    }
    course_id_by_student_id: dict[int, int] = {
        enrollment.student_id: enrollment.course_id for enrollment in enrollments
    }
    charge_by_id: dict[int, Charge] = {charge.id: charge for charge in charges}
    for allocation in allocations:
        if allocation.ledger_entry_id not in payment_entry_ids:
            continue
        charge: Charge = charge_by_id[allocation.charge_id]
        enrollment: Enrollment = enrollment_by_id[charge.enrollment_id]
        payment_entry: LedgerEntry = ledger_entry_by_id[allocation.ledger_entry_id]
        assert charge.student_id == payment_entry.student_id
        assert enrollment.student_id == payment_entry.student_id
        assert enrollment.course_id == course_id_by_student_id[payment_entry.student_id]
    for charge in charges:
        assert charge.enrollment_id in enrollment_by_id
        assert charge.amount == enrollment_by_id[charge.enrollment_id].price_at_enrollment
        assert enrollment_by_id[charge.enrollment_id].course_id in seeded_course_ids
    for course in seeded_courses:
        assert course.photo_path is not None
        assert course.photo_path == f"/storage/course/{course.id}/course_image.jpg"
        photo_relative_path: str = course.photo_path.removeprefix("/storage/")
        assert (backend_root / "storage" / photo_relative_path).is_file()

    assert mentor is not None
    response: Response = await client.post(
        "/api/v1/courses/",
        headers={
            "Authorization": (
                f"Bearer {create_access_token(api_administrator_id, UserRole.SUPERADMIN)}"
            )
        },
        json={
            "title": "WP38 API course",
            "description": "Created after guarded demo seed",
            "start_date": (date.today() + timedelta(days=1)).isoformat(),
            "end_date": (date.today() + timedelta(days=61)).isoformat(),
            "exam_type": CourseExamType.MONTHLY.value,
            "price": "100.00",
            "mentor_id": mentor.id,
            "schedules": [
                {
                    "day_of_week": 1,
                    "time_start": "10:00:00",
                    "time_end": "11:00:00",
                }
            ],
        },
    )

    assert response.status_code == 201
    assert response.json()["id"] not in seeded_course_ids
    assert response.json()["id"] > max(seeded_course_ids)


@pytest.fixture(autouse=True)
def enable_email_less_users(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "ALLOW_EMAILLESS_USERS", True)
