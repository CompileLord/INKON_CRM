from typing import Any

import pytest
from httpx import AsyncClient

from app.api.v1 import cron


CRON_ROUTES: tuple[tuple[str, str], ...] = (
    ("/api/v1/cron/archive-courses", "archive_expired_courses"),
    ("/api/v1/cron/payment-reminders", "check_payment_reminders"),
)


@pytest.mark.asyncio
@pytest.mark.parametrize(("route", "job_name"), CRON_ROUTES)
@pytest.mark.parametrize("configured_secret", [None, ""])
@pytest.mark.parametrize("header_secret", [None, "wrong-secret", "configured-secret"])
async def test_cron_routes_reject_requests_without_configured_secret(
    client: AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
    route: str,
    job_name: str,
    configured_secret: str | None,
    header_secret: str | None,
) -> None:
    calls: list[dict[str, Any]] = []

    async def record_job(payload: dict[str, Any]) -> None:
        calls.append(payload)

    monkeypatch.setattr(cron.settings, "CRON_SECRET", configured_secret)
    monkeypatch.setattr(cron, job_name, record_job)
    headers = {} if header_secret is None else {"X-Cloud-Scheduler-Secret": header_secret}

    response = await client.post(route, headers=headers)

    assert response.status_code == 401
    assert calls == []


@pytest.mark.asyncio
@pytest.mark.parametrize(("route", "job_name"), CRON_ROUTES)
@pytest.mark.parametrize("header_secret", [None, "wrong-secret"])
async def test_cron_routes_reject_missing_or_wrong_header(
    client: AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
    route: str,
    job_name: str,
    header_secret: str | None,
) -> None:
    calls: list[dict[str, Any]] = []

    async def record_job(payload: dict[str, Any]) -> None:
        calls.append(payload)

    monkeypatch.setattr(cron.settings, "CRON_SECRET", "configured-secret")
    monkeypatch.setattr(cron, job_name, record_job)
    headers = {} if header_secret is None else {"X-Cloud-Scheduler-Secret": header_secret}

    response = await client.post(route, headers=headers)

    assert response.status_code == 401
    assert calls == []


@pytest.mark.asyncio
@pytest.mark.parametrize(("route", "job_name", "task_name"), [
    ("/api/v1/cron/archive-courses", "archive_expired_courses", "archive_expired_courses"),
    ("/api/v1/cron/payment-reminders", "check_payment_reminders", "check_payment_reminders"),
])
async def test_cron_routes_accept_configured_secret_and_preserve_contract(
    client: AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
    route: str,
    job_name: str,
    task_name: str,
) -> None:
    calls: list[dict[str, Any]] = []

    async def record_job(payload: dict[str, Any]) -> None:
        calls.append(payload)

    monkeypatch.setattr(cron.settings, "CRON_SECRET", "configured-secret")
    monkeypatch.setattr(cron, job_name, record_job)

    response = await client.post(
        route,
        headers={"X-Cloud-Scheduler-Secret": "configured-secret"},
    )

    assert response.status_code == 200
    assert response.json() == {"status": "success", "task": task_name}
    assert calls == [{}]
