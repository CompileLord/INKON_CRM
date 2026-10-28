from decimal import Decimal
from sqlalchemy import select
from app.models.course import Course, CourseExamType
from app.models.enrollment import Enrollment, EnrollmentStatus
from app.repositories.sqlalchemy.document_repository import SQLAlchemyDocumentRepository
from app.repositories.sqlalchemy.enrollment_repository import SQLAlchemyEnrollmentRepository
from app.repositories.sqlalchemy.user_repository import SQLAlchemyUserRepository
from datetime import date
from typing import Any, AsyncGenerator

import pytest
from fastapi import HTTPException
from httpx import AsyncClient, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import deps
from app.main import app
from app.models.audit_log import AuditAction, AuditLog
from app.repositories.interfaces.base_repository import RepositoryPage
from app.repositories.interfaces.document_repository import DocumentFilters
from app.repositories.interfaces.enrollment_repository import EnrollmentFilters
from app.repositories.interfaces.user_repository import StudentTotalsRawRecord
from app.models.document import Document
from app.models.user import User, UserRole
from app.repositories.interfaces.audit_log_repository import AuditLogFilters
from app.services.audit_service import AuditService
from app.services.document_service import DocumentService
from app.services.enrollment_service import EnrollmentService


class MemoryRepo:
    def __init__(self) -> None:
        self.calls: list[tuple[Any, ...]] = []
        self.permitted: bool = True

    async def list_documents(self, filters: DocumentFilters, viewer_id: int, viewer_role: UserRole, page: int, page_size: int) -> RepositoryPage[Document]:
        self.calls.append((filters, viewer_id, viewer_role, page, page_size))
        return self.page(page, page_size)

    async def get_visible_document(self, document_id: int, viewer_id: int, viewer_role: UserRole) -> Document | None:
        self.calls.append((document_id, viewer_id, viewer_role))
        return None

    async def mentor_has_student(self, mentor_id: int, student_id: int) -> bool:
        self.calls.append((mentor_id, student_id))
        return self.permitted

    async def list_enrollments(self, filters: EnrollmentFilters, page: int, page_size: int) -> RepositoryPage[Any]:
        self.calls.append((filters, page, page_size))
        return self.page(page, page_size)

    async def list_filtered_rows(self, filters: AuditLogFilters, page: int, page_size: int) -> tuple[list[Any], int]:
        self.calls.append((filters, page, page_size))
        return [], 7

    def stage_log(self, log: AuditLog) -> None:
        self.calls.append((log,))

    async def get_student_directory(self, page: int, page_size: int, search: str | None, mentor_id: int | None, course_id: int | None, payment_status: str | None) -> RepositoryPage[dict[str, Any]]:
        self.calls.append((page, page_size, search, mentor_id, course_id, payment_status))
        return self.page(page, page_size)

    async def get_student_profile_stats(self, student_id: int) -> dict[str, Any]:
        self.calls.append((student_id,))
        return {"raw_totals": StudentTotalsRawRecord(None, 0, 0, 0, 0), "raw_courses": {}, "courses": [],
                "totals": {"avg_percentage": 0, "attendance_percentage": 0, "absences": 0, "total_lessons": 0,
                           "active_course_count": 0, "archived_course_count": 0},
                "avg_score": 0, "absences": 0, "total_lessons": 0}

    async def list_event_keys(self, filters: AuditLogFilters, page: int, page_size: int) -> tuple[list[Any], int]:
        self.calls.append((filters, page, page_size))
        return [], 7

    async def list_changes_for_events(self, event_keys: list[Any]) -> list[AuditLog]:
        return []

    async def resolve_course_titles(self, course_ids: set[int]) -> dict[int, str]:
        return {}

    async def list_actors(self) -> list[Any]:
        self.calls.append(("actors",))
        return []

    async def list_entity_types(self) -> list[str]:
        return ["student"]

    async def resolve_entity_references(self, entity_ids_by_type: dict[str, set[int]]) -> dict[Any, Any]:
        return {}

    @staticmethod
    def page(page: int, page_size: int) -> RepositoryPage[Any]:
        return {"items": [], "total": 7, "page": page, "page_size": page_size, "total_pages": 4}

class RepositoryOverrides:
    @staticmethod
    def apply(repository: MemoryRepo, user: User, provider: str) -> None:
        def alternate_repository() -> MemoryRepo:
            return repository

        def current_user() -> User:
            return user

        app.dependency_overrides[getattr(deps, provider)] = alternate_repository
        app.dependency_overrides[deps.get_current_user] = current_user


class TestFeatureContracts:
    @pytest.mark.asyncio
    async def test_document_list_uses_alternate_feature_method(self, db_session: AsyncSession, test_student: User) -> None:
        repository: MemoryRepo = MemoryRepo()
        service: DocumentService = DocumentService(db_session, document_repo=repository)
        result: dict[str, Any] = await service.list_documents({"journal_id": 9}, 2, 2, test_student)
        assert result["total"] == 7
        assert repository.calls == [({"journal_id": 9}, test_student.id, UserRole.STUDENT, 2, 2)]

    @pytest.mark.asyncio
    async def test_document_mentor_owner_check_precedes_listing(self, db_session: AsyncSession, test_mentor: User) -> None:
        repository: MemoryRepo = MemoryRepo()
        repository.permitted = False
        service: DocumentService = DocumentService(db_session, document_repo=repository)
        raised: pytest.ExceptionInfo[HTTPException]
        with pytest.raises(HTTPException) as raised:
            await service.list_documents({"owner_type": "student", "owner_id": 999}, 1, 20, test_mentor)
        assert raised.value.status_code == 404
        assert repository.calls == [(test_mentor.id, 999)]

    @pytest.mark.asyncio
    async def test_document_read_uses_visibility_contract(self, db_session: AsyncSession, test_student: User) -> None:
        repository: MemoryRepo = MemoryRepo()
        service: DocumentService = DocumentService(db_session, document_repo=repository)
        raised: pytest.ExceptionInfo[HTTPException]
        with pytest.raises(HTTPException) as raised:
            await service.read_document(999, test_student)
        assert raised.value.status_code == 404
        assert repository.calls == [(999, test_student.id, UserRole.STUDENT)]

    @pytest.mark.asyncio
    async def test_document_unsupported_role_rejected_before_repository(self, db_session: AsyncSession, test_accountant: User) -> None:
        repository: MemoryRepo = MemoryRepo()
        service: DocumentService = DocumentService(db_session, document_repo=repository)
        raised: pytest.ExceptionInfo[HTTPException]
        with pytest.raises(HTTPException) as raised:
            await service.list_documents({}, 1, 20, test_accountant)
        assert raised.value.status_code == 403
        assert repository.calls == []

    @pytest.mark.asyncio
    async def test_enrollment_list_uses_alternate_feature_method(self, db_session: AsyncSession) -> None:
        repository: MemoryRepo = MemoryRepo()
        service: EnrollmentService = EnrollmentService(db_session, enrollment_repo=repository)
        result: dict[str, Any] = await service.list_enrollments({"course_id": 4, "student_id": 5, "mentor_id": 6}, 2, 2)
        assert result["total"] == 7
        assert repository.calls == [({"course_id": 4, "student_id": 5, "mentor_id": 6}, 2, 2)]

    @pytest.mark.asyncio
    async def test_audit_list_uses_alternate_contract_and_normalizes_filters(self, db_session: AsyncSession) -> None:
        repository: MemoryRepo = MemoryRepo()
        service: AuditService = AuditService(db_session, audit_repo=repository)
        result: dict[str, Any] = await service.list_logs(2, 500, actor_id=3, action=AuditAction.CREATE, date_from=date(2026, 1, 2), search=" name ")
        assert result["total"] == 7
        assert result["page_size"] == 100
        assert repository.calls[0][0].search == "name"
        assert repository.calls[0][0].actor_id == 3
        assert repository.calls[0][0].created_from.isoformat() == "2026-01-01T19:00:00+00:00"

    @pytest.mark.asyncio
    @pytest.mark.parametrize("path,provider", [
        ("/api/v1/documents/", "get_document_repository"),
        ("/api/v1/enrollments/", "get_enrollment_repository"),
        ("/api/v1/audit-log/", "get_audit_log_repository"),
        ("/api/v1/audit-log/events/", "get_audit_log_repository"),
    ])
    async def test_http_repository_provider_override(self, client: AsyncClient, test_admin: User, path: str, provider: str) -> None:
        repository: MemoryRepo = MemoryRepo()

        RepositoryOverrides.apply(repository, test_admin, provider)
        response: Response = await client.get(path, params={"page": 2, "page_size": 2})
        assert response.status_code == 200, response.text
        assert response.json()["total"] == 7
        assert repository.calls



class RepositoryFixture:
    @staticmethod
    async def course(session: AsyncSession, mentor_id: int, title: str) -> Course:
        course: Course = Course(title=title, description=title, start_date=date(2026, 1, 1),
                                end_date=date(2026, 2, 1), exam_type=CourseExamType.WEEKLY,
                                price=Decimal("100.25"), mentor_id=mentor_id)
        session.add(course)
        await session.flush()
        return course


class TestDatabaseFeatureContracts:
    @pytest.mark.asyncio
    async def test_document_page_filters_count_order_and_soft_delete(self, db_session: AsyncSession, test_admin: User, test_student: User) -> None:
        documents: list[Document] = [Document(owner_type="student", owner_id=test_student.id,
            file_path=f"student/{test_student.id}/{index}.txt", file_name=f"{index}.txt",
            file_type="text/plain", file_size=1, uploaded_by_id=test_admin.id,
            is_deleted=index == 3) for index in range(4)]
        documents.append(Document(owner_type="mentor", owner_id=test_student.id, file_path="other.txt",
            file_name="other.txt", file_type="text/plain", file_size=1, uploaded_by_id=test_admin.id))
        db_session.add_all(documents)
        await db_session.flush()
        repository: SQLAlchemyDocumentRepository = SQLAlchemyDocumentRepository(db_session)
        page: dict[str, Any] = await repository.list_documents({"owner_type": "student", "owner_id": test_student.id}, test_admin.id, UserRole.SUPERADMIN, 2, 1)
        assert page["total"] == 3 and page["total_pages"] == 3
        assert [document.id for document in page["items"]] == [documents[1].id]
        page = await repository.list_documents({}, test_student.id, UserRole.STUDENT, 1, 20)
        assert [document.id for document in page["items"]] == [document.id for document in reversed(documents[:3])]
        assert await repository.get_visible_document(documents[3].id, test_admin.id, UserRole.SUPERADMIN) is None
        assert await repository.get_visible_document(documents[4].id, test_student.id, UserRole.STUDENT) is None

    @pytest.mark.asyncio
    async def test_enrollment_page_combines_filters_and_preserves_decimal_and_withdrawn(self, db_session: AsyncSession, test_mentor: User, test_student: User, test_admin: User) -> None:
        course: Course = await RepositoryFixture.course(db_session, test_mentor.id, "Owned")
        other_course: Course = await RepositoryFixture.course(db_session, test_admin.id, "Other")
        enrollments: list[Enrollment] = [
            Enrollment(student_id=test_student.id, course_id=course.id, price_at_enrollment=Decimal("100.25"), color_hex="#123456", status=EnrollmentStatus.WITHDRAWN),
            Enrollment(student_id=test_student.id, course_id=other_course.id, price_at_enrollment=Decimal("100.25"), color_hex="#123456"),
            Enrollment(student_id=test_admin.id, course_id=course.id, price_at_enrollment=Decimal("100.25"), color_hex="#123456", is_deleted=True),
        ]
        db_session.add_all(enrollments)
        await db_session.flush()
        repository: SQLAlchemyEnrollmentRepository = SQLAlchemyEnrollmentRepository(db_session)
        page: dict[str, Any] = await repository.list_enrollments({"course_id": course.id, "student_id": test_student.id, "mentor_id": test_mentor.id}, 1, 1)
        assert page["total"] == 1
        assert page["items"][0].id == enrollments[0].id
        assert page["items"][0].price_at_enrollment == Decimal("100.25")
        assert page["items"][0].status == EnrollmentStatus.WITHDRAWN
        assert (await repository.list_enrollments({"mentor_id": test_admin.id, "course_id": course.id}, 1, 20))["total"] == 0
        assert (await repository.list_enrollments({"student_id": test_admin.id}, 1, 20))["total"] == 0
        assert await repository.count_existing(course.id) == 1
        assert await repository.find_existing(test_student.id, course.id) is enrollments[0]
        assert await repository.find_existing(test_admin.id, course.id) is None

    @pytest.mark.asyncio
    async def test_student_profile_ownership_preserves_existing_enrollment_semantics(self, db_session: AsyncSession, test_student: User, test_mentor: User, test_admin: User) -> None:
        course: Course = await RepositoryFixture.course(db_session, test_mentor.id, "Profile")
        enrollment: Enrollment = Enrollment(student_id=test_student.id, course_id=course.id,
            price_at_enrollment=Decimal("100.25"), color_hex="#123456", status=EnrollmentStatus.WITHDRAWN)
        db_session.add(enrollment)
        await db_session.flush()
        repository: SQLAlchemyUserRepository = SQLAlchemyUserRepository(db_session)
        assert await repository.mentor_has_student(test_mentor.id, test_student.id)
        assert not await repository.mentor_has_student(test_admin.id, test_student.id)
        enrollment.is_deleted = True
        await db_session.flush()
        assert not await repository.mentor_has_student(test_mentor.id, test_student.id)

    @pytest.mark.asyncio
    async def test_staged_audit_is_committed_by_request_owner(self) -> None:
        dependency: AsyncGenerator[AsyncSession, None] = deps.get_db_session()
        session: AsyncSession = await anext(dependency)
        await AuditService(session).log(None, "create", "wp51", 51, {"name": (None, "committed")})
        assert any(isinstance(entity, AuditLog) for entity in session.new)
        with pytest.raises(StopAsyncIteration):
            await anext(dependency)
        verification: AsyncSession
        async with deps.AsyncSessionLocal() as verification:
            assert (await verification.scalar(select(AuditLog.new_value).where(AuditLog.entity_type == "wp51"))) == "committed"

    @pytest.mark.asyncio
    async def test_staged_audit_is_rolled_back_by_request_owner(self) -> None:
        dependency: AsyncGenerator[AsyncSession, None] = deps.get_db_session()
        session: AsyncSession = await anext(dependency)
        await AuditService(session).log(None, "create", "wp51", 51, {"name": (None, "rolled-back")})
        await session.flush()
        with pytest.raises(ValueError, match="rollback"):
            await dependency.athrow(ValueError("rollback"))
        verification: AsyncSession
        async with deps.AsyncSessionLocal() as verification:
            assert (await verification.scalar(select(AuditLog.id).where(AuditLog.entity_type == "wp51"))) is None


class TestUserFeatureContracts:
    @pytest.mark.asyncio
    async def test_student_directory_provider_preserves_mentor_filter(self, client: AsyncClient, test_mentor: User) -> None:
        repository: MemoryRepo = MemoryRepo()
        RepositoryOverrides.apply(repository, test_mentor, "get_user_repository")
        response: Response = await client.get("/api/v1/students/", params={"page": 2, "page_size": 2, "search": "student"})
        assert response.status_code == 200, response.text
        assert response.json()["total"] == 7
        assert repository.calls == [(2, 2, "student", test_mentor.id, None, None)]

    @pytest.mark.asyncio
    async def test_student_profile_provider_uses_alternate_repository(self, client: AsyncClient, test_student: User) -> None:
        repository: MemoryRepo = MemoryRepo()

        RepositoryOverrides.apply(repository, test_student, "get_user_repository")
        response: Response = await client.get("/api/v1/students/me/profile")
        assert response.status_code == 200, response.text
        assert repository.calls == [(test_student.id,)]
        assert response.json()["performance"]["total_lessons"] == 0

    @pytest.mark.asyncio
    async def test_audit_staging_uses_alternate_contract_without_flush(self, db_session: AsyncSession) -> None:
        repository: MemoryRepo = MemoryRepo()
        service: AuditService = AuditService(db_session, audit_repo=repository)
        await service.log(None, "update", "student", 42, {"name": ("old", "new")})
        assert len(repository.calls) == 1
        log: AuditLog = repository.calls[0][0]
        assert (log.old_value, log.new_value, log.entity_id) == ("old", "new", 42)
        assert not db_session.new

    @pytest.mark.asyncio
    async def test_student_profile_denies_unowned_student_with_alternate_repository(self, client: AsyncClient, test_mentor: User) -> None:
        repository: MemoryRepo = MemoryRepo()
        repository.permitted = False

        RepositoryOverrides.apply(repository, test_mentor, "get_user_repository")
        response: Response = await client.get("/api/v1/students/999/profile")
        assert response.status_code == 403, response.text
        assert repository.calls == [(test_mentor.id, 999)]

    @pytest.mark.asyncio
    async def test_audit_options_uses_alternate_repository(self, client: AsyncClient, test_admin: User) -> None:
        repository: MemoryRepo = MemoryRepo()

        RepositoryOverrides.apply(repository, test_admin, "get_audit_log_repository")
        response: Response = await client.get("/api/v1/audit-log/filter-options/")
        assert response.status_code == 200, response.text
        assert response.json() == {"actors": [], "entity_types": ["student"]}
        assert repository.calls == [("actors",)]

    def test_feature_protocols_declare_typed_consumer_methods(self) -> None:
        from typing import get_type_hints
        from app.repositories.interfaces.audit_log_repository import AuditLogRepository
        from app.repositories.interfaces.document_repository import DocumentRepository
        from app.repositories.interfaces.enrollment_repository import EnrollmentRepository
        from app.repositories.interfaces.user_repository import UserRepository
        contracts: list[tuple[type, list[str]]] = [
            (DocumentRepository, ["list_documents", "get_visible_document", "mentor_has_student", "get_journal_summary"]),
            (EnrollmentRepository, ["list_enrollments", "find_existing", "count_existing", "list_schedules", "list_journals", "list_future_open_charges"]),
            (AuditLogRepository, ["stage_log", "list_filtered_rows", "list_event_keys", "list_changes_for_events", "resolve_entity_references", "resolve_course_titles", "list_actors", "list_entity_types"]),
            (UserRepository, ["mentor_has_student", "get_students_list", "get_mentors_list", "get_student_profile_stats"]),
        ]
        contract: type
        method_names: list[str]
        method_name: str
        for contract, method_names in contracts:
            for method_name in method_names:
                assert method_name in contract.__dict__, (contract.__name__, method_name)
                annotations: dict[str, Any] = get_type_hints(getattr(contract, method_name))
                assert "return" in annotations
                assert "Select" not in str(annotations)
                assert annotations["return"] is not dict
