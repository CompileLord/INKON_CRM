from datetime import date, datetime, timedelta
from unittest.mock import AsyncMock
from zoneinfo import ZoneInfo
import pytest
from app.repositories.interfaces.student_journal_history_repository import StudentJournalHistoryRecord, StudentJournalHistorySlice
from app.schemas.student_journal_history import StudentJournalHistoryCursorPayload, StudentJournalHistoryPage, StudentJournalHistoryQuery
from app.services.student_journal_history_cursor import StudentJournalHistoryCursorCodec
from app.services.student_journal_history_service import StudentJournalHistoryService


class HistoryClock:
    def __init__(self) -> None:
        self.moment: datetime = datetime(2026, 10, 20, 23, 59, tzinfo=ZoneInfo("Asia/Dushanbe"))

    def __call__(self) -> datetime:
        return self.moment


class CursorFixture:
    @staticmethod
    def payload() -> StudentJournalHistoryCursorPayload:
        return StudentJournalHistoryCursorPayload(student_id=1, course_id=5, started_only=True,
            cutoff=date(2026, 10, 20), last_period_start=date(2026, 10, 19), last_journal_id=7)


@pytest.mark.parametrize("student_id,course_id,started_only", [(2, 5, True), (1, None, True), (1, 6, True), (1, 5, False)])
def test_cursor_is_bound_to_student_and_filters(student_id: int, course_id: int | None, started_only: bool) -> None:
    codec: StudentJournalHistoryCursorCodec = StudentJournalHistoryCursorCodec("synthetic-test-key")
    token: str = codec.encode(CursorFixture.payload())
    with pytest.raises(ValueError, match="Invalid history cursor"):
        codec.decode(token, student_id, course_id, started_only)


@pytest.mark.parametrize("token", ["", "bad", "a.b.c", "a.é", "é." + "a" * 64, "a." + "a" * 64, "A" * 1025])
def test_cursor_rejects_malformed_encoding_without_internal_errors(token: str) -> None:
    with pytest.raises(ValueError, match="Invalid history cursor"):
        StudentJournalHistoryCursorCodec("synthetic-test-key").decode(token, 1, 5, True)


def test_cursor_roundtrip_and_tampering() -> None:
    codec: StudentJournalHistoryCursorCodec = StudentJournalHistoryCursorCodec("synthetic-test-key")
    payload: StudentJournalHistoryCursorPayload = CursorFixture.payload()
    token: str = codec.encode(payload)
    assert codec.decode(token, 1, 5, True) == payload
    replacement: str = "0" if token[-1] != "0" else "1"
    with pytest.raises(ValueError):
        codec.decode(token[:-1] + replacement, 1, 5, True)


@pytest.mark.asyncio
async def test_started_cutoff_is_frozen_across_midnight() -> None:
    repository: AsyncMock = AsyncMock()
    record: StudentJournalHistoryRecord = StudentJournalHistoryRecord(7, 5, "Course", "Period", date(2026, 10, 19), date(2026, 10, 20), None)
    repository.page.return_value = StudentJournalHistorySlice([record], True)
    repository.has_upcoming.return_value = False
    clock: HistoryClock = HistoryClock()
    service: StudentJournalHistoryService = StudentJournalHistoryService(repository, StudentJournalHistoryCursorCodec("synthetic-test-key"), clock)
    first: StudentJournalHistoryPage = await service.page(1, StudentJournalHistoryQuery(course_id=5, started_only=True, page_size=1))
    clock.moment += timedelta(days=2)
    await service.page(1, StudentJournalHistoryQuery(course_id=5, started_only=True, page_size=1, cursor=first.next_cursor))
    assert repository.page.await_args_list[0].args[2] == date(2026, 10, 20)
    assert repository.page.await_args_list[1].args[2] == date(2026, 10, 20)
    assert repository.page.await_args_list[1].args[3:5] == (date(2026, 10, 19), 7)


@pytest.mark.asyncio
async def test_course_access_is_checked_before_paging() -> None:
    from fastapi import HTTPException
    repository: AsyncMock = AsyncMock()
    repository.has_enrollment.return_value = False
    service: StudentJournalHistoryService = StudentJournalHistoryService(repository, StudentJournalHistoryCursorCodec("synthetic-test-key"))
    with pytest.raises(HTTPException) as error:
        await service.page(1, StudentJournalHistoryQuery(course_id=5))
    assert error.value.status_code == 403
    repository.page.assert_not_awaited()


@pytest.mark.parametrize("changes", [
    {"version": 2}, {"version": True}, {"student_id": "1"}, {"student_id": True}, {"course_id": 0},
    {"started_only": "true"}, {"cutoff": None}, {"last_journal_id": 0},
    {"last_period_start": "2026-10-21"}, {"unexpected": 1},
])
def test_signed_cursor_payload_still_requires_strict_schema(changes: dict[str, object]) -> None:
    import base64
    import hashlib
    import hmac
    import json
    data: dict[str, object] = CursorFixture.payload().model_dump(mode="json")
    data.update(changes)
    encoded: str = base64.urlsafe_b64encode(json.dumps(data).encode()).decode().rstrip("=")
    signature: str = hmac.new(b"synthetic-test-key", b"student-journal-history-v1:" + encoded.encode(), hashlib.sha256).hexdigest()
    with pytest.raises(ValueError, match="Invalid history cursor"):
        StudentJournalHistoryCursorCodec("synthetic-test-key").decode(f"{encoded}.{signature}", 1, 5, True)
