import resource
from time import perf_counter
from typing import Any
import pytest
from httpx import AsyncClient, Response
from sqlalchemy import event
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.user import User
from app.tests.integration.test_remediation_wp40 import HistoryFixture
from conftest import test_engine


@pytest.mark.asyncio
@pytest.mark.parametrize("period_count", [100, 10000])
async def test_history_fetch_and_response_stay_bounded_at_scale(
    client: AsyncClient, db_session: AsyncSession, test_student: User, test_mentor: User, period_count: int,
) -> None:
    await HistoryFixture.create(db_session, test_student, test_mentor, period_count)
    trials: list[dict[str, Any]] = []
    page_size: int
    trial: int
    for page_size in (20, 100):
        for trial in range(3):
            captured: list[tuple[str, int, int]] = []

            def record(connection: Any, cursor: Any, statement: str, parameters: Any, context: Any, executemany: bool) -> None:
                normalized: str = statement.lower()
                if not normalized.startswith("select exists") and ("from journals" in normalized or "from journal_student_summaries" in normalized):
                    captured.append(("summary" if "from journal_student_summaries" in normalized else "journal", cursor.rowcount, len(parameters)))

            event.listen(test_engine.sync_engine, "after_cursor_execute", record)
            rss_before: int = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
            started: float = perf_counter()
            try:
                response: Response = await client.get("/api/v1/students/me/journals/page", params={"page_size": page_size}, headers=HistoryFixture.headers(test_student))
            finally:
                elapsed: float = perf_counter() - started
                event.remove(test_engine.sync_engine, "after_cursor_execute", record)
            assert response.status_code == 200
            assert len(response.json()["items"]) == page_size
            journal_fetch: list[tuple[str, int, int]] = [entry for entry in captured if entry[0] == "journal"]
            summary_fetch: list[tuple[str, int, int]] = [entry for entry in captured if entry[0] == "summary"]
            assert len(journal_fetch) == len(summary_fetch) == 1
            assert journal_fetch[0][1] == min(period_count, page_size + 1)
            assert summary_fetch[0][1] == page_size
            assert summary_fetch[0][2] <= page_size + 1
            assert journal_fetch[0][2] <= 4
            assert len(response.content) < 100000
            trials.append({"periods": period_count, "page_size": page_size, "trial": trial,
                "fetched_rows": [entry[1] for entry in captured], "sql_parameters": [entry[2] for entry in captured],
                "response_bytes": len(response.content), "rss_high_water_kib": resource.getrusage(resource.RUSAGE_SELF).ru_maxrss,
                "rss_high_water_delta_kib": resource.getrusage(resource.RUSAGE_SELF).ru_maxrss - rss_before, "elapsed_seconds": elapsed})
    print(trials)
