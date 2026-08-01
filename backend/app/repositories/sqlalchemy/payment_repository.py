from decimal import Decimal
from typing import List
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.payment import Payment
from app.repositories.interfaces.payment_repository import PaymentRepository
from app.repositories.sqlalchemy.base_repository import SQLAlchemyBaseRepository


class SQLAlchemyPaymentRepository(SQLAlchemyBaseRepository[Payment], PaymentRepository):
    def __init__(self, session: AsyncSession) -> None:
        super().__init__(Payment, session)

    async def get_by_student_course(self, student_id: int, course_id: int) -> List[Payment]:
        query = select(Payment).filter(
            Payment.student_id == student_id,
            Payment.course_id == course_id
        )
        result = await self.session.execute(query)
        return list(result.scalars().all())

    async def sum_effective_payments(self, student_id: int, course_id: int) -> Decimal:
        query = select(func.sum(Payment.amount)).filter(
            Payment.student_id == student_id,
            Payment.course_id == course_id
        )
        result = await self.session.execute(query)
        total = result.scalar()
        if total is None:
            return Decimal("0.00")
        return Decimal(total)
