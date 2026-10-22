import json
import os
import statistics
from time import perf_counter
from typing import Any
import pytest
from sqlalchemy import Select, event, select, text
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.user import User, UserRole
from app.repositories.sqlalchemy.user_repository import SQLAlchemyUserRepository
from conftest import test_engine


class DirectoryFixture:
    @staticmethod
    async def users(session: AsyncSession, role: UserRole) -> list[int]:
        users: list[User] = [User(email=f"wp44-{role.value}-{index}@example.test", first_name="Tied", last_name="Name", role=role) for index in range(9)]
        users.append(User(email=f"wp44-deleted-{role.value}@example.test", first_name="Tied", last_name="Name", role=role, is_deleted=True))
        session.add_all(users)
        await session.commit()
        return [user.id for user in users[:-1]]


@pytest.mark.asyncio
async def test_empty_search_executes_only_count_and_keeps_numbered_contract(db_session: AsyncSession) -> None:
    captured: list[str] = []

    def record(connection: Any, cursor: Any, statement: str, parameters: Any, context: Any, executemany: bool) -> None:
        captured.append(statement)

    event.listen(test_engine.sync_engine, "before_cursor_execute", record)
    try:
        result: dict[str, Any] = await SQLAlchemyUserRepository(db_session).get_students_list(page=7, page_size=500, search="absent-wp44")
    finally:
        event.remove(test_engine.sync_engine, "before_cursor_execute", record)
    assert result == {"items": [], "total": 0, "page": 7, "page_size": 100, "total_pages": 0}
    assert len(captured) == 1
    assert "count(" in captured[0].lower()


@pytest.mark.asyncio
@pytest.mark.parametrize("role", [UserRole.STUDENT, UserRole.MENTOR])
async def test_tied_name_pages_have_explicit_stable_order_and_exact_role_search_count(db_session: AsyncSession, role: UserRole) -> None:
    expected: list[int] = await DirectoryFixture.users(db_session, role)
    await DirectoryFixture.users(db_session, UserRole.ACCOUNTANT)
    captured: list[str] = []

    def record(connection: Any, cursor: Any, statement: str, parameters: Any, context: Any, executemany: bool) -> None:
        if "count(" not in statement.lower():
            captured.append(statement.lower())

    repository: SQLAlchemyUserRepository = SQLAlchemyUserRepository(db_session)
    event.listen(test_engine.sync_engine, "before_cursor_execute", record)
    try:
        trial: int
        for trial in range(3):
            observed: list[int] = []
            page: int
            for page in range(1, 4):
                result: dict[str, Any] = await (repository.get_students_list(page, 3, "Tied") if role == UserRole.STUDENT else repository.get_mentors_list(page, 3, "Tied"))
                assert result["total"] == 9 and result["total_pages"] == 3
                assert result["page"] == page and result["page_size"] == 3
                observed.extend(user.id for user in result["items"])
                assert all(user.role == role and not user.is_deleted for user in result["items"])
            assert observed == expected
    finally:
        event.remove(test_engine.sync_engine, "before_cursor_execute", record)
    assert len(captured) == 9
    assert all("order by users.id" in statement for statement in captured)


@pytest.mark.asyncio
async def test_out_of_range_nonempty_page_retains_exact_count_without_item_query(db_session: AsyncSession) -> None:
    await DirectoryFixture.users(db_session, UserRole.MENTOR)
    captured: list[str] = []

    def record(connection: Any, cursor: Any, statement: str, parameters: Any, context: Any, executemany: bool) -> None:
        captured.append(statement)

    event.listen(test_engine.sync_engine, "before_cursor_execute", record)
    try:
        result: dict[str, Any] = await SQLAlchemyUserRepository(db_session).get_mentors_list(page=4, page_size=3, search="Tied")
    finally:
        event.remove(test_engine.sync_engine, "before_cursor_execute", record)
    assert result == {"items": [], "total": 9, "page": 4, "page_size": 3, "total_pages": 3}
    assert len(captured) == 1


class DirectoryBenchmark:
    @staticmethod
    async def seed(session: AsyncSession, population: int) -> None:
        await session.execute(text("""
            INSERT INTO users (email, first_name, last_name, role, is_deleted)
            SELECT 'wp44-scale-' || value || '@example.test',
                   CASE WHEN value % 997 = 1 THEN 'Rare' ELSE 'Common' END, 'Directory',
                   CASE WHEN value % 10 = 0 THEN 'mentor' ELSE 'student' END,
                   value % 100 = 99
            FROM generate_series(1, :population) AS value
        """), {"population": population})
        await session.commit()
        await session.execute(text("ANALYZE users"))
        await session.commit()

    @staticmethod
    async def measure(session: AsyncSession, population: int) -> dict[str, Any]:
        repository: SQLAlchemyUserRepository = SQLAlchemyUserRepository(session)
        cases: list[tuple[str, str, int]] = [("first_common", "Common", 1), ("deep_common", "Common", max(1, population * 4 // 100)), ("first_rare", "Rare", 1), ("empty", "NeverMatchingWP44", 1)]
        output: dict[str, Any] = {"population": population, "cases": {}}
        name: str
        term: str
        page: int
        for name, term, page in cases:
            durations: list[float] = []
            counts: list[int] = []
            statements: list[tuple[str, Any]] = []
            totals: list[int] = []
            trial: int
            for trial in range(3):
                captured: list[tuple[str, Any]] = []

                def record(connection: Any, cursor: Any, statement: str, parameters: Any, context: Any, executemany: bool) -> None:
                    captured.append((statement, parameters))

                event.listen(test_engine.sync_engine, "before_cursor_execute", record)
                started: float = perf_counter()
                try:
                    result: dict[str, Any] = await repository.get_students_list(page=page, page_size=20, search=term)
                finally:
                    durations.append(perf_counter() - started)
                    event.remove(test_engine.sync_engine, "before_cursor_execute", record)
                counts.append(len(captured))
                totals.append(result["total"])
                statements = captured
                assert len(result["items"]) <= 20
                assert result["page"] == page and result["page_size"] == 20
            assert len(set(totals)) == 1
            plans: list[dict[str, Any]] = []
            connection: Any = await session.connection()
            statement: str
            parameters: Any
            for statement, parameters in statements:
                result_plan: Any = await connection.exec_driver_sql("EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) " + statement, parameters)
                raw_plan: Any = result_plan.scalar_one()
                plans.extend(json.loads(raw_plan) if isinstance(raw_plan, str) else raw_plan)
            output["cases"][name] = {"page": page, "total": totals[0], "sql_counts": counts,
                "seconds": durations, "p50_seconds": statistics.median(durations), "p95_seconds": max(durations),
                "variance_seconds_squared": statistics.pvariance(durations), "plans": plans}
        return output


@pytest.mark.skipif(os.environ.get("IMKON_RUN_SCALE") != "1", reason="scale measurement is opt-in: set IMKON_RUN_SCALE=1")
@pytest.mark.asyncio
@pytest.mark.parametrize("population", [10000, 100000, 1000000])
async def test_directory_representative_scale_measurements(db_session: AsyncSession, population: int) -> None:
    await DirectoryBenchmark.seed(db_session, population)
    result: dict[str, Any] = await DirectoryBenchmark.measure(db_session, population)
    print(json.dumps(result))
    assert result["cases"]["empty"]["total"] == 0
    assert result["cases"]["first_common"]["total"] > result["cases"]["first_rare"]["total"] > 0


@pytest.mark.asyncio
async def test_count_discards_ordering_while_generic_item_order_is_preserved(db_session: AsyncSession) -> None:
    expected: list[int] = await DirectoryFixture.users(db_session, UserRole.MENTOR)
    query: Select[tuple[User]] = select(User).where(User.role == UserRole.MENTOR, User.is_deleted.is_(False)).order_by(User.id.desc())
    captured: list[str] = []

    def record(connection: Any, cursor: Any, statement: str, parameters: Any, context: Any, executemany: bool) -> None:
        captured.append(statement.lower())

    event.listen(test_engine.sync_engine, "before_cursor_execute", record)
    try:
        result: dict[str, Any] = await SQLAlchemyUserRepository(db_session).get_paginated(query, page=1, page_size=3)
    finally:
        event.remove(test_engine.sync_engine, "before_cursor_execute", record)
    assert result["total"] == 9
    assert [user.id for user in result["items"]] == list(reversed(expected))[:3]
    assert "order by" not in captured[0]
    assert "order by users.id desc" in captured[1]
