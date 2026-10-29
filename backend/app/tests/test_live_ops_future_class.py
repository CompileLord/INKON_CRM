from datetime import timedelta
from unittest.mock import AsyncMock, MagicMock
import pytest
from app.core.school_calendar import SchoolCalendar
from app.models.user import User, UserRole
from app.services.journal_query_service import JournalQueryService


@pytest.mark.asyncio
async def test_future_class_entries_have_unknown_attendance() -> None:
    service: JournalQueryService = JournalQueryService(MagicMock())
    today = SchoolCalendar.today()
    entry: dict = {"lesson_date": today + timedelta(days=1), "attendance": False, "comment": None, "has_comment": False}
    student: dict = {"student_id": 2, "first_name": "A", "last_name": "B", "color_hex": "#123456", "entries": [entry], "summary": None}
    service.get_journal = AsyncMock(return_value={"students": [student]})
    result: dict = await service.get_class_journal(1, User(id=1, role=UserRole.STUDENT))
    assert result["students"][0]["entries"][0]["attendance"] is None
