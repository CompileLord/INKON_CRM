from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.deps import get_db_session, get_current_user
from app.models.user import User, UserRole
from app.models.enrollment import Enrollment
from app.models.course import Course
from app.repositories.sqlalchemy.user_repository import SQLAlchemyUserRepository
from app.schemas.user import StudentProfileResponse, UserResponse
from app.services.user_service import UserService

router = APIRouter()


from app.schemas.common import PaginatedResponse, PaginationParams

@router.get("/", response_model=PaginatedResponse[UserResponse])
async def get_students(
    search: Optional[str] = None,
    pagination: PaginationParams = Depends(),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session)
) -> dict:
    if current_user.role not in [UserRole.SUPERADMIN, UserRole.ACCOUNTANT, UserRole.MENTOR]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not enough permissions"
        )
    user_service = UserService(db)
    return await user_service.get_students(page=pagination.page, page_size=pagination.page_size, search=search)


@router.get("/me/profile", response_model=StudentProfileResponse)
async def get_my_profile(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session)
) -> dict:
    if current_user.role != UserRole.STUDENT:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current user is not a student"
        )
    user_repo = SQLAlchemyUserRepository(db)
    stats = await user_repo.get_student_profile_stats(current_user.id)
    return {
        "user": current_user,
        "courses": stats["courses"],
        "avg_score": stats["avg_score"],
        "absences": stats["absences"],
        "total_lessons": stats["total_lessons"]
    }


@router.get("/{id}/profile", response_model=StudentProfileResponse)
async def get_student_profile(
    id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session)
) -> dict:
    if current_user.role == UserRole.STUDENT and current_user.id != id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied to other student profiles"
        )

    if current_user.role == UserRole.MENTOR:
        query = select(Enrollment).join(Course).filter(
            Enrollment.student_id == id,
            Course.mentor_id == current_user.id,
            Enrollment.is_deleted == False
        )
        result = await db.execute(query)
        enrollment = result.scalars().first()
        if not enrollment:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not authorized to view this student's profile"
            )

    user_repo = SQLAlchemyUserRepository(db)
    target_user = await user_repo.get_by_id(id)
    if not target_user or target_user.role != UserRole.STUDENT:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Student not found"
        )

    stats = await user_repo.get_student_profile_stats(id)
    return {
        "user": target_user,
        "courses": stats["courses"],
        "avg_score": stats["avg_score"],
        "absences": stats["absences"],
        "total_lessons": stats["total_lessons"]
    }
