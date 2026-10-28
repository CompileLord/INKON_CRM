import re
from collections import Counter
from datetime import date, datetime, timezone
from typing import Callable
from pathlib import Path

import pytest
import pytest_asyncio
from httpx import AsyncClient, Response
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.school_calendar import SchoolCalendar
from app.models.course import Course
from app.models.journal import Journal
from app.models.ledger import LedgerEntry, LedgerEntryType
from app.core.telegram_link_codes import TelegramLinkCodeHasher
from app.db.session import AsyncSessionLocal
from app.models.notification_log import NotificationLog
from app.models.outbox_event import OutboxEvent
from app.models.telegram_link import TelegramLinkCode
from app.models.user import User, UserRole
from app.tests.integration.test_remediation_wp38 import DemoSeedTestFixture
from scripts import seed_demo_data
from scripts.reset_guard import ResetTarget
from app.models.outbox_event import OutboxEventKind, OutboxEventStatus

ADMINISTRATOR_PASSWORD: str = "synthetic seed administrator credential"
DEMO_PASSWORD: str = "synthetic seed demo credential"
E164_PATTERN: re.Pattern[str] = re.compile(r"^\+[1-9][0-9]{7,14}$")
LINK_CODE_LINE: re.Pattern[str] = re.compile(r"^\s+([0-9A-HJ-NP-Z]{6})\s+(.+?)\s+expires\s", re.MULTILINE)


class SeededDatabase:
    def __init__(self, output: str, target: ResetTarget) -> None:
        self.output: str = output
        self.target: ResetTarget = target


@pytest_asyncio.fixture
async def seeded(tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]) -> SeededDatabase:
    backend_root: Path = tmp_path / "backend"
    backend_root.mkdir()
    guard, reset_target = DemoSeedTestFixture.create_disposable_reset_target(backend_root)
    image_bytes: bytes = DemoSeedTestFixture.create_staged_jpeg()
    staged_assets: dict[str, bytes] = {
        **{f"mentor:{email}": image_bytes for email in seed_demo_data.MENTOR_PHOTO_URLS},
        **{f"course:{course_id}": image_bytes for course_id in seed_demo_data.COURSE_PHOTO_URLS},
    }
    monkeypatch.setattr(seed_demo_data, "create_reset_guard", lambda: guard)
    monkeypatch.setattr(seed_demo_data, "stage_downloadable_assets", lambda: staged_assets)
    await seed_demo_data.seed_demo_data(reset_target, ADMINISTRATOR_PASSWORD, DEMO_PASSWORD)
    return SeededDatabase(capsys.readouterr().out, reset_target)


async def all_users() -> list[User]:
    session: AsyncSession
    async with AsyncSessionLocal() as session:
        return list((await session.scalars(select(User))).all())


async def students() -> list[User]:
    return [user for user in await all_users() if user.role == UserRole.STUDENT]


@pytest.mark.asyncio
async def test_every_seeded_phone_is_e164_and_every_student_can_log_in_and_be_reached(seeded: SeededDatabase) -> None:
    users: list[User] = await all_users()
    assert len(users) > 30
    user: User
    for user in users:
        for phone in (user.phone, user.parent_phone):
            assert phone is None or E164_PATTERN.fullmatch(phone), phone
    for student in await students():
        assert student.email or student.phone
        assert student.phone or student.parent_phone
        assert student.parent_telegram_chat_id is None
        assert student.must_set_password is False


@pytest.mark.asyncio
async def test_students_cover_every_contact_case_including_siblings(seeded: SeededDatabase) -> None:
    cohort: list[User] = await students()
    assert any(s.email and s.phone and s.parent_phone for s in cohort)
    assert any(s.email is None and s.phone and s.parent_phone is None for s in cohort)
    assert any(s.email and s.phone is None and s.parent_phone for s in cohort)
    shared: Counter[str] = Counter(s.parent_phone for s in cohort if s.parent_phone)
    assert any(count >= 2 for count in shared.values())
    own_phones: list[str] = [s.phone for s in cohort if s.phone]
    assert len(own_phones) == len(set(own_phones))


@pytest.mark.asyncio
async def test_seeding_queues_no_sms_email_or_telegram_events(seeded: SeededDatabase) -> None:
    session: AsyncSession
    async with AsyncSessionLocal() as session:
        assert await session.scalar(select(func.count()).select_from(OutboxEvent)) == 0
        assert await session.scalar(select(func.count()).select_from(NotificationLog)) == 0


@pytest.mark.asyncio
async def test_active_parent_link_codes_exist_and_printed_codes_match_stored_hashes(seeded: SeededDatabase) -> None:
    session: AsyncSession
    async with AsyncSessionLocal() as session:
        rows: list[TelegramLinkCode] = list((await session.scalars(select(TelegramLinkCode))).all())
    now: datetime = datetime.now(timezone.utc)
    active: list[TelegramLinkCode] = [row for row in rows if row.expires_at > now]
    assert len(active) >= 3
    printed: list[tuple[str, str]] = LINK_CODE_LINE.findall(seeded.output)
    assert len(printed) == len(active)
    hasher: TelegramLinkCodeHasher = TelegramLinkCodeHasher(settings.JWT_SECRET_KEY)
    stored_hashes: set[str] = {row.code_hash for row in active}
    assert {hasher.hash_code(code) for code, _ in printed} == stored_hashes


@pytest.mark.asyncio
async def test_report_lists_logins_without_echoing_provisioned_passwords(seeded: SeededDatabase) -> None:
    assert "superadmin@mail.com" in seeded.output and "accountant@test.com" in seeded.output
    assert ADMINISTRATOR_PASSWORD not in seeded.output and DEMO_PASSWORD not in seeded.output
    phone_only: User = next(s for s in await students() if s.email is None)
    assert phone_only.phone in seeded.output


@pytest.mark.asyncio
async def test_demo_logins_authenticate_by_email_and_by_phone(client: AsyncClient, seeded: SeededDatabase) -> None:
    cohort: list[User] = await students()
    phone_only: User = next(s for s in cohort if s.email is None)
    emailed: User = next(s for s in cohort if s.email)
    attempts: list[tuple[str, str]] = [
        ("superadmin@mail.com", ADMINISTRATOR_PASSWORD),
        ("accountant@test.com", DEMO_PASSWORD),
        ("sukhrob.hakimov@imkon.tj", DEMO_PASSWORD),
        (emailed.email, DEMO_PASSWORD),
        (phone_only.phone, DEMO_PASSWORD),
    ]
    login: str
    password: str
    for login, password in attempts:
        response: Response = await client.post("/api/v1/auth/login", json={"login": login, "password": password})
        assert response.status_code == 200, login
        assert response.json()["must_set_password"] is False


@pytest.mark.asyncio
async def test_reseeding_removes_stale_outbox_events_of_the_previous_dataset(seeded: SeededDatabase) -> None:
    session: AsyncSession
    async with AsyncSessionLocal() as session:
        session.add(OutboxEvent(
            kind=OutboxEventKind.STUDENT_PASSWORD_SMS, status=OutboxEventStatus.PENDING, recipient_email="",
            subject="", recipient_phone="+992900000000", target_user_id=1, correlation_key="stale",
            next_attempt_at=datetime.now(timezone.utc), expires_at=datetime.now(timezone.utc),
        ))
        await session.commit()
    await seed_demo_data.seed_demo_data(seeded.target, ADMINISTRATOR_PASSWORD, DEMO_PASSWORD)
    async with AsyncSessionLocal() as session:
        assert await session.scalar(select(func.count()).select_from(OutboxEvent)) == 0


@pytest.fixture(autouse=True)
def enable_email_less_users(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "ALLOW_EMAILLESS_USERS", True)


@pytest.fixture(params=[None, date(2026, 8, 10)])
def seed_school_day(request: pytest.FixtureRequest, freeze_school_today: Callable[[date], None], monkeypatch: pytest.MonkeyPatch) -> date:
    school_day: date | None = request.param
    if school_day is not None:
        freeze_school_today(school_day)
        monkeypatch.setattr(SchoolCalendar, "today", staticmethod(lambda: school_day))
    return SchoolCalendar.today()


@pytest.mark.asyncio
async def test_seed_courses_remain_current_with_history(seed_school_day: date, seeded: SeededDatabase) -> None:
    async with AsyncSessionLocal() as session:
        courses: list[Course] = list((await session.scalars(select(Course).order_by(Course.id))).all())
        assert len(courses) == 4
        assert all(course.start_date <= seed_school_day <= course.end_date for course in courses)
        assert all(course.start_date < seed_school_day for course in courses[:2])
        assert all(course.start_date == seed_school_day.replace(day=1) for course in courses[2:])
        assert all('2026' not in course.title for course in courses)
        assert await session.scalar(select(func.count()).select_from(Journal)) > 0
        assert await session.scalar(select(func.count()).select_from(LedgerEntry).where(LedgerEntry.type == LedgerEntryType.PAYMENT)) == 28
