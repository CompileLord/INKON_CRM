from unittest.mock import AsyncMock, MagicMock
import pytest
from fastapi import HTTPException
from app.models.user import User, UserRole
from app.services.user_service import UserService


@pytest.mark.asyncio
async def test_mentor_with_active_courses_cannot_be_deleted() -> None:
    service: UserService = UserService(MagicMock(), storage=MagicMock())
    repository: MagicMock = MagicMock()
    repository.get_by_id = AsyncMock(return_value=User(id=2, role=UserRole.MENTOR))
    repository.count_active_mentor_courses = AsyncMock(return_value=3)
    repository.soft_delete = AsyncMock()
    service.user_repo = repository
    with pytest.raises(HTTPException) as error:
        await service.delete_user(2, 1)
    assert error.value.status_code == 409
    assert error.value.detail == {"code": "mentor_has_active_courses", "course_count": 3}
    repository.soft_delete.assert_not_awaited()
