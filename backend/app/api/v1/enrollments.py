from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.deps import get_db_session, require_superadmin
from app.models.user import User
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
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: User = Depends(require_superadmin),
    db: AsyncSession = Depends(get_db_session)
) -> dict:
    enrollment_service = EnrollmentService(db)
    return await enrollment_service.list_enrollments({}, page, page_size)
