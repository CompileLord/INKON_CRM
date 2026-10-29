from datetime import date
from unittest.mock import AsyncMock, MagicMock
import pytest
from app.repositories.interfaces.journal_repository import MentorJournalBatch
from app.services.mentor_grading_queue_service import MentorGradingQueueService


@pytest.mark.asyncio
async def test_queue_skips_period_without_expected_cells() -> None:
    course: MagicMock = MagicMock(id=1)
    journal: MagicMock = MagicMock(course_id=1, id=2, period_start=date(2020, 1, 1), period_end=date(2020, 1, 31))
    batch: MentorJournalBatch = MentorJournalBatch((course,), (journal,), (), {}, {})
    repository: MagicMock = MagicMock()
    repository.get_mentor_journal_batch = AsyncMock(return_value=batch)
    assert await MentorGradingQueueService(repository).build(1) == []
