from unittest.mock import AsyncMock, MagicMock
import pytest
from fastapi import HTTPException
from app.models.course import CourseStatus
from app.models.user import User, UserRole
from app.schemas.course import MentorMiniResponse
from app.services.audit_service import AuditService
from app.services.journal_service import JournalService
from app.repositories.interfaces.journal_cell_lookup import JournalCellLookup


@pytest.mark.asyncio
async def test_audit_stores_enum_value() -> None:
    repository: MagicMock = MagicMock()
    service: AuditService = AuditService(MagicMock(), repository)
    await service.log(1, "update", "course", 1, {"status": (CourseStatus.ACTIVE, CourseStatus.ARCHIVED)})
    entry: object = repository.stage_log.call_args.args[0]
    assert entry.old_value == "active"
    assert entry.new_value == "archived"
