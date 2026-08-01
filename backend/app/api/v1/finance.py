from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import date
from typing import Optional
from app.core.deps import get_db_session, require_accountant
from app.models.user import User
from app.models.payment import Payment, PaymentMethod
from app.schemas.payment import PaymentCreate, PaymentResponse
from app.schemas.debt import DebtResponse
from app.schemas.common import PaginatedResponse
from app.services.finance_service import FinanceService

router = APIRouter()


@router.post("/payments/", response_model=PaymentResponse, status_code=status.HTTP_201_CREATED)
async def create_payment(
    payload: PaymentCreate,
    current_user: User = Depends(require_accountant),
    db: AsyncSession = Depends(get_db_session)
) -> Payment:
    finance_service = FinanceService(db)
    return await finance_service.create_payment(
        student_id=payload.student_id,
        course_id=payload.course_id,
        amount=payload.amount,
        paid_at=payload.paid_at,
        method=payload.method,
        discount_percent=payload.discount_percent,
        comment=payload.comment,
        current_user=current_user
    )


@router.get("/payments/", response_model=PaginatedResponse[PaymentResponse])
async def list_payments(
    student_id: Optional[int] = Query(None),
    course_id: Optional[int] = Query(None),
    method: Optional[PaymentMethod] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: User = Depends(require_accountant),
    db: AsyncSession = Depends(get_db_session)
) -> dict:
    finance_service = FinanceService(db)
    filters = {}
    if student_id is not None:
        filters["student_id"] = student_id
    if course_id is not None:
        filters["course_id"] = course_id
    if method is not None:
        filters["method"] = method
    return await finance_service.list_payments(filters, page, page_size)


@router.get("/debts/", response_model=PaginatedResponse[DebtResponse])
async def get_debts(
    course_id: Optional[int] = Query(None),
    min_debt: Optional[float] = Query(None),
    overdue_days: Optional[int] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: User = Depends(require_accountant),
    db: AsyncSession = Depends(get_db_session)
) -> dict:
    finance_service = FinanceService(db)
    filters = {}
    if course_id is not None:
        filters["course_id"] = course_id
    if min_debt is not None:
        filters["min_debt"] = min_debt
    if overdue_days is not None:
        filters["overdue_days"] = overdue_days
    return await finance_service.get_debts(filters, page, page_size)


@router.get("/analytics/", response_model=dict)
async def get_analytics(
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
    current_user: User = Depends(require_accountant),
    db: AsyncSession = Depends(get_db_session)
) -> dict:
    from datetime import date
    import calendar
    if not date_from or not date_to:
        today = date.today()
        _, last_day = calendar.monthrange(today.year, today.month)
        if not date_from:
            date_from = date(today.year, today.month, 1)
        if not date_to:
            date_to = date(today.year, today.month, last_day)

    finance_service = FinanceService(db)
    return await finance_service.get_analytics(date_from, date_to)
