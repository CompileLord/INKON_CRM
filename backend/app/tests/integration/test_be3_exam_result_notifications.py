import asyncio
import io
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from typing import Any
import pytest
import pytest_asyncio
from aiogram.exceptions import TelegramForbiddenError, TelegramNetworkError
from aiogram.methods import SendPhoto
from httpx import AsyncClient
from PIL import Image, ImageFont
from sqlalchemy import select
from app.core.config import settings
from app.core.security import create_access_token
from app.models.course import Course
from app.models.exam_result_notification import ExamResultNotification, ExamResultNotificationStatus
from app.models.journal import Journal
from app.models.journal_student_summary import JournalStudentSummary
from app.models.outbox_event import OutboxEvent
from app.models.telegram_link import TelegramChatPreference
from app.models.user import User, UserRole
from app.repositories.sqlalchemy.exam_result_notification_repository import SQLAlchemyExamResultNotificationRepository
from app.services.exam_result_image import ExamResultCardData, ExamResultSvgRenderer, ResvgPngRasterizer
from app.services.exam_result_scheduling_service import ExamResultSchedulingService
from app.workers.exam_result_delivery import ExamResultDeliveryWorker
from conftest import TestingSessionLocal

PARENT_CHAT_ID: int = 555001
DELAY_SECONDS: int = 14400
BASE_TIME: datetime = datetime(2026, 3, 10, 9, 0, tzinfo=timezone.utc)


@dataclass
class RecordingSender:
    photos: list[tuple[int, bytes, str]] = field(default_factory=list)
    failures: list[Exception] = field(default_factory=list)

    async def send_photo(self, chat_id: int, png_bytes: bytes, caption: str) -> None:
        if self.failures:
            raise self.failures.pop(0)
        self.photos.append((chat_id, png_bytes, caption))


class RecordingRenderer(ExamResultSvgRenderer):
    def __init__(self) -> None:
        super().__init__()
        self.rendered: list[tuple[str, str]] = []

    def render(self, data: ExamResultCardData, language: str) -> str:
        svg_markup: str = super().render(data, language)
        self.rendered.append((language, svg_markup))
        return svg_markup


class MutableClock:
    def __init__(self, moment: datetime) -> None:
        self.moment: datetime = moment

    def __call__(self) -> datetime:
        return self.moment


@dataclass(frozen=True)
class Scenario:
    student_id: int
    journal_id: int
    course_id: int
    mentor_id: int


@pytest_asyncio.fixture
async def scenario(test_mentor: User, test_student: User) -> Scenario:
    session: Any
    async with TestingSessionLocal() as session:
        student: User | None = await session.get(User, test_student.id)
        assert student is not None
        student.parent_telegram_chat_id = PARENT_CHAT_ID
        session.add(TelegramChatPreference(chat_id=PARENT_CHAT_ID, language="tg"))
        course: Course = Course(
            title="Python Pro", description="d", start_date=date(2026, 1, 1), end_date=date(2026, 12, 1),
            exam_type="monthly", price=Decimal("10.00"), mentor_id=test_mentor.id,
        )
        session.add(course)
        await session.flush()
        journal: Journal = Journal(
            course_id=course.id, period_label="Month 1", period_start=date(2026, 3, 1),
            period_end=date(2026, 3, 28), period_type="month", exam_max_score=60,
        )
        session.add(journal)
        await session.flush()
        session.add(JournalStudentSummary(
            journal_id=journal.id, student_id=test_student.id, exam_score=45, sum_score=92,
            max_period_score=130, attendance_count=14, total_lessons=16,
        ))
        await session.commit()
        return Scenario(test_student.id, journal.id, course.id, test_mentor.id)


async def register_edit(scenario: Scenario, previous: int, new: int, edited_at: datetime) -> None:
    session: Any
    async with TestingSessionLocal() as session:
        service: ExamResultSchedulingService = ExamResultSchedulingService(
            SQLAlchemyExamResultNotificationRepository(session), DELAY_SECONDS
        )
        await service.register_exam_score_edit(scenario.student_id, scenario.journal_id, previous, new, edited_at)
        await session.commit()


async def all_notifications() -> list[ExamResultNotification]:
    session: Any
    async with TestingSessionLocal() as session:
        result = await session.execute(select(ExamResultNotification).order_by(ExamResultNotification.id))
        return list(result.scalars().all())


async def force_due(moment: datetime) -> None:
    session: Any
    async with TestingSessionLocal() as session:
        for row in (await session.execute(select(ExamResultNotification))).scalars().all():
            if row.status == ExamResultNotificationStatus.PENDING.value:
                row.due_at = moment
        await session.commit()


def build_worker(sender: RecordingSender, clock: MutableClock, renderer: RecordingRenderer | None = None) -> ExamResultDeliveryWorker:
    return ExamResultDeliveryWorker(
        TestingSessionLocal, sender, renderer=renderer or RecordingRenderer(), clock=clock
    )


def sample_card(student_name: str = "Ali Valiev") -> ExamResultCardData:
    return ExamResultCardData(
        student_name=student_name, course_title="Python Pro", period_label="Month 1", exam_score=45,
        exam_max_score=60, total_score=92, max_period_score=130, attendance_count=14, total_lessons=16,
        rendered_at=datetime(2026, 3, 10, 14, 0),
    )


@pytest.mark.asyncio
async def test_first_edit_creates_one_pending_row_due_in_delay(scenario: Scenario) -> None:
    await register_edit(scenario, 0, 45, BASE_TIME)
    rows: list[ExamResultNotification] = await all_notifications()
    assert len(rows) == 1
    assert rows[0].status == "pending"
    assert rows[0].due_at == BASE_TIME + timedelta(seconds=DELAY_SECONDS)


@pytest.mark.asyncio
async def test_unchanged_score_creates_nothing(scenario: Scenario) -> None:
    await register_edit(scenario, 45, 45, BASE_TIME)
    assert await all_notifications() == []


@pytest.mark.asyncio
async def test_second_edit_debounces_to_one_pending_row_with_moved_due_at(scenario: Scenario) -> None:
    await register_edit(scenario, 0, 45, BASE_TIME)
    later: datetime = BASE_TIME + timedelta(hours=3)
    await register_edit(scenario, 45, 50, later)
    rows: list[ExamResultNotification] = await all_notifications()
    assert len(rows) == 1
    assert rows[0].due_at == later + timedelta(seconds=DELAY_SECONDS)


@pytest.mark.asyncio
async def test_clearing_score_cancels_pending_notification(scenario: Scenario) -> None:
    await register_edit(scenario, 0, 45, BASE_TIME)
    await register_edit(scenario, 45, 0, BASE_TIME + timedelta(minutes=5))
    rows: list[ExamResultNotification] = await all_notifications()
    assert [row.status for row in rows] == ["skipped"]
    assert rows[0].last_error == "exam_score_cleared"
    sender: RecordingSender = RecordingSender()
    clock: MutableClock = MutableClock(BASE_TIME + timedelta(days=1))
    assert await build_worker(sender, clock).run_once() == 0
    assert sender.photos == []


@pytest.mark.asyncio
async def test_concurrent_edits_never_create_duplicate_pending_rows(scenario: Scenario) -> None:
    await asyncio.gather(*[
        register_edit(scenario, index, index + 1, BASE_TIME + timedelta(seconds=index)) for index in range(12)
    ])
    rows: list[ExamResultNotification] = await all_notifications()
    assert len(rows) == 1
    assert rows[0].status == "pending"


@pytest.mark.asyncio
async def test_notification_is_not_delivered_before_due_time(scenario: Scenario) -> None:
    await register_edit(scenario, 0, 45, BASE_TIME)
    sender: RecordingSender = RecordingSender()
    clock: MutableClock = MutableClock(BASE_TIME + timedelta(seconds=DELAY_SECONDS - 1))
    assert await build_worker(sender, clock).run_once() == 0
    assert sender.photos == []


@pytest.mark.asyncio
async def test_due_notification_sends_localized_png_photo_once(scenario: Scenario) -> None:
    await register_edit(scenario, 0, 45, BASE_TIME)
    sender: RecordingSender = RecordingSender()
    renderer: RecordingRenderer = RecordingRenderer()
    clock: MutableClock = MutableClock(BASE_TIME + timedelta(seconds=DELAY_SECONDS))
    worker: ExamResultDeliveryWorker = build_worker(sender, clock, renderer)
    assert await worker.run_once() == 1
    assert await worker.run_once() == 0
    assert len(sender.photos) == 1
    chat_id: int
    png_bytes: bytes
    caption: str
    chat_id, png_bytes, caption = sender.photos[0]
    assert chat_id == PARENT_CHAT_ID
    assert "Ҳафтаи" not in caption and "Моҳи 1" in caption
    assert renderer.rendered[0][0] == "tg"
    row: ExamResultNotification = (await all_notifications())[0]
    assert row.status == "sent"
    assert row.sent_at == clock.moment


@pytest.mark.asyncio
async def test_worker_sends_latest_values_not_values_from_scheduling_time(scenario: Scenario) -> None:
    await register_edit(scenario, 0, 45, BASE_TIME)
    session: Any
    async with TestingSessionLocal() as session:
        summary: JournalStudentSummary = (await session.execute(select(JournalStudentSummary))).scalars().one()
        summary.exam_score = 58
        summary.sum_score = 111
        await session.commit()
    renderer: RecordingRenderer = RecordingRenderer()
    clock: MutableClock = MutableClock(BASE_TIME + timedelta(seconds=DELAY_SECONDS))
    await build_worker(RecordingSender(), clock, renderer).run_once()
    svg_markup: str = renderer.rendered[0][1]
    assert "58/60" in svg_markup and "111/130" in svg_markup
    assert "45/60" not in svg_markup


@pytest.mark.asyncio
async def test_student_without_parent_chat_is_skipped_silently(scenario: Scenario) -> None:
    await register_edit(scenario, 0, 45, BASE_TIME)
    session: Any
    async with TestingSessionLocal() as session:
        student: User = await session.get(User, scenario.student_id)
        student.parent_telegram_chat_id = None
        await session.commit()
    sender: RecordingSender = RecordingSender()
    clock: MutableClock = MutableClock(BASE_TIME + timedelta(seconds=DELAY_SECONDS))
    await build_worker(sender, clock).run_once()
    row: ExamResultNotification = (await all_notifications())[0]
    assert sender.photos == []
    assert (row.status, row.last_error) == ("skipped", "no_parent_chat")


@pytest.mark.asyncio
async def test_deleted_student_is_skipped(scenario: Scenario) -> None:
    await register_edit(scenario, 0, 45, BASE_TIME)
    session: Any
    async with TestingSessionLocal() as session:
        student: User = await session.get(User, scenario.student_id)
        student.is_deleted = True
        await session.commit()
    sender: RecordingSender = RecordingSender()
    await build_worker(sender, MutableClock(BASE_TIME + timedelta(seconds=DELAY_SECONDS))).run_once()
    row: ExamResultNotification = (await all_notifications())[0]
    assert sender.photos == []
    assert (row.status, row.last_error) == ("skipped", "student_deleted")


@pytest.mark.asyncio
async def test_deleted_course_is_skipped(scenario: Scenario) -> None:
    await register_edit(scenario, 0, 45, BASE_TIME)
    session: Any
    async with TestingSessionLocal() as session:
        course: Course = await session.get(Course, scenario.course_id)
        course.is_deleted = True
        await session.commit()
    sender: RecordingSender = RecordingSender()
    await build_worker(sender, MutableClock(BASE_TIME + timedelta(seconds=DELAY_SECONDS))).run_once()
    row: ExamResultNotification = (await all_notifications())[0]
    assert sender.photos == []
    assert (row.status, row.last_error) == ("skipped", "course_deleted")


@pytest.mark.asyncio
async def test_blocked_bot_is_skipped_not_retried(scenario: Scenario) -> None:
    await register_edit(scenario, 0, 45, BASE_TIME)
    sender: RecordingSender = RecordingSender(
        failures=[TelegramForbiddenError(method=SendPhoto(chat_id=1, photo="x"), message="blocked")]
    )
    await build_worker(sender, MutableClock(BASE_TIME + timedelta(seconds=DELAY_SECONDS))).run_once()
    row: ExamResultNotification = (await all_notifications())[0]
    assert (row.status, row.last_error) == ("skipped", "parent_chat_unavailable")


@pytest.mark.asyncio
async def test_telegram_error_retries_with_backoff_and_sends_exactly_once(scenario: Scenario) -> None:
    await register_edit(scenario, 0, 45, BASE_TIME)
    sender: RecordingSender = RecordingSender(
        failures=[TelegramNetworkError(method=SendPhoto(chat_id=1, photo="x"), message="timeout")]
    )
    clock: MutableClock = MutableClock(BASE_TIME + timedelta(seconds=DELAY_SECONDS))
    worker: ExamResultDeliveryWorker = build_worker(sender, clock)
    assert await worker.run_once() == 1
    retry_row: ExamResultNotification = (await all_notifications())[0]
    assert retry_row.status == "pending"
    assert retry_row.due_at == clock.moment + timedelta(seconds=60)
    assert retry_row.last_error == "TelegramNetworkError"
    assert sender.photos == []
    assert await worker.run_once() == 0
    clock.moment += timedelta(seconds=61)
    assert await worker.run_once() == 1
    assert len(sender.photos) == 1
    clock.moment += timedelta(days=1)
    assert await worker.run_once() == 0
    assert len(sender.photos) == 1
    assert (await all_notifications())[0].status == "sent"


@pytest.mark.asyncio
async def test_repeated_failures_end_in_failed_after_max_attempts(scenario: Scenario) -> None:
    await register_edit(scenario, 0, 45, BASE_TIME)
    sender: RecordingSender = RecordingSender(
        failures=[TelegramNetworkError(method=SendPhoto(chat_id=1, photo="x"), message="down") for _ in range(10)]
    )
    clock: MutableClock = MutableClock(BASE_TIME + timedelta(seconds=DELAY_SECONDS))
    worker: ExamResultDeliveryWorker = build_worker(sender, clock)
    for _ in range(8):
        await worker.run_once()
        clock.moment += timedelta(hours=2)
    row: ExamResultNotification = (await all_notifications())[0]
    assert row.status == "failed"
    assert row.attempt_count == 5
    assert sender.photos == []


@pytest.mark.asyncio
async def test_crash_after_send_started_never_resends(scenario: Scenario) -> None:
    await register_edit(scenario, 0, 45, BASE_TIME)
    due_time: datetime = BASE_TIME + timedelta(seconds=DELAY_SECONDS)
    session: Any
    async with TestingSessionLocal() as session:
        repository: SQLAlchemyExamResultNotificationRepository = SQLAlchemyExamResultNotificationRepository(session)
        claimed = await repository.claim_due_batch("crashed-worker", 180, 10, due_time)
        assert len(claimed) == 1
        assert await repository.mark_send_started(claimed[0].id, "crashed-worker", due_time)
        await session.commit()
    sender: RecordingSender = RecordingSender()
    clock: MutableClock = MutableClock(due_time + timedelta(minutes=10))
    worker: ExamResultDeliveryWorker = build_worker(sender, clock)
    await worker.run_once()
    await worker.run_once()
    row: ExamResultNotification = (await all_notifications())[0]
    assert sender.photos == []
    assert (row.status, row.last_error) == ("failed", "delivery_outcome_unknown")


@pytest.mark.asyncio
async def test_crash_before_send_started_is_released_and_sent_once(scenario: Scenario) -> None:
    await register_edit(scenario, 0, 45, BASE_TIME)
    due_time: datetime = BASE_TIME + timedelta(seconds=DELAY_SECONDS)
    session: Any
    async with TestingSessionLocal() as session:
        claimed = await SQLAlchemyExamResultNotificationRepository(session).claim_due_batch("crashed", 180, 10, due_time)
        assert len(claimed) == 1
        await session.commit()
    sender: RecordingSender = RecordingSender()
    clock: MutableClock = MutableClock(due_time + timedelta(minutes=10))
    await build_worker(sender, clock).run_once()
    assert len(sender.photos) == 1


@pytest.mark.asyncio
async def test_edit_during_delivery_creates_new_pending_and_stale_attempt_is_superseded(scenario: Scenario) -> None:
    await register_edit(scenario, 0, 45, BASE_TIME)
    due_time: datetime = BASE_TIME + timedelta(seconds=DELAY_SECONDS)
    session: Any
    async with TestingSessionLocal() as session:
        repository: SQLAlchemyExamResultNotificationRepository = SQLAlchemyExamResultNotificationRepository(session)
        claimed = await repository.claim_due_batch("owner", 180, 10, due_time)
        await session.commit()
    await register_edit(scenario, 45, 55, due_time)
    rows: list[ExamResultNotification] = await all_notifications()
    assert sorted(row.status for row in rows) == ["claimed", "pending"]
    async with TestingSessionLocal() as session:
        repository = SQLAlchemyExamResultNotificationRepository(session)
        assert await repository.mark_retry(claimed[0].id, "owner", "TelegramNetworkError", due_time, due_time)
        await session.commit()
    final_rows: list[ExamResultNotification] = await all_notifications()
    assert sorted(row.status for row in final_rows) == ["pending", "skipped"]


@pytest.mark.asyncio
async def test_two_workers_claim_each_notification_once(scenario: Scenario) -> None:
    await register_edit(scenario, 0, 45, BASE_TIME)
    sender: RecordingSender = RecordingSender()
    clock: MutableClock = MutableClock(BASE_TIME + timedelta(seconds=DELAY_SECONDS))
    counts: list[int] = await asyncio.gather(
        build_worker(sender, clock).run_once(), build_worker(sender, clock).run_once()
    )
    assert sorted(counts) == [0, 1]
    assert len(sender.photos) == 1


class TestSummaryEndpointIntegration:
    def headers(self, user_id: int) -> dict[str, str]:
        return {"Authorization": f"Bearer {create_access_token(user_id, UserRole.SUPERADMIN)}"}

    async def patch_summary(
        self, client: AsyncClient, scenario: Scenario, admin: User, exam_score: int, bonus_score: int, version: int
    ) -> dict[str, Any]:
        response = await client.patch(
            f"/api/v1/journals/{scenario.journal_id}/students/{scenario.student_id}/summary",
            json={"exam_score": exam_score, "bonus_score": bonus_score, "version": version},
            headers=self.headers(admin.id),
        )
        assert response.status_code == 200, response.text
        return response.json()

    @pytest.mark.asyncio
    async def test_endpoint_schedules_debounces_ignores_bonus_only_and_cancels(
        self, client: AsyncClient, scenario: Scenario, test_admin: User
    ) -> None:
        before: datetime = datetime.now(timezone.utc)
        first: dict[str, Any] = await self.patch_summary(client, scenario, test_admin, 50, 0, 1)
        rows: list[ExamResultNotification] = await all_notifications()
        assert len(rows) == 1
        expected_delay: timedelta = timedelta(seconds=settings.EXAM_RESULT_NOTIFICATION_DELAY_SECONDS)
        assert settings.EXAM_RESULT_NOTIFICATION_DELAY_SECONDS == 14400
        assert before + expected_delay <= rows[0].due_at <= datetime.now(timezone.utc) + expected_delay
        first_due: datetime = rows[0].due_at
        bonus_only: dict[str, Any] = await self.patch_summary(client, scenario, test_admin, 50, 5, first["version"])
        assert (await all_notifications())[0].due_at == first_due
        second: dict[str, Any] = await self.patch_summary(client, scenario, test_admin, 51, 5, bonus_only["version"])
        rows = await all_notifications()
        assert len(rows) == 1
        assert rows[0].due_at > first_due
        await self.patch_summary(client, scenario, test_admin, 0, 5, second["version"])
        rows = await all_notifications()
        assert [(row.status, row.last_error) for row in rows] == [("skipped", "exam_score_cleared")]
        session: Any
        async with TestingSessionLocal() as session:
            assert (await session.execute(select(OutboxEvent))).scalars().all() == []


class TestExamResultImage:
    languages_with_labels: dict[str, tuple[str, str, str, str]] = {
        "tg": ("Натиҷаи имтиҳон", "Имтиҳон", "Холи умумии давра", "14 аз 16 дарс"),
        "ru": ("Результат экзамена", "Экзамен", "Итог периода", "14 из 16 занятий"),
        "en": ("Exam result", "Exam", "Period total", "14 of 16 lessons"),
    }

    @pytest.mark.parametrize("language", ["tg", "ru", "en"])
    def test_svg_contains_localized_labels_and_values(self, language: str) -> None:
        svg_markup: str = ExamResultSvgRenderer().render(sample_card(), language)
        label: str
        for label in self.languages_with_labels[language]:
            assert label in svg_markup
        for expected in ("KITOB", "Ali Valiev", "Python Pro", "45/60", "92/130", "71%", "10.03.2026"):
            assert expected in svg_markup

    def test_period_label_is_localized_per_language(self) -> None:
        renderer: ExamResultSvgRenderer = ExamResultSvgRenderer()
        assert renderer.localize_period_label("Month 1", "en") == "Month 1"
        assert renderer.localize_period_label("Month 1", "ru") == "Месяц 1"
        assert renderer.localize_period_label("Week 3", "tg") == "Ҳафтаи 3"
        assert renderer.localize_period_label("Custom", "ru") == "Custom"

    def test_user_text_is_escaped_and_cannot_inject_markup(self) -> None:
        hostile: str = '&"<script>x</script><image/>'
        svg_markup: str = ExamResultSvgRenderer().render(sample_card(student_name=hostile), "en")
        assert "<script" not in svg_markup
        assert "<image" not in svg_markup
        assert "&lt;script&gt;" in svg_markup
        assert "&amp;" in svg_markup
        ResvgPngRasterizer().rasterize(svg_markup)

    def test_control_characters_are_stripped_so_svg_stays_parseable(self) -> None:
        svg_markup: str = ExamResultSvgRenderer().render(sample_card(student_name="Ali\x00\x0bVal"), "en")
        assert "\x00" not in svg_markup and "\x0b" not in svg_markup
        assert ResvgPngRasterizer().rasterize(svg_markup).startswith(b"\x89PNG")

    def test_png_is_valid_square_image_in_brand_colors(self) -> None:
        svg_markup: str = ExamResultSvgRenderer().render(sample_card(), "ru")
        png_bytes: bytes = ResvgPngRasterizer().rasterize(svg_markup)
        assert png_bytes.startswith(b"\x89PNG\r\n\x1a\n")
        image: Image.Image = Image.open(io.BytesIO(png_bytes))
        image.load()
        assert image.size == (1080, 1080)
        assert image.convert("RGB").getpixel((540, 100)) == (8, 61, 145)

    def test_bundled_font_has_real_glyphs_for_tajik_and_cyrillic_letters(self) -> None:
        font: ImageFont.FreeTypeFont = ImageFont.truetype(str(ResvgPngRasterizer.font_directory / "OpenSans-Bold.ttf"), 64)
        missing_glyph: bytes = bytes(font.getmask(""))
        letter: str
        for letter in "ӣӯҳҷқғӢӮҲҶҚҒжщыю":
            assert bytes(font.getmask(letter)) != missing_glyph

    def test_tajik_text_changes_rendered_pixels_compared_to_missing_glyphs(self) -> None:
        rasterizer: ResvgPngRasterizer = ResvgPngRasterizer()
        renderer: ExamResultSvgRenderer = ExamResultSvgRenderer()
        tajik_png: bytes = rasterizer.rasterize(renderer.render(sample_card("ӣӯҳҷқғ"), "tg"))
        missing_png: bytes = rasterizer.rasterize(renderer.render(sample_card(""), "tg"))
        assert tajik_png != missing_png

    def test_caption_is_localized(self) -> None:
        renderer: ExamResultSvgRenderer = ExamResultSvgRenderer()
        assert renderer.build_caption(sample_card(), "ru") == "Результат экзамена Ali Valiev: Python Pro, Месяц 1."
        assert renderer.build_caption(sample_card(), "en") == "Exam result for Ali Valiev: Python Pro, Month 1."
