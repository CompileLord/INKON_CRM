from typing import List
from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.deps import get_db_session, get_current_user
from app.models.user import User
from app.models.journal_student_summary import JournalStudentSummary
from app.schemas.journal import JournalEntryUpdate, JournalStudentSummaryUpdate, JournalStudentSummaryResponse
from app.services.journal_service import JournalService

router = APIRouter()


@router.get("/{id}", response_model=dict)
async def get_journal(
    id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session)
) -> dict:
    journal_service = JournalService(db)
    return await journal_service.get_journal(id, current_user)


@router.put("/{id}/entries", status_code=status.HTTP_200_OK)
async def batch_update_entries(
    id: int,
    payload: List[JournalEntryUpdate],
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session)
) -> dict:
    journal_service = JournalService(db)
    return await journal_service.batch_update_entries(id, payload, current_user)


@router.patch("/{journal_id}/students/{student_id}/summary", response_model=JournalStudentSummaryResponse)
async def update_exam_or_bonus(
    journal_id: int,
    student_id: int,
    payload: JournalStudentSummaryUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session)
) -> JournalStudentSummary:
    journal_service = JournalService(db)
    return await journal_service.update_exam_or_bonus(
        journal_id=journal_id,
        student_id=student_id,
        exam_score=payload.exam_score,
        bonus_score=payload.bonus_score,
        version=payload.version,
        current_user=current_user
    )
