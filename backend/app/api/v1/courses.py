from fastapi import APIRouter, Depends, HTTPException, status, Query, File, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List, Optional

from app.core.deps import (
    get_storage_service,
    get_course_copy_service,
    get_db_session,
    get_current_user,
    require_superadmin,
    get_course_progress_repository,
    get_course_progress_service,
)
from app.models.user import User, UserRole
from app.models.course import Course
from app.models.course_schedule import CourseSchedule
from app.models.enrollment import Enrollment, EnrollmentStatus
from app.models.course_mentor_history import CourseMentorHistory
from app.models.journal import Journal
from app.schemas.course import CourseCreate, CourseUpdate, CourseResponse, CourseListItemResponse, CourseScheduleResponse, CourseMentorHistoryResponse, CourseStaffProgressResponse
from app.schemas.journal import JournalResponse, CourseJournalMetricsResponse
from app.schemas.common import PaginatedResponse
from app.services.course_service import CourseService
from app.services.storage_service import StorageService
from app.services.journal_service import JournalService
from app.services.course_progress_service import CourseProgressService
from app.repositories.interfaces.course_progress_repository import (
    CourseProgressRepositoryInterface,
    CourseAccessRecord,
)
from app.schemas.course_progress import StaffChartResponse, StudentChartResponse

router = APIRouter()

async def get_course_journals(course_id: int, db: AsyncSession) -> List[JournalResponse]:
    journal_service = JournalService(db)
    return await journal_service.get_course_journals_aggregated(course_id)


async def check_course_access(course_id: int, current_user: User, db: AsyncSession) -> Course:
    course_service = CourseService(db)
    course = await course_service.course_repo.get_by_id(course_id)
    if not course:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Course not found"
        )
    if current_user.role == UserRole.SUPERADMIN:
        return course
    elif current_user.role == UserRole.MENTOR:
        if course.mentor_id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not enough permissions"
            )
        return course
    elif current_user.role == UserRole.STUDENT:
        enrollment_query = select(Enrollment).filter(
            Enrollment.course_id == course_id,
            Enrollment.student_id == current_user.id,
            Enrollment.is_deleted == False
        )
        enrollment_result = await db.execute(enrollment_query)
        if enrollment_result.scalars().first() is None:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not enough permissions"
            )
        return course
    else:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not enough permissions"
        )


async def check_course_staff_access(
    course_id: int,
    current_user: User,
    repo: CourseProgressRepositoryInterface
) -> CourseAccessRecord:
    record = await repo.get_course_access_record(course_id)
    if not record or record.is_deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Course not found"
        )
    if current_user.role == UserRole.SUPERADMIN:
        return record
    elif current_user.role == UserRole.MENTOR:
        if record.mentor_id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not enough permissions"
            )
        return record
    else:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not enough permissions"
        )




@router.post("/", response_model=CourseResponse, status_code=status.HTTP_201_CREATED)
async def create_course(
    payload: CourseCreate,
    current_user: User = Depends(require_superadmin),
    db: AsyncSession = Depends(get_db_session)
) -> Course:
    course_service = CourseService(db)
    return await course_service.create_course(payload, current_user)


@router.get("/", response_model=PaginatedResponse[CourseListItemResponse])
async def list_courses(
    status: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session)
) -> dict:
    course_service = CourseService(db)
    filters = {}
    if status:
        filters["status"] = status
    return await course_service.list_courses(filters, page, page_size, current_user)


@router.get("/{id}", response_model=CourseResponse)
async def get_course(
    id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session)
) -> Course:
    return await check_course_access(id, current_user, db)


@router.patch("/{id}", response_model=CourseResponse)
async def update_course(
    id: int,
    payload: CourseUpdate,
    current_user: User = Depends(require_superadmin),
    db: AsyncSession = Depends(get_db_session)
) -> Course:
    course_service = CourseService(db)
    return await course_service.update_course(id, payload, current_user)


@router.post("/{id}/image/", response_model=CourseResponse)
async def upload_course_image(
    id: int,
    file: UploadFile = File(...),
    current_user: User = Depends(require_superadmin),
    db: AsyncSession = Depends(get_db_session),
    storage: StorageService = Depends(get_storage_service),
) -> Course:
    course_service = CourseService(db, storage)
    return await course_service.upload_course_image(id, file)


@router.delete("/{id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_course(
    id: int,
    current_user: User = Depends(require_superadmin),
    db: AsyncSession = Depends(get_db_session)
) -> None:
    course_service = CourseService(db)
    await course_service.delete_course(id)


@router.get("/{id}/schedule", response_model=List[CourseScheduleResponse])
async def get_course_schedule(
    id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session)
) -> List[CourseSchedule]:
    await check_course_access(id, current_user, db)
    schedules_query = select(CourseSchedule).filter(CourseSchedule.course_id == id)
    schedules_result = await db.execute(schedules_query)
    return list(schedules_result.scalars().all())


@router.post("/{id}/copy/", response_model=CourseResponse, status_code=status.HTTP_201_CREATED)
async def copy_course(
    id: int,
    payload: CourseCreate,
    current_user: User = Depends(require_superadmin),
    course_service: CourseService = Depends(get_course_copy_service),
) -> Course:
    return await course_service.copy_course(payload, id, current_user)


@router.get("/{id}/mentor-history", response_model=List[CourseMentorHistoryResponse])
async def get_course_mentor_history(
    id: int,
    current_user: User = Depends(require_superadmin),
    db: AsyncSession = Depends(get_db_session)
) -> List[CourseMentorHistory]:
    course_service = CourseService(db)
    return await course_service.get_mentor_history(id)


@router.get("/{id}/journals", response_model=List[JournalResponse])
async def list_course_journals(
    id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session)
) -> List[JournalResponse]:
    await check_course_access(id, current_user, db)
    return await get_course_journals(id, db)


@router.get("/{id}/journal-metrics", response_model=CourseJournalMetricsResponse)
async def get_course_journal_metrics(
    id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session)
) -> CourseJournalMetricsResponse:
    await check_course_access(id, current_user, db)
    journal_service = JournalService(db)
    return await journal_service.get_course_journal_metrics(id)


@router.get("/{id}/staff-progress", response_model=CourseStaffProgressResponse)
async def get_staff_progress(
    id: int,
    current_user: User = Depends(get_current_user),
    progress_repo: CourseProgressRepositoryInterface = Depends(get_course_progress_repository),
    progress_service: CourseProgressService = Depends(get_course_progress_service)
) -> CourseStaffProgressResponse:
    await check_course_staff_access(id, current_user, progress_repo)
    return await progress_service.get_staff_progress(id)



@router.get("/{id}/class-progress", response_model=CourseStaffProgressResponse)
async def get_class_progress(
    id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
    progress_service: CourseProgressService = Depends(get_course_progress_service)
) -> CourseStaffProgressResponse:
    if current_user.role != UserRole.STUDENT:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not enough permissions"
        )
    await check_course_access(id, current_user, db)
    return await progress_service.get_student_class_progress(id, current_user.id)


@router.get("/{id}/progress-chart", response_model=StaffChartResponse | StudentChartResponse)
async def get_progress_chart(
    id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
    progress_service: CourseProgressService = Depends(get_course_progress_service),
) -> StaffChartResponse | StudentChartResponse:
    await check_course_access(id, current_user, db)
    return await progress_service.get_progress_chart(
        id, current_user.id if current_user.role == UserRole.STUDENT else None
    )
