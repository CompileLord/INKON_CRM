from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List, Optional
from app.core.deps import get_db_session, get_current_user, require_superadmin
from app.models.user import User, UserRole
from app.models.course import Course
from app.models.course_schedule import CourseSchedule
from app.models.enrollment import Enrollment
from app.schemas.course import CourseCreate, CourseUpdate, CourseResponse, CourseScheduleResponse, CourseMentorHistoryResponse
from app.models.course_mentor_history import CourseMentorHistory
from app.schemas.common import PaginatedResponse
from app.services.course_service import CourseService

router = APIRouter()


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


@router.post("/", response_model=CourseResponse, status_code=status.HTTP_201_CREATED)
async def create_course(
    payload: CourseCreate,
    current_user: User = Depends(require_superadmin),
    db: AsyncSession = Depends(get_db_session)
) -> Course:
    course_service = CourseService(db)
    return await course_service.create_course(payload, current_user)


@router.get("/", response_model=PaginatedResponse[CourseResponse])
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
    db: AsyncSession = Depends(get_db_session)
) -> Course:
    course_service = CourseService(db)
    return await course_service.copy_course(payload, id, current_user)


@router.get("/{id}/mentor-history", response_model=List[CourseMentorHistoryResponse])
async def get_course_mentor_history(
    id: int,
    current_user: User = Depends(require_superadmin),
    db: AsyncSession = Depends(get_db_session)
) -> List[CourseMentorHistory]:
    course_service = CourseService(db)
    return await course_service.get_mentor_history(id)


@router.get("/{id}/progress-chart")
async def get_progress_chart(
    id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session)
) -> dict:
    await check_course_access(id, current_user, db)
    if current_user.role not in (UserRole.SUPERADMIN, UserRole.MENTOR):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not enough permissions"
        )
    from app.models.journal import Journal
    from app.models.enrollment import Enrollment, EnrollmentStatus
    from app.models.journal_student_summary import JournalStudentSummary
    from sqlalchemy.orm import joinedload

    journals_stmt = select(Journal).filter(Journal.course_id == id).order_by(Journal.period_start.asc())
    journals_res = await db.execute(journals_stmt)
    journals = list(journals_res.scalars().all())

    enroll_stmt = (
        select(Enrollment)
        .options(joinedload(Enrollment.student))
        .filter(
            Enrollment.course_id == id,
            Enrollment.status == EnrollmentStatus.ACTIVE,
            Enrollment.is_deleted == False
        )
    )
    enroll_res = await db.execute(enroll_stmt)
    enrollments = list(enroll_res.scalars().all())

    journal_ids = [j.id for j in journals]
    summaries = []
    if journal_ids:
        summary_stmt = select(JournalStudentSummary).filter(
            JournalStudentSummary.journal_id.in_(journal_ids)
        )
        summary_res = await db.execute(summary_stmt)
        summaries = list(summary_res.scalars().all())

    summary_map = {(s.student_id, s.journal_id): s.sum_score for s in summaries}

    labels = [j.period_label for j in journals] + ["Average"]
    datasets = []

    for enroll in enrollments:
        student = enroll.student
        scores = []
        for j in journals:
            score = summary_map.get((student.id, j.id), 0)
            scores.append(score)

        avg = round(sum(scores) / len(journals), 2) if journals else 0.0
        scores.append(avg)

        datasets.append({
            "student_id": student.id,
            "name": f"{student.first_name} {student.last_name}",
            "color_hex": enroll.color_hex,
            "scores": scores
        })

    return {
        "labels": labels,
        "datasets": datasets
    }

