import importlib
from pathlib import Path

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

import app.core.redis as redis_module
from app.core.config import settings
from app.core.security import create_access_token
from app.api.v1.documents import router as document_router
from app.models.document import Document, DocumentOwnerType
from app.models.user import User, UserRole


def test_document_download_has_one_registered_handler() -> None:
    routes = [route for route in document_router.routes if getattr(route, "path", "").startswith("/{") and getattr(route, "path", "").endswith("/download") and "GET" in getattr(route, "methods", set())]
    assert len(routes) == 1


@pytest.mark.asyncio
async def test_private_download_rejects_mismatched_owner_storage_path(
    client: AsyncClient,
    db_session: AsyncSession,
    test_admin: User,
    test_student: User,
) -> None:
    other_student = User(email="integration-other-owner@example.com", first_name="Other", last_name="Owner", role=UserRole.STUDENT, must_set_password=False)
    db_session.add(other_student)
    await db_session.commit()
    owner_directory = Path(settings.STORAGE_PATH) / "student" / str(other_student.id)
    owner_directory.mkdir(parents=True, exist_ok=True)
    file_path = owner_directory / "private.pdf"
    file_path.write_bytes(b"%PDF-private-other-owner")
    document = Document(owner_type=DocumentOwnerType.STUDENT, owner_id=test_student.id, file_path=f"/storage/student/{other_student.id}/private.pdf", file_name="private.pdf", file_type="application/pdf", file_size=24, uploaded_by_id=test_admin.id)
    db_session.add(document)
    await db_session.commit()
    headers = {"Authorization": f"Bearer {create_access_token(test_student.id, test_student.role)}"}
    response = await client.get(f"/api/v1/documents/{document.id}/download", headers=headers)
    assert response.status_code == 404
    assert b"private-other-owner" not in response.content


@pytest.mark.asyncio
async def test_fixture_import_alias_shares_engine_and_owned_redis_namespace(db_session: AsyncSession) -> None:
    fixture_module = importlib.import_module("app.tests.conftest")
    assert db_session.bind is fixture_module.test_engine
    assert redis_module.redis_client is fixture_module.redis_client
    assert fixture_module.redis_client._client is fixture_module.raw_test_redis
    key = "integration:fixture-alias"
    await fixture_module.redis_client.set(key, "owned-value", ex=60)
    assert await redis_module.redis_client.get(key) == "owned-value"
    assert await fixture_module.raw_test_redis.get(key) is None
    assert await fixture_module.raw_test_redis.get(f"{fixture_module.TEST_REDIS_PREFIX}{key}") == "owned-value"
