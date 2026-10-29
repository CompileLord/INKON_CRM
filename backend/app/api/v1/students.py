from typing import Annotated, List, Optional, Literal, Any
from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.deps import get_db_session, get_user_repository, get_current_user, get_student_journal_history_service, get_student_profile_service, require_superadmin
from app.models.user import User, UserRole
from app.repositories.interfaces.base_repository import RepositoryPage
from app.repositories.interfaces.user_repository import UserRepository
from app.schemas.user import StudentProfileResponse, StudentJournalPeriodResponse, TelegramLinkCodeResponse, UserResponse, StudentListItemResponse
from app.services.student_profile_service import StudentProfileService
from app.services.telegram_link_service import IssuedLinkCode, TelegramLinkService

from app.schemas.student_journal_history import StudentJournalHistoryPage, StudentJournalHistoryQuery
from app.services.student_journal_history_service import StudentJournalHistoryService

from app.api.v1.contract_notes import ContractNotes

router = APIRouter()


from app.schemas.common import PaginatedResponse, PaginationParams

@router.get("/", response_model=PaginatedResponse[StudentListItemResponse])
async def get_students(
    search: Optional[str] = None,
    course_id: Annotated[int | None, Query(gt=0)] = None,
    payment_status: Literal["debt", "ok", "grant"] | None = None,
    pagination: PaginationParams = Depends(),
    current_user: User = Depends(get_current_user),
    user_repo: UserRepository = Depends(get_user_repository)
) -> RepositoryPage[dict[str, Any]]:
    if current_user.role not in [UserRole.SUPERADMIN, UserRole.ACCOUNTANT, UserRole.MENTOR]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not enough permissions"
        )
    if current_user.role == UserRole.MENTOR and payment_status is not None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not enough permissions")
    mentor_id: int | None = current_user.id if current_user.role == UserRole.MENTOR else None
    result: RepositoryPage[dict[str, Any]] = await user_repo.get_student_directory(
        page=pagination.page,
        page_size=pagination.page_size,
        search=search,
        mentor_id=mentor_id,
        course_id=course_id,
        payment_status=payment_status,
    )
    if current_user.role == UserRole.MENTOR:
        response: PaginatedResponse[StudentListItemResponse] = PaginatedResponse[StudentListItemResponse].model_validate(result, from_attributes=True)
        return JSONResponse(response.model_dump(mode="json", exclude={"items": {"__all__": {"parent_telegram_chat_id": True, "parent_link_code_expires_at": True, "debt_amount": True, "payment_status": True, "payment_day_of_month": True, "courses": {"__all__": {"billing_mode"}}}}}))
    return result


@router.post(
    "/{id}/telegram-link-code",
    response_model=TelegramLinkCodeResponse,
    status_code=status.HTTP_201_CREATED,
)
async def generate_telegram_link_code(
    id: int,
    current_user: User = Depends(require_superadmin),
    db: AsyncSession = Depends(get_db_session),
) -> TelegramLinkCodeResponse:
    issued_code: IssuedLinkCode = await TelegramLinkService(db).issue_code_for_student(id, current_user.id)
    return TelegramLinkCodeResponse(code=issued_code.code, expires_at=issued_code.expires_at)


@router.get("/me/profile", response_model=StudentProfileResponse)
async def get_my_profile(
    current_user: User = Depends(get_current_user),
    profile_service: StudentProfileService = Depends(get_student_profile_service)
) -> dict:
    if current_user.role != UserRole.STUDENT:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current user is not a student"
        )
    stats = await profile_service.get_student_profile_payload(current_user.id)
    response: dict[str, Any] = {
        "user": current_user,
        "totals": stats["totals"],
        "courses": stats["courses"],
        "avg_score": stats["avg_score"],
        "absences": stats["absences"],
        "total_lessons": stats["total_lessons"],
        "performance": stats["performance"],
    }
    validated: StudentProfileResponse = StudentProfileResponse.model_validate(response, from_attributes=True)
    return JSONResponse(validated.model_dump(mode="json", exclude={"user": {"payment_day_of_month", "parent_telegram_chat_id", "parent_link_code_expires_at"}}))


@router.get("/me/journals/page", response_model=StudentJournalHistoryPage, description=ContractNotes.JOURNAL_HISTORY_PAGE)
async def get_my_journal_page(
    query: Annotated[StudentJournalHistoryQuery, Query()],
    current_user: User = Depends(get_current_user),
    history_service: StudentJournalHistoryService = Depends(get_student_journal_history_service),
) -> StudentJournalHistoryPage:
    if current_user.role != UserRole.STUDENT:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Current user is not a student")
    return await history_service.page(current_user.id, query)


@router.get("/me/journals", response_model=List[StudentJournalPeriodResponse],
    responses={409: {"description": "History exceeds 100 periods; use the cursor-paged history endpoint"}})
async def get_my_journals(
    course_id: Annotated[int | None, Query(gt=0)] = None,
    current_user: User = Depends(get_current_user),
    history_service: StudentJournalHistoryService = Depends(get_student_journal_history_service),
) -> list[dict]:
    if current_user.role != UserRole.STUDENT:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Current user is not a student")
    return await history_service.legacy(current_user.id, course_id)


@router.get("/{id}/profile", response_model=StudentProfileResponse)
async def get_student_profile(
    id: int,
    current_user: User = Depends(get_current_user),
    user_repo: UserRepository = Depends(get_user_repository),
    profile_service: StudentProfileService = Depends(get_student_profile_service)
) -> dict:
    if current_user.role not in [UserRole.SUPERADMIN, UserRole.MENTOR, UserRole.STUDENT]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not enough permissions"
        )

    if current_user.role == UserRole.STUDENT and current_user.id != id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied to other student profiles"
        )

    if current_user.role == UserRole.MENTOR:
        if not await user_repo.mentor_has_student(current_user.id, id):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not authorized to view this student's profile"
            )

    target_user: User | None = await user_repo.get_by_id(id)
    if not target_user or target_user.role != UserRole.STUDENT:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Student not found"
        )

    stats = await profile_service.get_student_profile_payload(id)
    response: dict[str, Any] = {
        "user": target_user,
        "totals": stats["totals"],
        "courses": stats["courses"],
        "avg_score": stats["avg_score"],
        "absences": stats["absences"],
        "total_lessons": stats["total_lessons"],
        "performance": stats["performance"],
    }
    if current_user.role not in (UserRole.SUPERADMIN, UserRole.ACCOUNTANT):
        validated: StudentProfileResponse = StudentProfileResponse.model_validate(response, from_attributes=True)
        return JSONResponse(validated.model_dump(mode="json", exclude={"user": {"payment_day_of_month", "parent_telegram_chat_id", "parent_link_code_expires_at"}}))
    return response
