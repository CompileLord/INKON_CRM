from datetime import date, datetime, timezone
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.services.finance_service import FinanceService
from app.models.charge import Charge


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "start_date,end_date,enrolled_date,payment_day,expected_dates",
    [
        (date(2026, 10, 19), date(2027, 1, 19), date(2026, 10, 1), 26, [date(2026, 10, 26), date(2026, 11, 26), date(2026, 12, 26)]),
        (date(2026, 10, 19), date(2027, 1, 19), date(2026, 10, 1), 5, [date(2026, 11, 5), date(2026, 12, 5), date(2027, 1, 5)]),
        (date(2026, 10, 21), date(2026, 11, 21), date(2026, 10, 1), 26, [date(2026, 10, 26)]),
        (date(2026, 6, 1), date(2026, 8, 31), date(2026, 5, 1), 26, [date(2026, 6, 26), date(2026, 7, 26), date(2026, 8, 26)]),
        (date(2026, 10, 19), date(2027, 1, 19), date(2026, 11, 5), 26, [date(2026, 11, 5), date(2026, 11, 26), date(2026, 12, 26)]),
        (date(2026, 1, 31), date(2026, 5, 31), date(2026, 1, 1), 28, [date(2026, 2, 28), date(2026, 2, 28), date(2026, 4, 28), date(2026, 5, 28)]),
        (date(2028, 1, 31), date(2028, 4, 30), date(2028, 1, 1), 28, [date(2028, 2, 28), date(2028, 3, 28), date(2028, 4, 28)]),
        (date(2026, 10, 19), date(2027, 1, 19), date(2026, 11, 22), 26, [date(2026, 11, 26), date(2026, 12, 26)]),
        (date(2026, 10, 19), date(2027, 1, 19), date(2026, 11, 28), 26, [date(2026, 11, 28), date(2026, 12, 26)]),
    ],
)
async def test_course_month_schedule(
    start_date: date, end_date: date, enrolled_date: date, payment_day: int, expected_dates: list[date],
) -> None:
    enrollment: SimpleNamespace = SimpleNamespace(id=1, price_at_enrollment=Decimal("500.00"), enrolled_at=datetime.combine(enrolled_date, datetime.min.time(), tzinfo=timezone.utc))
    student: SimpleNamespace = SimpleNamespace(id=2, payment_day_of_month=payment_day)
    course: SimpleNamespace = SimpleNamespace(start_date=start_date, end_date=end_date, price=Decimal("900.00"))
    enrollment_result: MagicMock = MagicMock()
    enrollment_result.first.return_value = (enrollment, student, course)
    charges_result: MagicMock = MagicMock()
    charges_result.scalars.return_value.all.return_value = []
    session: MagicMock = MagicMock()
    session.execute = AsyncMock(side_effect=[enrollment_result, charges_result])
    session.flush = AsyncMock()
    service: FinanceService = FinanceService(session)
    service.lock_student_accounts = AsyncMock()
    service.auto_allocate_student_credit = AsyncMock()
    service._invalidate_cache = AsyncMock()

    charges: list[Charge] = await service.generate_schedule_for_enrollment(1)

    assert [charge.due_date for charge in charges] == expected_dates
    assert all(charge.amount == Decimal("500.00") for charge in charges)
    assert [charge.sequence_no for charge in charges] == list(range(1, len(charges) + 1))
