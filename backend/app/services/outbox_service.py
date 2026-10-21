import base64
import json
import os
from datetime import datetime, timedelta, timezone
from typing import Optional
from pydantic import BaseModel, ConfigDict, Field
from app.models.outbox_event import OutboxEvent, OutboxEventKind, OutboxEventStatus
from app.repositories.interfaces.outbox_repository import OutboxRepository
from app.services.email_templates import (
    CredentialsEmailTemplate,
    PasswordResetEmailTemplate,
    VerificationCodeEmailTemplate,
)

OUTBOX_PAYLOAD_DOMAIN_SEPARATOR = b"imkon-crm:outbox-payload:v1"
OUTBOX_CODE_TTL_SECONDS = 600
STUDENT_PASSWORD_SMS_TTL_SECONDS = 3600


class NotificationIntentPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    student_id: int = Field(gt=0)
    journal_id: int = Field(gt=0)


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

    async def enqueue_notification(
        self,
        kind: OutboxEventKind,
        student_id: int,
        journal_id: int,
        correlation_key: str,
    ) -> OutboxEvent:
        if kind not in (OutboxEventKind.EXAM_RESULT_NOTIFICATION, OutboxEventKind.DOCUMENT_NOTIFICATION):
            raise ValueError("Unsupported notification intent kind")
        payload: NotificationIntentPayload = NotificationIntentPayload(student_id=student_id, journal_id=journal_id)
        event: OutboxEvent = OutboxEvent(
            kind=kind,
            status=OutboxEventStatus.PENDING,
            recipient_email="",
            subject="",
            encrypted_payload=self._encryptor.encrypt(payload.model_dump_json()),
            correlation_key=correlation_key,
            max_attempts=5,
            next_attempt_at=datetime.now(timezone.utc),
        )
        return await self._repository.enqueue(event)

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
            subject=VerificationCodeEmailTemplate.SUBJECT,
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
            subject=PasswordResetEmailTemplate.SUBJECT,
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
        parent_link_code: Optional[str] = None,
    ) -> OutboxEvent:
        now = datetime.now(timezone.utc)
        expires_at = now + timedelta(seconds=OUTBOX_CODE_TTL_SECONDS)
        payload_fields: dict[str, str] = {"first_name": first_name, "temporary_password": temporary_password}
        if parent_link_code is not None:
            payload_fields["parent_link_code"] = parent_link_code
        encrypted_payload = self._encryptor.encrypt(json.dumps(payload_fields))
        event = OutboxEvent(
            kind=OutboxEventKind.CREDENTIALS_EMAIL,
            status=OutboxEventStatus.PENDING,
            recipient_email=recipient_email,
            subject=CredentialsEmailTemplate.SUBJECT,
            encrypted_payload=encrypted_payload,
            correlation_key=correlation_key,
            max_attempts=5,
            next_attempt_at=now,
            expires_at=expires_at,
        )
        return await self._repository.enqueue(event)

    async def enqueue_student_password_sms(
        self,
        recipient_phone: str,
        target_user_id: int,
        code: str,
        reason: str,
        language: Optional[str],
        expires_at: Optional[datetime] = None,
    ) -> OutboxEvent:
        now: datetime = datetime.now(timezone.utc)
        payload_fields: dict[str, Optional[str]] = {"code": code, "reason": reason, "language": language}
        event: OutboxEvent = OutboxEvent(
            kind=OutboxEventKind.STUDENT_PASSWORD_SMS,
            status=OutboxEventStatus.PENDING,
            recipient_email="",
            subject="",
            recipient_phone=recipient_phone,
            target_user_id=target_user_id,
            encrypted_payload=self._encryptor.encrypt(json.dumps(payload_fields)),
            correlation_key=f"password-sms:{target_user_id}",
            max_attempts=6,
            next_attempt_at=now,
            expires_at=expires_at or now + timedelta(seconds=STUDENT_PASSWORD_SMS_TTL_SECONDS),
        )
        return await self._repository.enqueue(event)

    def decrypt_payload(self, event: OutboxEvent) -> str:
        if event.encrypted_payload is None:
            raise ValueError("Payload already purged")
        return self._encryptor.decrypt(event.encrypted_payload)
