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


def test_mentor_history_accepts_missing_email() -> None:
    response: MentorMiniResponse = MentorMiniResponse(id=1, first_name="A", last_name="B", email=None, is_deleted=True)
    assert response.email is None

@pytest.mark.asyncio
async def test_course_rejects_non_mentor_on_create_and_patch() -> None:
    from datetime import date, time
    from decimal import Decimal
    from app.schemas.course import CourseCreate, CourseScheduleCreate, CourseUpdate
    from app.models.course import CourseExamType
    from app.services.course_service import CourseService

    repository: MagicMock = MagicMock()
    repository.get_by_id = AsyncMock(return_value=User(id=2, role=UserRole.STUDENT, is_deleted=False))
    course_repository: MagicMock = MagicMock()
    course_repository.get_by_id = AsyncMock(return_value=MagicMock(mentor_id=3))
    service: CourseService = CourseService(MagicMock(), storage=MagicMock(), user_repo=repository, course_repo=course_repository)
    actor: User = User(id=1, role=UserRole.SUPERADMIN)
    data: CourseCreate = CourseCreate(title="Course", description="", start_date=date(2026, 1, 1), end_date=date(2026, 2, 1), exam_type=CourseExamType.WEEKLY, price=Decimal("100"), mentor_id=2, schedules=[CourseScheduleCreate(day_of_week=1, time_start=time(10), time_end=time(11))])
    with pytest.raises(HTTPException) as error:
        await service.create_course(data, actor)
    assert error.value.status_code == 422 and error.value.detail["code"] == "mentor_role_required"
    with pytest.raises(HTTPException) as error:
        await service.update_course(1, CourseUpdate(mentor_id=2), actor)
    assert error.value.status_code == 422 and error.value.detail["code"] == "mentor_role_required"
    course_repository.get_by_id.return_value.mentor_id = 2
    with pytest.raises(HTTPException) as error:
        await service.update_course(1, CourseUpdate(mentor_id=2), actor)
    assert error.value.status_code == 422 and error.value.detail["code"] == "mentor_role_required"
