from fastapi import APIRouter, Depends, HTTPException, status, Query, File, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List, Optional
from app.core.deps import get_db_session, get_current_user, require_superadmin
from app.models.user import User, UserRole
from app.models.course import Course
from app.models.course_schedule import CourseSchedule
from app.models.enrollment import Enrollment
from app.schemas.course import CourseCreate, CourseUpdate, CourseResponse, CourseScheduleResponse, CourseMentorHistoryResponse
from app.schemas.journal import JournalResponse
from app.models.course_mentor_history import CourseMentorHistory
from app.models.journal import Journal
from app.schemas.common import PaginatedResponse
from app.services.course_service import CourseService

router = APIRouter()



from app.services.journal_service import JournalService

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


@router.post("/{id}/image/", response_model=CourseResponse)
async def upload_course_image(
    id: int,
    file: UploadFile = File(...),
    current_user: User = Depends(require_superadmin),
    db: AsyncSession = Depends(get_db_session)
) -> Course:
    course_service = CourseService(db)
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


from app.schemas.journal import JournalResponse, CourseJournalMetricsResponse

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


@router.get("/{id}/progress-chart")
async def get_progress_chart(
    id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session)
) -> dict:
    await check_course_access(id, current_user, db)
    from app.models.enrollment import Enrollment, EnrollmentStatus
    from app.models.journal_student_summary import JournalStudentSummary
    from sqlalchemy.orm import joinedload
    from app.core.scoring import score_percentage

    journals = await get_course_journals(id, db)
    journal_ids = [j.id for j in journals]

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
    class_size = len(enrollments)

    summaries = []
    if journal_ids:
        summary_stmt = select(JournalStudentSummary).filter(
            JournalStudentSummary.journal_id.in_(journal_ids)
        )
        summary_res = await db.execute(summary_stmt)
        summaries = list(summary_res.scalars().all())

    summary_map = {(s.student_id, s.journal_id): (s.sum_score, s.max_period_score) for s in summaries}

    periods = [
        {"id": j.id, "period_label": j.period_label}
        for j in journals
    ]

    if current_user.role == UserRole.STUDENT:
        my_percentages = []
        my_graded_pcts = []
        for j in journals:
            sum_score, max_score = summary_map.get((current_user.id, j.id), (0, 0))
            pct = score_percentage(sum_score, max_score)
            my_percentages.append(pct)
            if max_score > 0:
                my_graded_pcts.append(pct)
        my_avg = round(sum(my_graded_pcts) / len(my_graded_pcts), 1) if my_graded_pcts else 0.0
        my_series = my_percentages + [my_avg]

        class_avg_series = []
        graded_class_avgs = []
        for j in journals:
            j_summaries = [s for s in summaries if s.journal_id == j.id and s.max_period_score > 0]
            if j_summaries:
                j_pcts = [score_percentage(s.sum_score, s.max_period_score) for s in j_summaries]
                period_avg = round(sum(j_pcts) / len(j_pcts), 1)
                class_avg_series.append(period_avg)
                graded_class_avgs.append(period_avg)
            else:
                class_avg_series.append(0.0)
        overall_class_avg = round(sum(graded_class_avgs) / len(graded_class_avgs), 1) if graded_class_avgs else 0.0
        class_avg_series.append(overall_class_avg)

        student_avgs = {}
        for enroll in enrollments:
            s_id = enroll.student.id
            s_pcts = []
            for j in journals:
                sum_score, max_score = summary_map.get((s_id, j.id), (0, 0))
                if max_score > 0:
                    s_pcts.append(score_percentage(sum_score, max_score))
            student_avgs[s_id] = sum(s_pcts) / len(s_pcts) if s_pcts else 0.0

        sorted_student_ids = sorted(student_avgs.keys(), key=lambda sid: student_avgs[sid], reverse=True)
        my_rank = (sorted_student_ids.index(current_user.id) + 1) if current_user.id in sorted_student_ids else (len(sorted_student_ids) + 1)

        return {
            "periods": periods,
            "my_series": my_series,
            "class_avg_series": class_avg_series,
            "my_rank": my_rank,
            "class_size": class_size
        }

    labels = [j.period_label for j in journals] + ["Average"]
    datasets = []

    COLOR_PALETTE = [
        "#E53E3E", "#319795", "#3182CE", "#D69E2E", "#D53F8C",
        "#805AD5", "#DD6B20", "#38A169", "#00B5D8", "#B83280",
        "#4C51BF", "#C05621", "#2B6CB0", "#2F855A", "#9B2C2C",
        "#2C7A7B", "#6B46C1", "#975A16", "#702459", "#1A365D"
    ]

    for idx, enroll in enumerate(enrollments):
        student = enroll.student
        scores = []
        max_scores = []
        percentages = []
        for j in journals:
            sum_score, max_score = summary_map.get((student.id, j.id), (0, 0))
            scores.append(sum_score)
            max_scores.append(max_score)
            percentages.append(score_percentage(sum_score, max_score))

        avg = round(sum(scores) / len(journals), 2) if journals else 0.0
        avg_max = round(sum(max_scores) / len(journals), 2) if journals else 0.0
        avg_pct = round(sum(percentages) / len(journals), 2) if journals else 0.0
        scores.append(avg)
        max_scores.append(avg_max)
        percentages.append(avg_pct)

        color_hex = enroll.color_hex if enroll.color_hex and enroll.color_hex != "#FF5733" else COLOR_PALETTE[idx % len(COLOR_PALETTE)]

        datasets.append({
            "student_id": student.id,
            "name": f"{student.first_name} {student.last_name}",
            "color_hex": color_hex,
            "scores": scores,
            "max_scores": max_scores,
            "percentages": percentages
        })

    return {
        "labels": labels,
        "periods": periods,
        "datasets": datasets
    }


