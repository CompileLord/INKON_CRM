from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from enum import Enum
from typing import ClassVar
from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.config import settings
from app.core.telegram_link_codes import TelegramLinkCodeGenerator, TelegramLinkCodeHasher
from app.models.user import User, UserRole
from app.repositories.interfaces.telegram_link_repository import (
    TelegramChatPreferenceRepository,
    TelegramLinkCodeRepository,
)
from app.repositories.sqlalchemy.telegram_link_repository import (
    SQLAlchemyTelegramChatPreferenceRepository,
    SQLAlchemyTelegramLinkCodeRepository,
)
from app.repositories.sqlalchemy.user_repository import SQLAlchemyUserRepository
from app.services.audit_service import AuditService


@dataclass(frozen=True)
class IssuedLinkCode:
    code: str
    expires_at: datetime


class LinkOutcome(str, Enum):
    LINKED = "linked"
    INVALID = "invalid"


@dataclass(frozen=True)
class LinkResult:
    outcome: LinkOutcome
    student_name: str | None = None
    replaced_chat_id: int | None = None


class TelegramLinkService:
    code_lifetime: ClassVar[timedelta] = timedelta(days=7)
    supported_languages: ClassVar[tuple[str, ...]] = ("tg", "ru", "en")
    audit_entity_type: ClassVar[str] = "student_telegram_link"

    def __init__(
        self,
        db: AsyncSession,
        code_repository: TelegramLinkCodeRepository | None = None,
        preference_repository: TelegramChatPreferenceRepository | None = None,
        generator: TelegramLinkCodeGenerator | None = None,
        hasher: TelegramLinkCodeHasher | None = None,
    ) -> None:
        self.db: AsyncSession = db
        self.code_repository: TelegramLinkCodeRepository = code_repository or SQLAlchemyTelegramLinkCodeRepository(db)
        self.preference_repository: TelegramChatPreferenceRepository = (
            preference_repository or SQLAlchemyTelegramChatPreferenceRepository(db)
        )
        self.user_repository: SQLAlchemyUserRepository = SQLAlchemyUserRepository(db)
        self.generator: TelegramLinkCodeGenerator = generator or TelegramLinkCodeGenerator()
        self.hasher: TelegramLinkCodeHasher = hasher or TelegramLinkCodeHasher(settings.JWT_SECRET_KEY)
        self.audit_service: AuditService = AuditService(db)

    async def issue_code_for_student(self, student_id: int, actor_id: int | None) -> IssuedLinkCode:
        student: User | None = await self.user_repository.get_by_id_for_update(student_id)
        if student is None or student.is_deleted or student.role != UserRole.STUDENT:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Student not found")
        return await self.issue_code(student, actor_id)

    async def issue_code(self, student: User, actor_id: int | None) -> IssuedLinkCode:
        code: str = self.generator.generate()
        expires_at: datetime = datetime.now(timezone.utc) + self.code_lifetime
        previous_expiry: datetime | None = student.parent_link_code_expires_at
        await self.code_repository.replace_code(student.id, self.hasher.hash_code(code), expires_at)
        student.parent_link_code_expires_at = expires_at
        await self.db.flush()
        await self.audit_service.log(
            actor_id,
            "update",
            self.audit_entity_type,
            student.id,
            {
                "link_code_expires_at": (previous_expiry.isoformat() if previous_expiry else None, expires_at.isoformat()),
            },
        )
        await self.db.flush()
        return IssuedLinkCode(code=code, expires_at=expires_at)

    async def get_language(self, chat_id: int) -> str | None:
        return await self.preference_repository.get_language(chat_id)

    async def set_language(self, chat_id: int, language: str) -> None:
        if language not in self.supported_languages:
            raise ValueError("Unsupported language")
        await self.preference_repository.set_language(chat_id, language)

    async def link_parent_chat(self, chat_id: int, normalized_code: str) -> LinkResult:
        now: datetime = datetime.now(timezone.utc)
        student_id: int | None = await self.code_repository.consume(
            self.hasher.hash_code(normalized_code), now, chat_id
        )
        if student_id is None:
            return LinkResult(outcome=LinkOutcome.INVALID)
        student: User | None = await self.user_repository.get_by_id_for_update(student_id)
        if student is None or student.is_deleted or student.role != UserRole.STUDENT:
            return LinkResult(outcome=LinkOutcome.INVALID)
        previous_chat_id: int | None = student.parent_telegram_chat_id
        student.parent_telegram_chat_id = chat_id
        student.parent_link_code_expires_at = None
        await self.db.flush()
        replaced_chat_id: int | None = (
            previous_chat_id if previous_chat_id is not None and previous_chat_id != chat_id else None
        )
        await self.audit_service.log(
            None,
            "update",
            self.audit_entity_type,
            student.id,
            {"parent_telegram_chat_id": (previous_chat_id, chat_id)},
        )
        await self.db.flush()
        return LinkResult(
            outcome=LinkOutcome.LINKED,
            student_name=f"{student.first_name} {student.last_name}",
            replaced_chat_id=replaced_chat_id,
        )
