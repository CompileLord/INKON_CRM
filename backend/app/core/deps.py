from typing import AsyncGenerator, Callable, List
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.security import AccessTokenPrincipal
from app.db.session import AsyncSessionLocal
from app.models.user import User, UserRole
from app.repositories.interfaces.course_progress_repository import CourseProgressRepositoryInterface
from app.repositories.sqlalchemy.course_progress_repository import SqlAlchemyCourseProgressRepository
from app.repositories.sqlalchemy.user_repository import SQLAlchemyUserRepository
from app.services.course_progress_service import CourseProgressService

oauth2_scheme = HTTPBearer()


async def get_db_session() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        try:
            yield session
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
    return user


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
    from app.services.storage_service import StorageService, LocalStorageService
    return LocalStorageService()


def get_student_profile_service(
    db: AsyncSession = Depends(get_db_session)
) -> "StudentProfileService":
    from app.repositories.sqlalchemy.user_repository import SQLAlchemyUserRepository
    from app.services.schedule_service import LessonScheduleService
    from app.services.student_profile_service import StudentProfileService
    user_repo = SQLAlchemyUserRepository(db)
    schedule_service = LessonScheduleService()
    return StudentProfileService(user_repo=user_repo, schedule_service=schedule_service)


def get_document_delivery_service(
    db: AsyncSession = Depends(get_db_session)
) -> "DocumentDeliveryService":
    from app.repositories.sqlalchemy.document_repository import SQLAlchemyDocumentRepository
    from app.services.document_delivery_service import DocumentDeliveryService
    from app.services.document_file_storage import LocalDocumentFileStorage
    return DocumentDeliveryService(SQLAlchemyDocumentRepository(db), LocalDocumentFileStorage())


def get_mentor_analytics_service(
    db: AsyncSession = Depends(get_db_session)
) -> "MentorAnalyticsService":
    from app.services.mentor_analytics_service import MentorAnalyticsService
    return MentorAnalyticsService(SQLAlchemyUserRepository(db))


def get_course_progress_repository(
    db: AsyncSession = Depends(get_db_session)
) -> CourseProgressRepositoryInterface:
    return SqlAlchemyCourseProgressRepository(db)


def get_course_progress_service(
    repo: CourseProgressRepositoryInterface = Depends(get_course_progress_repository)
) -> CourseProgressService:
    return CourseProgressService(repo)
