from datetime import date, datetime, timezone
from typing import Any
from unittest.mock import AsyncMock

import pytest

from app.core.config import settings
from app.workers import tasks
from app.workers.settings import WorkerSettings


class TestBusinessClock:
    @pytest.mark.asyncio
    async def test_archive_uses_business_date_at_utc_20(
        self, monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        class FrozenDateTime(datetime):
            @classmethod
            def now(cls, tz: Any = None) -> datetime:
                return datetime(2026, 10, 20, 20, tzinfo=timezone.utc).astimezone(tz)

        class FrozenDate(date):
            @classmethod
            def today(cls) -> date:
                return date(2026, 10, 20)

        session: AsyncMock = AsyncMock()
        factory: Any = AsyncMock()
        factory.return_value.__aenter__.return_value = session
        monkeypatch.setattr(tasks, "datetime", FrozenDateTime)
        monkeypatch.setattr(tasks, "date", FrozenDate)
        monkeypatch.setattr(tasks, "AsyncSessionLocal", lambda: factory.return_value)
        monkeypatch.setattr(settings, "TIMEZONE", "Asia/Dushanbe")
        await tasks.archive_expired_courses(None)
        parameters: dict[str, Any] = session.execute.call_args.args[0].compile().params
        assert datetime(2026, 10, 21).date() in parameters.values()
        assert WorkerSettings.timezone == timezone.utc

