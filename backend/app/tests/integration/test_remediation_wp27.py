import asyncio
import importlib.util
import logging
import subprocess
import sys
from pathlib import Path
from types import ModuleType
from typing import Any
from unittest.mock import AsyncMock

import pytest
from fastapi import FastAPI

import app.core.redis as redis_module
import app.main as main_module
import app.telegram_bot.bot as telegram_bot_module
from app.core.config import settings


BACKEND_ROOT: Path = Path(__file__).resolve().parents[3]
REGISTRATION_SCRIPT_PATH: Path = BACKEND_ROOT / "scripts/register_telegram_webhook.py"
WEBHOOK_URL: str = "https://hooks.example.com/api/v1/telegram/webhook"
WEBHOOK_SECRET: str = "wp27-synthetic-webhook-secret"


class FakeBotSession:
    def __init__(self) -> None:
        self.close: AsyncMock = AsyncMock()


class FakeTelegramBot:
    def __init__(self, set_webhook_result: bool = True) -> None:
        self.session: FakeBotSession = FakeBotSession()
        self.set_webhook: AsyncMock = AsyncMock(return_value=set_webhook_result)
        self.delete_webhook: AsyncMock = AsyncMock()


def load_registration_module() -> ModuleType:
    module_spec = importlib.util.spec_from_file_location(
        "wp27_register_telegram_webhook",
        REGISTRATION_SCRIPT_PATH,
    )
    assert module_spec is not None and module_spec.loader is not None
    module: ModuleType = importlib.util.module_from_spec(module_spec)
    module_spec.loader.exec_module(module)
    return module


@pytest.fixture
def lifespan_probes(
    monkeypatch: pytest.MonkeyPatch,
) -> tuple[FakeTelegramBot, AsyncMock]:
    bot: FakeTelegramBot = FakeTelegramBot()
    close_arq_pool: AsyncMock = AsyncMock()
    monkeypatch.setattr(settings, "TESTING", False)
    monkeypatch.setattr(telegram_bot_module, "bot", bot)
    monkeypatch.setattr(redis_module, "close_arq_pool", close_arq_pool)
    return bot, close_arq_pool


@pytest.mark.asyncio
async def test_overlapping_lifespans_never_register_or_delete_shared_webhook(
    lifespan_probes: tuple[FakeTelegramBot, AsyncMock],
) -> None:
    bot, close_arq_pool = lifespan_probes
    application: FastAPI = FastAPI()
    first_lifespan = main_module.lifespan(application)
    second_lifespan = main_module.lifespan(application)
    first_started: bool = False
    second_started: bool = False

    try:
        await first_lifespan.__aenter__()
        first_started = True
        await second_lifespan.__aenter__()
        second_started = True
        await first_lifespan.__aexit__(None, None, None)
        first_started = False

        bot.delete_webhook.assert_not_awaited()
        bot.set_webhook.assert_not_awaited()
        await second_lifespan.__aexit__(None, None, None)
        second_started = False
        bot.session.close.assert_awaited()
        assert close_arq_pool.await_count == 2
    finally:
        if first_started:
            await first_lifespan.__aexit__(None, None, None)
        if second_started:
            await second_lifespan.__aexit__(None, None, None)


@pytest.mark.asyncio
async def test_cancelled_lifespan_closes_local_bot_and_shared_arq_resources(
    lifespan_probes: tuple[FakeTelegramBot, AsyncMock],
) -> None:
    bot, close_arq_pool = lifespan_probes
    application: FastAPI = FastAPI()

    with pytest.raises(asyncio.CancelledError):
        async with main_module.lifespan(application):
            raise asyncio.CancelledError

    bot.set_webhook.assert_not_awaited()
    bot.delete_webhook.assert_not_awaited()
    bot.session.close.assert_awaited_once_with()
    close_arq_pool.assert_awaited_once_with()


@pytest.mark.asyncio
async def test_lifespan_startup_failure_closes_local_bot_and_shared_arq_resources(
    lifespan_probes: tuple[FakeTelegramBot, AsyncMock],
) -> None:
    bot, close_arq_pool = lifespan_probes
    application: FastAPI = FastAPI()

    with pytest.raises(RuntimeError, match="startup failed"):
        async with main_module.lifespan(application):
            raise RuntimeError("startup failed")

    bot.set_webhook.assert_not_awaited()
    bot.delete_webhook.assert_not_awaited()
    bot.session.close.assert_awaited_once_with()
    close_arq_pool.assert_awaited_once_with()


@pytest.mark.asyncio
async def test_registration_command_is_explicit_repeatable_and_closes_bot_session() -> None:
    registration_module: ModuleType = load_registration_module()
    command_type: Any = getattr(
        registration_module,
        "TelegramWebhookRegistrationCommand",
    )
    first_bot: FakeTelegramBot = FakeTelegramBot()
    second_bot: FakeTelegramBot = FakeTelegramBot()
    logger: logging.Logger = logging.getLogger("wp27-registration-test")
    first_command: Any = command_type(first_bot, WEBHOOK_URL, WEBHOOK_SECRET, logger)
    second_command: Any = command_type(second_bot, WEBHOOK_URL, WEBHOOK_SECRET, logger)

    first_result: int = await first_command.run()
    second_result: int = await second_command.run()

    assert first_result == 0
    assert second_result == 0
    first_bot.set_webhook.assert_awaited_once_with(
        url=WEBHOOK_URL,
        secret_token=WEBHOOK_SECRET,
    )
    second_bot.set_webhook.assert_awaited_once_with(
        url=WEBHOOK_URL,
        secret_token=WEBHOOK_SECRET,
    )
    first_bot.session.close.assert_awaited_once_with()
    second_bot.session.close.assert_awaited_once_with()


@pytest.mark.parametrize(
    "invalid_secret",
    ["", "   ", "invalid.secret", "nonascii-é", "x" * 257],
)
@pytest.mark.asyncio
async def test_registration_rejects_invalid_secret_without_calling_provider(
    invalid_secret: str,
    caplog: pytest.LogCaptureFixture,
) -> None:
    registration_module: ModuleType = load_registration_module()
    command_type: Any = getattr(
        registration_module,
        "TelegramWebhookRegistrationCommand",
    )
    bot: FakeTelegramBot = FakeTelegramBot()
    command: Any = command_type(bot, WEBHOOK_URL, invalid_secret)

    with caplog.at_level(logging.INFO):
        result: int = await command.run()

    assert result != 0
    bot.set_webhook.assert_not_awaited()
    bot.session.close.assert_awaited_once_with()
    assert repr(invalid_secret) not in caplog.text


@pytest.mark.parametrize("valid_secret", ["A", "AZaz09_-", "a" * 256])
@pytest.mark.asyncio
async def test_registration_accepts_valid_secret_boundaries_and_alphabet(
    valid_secret: str,
) -> None:
    registration_module: ModuleType = load_registration_module()
    command_type: Any = getattr(
        registration_module,
        "TelegramWebhookRegistrationCommand",
    )
    bot: FakeTelegramBot = FakeTelegramBot()
    command: Any = command_type(bot, WEBHOOK_URL, valid_secret)

    result: int = await command.run()

    assert result == 0
    bot.set_webhook.assert_awaited_once_with(
        url=WEBHOOK_URL,
        secret_token=valid_secret,
    )
    bot.session.close.assert_awaited_once_with()


@pytest.mark.asyncio
async def test_invalid_registration_configuration_returns_nonzero_without_logging_secrets(
    caplog: pytest.LogCaptureFixture,
) -> None:
    registration_module: ModuleType = load_registration_module()
    command_type: Any = getattr(
        registration_module,
        "TelegramWebhookRegistrationCommand",
    )
    bot: FakeTelegramBot = FakeTelegramBot()
    invalid_url: str = "http://localhost:8000/api/v1/telegram/webhook"
    command: Any = command_type(bot, invalid_url, WEBHOOK_SECRET)

    with caplog.at_level(logging.INFO):
        result: int = await command.run()

    assert result != 0
    bot.set_webhook.assert_not_awaited()
    bot.session.close.assert_awaited_once_with()
    assert WEBHOOK_SECRET not in caplog.text
    assert invalid_url not in caplog.text


@pytest.mark.asyncio
async def test_registration_rejection_returns_nonzero_and_closes_session() -> None:
    registration_module: ModuleType = load_registration_module()
    command_type: Any = getattr(
        registration_module,
        "TelegramWebhookRegistrationCommand",
    )
    bot: FakeTelegramBot = FakeTelegramBot(set_webhook_result=False)
    command: Any = command_type(bot, WEBHOOK_URL, WEBHOOK_SECRET)

    result: int = await command.run()

    assert result != 0
    bot.set_webhook.assert_awaited_once_with(
        url=WEBHOOK_URL,
        secret_token=WEBHOOK_SECRET,
    )
    bot.session.close.assert_awaited_once_with()


@pytest.mark.asyncio
async def test_registration_cleanup_failure_returns_nonzero() -> None:
    registration_module: ModuleType = load_registration_module()
    command_type: Any = getattr(
        registration_module,
        "TelegramWebhookRegistrationCommand",
    )
    bot: FakeTelegramBot = FakeTelegramBot()
    bot.session.close.side_effect = RuntimeError("session cleanup failure")
    command: Any = command_type(bot, WEBHOOK_URL, WEBHOOK_SECRET)

    result: int = await command.run()

    assert result != 0
    bot.set_webhook.assert_awaited_once_with(
        url=WEBHOOK_URL,
        secret_token=WEBHOOK_SECRET,
    )
    bot.session.close.assert_awaited_once_with()


@pytest.mark.asyncio
async def test_registration_failure_returns_nonzero_and_redacts_provider_error(
    caplog: pytest.LogCaptureFixture,
) -> None:
    registration_module: ModuleType = load_registration_module()
    command_type: Any = getattr(
        registration_module,
        "TelegramWebhookRegistrationCommand",
    )
    bot: FakeTelegramBot = FakeTelegramBot()
    bot.set_webhook.side_effect = RuntimeError(
        f"provider failure {WEBHOOK_SECRET} {WEBHOOK_URL}"
    )
    command: Any = command_type(bot, WEBHOOK_URL, WEBHOOK_SECRET)

    with caplog.at_level(logging.INFO):
        result: int = await command.run()

    assert result != 0
    bot.session.close.assert_awaited_once_with()
    assert WEBHOOK_SECRET not in caplog.text
    assert WEBHOOK_URL not in caplog.text


def test_registration_script_help_documents_one_time_deployment_invocation() -> None:
    result: subprocess.CompletedProcess[bytes] = subprocess.run(
        [sys.executable, str(REGISTRATION_SCRIPT_PATH), "--help"],
        cwd=BACKEND_ROOT,
        capture_output=True,
        check=False,
    )

    assert result.returncode == 0
    assert b"once per deployment" in result.stdout.lower()
    assert b"python -m scripts.register_telegram_webhook" in result.stdout
    assert result.stderr == b""
