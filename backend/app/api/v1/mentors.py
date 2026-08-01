from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.deps import get_db_session, get_current_user, require_superadmin
from app.models.user import User, UserRole
from app.repositories.sqlalchemy.user_repository import SQLAlchemyUserRepository
from app.schemas.user import MentorProfileResponse, UserResponse
from app.services.user_service import UserService

router = APIRouter()


from app.schemas.common import PaginatedResponse, PaginationParams

@router.get("/", response_model=PaginatedResponse[UserResponse])
async def get_mentors(
    search: Optional[str] = None,
    pagination: PaginationParams = Depends(),
    current_user: User = Depends(require_superadmin),
    db: AsyncSession = Depends(get_db_session)
) -> dict:
    user_service = UserService(db)
    return await user_service.get_mentors(page=pagination.page, page_size=pagination.page_size, search=search)


@router.get("/me/profile", response_model=MentorProfileResponse)
async def get_my_profile(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session)
) -> dict:
    if current_user.role != UserRole.MENTOR:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current user is not a mentor"
        )
    user_repo = SQLAlchemyUserRepository(db)
    stats = await user_repo.get_mentor_profile_stats(current_user.id)
    return {
        "user": current_user,
        "active_courses": stats["active_courses"],
        "active_students_count": stats["active_students_count"],
        "avg_score": stats["avg_score"]
    }


@router.get("/{id}/profile", response_model=MentorProfileResponse)
async def get_mentor_profile(
    id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session)
) -> dict:
    if current_user.role == UserRole.MENTOR and current_user.id != id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied to other mentor profiles"
        )
    if current_user.role not in [UserRole.SUPERADMIN, UserRole.MENTOR]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not enough permissions"
        )

    user_repo = SQLAlchemyUserRepository(db)
    target_user = await user_repo.get_by_id(id)
    if not target_user or target_user.role != UserRole.MENTOR:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Mentor not found"
        )

    stats = await user_repo.get_mentor_profile_stats(id)
    return {
        "user": target_user,
        "active_courses": stats["active_courses"],
        "active_students_count": stats["active_students_count"],
        "avg_score": stats["avg_score"]
    }


@router.get("/{id}/analytics")
async def get_mentor_analytics(
    id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session)
) -> dict:
    if current_user.role == UserRole.MENTOR and current_user.id != id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied to other mentor analytics"
        )
    if current_user.role not in [UserRole.SUPERADMIN, UserRole.MENTOR]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not enough permissions"
        )

    user_repo = SQLAlchemyUserRepository(db)
    target_user = await user_repo.get_by_id(id)
    if not target_user or target_user.role != UserRole.MENTOR:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Mentor not found"
        )

    from app.models.course import Course, CourseStatus
    from app.models.enrollment import Enrollment
    from app.models.journal import Journal
    from app.models.journal_student_summary import JournalStudentSummary
    from sqlalchemy import select, func

    active_courses_stmt = select(func.count(Course.id)).filter(
        Course.mentor_id == id,
        Course.status == CourseStatus.ACTIVE,
        Course.is_deleted == False
    )
    active_courses_res = await db.execute(active_courses_stmt)
    active_courses_count = active_courses_res.scalar() or 0

    students_stmt = select(func.count(func.distinct(Enrollment.student_id))).join(Course).filter(
        Course.mentor_id == id,
        Enrollment.is_deleted == False
    )
    students_res = await db.execute(students_stmt)
    total_students_count = students_res.scalar() or 0

    score_stmt = select(func.avg(JournalStudentSummary.sum_score)).join(
        Journal, JournalStudentSummary.journal_id == Journal.id
    ).join(Course, Journal.course_id == Course.id).filter(
        Course.mentor_id == id,
        Course.is_deleted == False
    )
    score_res = await db.execute(score_stmt)
    avg_score = score_res.scalar()
    average_student_score = float(avg_score) if avg_score is not None else 0.0

    return {
        "active_courses_count": active_courses_count,
        "total_students_count": total_students_count,
        "average_student_score": average_student_score
    }

