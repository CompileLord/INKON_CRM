from dataclasses import dataclass
from datetime import date, datetime
from typing import List, Optional, TypedDict
from app.models.course_schedule import CourseSchedule
from app.models.journal import Journal
from app.models.charge import Charge
from typing_extensions import Protocol
from app.models.enrollment import Enrollment, EnrollmentStatus
from app.models.user import User
from app.schemas.enrollment import RosterSortOrder
from app.repositories.interfaces.base_repository import BaseRepository, RepositoryPage


@dataclass(frozen=True)
class EnrollmentStartWindow:
    enrolled_at: datetime
    course_start_date: date


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


class EnrollmentFilters(TypedDict, total=False):
    course_id: int
    student_id: int
    mentor_id: int


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

    async def list_enrollments(self, filters: EnrollmentFilters, page: int, page_size: int) -> RepositoryPage[Enrollment]:
        ...

    async def find_existing(self, student_id: int, course_id: int) -> Enrollment | None:
        ...

    async def count_existing(self, course_id: int) -> int:
        ...

    async def list_schedules(self, course_id: int) -> list[CourseSchedule]:
        ...

    async def list_journals(self, course_id: int) -> list[Journal]:
        ...

    async def list_future_open_charges(self, enrollment_id: int, today: date) -> list[Charge]:
        ...

    async def find_start_window(self, student_id: int, course_id: int) -> Optional[EnrollmentStartWindow]:
        ...
