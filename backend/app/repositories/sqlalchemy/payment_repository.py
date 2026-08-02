from typing import List
from sqlalchemy import select
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
