from typing import AsyncGenerator, Callable, List
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.config import settings
from app.db.session import AsyncSessionLocal
from app.models.user import User, UserRole
from app.repositories.sqlalchemy.user_repository import SQLAlchemyUserRepository

oauth2_scheme = OAuth2PasswordBearer(
    tokenUrl=f"{settings.API_V1_STR}/auth/login"
)


async def get_db_session() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


async def get_current_user(
    db: AsyncSession = Depends(get_db_session),
    token: str = Depends(oauth2_scheme)
) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=["HS256"])
        user_id_str: str = payload.get("sub")
        if user_id_str is None:
            raise credentials_exception
        user_id = int(user_id_str)
    except (JWTError, ValueError):
        raise credentials_exception

    user_repo = SQLAlchemyUserRepository(db)
    user = await user_repo.get_by_id(user_id)
    if user is None:
        raise credentials_exception
    if user.is_deleted:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Account deactivated"
        )
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


