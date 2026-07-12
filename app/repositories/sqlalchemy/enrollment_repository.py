from sqlalchemy.ext.asyncio import AsyncSession
from app.models.enrollment import Enrollment
from app.repositories.interfaces.enrollment_repository import EnrollmentRepository
from app.repositories.sqlalchemy.base_repository import SQLAlchemyBaseRepository


class SQLAlchemyEnrollmentRepository(SQLAlchemyBaseRepository[Enrollment], EnrollmentRepository):
    def __init__(self, session: AsyncSession) -> None:
        super().__init__(Enrollment, session)
