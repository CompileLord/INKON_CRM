from datetime import date, datetime
from typing import Optional, List
from fastapi import APIRouter, Depends, Query, Path, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_db_session, require_accountant, require_superadmin
from app.models.user import User
from app.models.payment import PaymentMethod
from app.models.charge import ChargeStatus
from app.models.enrollment import EnrollmentStatus
from app.models.ledger import LedgerEntry
from app.schemas.payment import PaymentCreate
from app.schemas.debt import DebtResponse
from app.schemas.common import PaginatedResponse
from app.schemas.ledger import (
    AdjustmentCreatePayload,
    AllocationCreatePayload,
    DiscountCreatePayload,
    LedgerEntryResponse,
    PaymentEntryResponse,
    RefundPaymentPayload,
    StudentBalanceResponse,
    VoidPaymentPayload,
)
from app.schemas.charge import ChargeResponse, StudentCreditResponse
from app.schemas.accounting_period import (
    AccountingPeriodResponse,
    ClosePeriodPayload,
    ReopenPeriodPayload,
)
from app.schemas.receipt import PaymentReceiptResponse
from app.schemas.analytics import DetailedAnalyticsResponse
from app.services.finance_service import FinanceService, get_dushanbe_today

router = APIRouter()


@router.post("/payments/", response_model=PaymentEntryResponse, status_code=status.HTTP_201_CREATED)
async def create_payment(
    payload: PaymentCreate,
    current_user: User = Depends(require_accountant),
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    """Record cash received. Discounts are separate — see POST /finance/discounts/."""
    finance_service = FinanceService(db)
    entry = await finance_service.create_payment(
        student_id=payload.student_id,
        course_id=payload.course_id,
        amount=payload.amount,
        paid_at=payload.paid_at,
        method=payload.method,
        comment=payload.comment,
        current_user=current_user,
    )
    decorated = await finance_service._decorate_entries([entry])
    return decorated[0]


@router.get("/payments/", response_model=PaginatedResponse[PaymentEntryResponse])
async def list_payments(
    student_id: Optional[int] = Query(None),
    course_id: Optional[int] = Query(None, description="Payments that settled charges on this course"),
    method: Optional[PaymentMethod] = Query(None),
    recorded_by: Optional[int] = Query(None),
    date_from: Optional[datetime] = Query(None),
    date_to: Optional[datetime] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: User = Depends(require_accountant),
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    finance_service = FinanceService(db)
    filters = {}
    if student_id is not None:
        filters["student_id"] = student_id
    if course_id is not None:
        filters["course_id"] = course_id
    if method is not None:
        filters["method"] = method
    if recorded_by is not None:
        filters["recorded_by"] = recorded_by
    if date_from is not None:
        filters["date_from"] = date_from
    if date_to is not None:
        filters["date_to"] = date_to
    return await finance_service.list_payments(filters, page, page_size)


@router.post("/payments/{id}/void", response_model=LedgerEntryResponse)
async def void_payment(
    id: int = Path(..., ge=1),
    payload: VoidPaymentPayload = ...,
    current_user: User = Depends(require_accountant),
    db: AsyncSession = Depends(get_db_session),
) -> LedgerEntry:
    finance_service = FinanceService(db)
    return await finance_service.void_payment(payment_id=id, payload=payload, current_user=current_user)


@router.post("/payments/{id}/refund", response_model=LedgerEntryResponse)
async def refund_payment(
    id: int = Path(..., ge=1),
    payload: RefundPaymentPayload = ...,
    current_user: User = Depends(require_superadmin),
    db: AsyncSession = Depends(get_db_session),
) -> LedgerEntry:
    finance_service = FinanceService(db)
    return await finance_service.refund_payment(payment_id=id, payload=payload, current_user=current_user)


@router.post("/discounts/", response_model=LedgerEntryResponse, status_code=status.HTTP_201_CREATED)
async def create_discount(
    payload: DiscountCreatePayload,
    current_user: User = Depends(require_accountant),
    db: AsyncSession = Depends(get_db_session),
) -> LedgerEntry:
    finance_service = FinanceService(db)
    return await finance_service.create_discount(payload=payload, current_user=current_user)


@router.post("/adjustments/", response_model=LedgerEntryResponse, status_code=status.HTTP_201_CREATED)
async def create_adjustment(
    payload: AdjustmentCreatePayload,
    current_user: User = Depends(require_superadmin),
    db: AsyncSession = Depends(get_db_session),
) -> LedgerEntry:
    """Post a correcting credit — the sanctioned fix for a closed period."""
    finance_service = FinanceService(db)
    return await finance_service.create_adjustment(payload=payload, current_user=current_user)


@router.post("/allocations/", response_model=Optional[LedgerEntryResponse], status_code=status.HTTP_201_CREATED)
async def allocate_credit(
    payload: AllocationCreatePayload,
    current_user: User = Depends(require_accountant),
    db: AsyncSession = Depends(get_db_session),
):
    """Manually apply a student's wallet credit to a specific charge."""
    finance_service = FinanceService(db)
    return await finance_service.allocate_credit(payload=payload, current_user=current_user)


@router.get("/students/{id}/ledger", response_model=List[dict])
async def get_student_ledger(
    id: int = Path(..., ge=1),
    current_user: User = Depends(require_accountant),
    db: AsyncSession = Depends(get_db_session),
) -> List[dict]:
    finance_service = FinanceService(db)
    return await finance_service.get_student_ledger(student_id=id)


@router.get("/students/{id}/balance", response_model=StudentBalanceResponse)
async def get_student_balance(
    id: int = Path(..., ge=1),
    current_user: User = Depends(require_accountant),
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    finance_service = FinanceService(db)
    return await finance_service.get_student_balance(student_id=id)


@router.get("/charges/", response_model=PaginatedResponse[ChargeResponse])
async def list_charges(
    student_id: Optional[int] = Query(None),
    enrollment_id: Optional[int] = Query(None),
    status_filter: Optional[ChargeStatus] = Query(None, alias="status"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: User = Depends(require_accountant),
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    finance_service = FinanceService(db)
    filters = {}
    if student_id is not None:
        filters["student_id"] = student_id
    if enrollment_id is not None:
        filters["enrollment_id"] = enrollment_id
    if status_filter is not None:
        filters["status"] = status_filter
    return await finance_service.list_charges(filters, page, page_size)


@router.get("/credits/", response_model=List[StudentCreditResponse])
async def list_student_credits(
    current_user: User = Depends(require_accountant),
    db: AsyncSession = Depends(get_db_session),
) -> List[dict]:
    finance_service = FinanceService(db)
    return await finance_service.list_student_credits()


@router.get("/payments/{id}/receipt", response_model=PaymentReceiptResponse)
async def get_payment_receipt(
    id: int = Path(..., ge=1),
    current_user: User = Depends(require_accountant),
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    finance_service = FinanceService(db)
    return await finance_service.get_payment_receipt(payment_id=id)


@router.post("/periods/{year}/{month}/close", response_model=AccountingPeriodResponse)
async def close_period(
    year: int = Path(..., ge=2000, le=2100),
    month: int = Path(..., ge=1, le=12),
    payload: Optional[ClosePeriodPayload] = None,
    current_user: User = Depends(require_superadmin),
    db: AsyncSession = Depends(get_db_session),
):
    finance_service = FinanceService(db)
    return await finance_service.close_period(
        year=year, month=month, payload=payload or ClosePeriodPayload(), current_user=current_user
    )


@router.post("/periods/{year}/{month}/reopen", response_model=AccountingPeriodResponse)
async def reopen_period(
    year: int = Path(..., ge=2000, le=2100),
    month: int = Path(..., ge=1, le=12),
    payload: ReopenPeriodPayload = ...,
    current_user: User = Depends(require_superadmin),
    db: AsyncSession = Depends(get_db_session),
):
    finance_service = FinanceService(db)
    return await finance_service.reopen_period(
        year=year, month=month, payload=payload, current_user=current_user
    )


@router.get("/debts/", response_model=PaginatedResponse[DebtResponse])
async def get_debts(
    course_id: Optional[int] = Query(None),
    min_debt: Optional[float] = Query(None),
    overdue_days: Optional[int] = Query(None),
    enrollment_status: Optional[EnrollmentStatus] = Query(
        None, description="Defaults to all statuses; use 'active' to exclude withdrawn students"
    ),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: User = Depends(require_accountant),
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    finance_service = FinanceService(db)
    filters = {}
    if course_id is not None:
        filters["course_id"] = course_id
    if min_debt is not None:
        filters["min_debt"] = min_debt
    if overdue_days is not None:
        filters["overdue_days"] = overdue_days
    if enrollment_status is not None:
        filters["status"] = enrollment_status
    return await finance_service.get_debts(filters, page, page_size)


@router.get("/analytics/", response_model=DetailedAnalyticsResponse)
async def get_analytics(
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
    current_user: User = Depends(require_accountant),
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    import calendar

    if not date_from or not date_to:
        today = get_dushanbe_today()
        _, last_day = calendar.monthrange(today.year, today.month)
        if not date_from:
            date_from = date(today.year, today.month, 1)
        if not date_to:
            date_to = date(today.year, today.month, last_day)

    finance_service = FinanceService(db)
    return await finance_service.get_analytics(date_from, date_to)
