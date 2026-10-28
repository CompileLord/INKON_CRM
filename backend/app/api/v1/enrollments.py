from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status as http_status
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.deps import get_db_session, get_enrollment_billing_service, get_enrollment_service, get_current_user, require_superadmin
from app.models.user import User, UserRole
from app.models.course import Course
from app.models.enrollment import Enrollment, EnrollmentStatus
from app.repositories.interfaces.enrollment_repository import EnrollmentFilters
from app.schemas.enrollment import (
    BillingModeChangeRequest,
    BillingModeChangeResponse,
    EnrollmentPreviewRequest,
    EnrollmentPreviewResponse,
    EnrollmentCreate,
    EnrollmentResponse,
    WithdrawalPreviewResponse,
    CourseRosterResponse,
    RosterLocationResponse,
    EligibleCandidateResponse,
    RosterSortOrder,
)
from app.schemas.common import PaginatedResponse
from app.services.enrollment_billing_service import EnrollmentBillingService
from app.services.enrollment_service import EnrollmentService

router = APIRouter()


@router.post("/", response_model=EnrollmentResponse, status_code=http_status.HTTP_201_CREATED)
async def enroll_student(
    payload: EnrollmentCreate,
    current_user: User = Depends(require_superadmin),
    db: AsyncSession = Depends(get_db_session),
    enrollment_service: EnrollmentService = Depends(get_enrollment_service),
) -> Enrollment:
    return await enrollment_service.enroll_student(
        payload.student_id, payload.course_id, current_user,
        price_at_enrollment=payload.price_at_enrollment, billing_mode=payload.billing_mode,
    )


@router.post("/preview", response_model=EnrollmentPreviewResponse)
async def preview_enrollment(
    payload: EnrollmentPreviewRequest,
    current_user: User = Depends(require_superadmin),
    billing_service: EnrollmentBillingService = Depends(get_enrollment_billing_service),
) -> EnrollmentPreviewResponse:
    return await billing_service.preview_enrollment(
        payload.student_id, payload.course_id, payload.price_at_enrollment, payload.billing_mode,
    )


@router.patch("/{id}/billing-mode", response_model=BillingModeChangeResponse)
async def change_billing_mode(
    id: int,
    payload: BillingModeChangeRequest,
    current_user: User = Depends(require_superadmin),
    billing_service: EnrollmentBillingService = Depends(get_enrollment_billing_service),
) -> BillingModeChangeResponse:
    return await billing_service.change_billing_mode(id, payload.billing_mode, payload.reason, current_user)


@router.get("/{id}/withdraw-preview", response_model=WithdrawalPreviewResponse)
async def preview_withdrawal(
    id: int,
    current_user: User = Depends(require_superadmin),
    enrollment_service: EnrollmentService = Depends(get_enrollment_service),
) -> WithdrawalPreviewResponse:
    return await enrollment_service.preview_withdrawal(id)


@router.patch("/{id}/withdraw", response_model=EnrollmentResponse)
async def withdraw_student(
    id: int,
    current_user: User = Depends(require_superadmin),
    db: AsyncSession = Depends(get_db_session),
    enrollment_service: EnrollmentService = Depends(get_enrollment_service),
) -> Enrollment:
    return await enrollment_service.withdraw_student(id, current_user.id)


@router.get("/", response_model=PaginatedResponse[EnrollmentResponse])
async def list_enrollments(
    course_id: Optional[int] = Query(None),
    student_id: Optional[int] = Query(None),
    status: Optional[EnrollmentStatus] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
    enrollment_service: EnrollmentService = Depends(get_enrollment_service),
) -> dict:
    filters: EnrollmentFilters = {}
    if status is not None:
        filters["status"] = status
    if current_user.role == UserRole.MENTOR:
        if not course_id:
            raise HTTPException(
                status_code=http_status.HTTP_403_FORBIDDEN,
                detail="Mentors must specify course_id to list enrollments"
            )
        course = await db.get(Course, course_id)
        if not course or course.is_deleted or course.mentor_id != current_user.id:
            raise HTTPException(
                status_code=http_status.HTTP_403_FORBIDDEN,
                detail="Not authorized to view enrollments for this course"
            )
        filters["course_id"] = course_id
    elif current_user.role == UserRole.STUDENT:
        if not student_id or student_id != current_user.id:
            raise HTTPException(
                status_code=http_status.HTTP_403_FORBIDDEN,
                detail="Students can only view their own enrollments"
            )
        filters["student_id"] = student_id
    else:
        if course_id is not None:
            filters["course_id"] = course_id
        if student_id is not None:
            filters["student_id"] = student_id

    result: dict = await enrollment_service.list_enrollments(filters, page, page_size)
    if current_user.role not in (UserRole.SUPERADMIN, UserRole.ACCOUNTANT):
        response: PaginatedResponse[EnrollmentResponse] = PaginatedResponse[EnrollmentResponse].model_validate(result, from_attributes=True)
        return JSONResponse(response.model_dump(mode="json", exclude={"items": {"__all__": {"price_at_enrollment", "billing_mode"}}}))
    return result


@router.get("/courses/{course_id}/roster", response_model=CourseRosterResponse)
async def get_course_roster(
    course_id: int,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    search: Optional[str] = Query(None),
    status: Optional[EnrollmentStatus] = Query(None),
    sort: RosterSortOrder = Query(RosterSortOrder.NAME_ASC),
    student_id: Optional[int] = Query(None),
    locate_student_id: Optional[int] = Query(None),
    current_user: User = Depends(get_current_user),
    enrollment_service: EnrollmentService = Depends(get_enrollment_service),
) -> CourseRosterResponse:
    if current_user.role not in (UserRole.SUPERADMIN, UserRole.MENTOR):
        raise HTTPException(
            status_code=http_status.HTTP_403_FORBIDDEN,
            detail="Not authorized to view course roster"
        )
    result: CourseRosterResponse = await enrollment_service.get_course_roster(
        course_id=course_id,
        current_user=current_user,
        page=page,
        page_size=page_size,
        search=search,
        status_filter=status,
        sort=sort,
        student_id=student_id,
        locate_student_id=locate_student_id,
    )
    if current_user.role == UserRole.MENTOR:
        return JSONResponse(result.model_dump(mode="json", exclude={"items": {"__all__": {"price_at_enrollment", "billing_mode"}}}))
    return result


@router.get("/courses/{course_id}/roster/locate", response_model=RosterLocationResponse)
async def locate_course_roster_student(
    course_id: int,
    student_id: int = Query(..., ge=1),
    page_size: int = Query(20, ge=1, le=100),
    search: Optional[str] = Query(None),
    status: Optional[EnrollmentStatus] = Query(None),
    sort: RosterSortOrder = Query(RosterSortOrder.NAME_ASC),
    current_user: User = Depends(get_current_user),
    enrollment_service: EnrollmentService = Depends(get_enrollment_service),
) -> RosterLocationResponse:
    if current_user.role not in (UserRole.SUPERADMIN, UserRole.MENTOR):
        raise HTTPException(
            status_code=http_status.HTTP_403_FORBIDDEN,
            detail="Not authorized to view course roster"
        )
    result: RosterLocationResponse = await enrollment_service.get_roster_location(
        course_id=course_id,
        student_id=student_id,
        current_user=current_user,
        page_size=page_size,
        search=search,
        status_filter=status,
        sort=sort,
    )
    if current_user.role == UserRole.MENTOR:
        return JSONResponse(result.model_dump(mode="json", exclude={"item": {"price_at_enrollment", "billing_mode"}}))
    return result


@router.get("/courses/{course_id}/eligible-candidates", response_model=PaginatedResponse[EligibleCandidateResponse])
async def get_course_eligible_candidates(
    course_id: int,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    search: Optional[str] = Query(None),
    current_user: User = Depends(require_superadmin),
    enrollment_service: EnrollmentService = Depends(get_enrollment_service),
) -> PaginatedResponse[EligibleCandidateResponse]:
    return await enrollment_service.get_eligible_candidates(
        course_id=course_id,
        current_user=current_user,
        page=page,
        page_size=page_size,
        search=search,
    )
