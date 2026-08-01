from typing_extensions import Protocol
from app.models.enrollment import Enrollment
from app.repositories.interfaces.base_repository import BaseRepository


class EnrollmentRepository(BaseRepository[Enrollment], Protocol):
    pass
