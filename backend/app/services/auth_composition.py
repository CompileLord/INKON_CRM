from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from app.core import redis as redis_module
from app.core.config import settings
from app.core.security import PasswordWorkService
from app.core.student_passwords import PendingStudentPasswordHasher
from app.core.temporary_passwords import TemporaryPasswordGenerator
from app.core.verification_codes import VerificationCodeStore
from app.repositories.interfaces.refresh_token_repository import AuthRefreshTokenRepository
from app.repositories.interfaces.user_repository import AuthUserRepository
from app.repositories.sqlalchemy.outbox_repository import SQLAlchemyOutboxRepository
from app.repositories.sqlalchemy.refresh_token_repository import SQLAlchemyRefreshTokenRepository
from app.repositories.sqlalchemy.user_repository import SQLAlchemyUserRepository
from app.services.auth_collaborators import (
    AuthChallengeConsumer, AuthChallengeWriter, AuthMailOutbox, AuthPasswordSms,
    AuthPasswordWork, AuthPendingPasswordHasher, AuthSmsBudget, AuthTemporaryPasswordGenerator,
)
from app.services.auth_service import AuthService
from app.services.outbox_service import OutboxService


class AuthServiceComposition:
    @staticmethod
    def user_repository(db: AsyncSession) -> AuthUserRepository:
        return SQLAlchemyUserRepository(db)

    @staticmethod
    def refresh_token_repository(db: AsyncSession) -> AuthRefreshTokenRepository:
        return SQLAlchemyRefreshTokenRepository(db)

    @staticmethod
    def mail_outbox(db: AsyncSession) -> AuthMailOutbox:
        return OutboxService(SQLAlchemyOutboxRepository(db), settings.JWT_SECRET_KEY)

    @staticmethod
    def password_work() -> AuthPasswordWork:
        return PasswordWorkService()

    @staticmethod
    def temporary_password_generator() -> AuthTemporaryPasswordGenerator:
        return TemporaryPasswordGenerator()

    @staticmethod
    def pending_password_hasher() -> AuthPendingPasswordHasher:
        return PendingStudentPasswordHasher(settings.JWT_SECRET_KEY)

    @staticmethod
    def challenge_writer() -> AuthChallengeWriter:
        return redis_module.redis_client

    @staticmethod
    def challenge_consumer() -> AuthChallengeConsumer:
        return VerificationCodeStore(redis_module.redis_client)

    @staticmethod
    def password_sms(db: AsyncSession) -> AuthPasswordSms:
        from app.services.student_password_sms_factory import StudentPasswordSmsServiceFactory
        return StudentPasswordSmsServiceFactory.create(db)

    @staticmethod
    def sms_budget() -> AuthSmsBudget:
        from app.core.sms_rate_limiter import PasswordSmsRateLimiter
        return PasswordSmsRateLimiter()

    @staticmethod
    def create(db: AsyncSession) -> AuthService:
        return AuthService(
            AuthServiceComposition.user_repository(db),
            AuthServiceComposition.refresh_token_repository(db),
            AuthServiceComposition.mail_outbox(db),
            AuthServiceComposition.password_work(),
            AuthServiceComposition.temporary_password_generator(),
            AuthServiceComposition.pending_password_hasher(),
            AuthServiceComposition.challenge_writer(),
            AuthServiceComposition.challenge_consumer(),
            AuthServiceComposition.password_sms(db),
            AuthServiceComposition.sms_budget(),
        )
