import base64
import json
import os
from datetime import datetime, timedelta, timezone
from typing import Optional
from app.models.outbox_event import OutboxEvent, OutboxEventKind, OutboxEventStatus
from app.repositories.interfaces.outbox_repository import OutboxRepository

OUTBOX_PAYLOAD_DOMAIN_SEPARATOR = b"imkon-crm:outbox-payload:v1"
OUTBOX_CODE_TTL_SECONDS = 600


class OutboxPayloadEncryptor:
    def __init__(self, master_key: str, domain_separator: bytes = OUTBOX_PAYLOAD_DOMAIN_SEPARATOR) -> None:
        self._master_key = master_key
        self._domain_separator = domain_separator
        self._derived_key = self._derive_key()

    def _derive_key(self) -> bytes:
        import hashlib
        return hashlib.blake2b(
            self._domain_separator + self._master_key.encode("utf-8"),
            digest_size=32,
        ).digest()

    def encrypt(self, plaintext: str) -> str:
        from cryptography.hazmat.primitives.ciphers.aead import AESGCM
        nonce = os.urandom(12)
        ciphertext = AESGCM(self._derived_key).encrypt(nonce, plaintext.encode("utf-8"), self._domain_separator)
        return base64.b64encode(nonce + ciphertext).decode("ascii")

    def decrypt(self, encrypted: str) -> str:
        from cryptography.hazmat.primitives.ciphers.aead import AESGCM
        raw = base64.b64decode(encrypted.encode("ascii"))
        if len(raw) < 12:
            raise ValueError("Invalid ciphertext length")
        nonce, ciphertext = raw[:12], raw[12:]
        plaintext = AESGCM(self._derived_key).decrypt(nonce, ciphertext, self._domain_separator)
        return plaintext.decode("utf-8")


class OutboxService:
    def __init__(
        self,
        repository: OutboxRepository,
        payload_master_key: str,
        encryptor: Optional[OutboxPayloadEncryptor] = None,
    ) -> None:
        self._repository = repository
        self._payload_master_key = payload_master_key
        self._encryptor = encryptor or OutboxPayloadEncryptor(payload_master_key)

    async def enqueue_verification_email(
        self,
        recipient_email: str,
        code: str,
        correlation_key: Optional[str] = None,
    ) -> OutboxEvent:
        now = datetime.now(timezone.utc)
        expires_at = now + timedelta(seconds=OUTBOX_CODE_TTL_SECONDS)
        encrypted_payload = self._encryptor.encrypt(code)
        event = OutboxEvent(
            kind=OutboxEventKind.VERIFICATION_EMAIL,
            status=OutboxEventStatus.PENDING,
            recipient_email=recipient_email,
            subject="Verification Code",
            encrypted_payload=encrypted_payload,
            correlation_key=correlation_key,
            max_attempts=5,
            next_attempt_at=now,
            expires_at=expires_at,
        )
        return await self._repository.enqueue(event)

    async def enqueue_password_reset_email(
        self,
        recipient_email: str,
        code: str,
        correlation_key: Optional[str] = None,
    ) -> OutboxEvent:
        now = datetime.now(timezone.utc)
        expires_at = now + timedelta(seconds=OUTBOX_CODE_TTL_SECONDS)
        encrypted_payload = self._encryptor.encrypt(code)
        event = OutboxEvent(
            kind=OutboxEventKind.PASSWORD_RESET_EMAIL,
            status=OutboxEventStatus.PENDING,
            recipient_email=recipient_email,
            subject="Password Reset Code",
            encrypted_payload=encrypted_payload,
            correlation_key=correlation_key,
            max_attempts=5,
            next_attempt_at=now,
            expires_at=expires_at,
        )
        return await self._repository.enqueue(event)

    async def enqueue_credentials_email(
        self,
        recipient_email: str,
        first_name: str,
        temporary_password: str,
        correlation_key: Optional[str] = None,
    ) -> OutboxEvent:
        now = datetime.now(timezone.utc)
        expires_at = now + timedelta(seconds=OUTBOX_CODE_TTL_SECONDS)
        encrypted_payload = self._encryptor.encrypt(
            json.dumps({"first_name": first_name, "temporary_password": temporary_password})
        )
        event = OutboxEvent(
            kind=OutboxEventKind.CREDENTIALS_EMAIL,
            status=OutboxEventStatus.PENDING,
            recipient_email=recipient_email,
            subject="Your IMKON CRM login details",
            encrypted_payload=encrypted_payload,
            correlation_key=correlation_key,
            max_attempts=5,
            next_attempt_at=now,
            expires_at=expires_at,
        )
        return await self._repository.enqueue(event)

    def decrypt_payload(self, event: OutboxEvent) -> str:
        if event.encrypted_payload is None:
            raise ValueError("Payload already purged")
        return self._encryptor.decrypt(event.encrypted_payload)
