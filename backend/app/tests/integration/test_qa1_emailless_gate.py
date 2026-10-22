from pathlib import Path
from typing import Any

import pytest
from httpx import AsyncClient, Response
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings, settings
from app.models.user import User
from app.tests.integration.plink_support import PlinkApi
from app.tests.sms_test_support import SmsPasswordTestSupport


@pytest.mark.parametrize("environment", ["development", "testing", "production"])
def test_email_less_users_default_is_disabled_in_every_environment(environment: str) -> None:
    assert Settings.model_construct(ENVIRONMENT=environment).ALLOW_EMAILLESS_USERS is False


@pytest.mark.asyncio
@pytest.mark.parametrize("allowed", [False, True])
@pytest.mark.parametrize("explicit_null", [False, True])
async def test_create_email_less_user_respects_gate_without_partial_writes(
    client: AsyncClient, test_admin: User, db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch,
    allowed: bool, explicit_null: bool,
) -> None:
    monkeypatch.setattr(settings, "ALLOW_EMAILLESS_USERS", allowed, raising=False)
    before: int = await db_session.scalar(select(func.count()).select_from(User))
    body: dict[str, Any] = {"first_name": "Gate", "last_name": "Student", "role": "student", "phone": "+992900001234"}
    if explicit_null:
        body["email"] = None
    response: Response = await PlinkApi.create_user(client, test_admin, body)
    assert response.status_code == (201 if allowed else 422), response.text
    assert await db_session.scalar(select(func.count()).select_from(User)) == before + int(allowed)
    if allowed:
        assert response.json()["email"] is None
    else:
        assert response.json()["detail"] == "Email is required until email-less users are enabled"


@pytest.mark.asyncio
@pytest.mark.parametrize("allowed", [False, True])
async def test_clear_email_respects_gate_and_preserves_database_on_rejection(
    client: AsyncClient, test_admin: User, test_student: User, db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch, allowed: bool,
) -> None:
    monkeypatch.setattr(settings, "ALLOW_EMAILLESS_USERS", allowed, raising=False)
    previous_email: str = test_student.email
    student_id: int = test_student.id
    response: Response = await client.patch(
        f"/api/v1/users/{test_student.id}", json={"email": None, "first_name": "Changed"},
        headers=SmsPasswordTestSupport.bearer(test_admin),
    )
    assert response.status_code == (200 if allowed else 422), response.text
    stored: User = (await db_session.scalars(select(User).where(User.id == student_id))).one()
    await db_session.refresh(stored)
    assert stored.email == (None if allowed else previous_email)
    assert (stored.first_name == "Changed") is allowed


@pytest.mark.asyncio
async def test_patch_omitting_email_keeps_existing_email_when_disabled(
    client: AsyncClient, test_admin: User, test_student: User, monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "ALLOW_EMAILLESS_USERS", False, raising=False)
    previous_email: str = test_student.email
    response: Response = await client.patch(
        f"/api/v1/users/{test_student.id}", json={"first_name": "Changed"},
        headers=SmsPasswordTestSupport.bearer(test_admin),
    )
    assert response.status_code == 200 and response.json()["email"] == previous_email


@pytest.mark.asyncio
async def test_seed_gate_rejects_before_assets_storage_or_database_changes(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, db_session: AsyncSession,
) -> None:
    from app.tests.integration.test_remediation_wp10 import make_guard, reset_arguments
    from scripts import seed_demo_data
    from scripts.reset_guard import ResetGuardError, ResetTargetGuard, ResetTarget

    guard: ResetTargetGuard = make_guard(tmp_path / "backend")
    target: ResetTarget = guard.parse_and_validate(reset_arguments(tmp_path / "backend"))
    monkeypatch.setattr(settings, "ALLOW_EMAILLESS_USERS", False)
    monkeypatch.setattr(seed_demo_data, "create_reset_guard", lambda: guard)
    before: int = await db_session.scalar(select(func.count()).select_from(User))

    def forbidden_assets() -> dict[str, bytes]:
        pytest.fail("Seed gate must reject before downloading assets")

    monkeypatch.setattr(seed_demo_data, "stage_downloadable_assets", forbidden_assets)
    with pytest.raises(ResetGuardError, match="ALLOW_EMAILLESS_USERS=true"):
        await seed_demo_data.seed_demo_data(target, "synthetic admin", "synthetic demo")
    assert await db_session.scalar(select(func.count()).select_from(User)) == before
