from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.deps import get_db_session, get_current_user, get_mentor_analytics_service, require_superadmin
from app.models.user import User, UserRole
from app.models.course import Course
from app.repositories.sqlalchemy.user_repository import SQLAlchemyUserRepository
from app.schemas.user import MentorAnalyticsResponse, MentorProfileResponse, StudentMentorCardResponse, StudentMentorCourseResponse, StudentMentorIdentityResponse, UserResponse
from app.services.user_service import UserService
from app.services.mentor_analytics_service import MentorAnalyticsService

from app.api.v1.contract_notes import ContractNotes

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
        "avg_score": stats["avg_score"],
        "active_students_population": "active_enrollments_on_assigned_courses_including_soft_deleted_courses",
        "avg_score_grading_state": stats["avg_score_grading_state"],
        "avg_score_provenance": stats["avg_score_provenance"],
        "avg_score_basis": stats["avg_score_basis"],
        "avg_score_summary_count": stats["avg_score_summary_count"],
        "avg_score_defined_ratio_count": stats["avg_score_defined_ratio_count"],
        "avg_score_undefined_ratio_count": stats["avg_score_undefined_ratio_count"],
        "avg_score_defined_ratios_mean": stats["avg_score_defined_ratios_mean"]
    }


from app.schemas.journal import GradingQueueItemResponse
from app.services.journal_service import JournalService

@router.get("/me/grading-queue", response_model=List[GradingQueueItemResponse])
async def get_my_grading_queue(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session)
) -> List[GradingQueueItemResponse]:
    if current_user.role not in [UserRole.MENTOR, UserRole.SUPERADMIN]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only mentors or admins can view the grading queue"
        )
    journal_service = JournalService(db)
    return await journal_service.get_mentor_grading_queue(current_user.id)


@router.get("/{id}/profile", response_model=MentorProfileResponse | StudentMentorCardResponse, description=ContractNotes.MENTOR_PROFILE,
    responses={200: {"description": "Successful Response (mentor owner or superadmin)"}})
async def get_mentor_profile(
    id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session)
) -> dict | StudentMentorCardResponse:
    if current_user.role == UserRole.MENTOR and current_user.id != id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied to other mentor profiles"
        )
    user_repo: SQLAlchemyUserRepository = SQLAlchemyUserRepository(db)
    if current_user.role == UserRole.STUDENT:
        visible_courses: list[Course] = await user_repo.get_student_visible_mentor_courses(id, current_user.id)
        if not visible_courses:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not enrolled in any course with this mentor"
            )
        target_mentor: User | None = await user_repo.get_by_id(id)
        if target_mentor is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Mentor not found")
        return StudentMentorCardResponse(
            user=StudentMentorIdentityResponse.model_validate(target_mentor),
            active_courses=[StudentMentorCourseResponse.model_validate(course) for course in visible_courses],
        )
    elif current_user.role not in [UserRole.SUPERADMIN, UserRole.MENTOR]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not enough permissions"
        )

    target_user: User | None = await user_repo.get_by_id(id)
    if not target_user or target_user.role != UserRole.MENTOR:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Mentor not found"
        )

    stats: dict = await user_repo.get_mentor_profile_stats(id)
    return {
        "user": target_user,
        "active_courses": stats["active_courses"],
        "active_students_count": stats["active_students_count"],
        "avg_score": stats["avg_score"],
        "active_students_population": "active_enrollments_on_assigned_courses_including_soft_deleted_courses",
        "avg_score_grading_state": stats["avg_score_grading_state"],
        "avg_score_provenance": stats["avg_score_provenance"],
        "avg_score_basis": stats["avg_score_basis"],
        "avg_score_summary_count": stats["avg_score_summary_count"],
        "avg_score_defined_ratio_count": stats["avg_score_defined_ratio_count"],
        "avg_score_undefined_ratio_count": stats["avg_score_undefined_ratio_count"],
        "avg_score_defined_ratios_mean": stats["avg_score_defined_ratios_mean"]
    }


@router.get("/{id}/analytics", response_model=MentorAnalyticsResponse)
async def get_mentor_analytics(
    id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
    analytics_service: MentorAnalyticsService = Depends(get_mentor_analytics_service)
) -> MentorAnalyticsResponse:
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

    return await analytics_service.get_mentor_analytics(id)

