from dataclasses import dataclass
from typing import List, Optional
from typing_extensions import Protocol
from app.models.enrollment import Enrollment, EnrollmentStatus
from app.models.user import User
from app.schemas.enrollment import RosterSortOrder
from app.repositories.interfaces.base_repository import BaseRepository


@dataclass(frozen=True)
class RosterQueryResult:
    items: List[Enrollment]
    total: int
    page: int
    page_size: int
    total_pages: int
    active_count: int
    located_page: Optional[int] = None
    located_index: Optional[int] = None


@dataclass(frozen=True)
class RosterLocationQueryResult:
    student_id: int
    enrollment_id: int
    page: int
    index: int
    total: int
    item: Enrollment


@dataclass(frozen=True)
class EligibleCandidatesQueryResult:
    items: List[User]
    total: int
    page: int
    page_size: int
    total_pages: int


class EnrollmentRepository(BaseRepository[Enrollment], Protocol):
    async def get_course_roster(
        self,
        course_id: int,
        page: int = 1,
        page_size: int = 20,
        search: Optional[str] = None,
        status: Optional[EnrollmentStatus] = None,
        sort: RosterSortOrder = RosterSortOrder.NAME_ASC,
        student_id: Optional[int] = None,
        locate_student_id: Optional[int] = None,
    ) -> RosterQueryResult:
        ...

    async def get_roster_location(
        self,
        course_id: int,
        student_id: int,
        page_size: int = 20,
        search: Optional[str] = None,
        status: Optional[EnrollmentStatus] = None,
        sort: RosterSortOrder = RosterSortOrder.NAME_ASC,
    ) -> Optional[RosterLocationQueryResult]:
        ...

    async def get_eligible_candidates(
        self,
        course_id: int,
        page: int = 1,
        page_size: int = 20,
        search: Optional[str] = None,
    ) -> EligibleCandidatesQueryResult:
        ...

    async def get_active_enrollments_count(self, course_id: int) -> int:
        ...
