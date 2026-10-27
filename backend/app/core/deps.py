from typing import AsyncGenerator, Callable, List
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.access_token_deny_list import AccessTokenDenyList, AccessTokenDenyListUnavailable
from app.core.security import AccessTokenPrincipal
from app.db.session import AsyncSessionLocal
from app.models.user import User, UserRole
from app.repositories.interfaces.course_progress_repository import CourseProgressRepositoryInterface
from app.repositories.sqlalchemy.course_progress_repository import SqlAlchemyCourseProgressRepository
from app.repositories.sqlalchemy.user_repository import SQLAlchemyUserRepository
from app.services.course_progress_service import CourseProgressService
from app.repositories.interfaces.user_repository import UserRepository
from app.repositories.interfaces.document_repository import DocumentRepository
from app.repositories.interfaces.enrollment_repository import EnrollmentRepository
from app.repositories.interfaces.audit_log_repository import AuditLogRepository
from app.services.storage_service import StorageService

from app.core.config import settings
from app.repositories.interfaces.user_repository import AuthUserRepository
from app.repositories.interfaces.refresh_token_repository import AuthRefreshTokenRepository
from app.services.auth_service import AuthService
from app.services.auth_composition import AuthServiceComposition
from app.services.auth_session_service import AuthSessionService
from app.services.auth_collaborators import (
    AuthMailOutbox, AuthPasswordWork, AuthTemporaryPasswordGenerator,
    AuthPendingPasswordHasher, AuthChallengeWriter, AuthChallengeConsumer,
    AuthPasswordSms, AuthSessions, AuthSmsBudget,
)


oauth2_scheme = HTTPBearer()


async def get_db_session() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        try:
            yield session
            if session.in_transaction():
                await session.commit()
        except Exception:
            await session.rollback()
            raise


def _credentials_exception() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )


def _forbidden_setup_exception() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Must set password first",
    )


async def _get_user_for_principal(
    principal: AccessTokenPrincipal,
    db: AsyncSession,
    lock_for_setup: bool = False,
) -> User:
    user_repo = SQLAlchemyUserRepository(db)
    user = (
        await user_repo.get_by_id_for_update(principal.subject_id)
        if lock_for_setup
        else await user_repo.get_by_id_for_authentication(principal.subject_id)
    )
    if user is None:
        raise _credentials_exception()
    if user.is_deleted:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Account deactivated"
        )
    if user.auth_version != principal.auth_version:
        raise _credentials_exception()
    await _reject_denied_token(principal)
    return user


async def _reject_denied_token(principal: AccessTokenPrincipal) -> None:
    if principal.token_id is None:
        return
    try:
        denied: bool = await AuthServiceComposition.deny_list().is_denied(principal.token_id)
    except AccessTokenDenyListUnavailable:
        AccessTokenDenyList.warn_unavailable(principal.token_id, "check")
        return
    if denied:
        raise _credentials_exception()


def _decode_principal(token_auth: HTTPAuthorizationCredentials) -> AccessTokenPrincipal:
    try:
        return AccessTokenPrincipal.from_token(token_auth.credentials)
    except (JWTError, ValueError) as exception:
        raise _credentials_exception() from exception


async def get_current_user(
    db: AsyncSession = Depends(get_db_session),
    token_auth: HTTPAuthorizationCredentials = Depends(oauth2_scheme)
) -> User:
    principal = _decode_principal(token_auth)
    if principal.scope is not None:
        raise _forbidden_setup_exception()
    user = await _get_user_for_principal(principal, db)
    if user.must_set_password:
        raise _forbidden_setup_exception()
    return user


async def get_setup_user(
    db: AsyncSession = Depends(get_db_session),
    token_auth: HTTPAuthorizationCredentials = Depends(oauth2_scheme)
) -> User:
    principal = _decode_principal(token_auth)
    if principal.scope != "must_set_password":
        raise _forbidden_setup_exception()
    user = await _get_user_for_principal(principal, db, lock_for_setup=True)
    if not user.must_set_password:
        raise _forbidden_setup_exception()
    return user


def require_role(roles: List[UserRole]) -> Callable[[User], User]:
    def dependency(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not enough permissions"
            )
        return current_user
    return dependency


require_superadmin = require_role([UserRole.SUPERADMIN])
require_accountant = require_role([UserRole.SUPERADMIN, UserRole.ACCOUNTANT])
require_mentor = require_role([UserRole.SUPERADMIN, UserRole.MENTOR])


async def check_must_set_password(current_user: User = Depends(get_current_user)) -> User:
    if current_user.must_set_password:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Must set password first"
        )
    return current_user


async def require_course_owner(
    course_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session)
) -> User:
    if current_user.role == UserRole.SUPERADMIN:
        return current_user
    if current_user.role != UserRole.MENTOR:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not enough permissions"
        )
    from app.repositories.sqlalchemy.course_repository import SQLAlchemyCourseRepository
    course_repo = SQLAlchemyCourseRepository(db)
    course = await course_repo.get_by_id(course_id)
    if not course:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Course not found"
        )
    if course.mentor_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not the owner of this course"
        )
    return current_user


async def require_student_self(
    student_id: int,
    current_user: User = Depends(get_current_user)
) -> User:
    if current_user.role == UserRole.SUPERADMIN:
        return current_user
    if current_user.role != UserRole.STUDENT or current_user.id != student_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied to other student profiles"
        )
    return current_user


def get_storage_service() -> "StorageService":
    from app.services.storage_service import get_storage_service as resolve_configured_storage_service
    return resolve_configured_storage_service()


def get_user_repository(db: AsyncSession = Depends(get_db_session)) -> UserRepository:
    return SQLAlchemyUserRepository(db)


def get_document_repository(db: AsyncSession = Depends(get_db_session)) -> DocumentRepository:
    from app.repositories.sqlalchemy.document_repository import SQLAlchemyDocumentRepository
    return SQLAlchemyDocumentRepository(db)


def get_enrollment_repository(db: AsyncSession = Depends(get_db_session)) -> EnrollmentRepository:
    from app.repositories.sqlalchemy.enrollment_repository import SQLAlchemyEnrollmentRepository
    return SQLAlchemyEnrollmentRepository(db)


def get_audit_log_repository(db: AsyncSession = Depends(get_db_session)) -> AuditLogRepository:
    from app.repositories.sqlalchemy.audit_log_repository import SQLAlchemyAuditLogRepository
    return SQLAlchemyAuditLogRepository(db)


def get_audit_service(
    db: AsyncSession = Depends(get_db_session),
    repository: AuditLogRepository = Depends(get_audit_log_repository),
) -> "AuditService":
    from app.services.audit_service import AuditService
    return AuditService(db, audit_repo=repository)


def get_document_service(
    db: AsyncSession = Depends(get_db_session),
    storage: StorageService = Depends(get_storage_service),
    repository: DocumentRepository = Depends(get_document_repository),
) -> "DocumentService":
    from app.services.document_service import DocumentService
    return DocumentService(db, storage, document_repo=repository)


def get_enrollment_service(
    db: AsyncSession = Depends(get_db_session),
    repository: EnrollmentRepository = Depends(get_enrollment_repository),
    user_repository: UserRepository = Depends(get_user_repository),
) -> "EnrollmentService":
    from app.repositories.sqlalchemy.course_repository import SQLAlchemyCourseRepository
    from app.services.enrollment_service import EnrollmentService
    return EnrollmentService(db, enrollment_repo=repository, course_repo=SQLAlchemyCourseRepository(db), user_repo=user_repository)


def get_student_profile_service(
    user_repo: UserRepository = Depends(get_user_repository)
) -> "StudentProfileService":
    from app.services.schedule_service import LessonScheduleService
    from app.services.student_profile_service import StudentProfileService
    schedule_service: LessonScheduleService = LessonScheduleService()
    return StudentProfileService(user_repo=user_repo, schedule_service=schedule_service)


def get_document_delivery_service(
    repository: DocumentRepository = Depends(get_document_repository)
) -> "DocumentDeliveryService":
    from app.services.document_delivery_service import DocumentDeliveryService
    from app.services.document_file_storage import LocalDocumentFileStorage
    return DocumentDeliveryService(repository, LocalDocumentFileStorage())


def get_mentor_analytics_service(
    repository: UserRepository = Depends(get_user_repository)
) -> "MentorAnalyticsService":
    from app.services.mentor_analytics_service import MentorAnalyticsService
    return MentorAnalyticsService(repository)


def get_course_progress_repository(
    db: AsyncSession = Depends(get_db_session)
) -> CourseProgressRepositoryInterface:
    return SqlAlchemyCourseProgressRepository(db)


def get_course_progress_service(
    repo: CourseProgressRepositoryInterface = Depends(get_course_progress_repository)
) -> CourseProgressService:
    return CourseProgressService(repo)


def get_notification_service(db: AsyncSession = Depends(get_db_session)) -> "NotificationService":
    from app.repositories.sqlalchemy.notification_log_repository import SQLAlchemyNotificationLogRepository
    from app.services.notification_service import NotificationService
    return NotificationService(SQLAlchemyNotificationLogRepository(db))


def get_debt_reminder_service(db: AsyncSession = Depends(get_db_session)) -> "DebtReminderService":
    from app.repositories.sqlalchemy.debt_reminder_repository import SQLAlchemyDebtReminderRepository
    from app.services.audit_service import AuditService
    from app.services.debt_reminder_service import DebtReminderService
    from app.core.config import settings
    from app.services.debt_reminder_sms import DebtReminderSms
    from app.services.outbox_service import OutboxPayloadEncryptor
    from app.repositories.sqlalchemy.outbox_repository import SQLAlchemyOutboxRepository
    return DebtReminderService(
        SQLAlchemyDebtReminderRepository(db), AuditService(db),
        sms=DebtReminderSms(SQLAlchemyOutboxRepository(db), OutboxPayloadEncryptor.from_settings(settings.JWT_SECRET_KEY)),
        interval_seconds=settings.DEBT_REMINDER_INTERVAL_SECONDS,
    )


def get_student_journal_history_service(db: AsyncSession = Depends(get_db_session)) -> "StudentJournalHistoryService":
    from app.core.config import settings
    from app.repositories.sqlalchemy.student_journal_history_repository import SQLAlchemyStudentJournalHistoryRepository
    from app.services.student_journal_history_cursor import StudentJournalHistoryCursorCodec
    from app.services.student_journal_history_service import StudentJournalHistoryService

    return StudentJournalHistoryService(SQLAlchemyStudentJournalHistoryRepository(db), StudentJournalHistoryCursorCodec(settings.JWT_SECRET_KEY))


def get_course_copy_service(db: AsyncSession = Depends(get_db_session)) -> "CourseService":
    from app.repositories.sqlalchemy.course_repository import SQLAlchemyCourseRepository
    from app.services.course_service import CourseService
    return CourseService(db, course_repo=SQLAlchemyCourseRepository(db), user_repo=SQLAlchemyUserRepository(db))


def get_auth_user_repository(db: AsyncSession = Depends(get_db_session)) -> AuthUserRepository:
    return AuthServiceComposition.user_repository(db)


def get_auth_refresh_token_repository(db: AsyncSession = Depends(get_db_session)) -> AuthRefreshTokenRepository:
    return AuthServiceComposition.refresh_token_repository(db)


def get_auth_mail_outbox(db: AsyncSession = Depends(get_db_session)) -> AuthMailOutbox:
    return AuthServiceComposition.mail_outbox(db)


def get_auth_password_work() -> AuthPasswordWork:
    return AuthServiceComposition.password_work()


def get_auth_temporary_password_generator() -> AuthTemporaryPasswordGenerator:
    return AuthServiceComposition.temporary_password_generator()


def get_auth_pending_password_hasher() -> AuthPendingPasswordHasher:
    return AuthServiceComposition.pending_password_hasher()


def get_auth_challenge_writer() -> AuthChallengeWriter:
    return AuthServiceComposition.challenge_writer()


def get_auth_challenge_consumer() -> AuthChallengeConsumer:
    return AuthServiceComposition.challenge_consumer()


def get_auth_password_sms(db: AsyncSession = Depends(get_db_session)) -> AuthPasswordSms:
    return AuthServiceComposition.password_sms(db)


def get_auth_sms_budget() -> AuthSmsBudget:
    return AuthServiceComposition.sms_budget()


def get_auth_session_service(
    user_repository: AuthUserRepository = Depends(get_auth_user_repository),
    token_repository: AuthRefreshTokenRepository = Depends(get_auth_refresh_token_repository),
) -> AuthSessions:
    return AuthSessionService(user_repository, token_repository, AuthServiceComposition.deny_list())


def get_auth_service(
    user_repository: AuthUserRepository = Depends(get_auth_user_repository),
    token_repository: AuthRefreshTokenRepository = Depends(get_auth_refresh_token_repository),
    outbox_service: AuthMailOutbox = Depends(get_auth_mail_outbox),
    password_work_service: AuthPasswordWork = Depends(get_auth_password_work),
    temporary_password_generator: AuthTemporaryPasswordGenerator = Depends(get_auth_temporary_password_generator),
    pending_password_hasher: AuthPendingPasswordHasher = Depends(get_auth_pending_password_hasher),
    challenge_writer: AuthChallengeWriter = Depends(get_auth_challenge_writer),
    challenge_consumer: AuthChallengeConsumer = Depends(get_auth_challenge_consumer),
    sms_service: AuthPasswordSms = Depends(get_auth_password_sms),
    sms_budget: AuthSmsBudget = Depends(get_auth_sms_budget),
    session_service: AuthSessions = Depends(get_auth_session_service),
) -> AuthService:
    return AuthService(
        user_repository, token_repository, outbox_service, password_work_service,
        temporary_password_generator, pending_password_hasher, challenge_writer,
        challenge_consumer, sms_service, sms_budget, session_service,
    )

