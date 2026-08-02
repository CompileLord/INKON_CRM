from typing import List
from typing_extensions import Protocol
from app.models.payment import Payment
from app.repositories.interfaces.base_repository import BaseRepository


class PaymentRepository(BaseRepository[Payment], Protocol):
    async def get_by_student_course(self, student_id: int, course_id: int) -> List[Payment]:
        ...
