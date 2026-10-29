import json
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock
import pytest
from app.api.v1.students import get_students
from app.models.user import User, UserRole
from app.schemas.common import PaginationParams


@pytest.mark.asyncio
async def test_mentor_directory_omits_parent_telegram_identifiers() -> None:
    now: datetime = datetime.now(timezone.utc)
    row: dict[str, object] = {"id": 7, "first_name": "A", "last_name": "B", "role": "student", "must_set_password": False, "is_deleted": False, "created_at": now, "updated_at": now, "courses": [], "parent_telegram_chat_id": 123, "parent_link_code_expires_at": now}
    repository: MagicMock = MagicMock()
    repository.get_student_directory = AsyncMock(return_value={"items": [row], "total": 1, "page": 1, "page_size": 20, "total_pages": 1})
    response: object = await get_students(pagination=PaginationParams(page=1, page_size=20), current_user=User(id=2, role=UserRole.MENTOR), user_repo=repository)
    payload: dict = json.loads(response.body)
    assert "parent_telegram_chat_id" not in payload["items"][0]
    assert "parent_link_code_expires_at" not in payload["items"][0]
