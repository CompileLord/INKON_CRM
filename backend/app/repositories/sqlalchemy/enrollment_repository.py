from datetime import date, datetime
from typing import cast, Optional
from app.models.course_schedule import CourseSchedule
from app.models.journal import Journal
from app.models.charge import Charge, ChargeStatus
from sqlalchemy import Row, Select, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload
from sqlalchemy.sql.elements import ColumnElement
from app.models.enrollment import Enrollment, EnrollmentStatus
from app.models.course import Course
from app.repositories.interfaces.base_repository import RepositoryPage
from app.models.user import User, UserRole
from app.schemas.enrollment import RosterSortOrder
from app.repositories.interfaces.enrollment_repository import (
    EligibleCandidatesQueryResult,
    EnrollmentRepository,
    EnrollmentFilters,
    EnrollmentStartWindow,
    RosterLocationQueryResult,
    RosterQueryResult,
)
from app.repositories.sqlalchemy.base_repository import SQLAlchemyBaseRepository
from app.repositories.sqlalchemy.person_search import PersonSearch


class SQLAlchemyEnrollmentRepository(SQLAlchemyBaseRepository[Enrollment], EnrollmentRepository):
    def __init__(self, session: AsyncSession) -> None:
        super().__init__(Enrollment, session)

    async def list_active_for_student(self, student_id: int) -> list[Enrollment]:
        statement: Select[tuple[Enrollment]] = select(Enrollment).where(
            Enrollment.student_id == student_id,
            Enrollment.status == EnrollmentStatus.ACTIVE,
            Enrollment.is_deleted.is_(False),
        ).order_by(Enrollment.id)
        return list((await self.session.execute(statement)).scalars().all())

    def _build_roster_filter_criteria(
        self,
        course_id: int,
        search: Optional[str],
        status: Optional[EnrollmentStatus],
        student_id: Optional[int],
    ) -> list:
        criteria: list[ColumnElement[bool]] = [
            Enrollment.course_id == course_id,
            Enrollment.is_deleted == False,
            User.is_deleted.is_(False),
        ]
        if status:
            criteria.append(Enrollment.status == status)
        if student_id:
            criteria.append(Enrollment.student_id == student_id)
        if search:
            criteria.append(PersonSearch.matches(search))
        return criteria

    def _build_roster_order_criteria(self, sort: RosterSortOrder) -> list:
        if sort == RosterSortOrder.NAME_DESC:
            return [User.last_name.desc(), User.first_name.desc(), Enrollment.id.asc()]
        if sort == RosterSortOrder.ENROLLED_DESC:
            return [Enrollment.enrolled_at.desc(), Enrollment.id.asc()]
        if sort == RosterSortOrder.ENROLLED_ASC:
            return [Enrollment.enrolled_at.asc(), Enrollment.id.asc()]
        if sort == RosterSortOrder.PRICE_DESC:
            return [Enrollment.price_at_enrollment.desc(), Enrollment.id.asc()]
        if sort == RosterSortOrder.PRICE_ASC:
            return [Enrollment.price_at_enrollment.asc(), Enrollment.id.asc()]
        return [User.last_name.asc(), User.first_name.asc(), Enrollment.id.asc()]

    async def _locate_student_in_sql(
        self,
        course_id: int,
        student_id: int,
        search: Optional[str],
        status: Optional[EnrollmentStatus],
        sort: RosterSortOrder,
    ) -> Optional[tuple[int, int, int]]:
        filter_criteria = self._build_roster_filter_criteria(course_id, search, status, None)
        order_criteria = self._build_roster_order_criteria(sort)

        row_num_col = (func.row_number().over(order_by=order_criteria) - 1).label("row_index")
        total_count_col = func.count().over().label("total_count")

        ranking_subquery = (
            select(
                Enrollment.student_id.label("student_id"),
                Enrollment.id.label("enrollment_id"),
                row_num_col,
                total_count_col,
            )
            .join(User, Enrollment.student_id == User.id)
            .filter(*filter_criteria)
            .subquery()
        )

        locate_query = (
            select(
                ranking_subquery.c.enrollment_id,
                ranking_subquery.c.row_index,
                ranking_subquery.c.total_count,
            )
            .filter(ranking_subquery.c.student_id == student_id)
        )

        result = await self.session.execute(locate_query)
        row = result.first()
        if not row:
            return None
        return int(row.enrollment_id), int(row.row_index), int(row.total_count)

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
        page_size = min(max(1, page_size), 100)
        filter_criteria = self._build_roster_filter_criteria(course_id, search, status, student_id)
        order_criteria = self._build_roster_order_criteria(sort)

        count_query = (
            select(func.count(Enrollment.id))
            .select_from(Enrollment)
            .join(User, Enrollment.student_id == User.id)
            .filter(*filter_criteria)
        )
        total_result = await self.session.execute(count_query)
        total = total_result.scalar() or 0

        total_pages = (total + page_size - 1) // page_size if total > 0 else 0

        active_count = await self.get_active_enrollments_count(course_id)

        located_page: Optional[int] = None
        located_index: Optional[int] = None
        if locate_student_id is not None:
            located_tuple = await self._locate_student_in_sql(
                course_id=course_id,
                student_id=locate_student_id,
                search=search,
                status=status,
                sort=sort,
            )
            if located_tuple is not None:
                _, row_index, _ = located_tuple
                located_page = (row_index // page_size) + 1
                located_index = row_index

        if page > total_pages and total_pages > 0:
            return RosterQueryResult(
                items=[],
                total=total,
                page=page,
                page_size=page_size,
                total_pages=total_pages,
                active_count=active_count,
                located_page=located_page,
                located_index=located_index,
            )

        offset = (page - 1) * page_size
        items_query = (
            select(Enrollment)
            .join(User, Enrollment.student_id == User.id)
            .options(joinedload(Enrollment.student))
            .filter(*filter_criteria)
            .order_by(*order_criteria)
            .offset(offset)
            .limit(page_size)
        )
        items_result = await self.session.execute(items_query)
        items = list(items_result.scalars().all())

        return RosterQueryResult(
            items=items,
            total=total,
            page=page,
            page_size=page_size,
            total_pages=total_pages,
            active_count=active_count,
            located_page=located_page,
            located_index=located_index,
        )

    async def get_roster_location(
        self,
        course_id: int,
        student_id: int,
        page_size: int = 20,
        search: Optional[str] = None,
        status: Optional[EnrollmentStatus] = None,
        sort: RosterSortOrder = RosterSortOrder.NAME_ASC,
    ) -> Optional[RosterLocationQueryResult]:
        page_size = min(max(1, page_size), 100)
        located_tuple = await self._locate_student_in_sql(
            course_id=course_id,
            student_id=student_id,
            search=search,
            status=status,
            sort=sort,
        )
        if located_tuple is None:
            return None

        enrollment_id, student_index, total = located_tuple
        page = (student_index // page_size) + 1

        item_query = (
            select(Enrollment)
            .options(joinedload(Enrollment.student))
            .filter(Enrollment.id == enrollment_id)
        )
        item_result = await self.session.execute(item_query)
        item = item_result.scalars().first()
        if not item:
            return None

        return RosterLocationQueryResult(
            student_id=student_id,
            enrollment_id=enrollment_id,
            page=page,
            index=student_index,
            total=total,
            item=item,
        )

    async def get_eligible_candidates(
        self,
        course_id: int,
        page: int = 1,
        page_size: int = 20,
        search: Optional[str] = None,
    ) -> EligibleCandidatesQueryResult:
        page_size = min(max(1, page_size), 100)
        conflicting_enrollments_subquery = select(Enrollment.student_id).filter(
            Enrollment.course_id == course_id,
        )

        filter_criteria: list[ColumnElement[bool]] = [
            User.role == UserRole.STUDENT,
            User.is_deleted == False,
            User.id.not_in(conflicting_enrollments_subquery),
        ]
        if search:
            filter_criteria.append(PersonSearch.matches(search))

        count_query = select(func.count(User.id)).filter(*filter_criteria)
        total_result = await self.session.execute(count_query)
        total = total_result.scalar() or 0

        total_pages = (total + page_size - 1) // page_size if total > 0 else 0

        if page > total_pages and total_pages > 0:
            return EligibleCandidatesQueryResult(
                items=[],
                total=total,
                page=page,
                page_size=page_size,
                total_pages=total_pages,
            )

        offset = (page - 1) * page_size
        items_query = (
            select(User)
            .filter(*filter_criteria)
            .order_by(User.last_name.asc(), User.first_name.asc(), User.id.asc())
            .offset(offset)
            .limit(page_size)
        )
        items_result = await self.session.execute(items_query)
        items = list(items_result.scalars().all())

        return EligibleCandidatesQueryResult(
            items=items,
            total=total,
            page=page,
            page_size=page_size,
            total_pages=total_pages,
        )

    async def get_active_enrollments_count(self, course_id: int) -> int:
        query = select(func.count(Enrollment.id)).join(User, User.id == Enrollment.student_id).filter(
            Enrollment.course_id == course_id,
            Enrollment.status == EnrollmentStatus.ACTIVE,
            Enrollment.is_deleted == False,
            User.is_deleted.is_(False),
        )
        result = await self.session.execute(query)
        return result.scalar() or 0

    async def list_enrollments(self, filters: EnrollmentFilters, page: int, page_size: int) -> RepositoryPage[Enrollment]:
        query: Select[tuple[Enrollment]] = select(Enrollment).where(Enrollment.is_deleted.is_(False))
        if filters.get("course_id") is not None:
            query = query.where(Enrollment.course_id == filters["course_id"])
        if filters.get("student_id") is not None:
            query = query.where(Enrollment.student_id == filters["student_id"])
        if filters.get("mentor_id") is not None:
            query = query.join(Course, Enrollment.course_id == Course.id).where(Course.mentor_id == filters["mentor_id"])
        return cast(RepositoryPage[Enrollment], await self.get_paginated(query, page, page_size))

    async def find_existing(self, student_id: int, course_id: int) -> Enrollment | None:
        query: Select[tuple[Enrollment]] = select(Enrollment).where(
            Enrollment.student_id == student_id, Enrollment.course_id == course_id,
            Enrollment.is_deleted.is_(False),
        )
        return (await self.session.execute(query)).scalars().first()

    async def count_existing(self, course_id: int) -> int:
        query: Select[tuple[int]] = select(func.count(Enrollment.id)).where(
            Enrollment.course_id == course_id, Enrollment.is_deleted.is_(False),
        )
        return (await self.session.scalar(query)) or 0

    async def list_schedules(self, course_id: int) -> list[CourseSchedule]:
        query: Select[tuple[CourseSchedule]] = select(CourseSchedule).where(CourseSchedule.course_id == course_id)
        return list((await self.session.execute(query)).scalars().all())

    async def list_journals(self, course_id: int) -> list[Journal]:
        query: Select[tuple[Journal]] = select(Journal).where(Journal.course_id == course_id)
        return list((await self.session.execute(query)).scalars().all())

    async def list_future_open_charges(self, enrollment_id: int, today: date) -> list[Charge]:
        query: Select[tuple[Charge]] = select(Charge).where(
            Charge.enrollment_id == enrollment_id, Charge.due_date > today,
            Charge.status == ChargeStatus.OPEN, Charge.is_deleted.is_(False),
        )
        return list((await self.session.execute(query)).scalars().all())

    async def find_start_window(self, student_id: int, course_id: int) -> Optional[EnrollmentStartWindow]:
        query: Select[tuple[datetime, date]] = (
            select(Enrollment.enrolled_at, Course.start_date)
            .join(Course, Course.id == Enrollment.course_id)
            .where(
                Enrollment.student_id == student_id,
                Enrollment.course_id == course_id,
                Enrollment.is_deleted.is_(False),
            )
        )
        row: Optional[Row[tuple[datetime, date]]] = (await self.session.execute(query)).first()
        if row is None:
            return None
        return EnrollmentStartWindow(enrolled_at=row.enrolled_at, course_start_date=row.start_date)
