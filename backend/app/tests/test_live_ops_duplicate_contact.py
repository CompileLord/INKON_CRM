from unittest.mock import AsyncMock, MagicMock
import pytest
from fastapi import HTTPException
from app.models.user import User
from app.services.user_service import UserService


@pytest.mark.asyncio
@pytest.mark.parametrize("email,phone,code", [("taken@example.test", None, "email_taken"), (None, "+992900000001", "phone_taken")])
async def test_duplicate_contact_has_stable_code_and_legacy_detail(email: str | None, phone: str | None, code: str) -> None:
    service: UserService = UserService(MagicMock(), storage=MagicMock())
    repository: MagicMock = MagicMock()
    repository.get_by_email = AsyncMock(return_value=User(id=2))
    repository.get_by_phone = AsyncMock(return_value=User(id=2))
    service.user_repo = repository
    with pytest.raises(HTTPException) as error:
        await service._reject_taken_contacts(email, phone, None)
    assert error.value.status_code == 409
    assert error.value.detail == {"code": code}
