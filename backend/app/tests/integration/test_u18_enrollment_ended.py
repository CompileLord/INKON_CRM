from datetime import date
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException

from app.models.course import CourseStatus
from app.services.enrollment_service import EnrollmentService
from app.services.finance_service import FinanceService


@pytest.mark.asyncio
@pytest.mark.parametrize("end_date", [date(2026, 10, 26), date(2026, 10, 27)])
async def test_enrollment_rejects_ended_course(end_date: date) -> None:
    session: MagicMock = MagicMock()
    course_repository: MagicMock = MagicMock()
    course_repository.get_by_id = AsyncMock(return_value=SimpleNamespace(
        is_deleted=False, status=CourseStatus.ACTIVE, end_date=end_date,
    ))
    enrollment_repository: MagicMock = MagicMock()
    user_repository: MagicMock = MagicMock()
    service: EnrollmentService = EnrollmentService(
        session, enrollment_repository, course_repository, user_repository,
    )
    with patch.object(FinanceService, "lock_student_accounts", new_callable=AsyncMock), patch(
        "app.services.finance_service.get_dushanbe_today", return_value=date(2026, 10, 27),
    ):
        with pytest.raises(HTTPException) as error:
            await service.enroll_student(1, 2, MagicMock())

    assert error.value.status_code == 422
    assert error.value.detail == "course_already_ended"
    user_repository.get_by_id.assert_not_called()
    session.add.assert_not_called()
