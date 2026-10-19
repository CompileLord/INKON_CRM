import asyncio
import threading
import time
from datetime import datetime, timedelta, timezone

from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException
from jose import jwt
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import security
from app.core.config import settings
from app.core.security import hash_password, verify_password
from app.models.user import User
from app.schemas.auth import TokenPair
from app.services.auth_service import AuthService


class TestPasswordOffload:
    @pytest.mark.asyncio
    async def test_bcrypt_semantics(self) -> None:
        adapter: security.PasswordWorkService = security.PasswordWorkService()
        password: str = "пароль123"
        encoded: str = await adapter.hash(password)
        assert encoded.startswith("$2b$12$")
        assert await adapter.verify(password, encoded)
        assert not await adapter.verify("wrong", encoded)
        assert not await adapter.verify(password, "invalid")
        assert not await adapter.verify("a" * 73, encoded)
        assert verify_password(password, encoded)
        with pytest.raises(ValueError):
            await adapter.hash("a" * 73)

    @pytest.mark.asyncio
    @pytest.mark.parametrize("operation", ["hash", "verify"])
    async def test_work_is_off_loop_and_admission_is_bounded(
        self, monkeypatch: pytest.MonkeyPatch, operation: str,
    ) -> None:
        monkeypatch.setattr(security.PasswordWorkService, "maximum_wait_seconds", 0.03)
        adapter: security.PasswordWorkService = security.PasswordWorkService()
        started: threading.Barrier = threading.Barrier(adapter.maximum_workers + 1)
        release: threading.Event = threading.Event()
        loop_thread: int = threading.get_ident()
        worker_threads: list[int] = []

        def expensive_work(*arguments: str) -> str | bool:
            worker_threads.append(threading.get_ident())
            started.wait(timeout=5)
            assert release.wait(timeout=5)
            return "encoded" if operation == "hash" else True

        monkeypatch.setattr(security, "hash_password" if operation == "hash" else "verify_password", expensive_work)
        arguments: tuple[str, ...] = ("password",) if operation == "hash" else ("password", "encoded")
        jobs: list[asyncio.Task[str | bool]] = [
            asyncio.create_task(getattr(adapter, operation)(*arguments))
            for _ in range(adapter.maximum_workers)
        ]
        try:
            await asyncio.to_thread(started.wait, 5)
            await asyncio.wait_for(asyncio.sleep(0.01), timeout=0.5)
            assert all(identifier != loop_thread for identifier in worker_threads)
            with pytest.raises(HTTPException) as overloaded:
                await getattr(adapter, operation)(*arguments)
            assert overloaded.value.status_code == 503
            jobs[0].cancel()
            with pytest.raises(asyncio.CancelledError):
                await jobs[0]
            with pytest.raises(HTTPException) as cancelled_capacity:
                await getattr(security.PasswordWorkService(), operation)(*arguments)
            assert cancelled_capacity.value.status_code == 503
            assert len(worker_threads) == adapter.maximum_workers
        finally:
            release.set()
            await asyncio.gather(*jobs, return_exceptions=True)
            await asyncio.sleep(0.05)

    @pytest.mark.asyncio
    async def test_auth_workflows_use_adapter(
        self, db_session: AsyncSession, test_student: User,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        service: AuthService = AuthService(db_session)
        adapter: type[security.PasswordWorkService] = security.PasswordWorkService
        verify: AsyncMock = AsyncMock(return_value=True)
        hashing: AsyncMock = AsyncMock(return_value=hash_password("replacement123"))
        monkeypatch.setattr(adapter, "verify", verify)
        monkeypatch.setattr(adapter, "hash", hashing)
        await service.login(test_student.email, "student_pass123")
        verify.assert_awaited_once()
        verify.return_value = False
        with pytest.raises(HTTPException) as rejected:
            await service.login(test_student.email, "wrong")
        assert rejected.value.status_code == 401
        await service.set_password(test_student.id, "replacement123")
        hashing.assert_awaited_once_with("replacement123")
        await service.issue_temporary_credentials(test_student)
        assert hashing.await_count == 2
        issued_at: datetime = datetime.now(timezone.utc)
        reset_token: str = jwt.encode(
            {"sub": str(test_student.id), "type": "password_reset",
             "auth_version": test_student.auth_version,
             "iat": issued_at, "exp": issued_at + timedelta(minutes=5)},
            settings.JWT_SECRET_KEY, algorithm="HS256",
        )
        await service.password_reset_confirm(reset_token, "replacement456")
        hashing.assert_awaited_with("replacement456")
        assert hashing.await_count == 3
        with pytest.raises(HTTPException) as reused_reset:
            await service.password_reset_confirm(reset_token, "replacement789")
        assert reused_reset.value.status_code == 400

    @pytest.mark.asyncio
    async def test_worker_error_releases_capacity(self, monkeypatch: pytest.MonkeyPatch) -> None:
        adapter: security.PasswordWorkService = security.PasswordWorkService()

        def rejected_hash(password: str) -> str:
            raise ValueError("controlled failure")

        monkeypatch.setattr(security, "hash_password", rejected_hash)
        attempt: int
        for attempt in range(adapter.maximum_workers + 1):
            with pytest.raises(ValueError, match="controlled failure"):
                await adapter.hash("password")

    @pytest.mark.asyncio
    async def test_reset_replaces_password_and_revokes_old_refresh(
        self, db_session: AsyncSession, test_student: User,
    ) -> None:
        service: AuthService = AuthService(db_session)
        original_tokens: TokenPair = await service.login(test_student.email, "student_pass123")
        issued_at: datetime = datetime.now(timezone.utc)
        reset_token: str = jwt.encode(
            {"sub": str(test_student.id), "type": "password_reset",
             "auth_version": test_student.auth_version,
             "iat": issued_at, "exp": issued_at + timedelta(minutes=5)},
            settings.JWT_SECRET_KEY, algorithm="HS256",
        )
        await service.password_reset_confirm(reset_token, "changed_password123")
        updated_user: User | None = await service.user_repo.get_by_id_for_update(test_student.id)
        assert updated_user is not None
        assert await security.PasswordWorkService().verify("changed_password123", updated_user.password_hash)
        with pytest.raises(HTTPException) as old_password:
            await service.login(test_student.email, "student_pass123")
        assert old_password.value.status_code == 401
        await service.login(test_student.email, "changed_password123")
        with pytest.raises(HTTPException) as revoked_refresh:
            await service.refresh(original_tokens.refresh_token)
        assert revoked_refresh.value.status_code == 401


class ControlledPasswordVerification:
    def __init__(self) -> None:
        self.started: threading.Barrier = threading.Barrier(3)
        self.release: threading.Event = threading.Event()
        self.lock: threading.Lock = threading.Lock()
        self.calls: list[str] = []

    def verify(self, password: str, encoded: str) -> bool:
        with self.lock:
            self.calls.append(password)
        if not self.release.is_set():
            self.started.wait(timeout=5)
            assert self.release.wait(timeout=5)
        return True


class TestPasswordWaitQueue:
    @pytest.mark.asyncio
    async def test_thirty_concurrent_verifications_succeed_with_two_workers(
        self, monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        adapter: security.PasswordWorkService = security.PasswordWorkService()
        encoded: str = hash_password("burst_password123")
        lock: threading.Lock = threading.Lock()
        active: int = 0
        peak: int = 0

        def measured_verify(password: str, hashed: str) -> bool:
            nonlocal active, peak
            with lock:
                active += 1
                peak = max(peak, active)
            try:
                return verify_password(password, hashed)
            finally:
                with lock:
                    active -= 1

        monkeypatch.setattr(security, "verify_password", measured_verify)
        outcomes: list[bool] = await asyncio.gather(*(
            adapter.verify("burst_password123", encoded) for _ in range(30)
        ))
        assert outcomes == [True] * 30
        assert peak == 2

    @pytest.mark.asyncio
    async def test_only_excess_beyond_waiter_capacity_is_rejected(
        self, monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        adapter: security.PasswordWorkService = security.PasswordWorkService()
        controlled: ControlledPasswordVerification = ControlledPasswordVerification()
        monkeypatch.setattr(security, "verify_password", controlled.verify)
        count: int = adapter.maximum_workers + adapter.maximum_waiters + 5
        jobs: list[asyncio.Task[bool]] = [
            asyncio.create_task(adapter.verify(str(index), "encoded")) for index in range(count)
        ]
        try:
            await asyncio.to_thread(controlled.started.wait, 5)
            await asyncio.sleep(0.05)
            completed: list[asyncio.Task[bool]] = [job for job in jobs if job.done()]
            assert len(completed) == 5
            job: asyncio.Task[bool]
            for job in completed:
                exception: BaseException | None = job.exception()
                assert isinstance(exception, HTTPException)
                assert exception.status_code == 503
                assert exception.headers == {"Retry-After": "1"}
            assert len(controlled.calls) == 2
        finally:
            controlled.release.set()
            outcomes: list[bool | BaseException] = await asyncio.gather(*jobs, return_exceptions=True)
        assert sum(outcome is True for outcome in outcomes) == count - 5
        assert sum(isinstance(outcome, HTTPException) for outcome in outcomes) == 5

    @pytest.mark.asyncio
    @pytest.mark.parametrize("termination", ["cancel", "deadline"])
    async def test_terminated_waiter_never_starts_work_or_leaks_capacity(
        self, monkeypatch: pytest.MonkeyPatch, termination: str,
    ) -> None:
        adapter: security.PasswordWorkService = security.PasswordWorkService()
        controlled: ControlledPasswordVerification = ControlledPasswordVerification()
        monkeypatch.setattr(security, "verify_password", controlled.verify)
        running: list[asyncio.Task[bool]] = [
            asyncio.create_task(adapter.verify(str(index), "encoded")) for index in range(2)
        ]
        queued: list[asyncio.Task[bool]] = []
        terminated: asyncio.Task[bool] | None = None
        try:
            await asyncio.to_thread(controlled.started.wait, 5)
            monkeypatch.setattr(security.PasswordWorkService, "maximum_wait_seconds", 0.03)
            began: float = time.monotonic()
            terminated = asyncio.create_task(adapter.verify("terminated", "encoded"))
            await asyncio.sleep(0.01)
            assert not terminated.done()
            if termination == "cancel":
                terminated.cancel()
                with pytest.raises(asyncio.CancelledError):
                    await terminated
            else:
                with pytest.raises(HTTPException) as expired:
                    await asyncio.wait_for(terminated, timeout=0.5)
                assert expired.value.status_code == 503
                assert expired.value.headers == {"Retry-After": "1"}
                assert time.monotonic() - began >= 0.03
            monkeypatch.setattr(security.PasswordWorkService, "maximum_wait_seconds", 1.0)
            queued = [asyncio.create_task(adapter.verify("queued", "encoded"))
                      for _ in range(adapter.maximum_waiters)]
            await asyncio.sleep(0.03)
            assert all(not job.done() for job in queued)
            assert len(controlled.calls) == 2
        finally:
            controlled.release.set()
            if terminated is not None and not terminated.done():
                terminated.cancel()
            await asyncio.gather(*running, *queued, *([terminated] if terminated is not None else []),
                                 return_exceptions=True)
        assert "terminated" not in controlled.calls
        assert await adapter.verify("after", "encoded")
