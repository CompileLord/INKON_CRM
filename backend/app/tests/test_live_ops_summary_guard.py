from unittest.mock import AsyncMock, MagicMock
import pytest
from fastapi import HTTPException
from app.models.course import CourseStatus
from app.models.user import User, UserRole
from app.schemas.course import MentorMiniResponse
from app.services.audit_service import AuditService
from app.services.document_service import verify_magic_bytes
from app.services.journal_service import JournalService
from app.repositories.interfaces.journal_cell_lookup import JournalCellLookup


@pytest.mark.asyncio
async def test_summary_rejects_withdrawn_student() -> None:
    database: MagicMock = MagicMock()
    journal: MagicMock = MagicMock()
    journal.course_id = 4
    database.get = AsyncMock(return_value=journal)
    result: MagicMock = MagicMock()
    database.execute = AsyncMock(return_value=result)
    course: MagicMock = MagicMock()
    result.scalars.return_value.first.return_value = course
    lookup: MagicMock = MagicMock()
    lookup.lookup = AsyncMock(return_value=JournalCellLookup((), frozenset({7}), frozenset()))
    service: JournalService = JournalService(database, cell_lookup=lookup)
    user: User = User(id=1, role=UserRole.SUPERADMIN)
    with pytest.raises(HTTPException) as error:
        await service.update_exam_or_bonus(1, 7, 0, 0, 1, user)
    assert error.value.status_code == 422
    assert error.value.detail["code"] == "student_not_enrolled"
