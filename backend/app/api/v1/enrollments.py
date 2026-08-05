from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.deps import get_db_session, get_current_user, require_superadmin
from app.models.user import User, UserRole
from app.models.course import Course
from app.models.enrollment import Enrollment
from app.schemas.enrollment import EnrollmentCreate, EnrollmentResponse
from app.schemas.common import PaginatedResponse
from app.services.enrollment_service import EnrollmentService

router = APIRouter()


@router.post("/", response_model=EnrollmentResponse, status_code=status.HTTP_201_CREATED)
async def enroll_student(
    payload: EnrollmentCreate,
    current_user: User = Depends(require_superadmin),
    db: AsyncSession = Depends(get_db_session)
) -> Enrollment:
    enrollment_service = EnrollmentService(db)
    return await enrollment_service.enroll_student(payload.student_id, payload.course_id, current_user)


@router.patch("/{id}/withdraw", response_model=EnrollmentResponse)
async def withdraw_student(
    id: int,
    current_user: User = Depends(require_superadmin),
    db: AsyncSession = Depends(get_db_session)
) -> Enrollment:
    enrollment_service = EnrollmentService(db)
    return await enrollment_service.withdraw_student(id)


@router.get("/", response_model=PaginatedResponse[EnrollmentResponse])
async def list_enrollments(
    course_id: Optional[int] = Query(None),
    student_id: Optional[int] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session)
) -> dict:
    filters = {}
    if current_user.role == UserRole.MENTOR:
        if not course_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Mentors must specify course_id to list enrollments"
            )
        course = await db.get(Course, course_id)
        if not course or course.is_deleted or course.mentor_id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not authorized to view enrollments for this course"
            )
        filters["course_id"] = course_id
    elif current_user.role == UserRole.STUDENT:
        if not student_id or student_id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Students can only view their own enrollments"
            )
        filters["student_id"] = student_id
    else:
        if course_id is not None:
            filters["course_id"] = course_id
        if student_id is not None:
            filters["student_id"] = student_id

    enrollment_service = EnrollmentService(db)
    return await enrollment_service.list_enrollments(filters, page, page_size)
