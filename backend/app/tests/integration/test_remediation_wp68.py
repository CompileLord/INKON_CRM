import base64
import hashlib
import os
import runpy
from typing import Any

import pytest
from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from httpx import ASGITransport, AsyncClient, Response
from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings, settings
from app.models.outbox_event import OutboxEvent
from app.repositories.sqlalchemy.outbox_repository import SQLAlchemyOutboxRepository
from app.services.outbox_service import OUTBOX_PAYLOAD_DOMAIN_SEPARATOR, OutboxPayloadEncryptor, OutboxService
from app.workers.outbox import OutboxWorkerManager
from app.workers.settings import WorkerSettings


class TestProductionConfiguration:
    keyring: str = f"v2:{'22' * 32},v1:{'11' * 32}"

    def test_production_rejects_testing(self) -> None:
        with pytest.raises(ValidationError, match="TESTING"):
            Settings(_env_file=None, ENVIRONMENT="production", TESTING=True,
                     OUTBOX_ENCRYPTION_KEYS=self.keyring,
                     TELEGRAM_WEBHOOK_URL="https://crm.example.com/webhook")

    def test_production_requires_outbox_keys(self) -> None:
        with pytest.raises(ValidationError, match="OUTBOX_ENCRYPTION_KEYS"):
            Settings(_env_file=None, ENVIRONMENT="production", TESTING=False,
                     OUTBOX_ENCRYPTION_KEYS="", TELEGRAM_WEBHOOK_URL="https://crm.example.com/webhook")

    def test_valid_production_configuration(self) -> None:
        configured: Settings = Settings(
            _env_file=None, ENVIRONMENT="production", TESTING=False,
            OUTBOX_ENCRYPTION_KEYS=self.keyring,
            TELEGRAM_WEBHOOK_URL="https://crm.example.com/webhook",
        )
        assert configured.OUTBOX_ENCRYPTION_KEYS == self.keyring
        assert "22" * 32 not in repr(configured)
        assert "OUTBOX_ENCRYPTION_KEYS" not in configured.model_dump()

    @pytest.mark.parametrize("keyring", ["v1:short", f"v1:{'gg' * 32}", f"v1:{'11' * 32},v1:{'22' * 32}", f"bad:{'11' * 32}", f"v1:{'11' * 32},"])
    def test_rejects_invalid_keyrings_without_disclosing_keys(self, keyring: str) -> None:
        caught: pytest.ExceptionInfo[ValidationError]
        with pytest.raises(ValidationError) as caught:
            Settings(_env_file=None, OUTBOX_ENCRYPTION_KEYS=keyring)
        assert keyring not in str(caught.value)

    @pytest.mark.parametrize("environment", ["development", "testing"])
    def test_nonproduction_allows_legacy_configuration(self, environment: str) -> None:
        configured: Settings = Settings(_env_file=None, ENVIRONMENT=environment, TESTING=True, OUTBOX_ENCRYPTION_KEYS="")
        assert configured.OUTBOX_ENCRYPTION_KEYS == ""

    @pytest.mark.parametrize("environment", ["production", "development", "testing"])
    @pytest.mark.parametrize("origin", ["https://crm.example.com", "http://localhost:5173", "http://192.168.1.2:3000", "https://demo.instatunnel.my", "https://attacker.example.com"])
    async def test_cors_only_allows_configured_origins_in_production(self, monkeypatch: pytest.MonkeyPatch, environment: str, origin: str) -> None:
        monkeypatch.setattr(settings, "ENVIRONMENT", environment)
        monkeypatch.setattr(settings, "BACKEND_CORS_ORIGINS", ["https://crm.example.com"])
        namespace: dict[str, Any] = runpy.run_path("app/main.py")
        transport: ASGITransport = ASGITransport(app=namespace["app"])
        client: AsyncClient
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response: Response = await client.options("/api/v1/auth/login", headers={"Origin": origin, "Access-Control-Request-Method": "POST"})
        allowed: bool = origin == "https://crm.example.com" or (environment != "production" and origin != "https://attacker.example.com")
        assert response.status_code == (200 if allowed else 400)
        assert response.headers.get("access-control-allow-origin") == (origin if allowed else None)

    def test_worker_health_interval_is_thirty_seconds(self) -> None:
        assert WorkerSettings.health_check_interval == 30


class TestOutboxKeyRotation:
    legacy_secret: str = "synthetic-legacy-secret"
    keyring: str = f"v2:{'22' * 32},v1:{'11' * 32}"

    def test_newest_key_encrypts_independently_of_jwt(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setattr(settings, "OUTBOX_ENCRYPTION_KEYS", self.keyring, raising=False)
        encryptor: OutboxPayloadEncryptor = OutboxPayloadEncryptor.from_settings(self.legacy_secret)
        encrypted: str = encryptor.encrypt("payload")
        assert encrypted.startswith("v2:")
        rotated_jwt: OutboxPayloadEncryptor = OutboxPayloadEncryptor.from_settings("changed-jwt-secret")
        assert rotated_jwt.decrypt(encrypted) == "payload"
        raw: bytes = base64.b64decode(encrypted.split(":", 1)[1])
        assert AESGCM(bytes.fromhex("22" * 32)).decrypt(raw[:12], raw[12:], OUTBOX_PAYLOAD_DOMAIN_SEPARATOR + b":v2") == b"payload"

    def test_rotation_reads_old_and_legacy_payloads(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setattr(settings, "OUTBOX_ENCRYPTION_KEYS", f"v1:{'11' * 32}", raising=False)
        previous: str = OutboxPayloadEncryptor.from_settings(self.legacy_secret).encrypt("previous")
        nonce: bytes = os.urandom(12)
        legacy_key: bytes = hashlib.blake2b(OUTBOX_PAYLOAD_DOMAIN_SEPARATOR + self.legacy_secret.encode(), digest_size=32).digest()
        legacy: str = base64.b64encode(nonce + AESGCM(legacy_key).encrypt(nonce, b"legacy", OUTBOX_PAYLOAD_DOMAIN_SEPARATOR)).decode()
        monkeypatch.setattr(settings, "OUTBOX_ENCRYPTION_KEYS", self.keyring, raising=False)
        current: OutboxPayloadEncryptor = OutboxPayloadEncryptor.from_settings(self.legacy_secret)
        assert current.decrypt(previous) == "previous"
        assert current.decrypt(legacy) == "legacy"
        assert current.encrypt("current").startswith("v2:")

    def test_unknown_version_and_tampering_fail_closed(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setattr(settings, "OUTBOX_ENCRYPTION_KEYS", self.keyring, raising=False)
        encryptor: OutboxPayloadEncryptor = OutboxPayloadEncryptor.from_settings(self.legacy_secret)
        encrypted: str = encryptor.encrypt("payload")
        with pytest.raises(ValueError, match="version"):
            encryptor.decrypt(encrypted.replace("v2:", "v3:", 1))
        with pytest.raises(InvalidTag):
            encryptor.decrypt(encrypted.replace("v2:", "v1:", 1))
        with pytest.raises(InvalidTag):
            encryptor.decrypt(encrypted.split(":", 1)[1])

    def test_empty_setting_keeps_legacy_encryption(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setattr(settings, "OUTBOX_ENCRYPTION_KEYS", "", raising=False)
        encryptor: OutboxPayloadEncryptor = OutboxPayloadEncryptor.from_settings(self.legacy_secret)
        encrypted: str = encryptor.encrypt("payload")
        assert ":" not in encrypted
        assert OutboxPayloadEncryptor(self.legacy_secret).decrypt(encrypted) == "payload"

    async def test_service_and_worker_share_configured_keyring(self, monkeypatch: pytest.MonkeyPatch, db_session: AsyncSession) -> None:
        monkeypatch.setattr(settings, "OUTBOX_ENCRYPTION_KEYS", self.keyring, raising=False)
        service: OutboxService = OutboxService(SQLAlchemyOutboxRepository(db_session), self.legacy_secret)
        event: OutboxEvent = await service.enqueue_verification_email("synthetic@example.test", "123456")
        assert event.encrypted_payload.startswith("v2:")
        worker: OutboxWorkerManager = OutboxWorkerManager(settings.DATABASE_URL, "changed-jwt-secret")
        assert worker.encryptor.decrypt(event.encrypted_payload) == "123456"
