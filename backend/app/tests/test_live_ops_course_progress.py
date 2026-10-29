from datetime import date
from unittest.mock import AsyncMock, MagicMock
import pytest
from app.repositories.sqlalchemy.course_repository import SQLAlchemyCourseRepository


@pytest.mark.asyncio
async def test_course_progress_groups_without_expanding_daily_series() -> None:
    session: MagicMock = MagicMock()
    result: MagicMock = MagicMock()
    result.__iter__.return_value = iter([])
    session.execute = AsyncMock(return_value=result)
    await SQLAlchemyCourseRepository(session).get_journal_progress([1, 2], date(2026, 10, 29))
    statement: str = str(session.execute.call_args.args[0]).lower()
    assert "group by" in statement
    assert "generate_series" not in statement
    assert session.execute.await_count == 1
