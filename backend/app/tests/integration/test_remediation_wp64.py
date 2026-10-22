import asyncio
import json
import os
import statistics
import subprocess
import sys
from pathlib import Path
from typing import Any

import asyncpg
import pytest
from sqlalchemy import Index, text
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, create_async_engine

from app.models.enrollment import Enrollment, EnrollmentStatus
from app.repositories.sqlalchemy.course_repository import SQLAlchemyCourseRepository
from app.repositories.sqlalchemy.enrollment_repository import SQLAlchemyEnrollmentRepository
from app.repositories.interfaces.enrollment_repository import RosterQueryResult
from app.schemas.enrollment import RosterSortOrder
from app.tests.migrations.test_migration_chain import DisposableMigrationDatabase


class RosterIndexFixture:
    index_name: str = "ix_enrollments_course_student_live"
    backend_root: str = str(Path(__file__).resolve().parents[3])

    @staticmethod
    async def seed(database: DisposableMigrationDatabase) -> None:
        await database.execute("INSERT INTO users(id,email,first_name,last_name,role,is_deleted) SELECT v,'wp64-'||v||'@example.test','First','Last'||v,CASE WHEN v=1 THEN 'mentor' ELSE 'student' END,v=7 FROM generate_series(1,9) v")
        await database.execute("INSERT INTO courses(id,title,description,start_date,end_date,exam_type,price,mentor_id) SELECT v,'Course'||v,'',DATE '2026-01-01',DATE '2026-12-31','monthly',100,1 FROM generate_series(1,3) v")
        await database.execute("INSERT INTO enrollments(id,student_id,course_id,price_at_enrollment,color_hex,status,is_deleted) SELECT v,v,CASE WHEN v=9 THEN 2 ELSE 1 END,100,'#112233',CASE WHEN v=3 THEN 'withdrawn' WHEN v=4 THEN 'completed' ELSE 'active' END,v=8 FROM generate_series(2,9) v")

    @staticmethod
    async def snapshot(database: DisposableMigrationDatabase) -> dict[str, Any]:
        engine: AsyncEngine = create_async_engine(database.database_url)
        try:
            session: AsyncSession
            async with AsyncSession(engine) as session:
                repository: SQLAlchemyEnrollmentRepository = SQLAlchemyEnrollmentRepository(session)
                result: dict[str, Any] = {}
                course_id: int
                for course_id in [1, 2, 3]:
                    roster: RosterQueryResult = await repository.get_course_roster(course_id, page_size=2, sort=RosterSortOrder.ENROLLED_ASC, locate_student_id=7)
                    ids: list[int] = []
                    page: int
                    for page in range(1, roster.total_pages + 1):
                        page_result: RosterQueryResult = await repository.get_course_roster(course_id, page=page, page_size=2, sort=RosterSortOrder.ENROLLED_ASC)
                        ids.extend(item.id for item in page_result.items)
                    filtered: RosterQueryResult = await repository.get_course_roster(course_id, status=EnrollmentStatus.ACTIVE, search='Last7')
                    result[str(course_id)] = {'ids': ids, 'total': roster.total, 'active_count': roster.active_count, 'located_page': roster.located_page, 'located_index': roster.located_index, 'filtered': [item.id for item in filtered.items]}
                result['class_sizes'] = await SQLAlchemyCourseRepository(session).count_active_students_by_course([1, 2, 3])
                return result
        finally:
            await engine.dispose()

    @classmethod
    async def assert_valid_index(cls, database: DisposableMigrationDatabase) -> None:
        row: asyncpg.Record | None = await database.fetchrow("SELECT i.indisvalid, i.indisready, pg_get_indexdef(i.indexrelid) AS definition, pg_get_expr(i.indpred,i.indrelid) AS predicate FROM pg_index i WHERE i.indexrelid=to_regclass($1)", cls.index_name)
        assert row is not None
        assert row['indisvalid'] and row['indisready']
        assert '(course_id, student_id)' in row['definition']
        assert row['predicate'] == '(is_deleted = false)'

    @staticmethod
    def assert_command(result: subprocess.CompletedProcess[str]) -> None:
        assert result.returncode == 0, result.stdout + result.stderr


def test_model_metadata_contains_matching_partial_course_leading_index() -> None:
    indexes: list[Index] = [index for index in Enrollment.__table__.indexes if index.name == RosterIndexFixture.index_name]
    assert len(indexes) == 1
    assert [column.name for column in indexes[0].columns] == ['course_id', 'student_id']
    assert str(indexes[0].dialect_options['postgresql']['where']) == 'is_deleted = false'
    assert not indexes[0].unique


@pytest.mark.parametrize(
    ('direction', 'revisions', 'expected'),
    [
        ('upgrade', 'rwp45_refresh_retention:rwp64_roster_index', 'CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_enrollments_course_student_live ON enrollments (course_id, student_id) WHERE is_deleted = false'),
        ('downgrade', 'rwp64_roster_index:rwp45_refresh_retention', 'DROP INDEX CONCURRENTLY IF EXISTS ix_enrollments_course_student_live'),
    ],
)
def test_migration_sql_uses_concurrent_retry_safe_operations(direction: str, revisions: str, expected: str) -> None:
    environment: dict[str, str] = os.environ.copy()
    environment['DATABASE_URL'] = os.environ['TEST_DATABASE_URL']
    result: subprocess.CompletedProcess[str] = subprocess.run(
        [sys.executable, '-m', 'alembic', direction, revisions, '--sql'],
        cwd=RosterIndexFixture.backend_root,
        env=environment,
        text=True,
        capture_output=True,
        timeout=30,
        check=False,
    )
    RosterIndexFixture.assert_command(result)
    assert expected in result.stdout
    assert 'COMMIT;' in result.stdout


@pytest.mark.asyncio
async def test_roster_soft_deletes_and_class_sizes_survive_upgrade_downgrade_reupgrade() -> None:
    database: DisposableMigrationDatabase
    async with DisposableMigrationDatabase(RosterIndexFixture.backend_root) as database:
        RosterIndexFixture.assert_command(database.upgrade('rwp45_refresh_retention'))
        await RosterIndexFixture.seed(database)
        before: dict[str, Any] = await RosterIndexFixture.snapshot(database)
        assert before == {'1': {'ids': [2, 3, 4, 5, 6, 7], 'total': 6, 'active_count': 4, 'located_page': 3, 'located_index': 5, 'filtered': [7]}, '2': {'ids': [9], 'total': 1, 'active_count': 1, 'located_page': None, 'located_index': None, 'filtered': []}, '3': {'ids': [], 'total': 0, 'active_count': 0, 'located_page': None, 'located_index': None, 'filtered': []}, 'class_sizes': {1: 4, 2: 1}}
        RosterIndexFixture.assert_command(database.upgrade('rwp64_roster_index'))
        assert await database.fetchval('SELECT version_num FROM alembic_version') == 'rwp64_roster_index'
        await RosterIndexFixture.assert_valid_index(database)
        assert await RosterIndexFixture.snapshot(database) == before
        RosterIndexFixture.assert_command(database.run_alembic('downgrade', '-1'))
        assert await database.fetchval('SELECT version_num FROM alembic_version') == 'rwp45_refresh_retention'
        assert await database.fetchval('SELECT to_regclass($1)::text', RosterIndexFixture.index_name) is None
        assert await RosterIndexFixture.snapshot(database) == before
        RosterIndexFixture.assert_command(database.upgrade('rwp64_roster_index'))
        await RosterIndexFixture.assert_valid_index(database)
        assert await RosterIndexFixture.snapshot(database) == before
        assert await database.fetchval('SELECT count(*) FROM enrollments') == 8


@pytest.mark.asyncio
async def test_upgrade_recovers_real_interrupted_concurrent_index_and_accepts_valid_existing_index() -> None:
    database: DisposableMigrationDatabase
    async with DisposableMigrationDatabase(RosterIndexFixture.backend_root) as database:
        RosterIndexFixture.assert_command(database.upgrade('rwp45_refresh_retention'))
        await RosterIndexFixture.seed(database)
        writer: asyncpg.Connection = await asyncpg.connect(**database._connection_parameters(database.database_url))
        builder: asyncpg.Connection = await asyncpg.connect(**database._connection_parameters(database.database_url))
        build: asyncio.Task[str] | None = None
        try:
            await writer.execute('BEGIN')
            await writer.execute('UPDATE enrollments SET price_at_enrollment=101 WHERE id=2')
            build = asyncio.create_task(builder.execute(f'CREATE INDEX CONCURRENTLY {RosterIndexFixture.index_name} ON enrollments(course_id,student_id) WHERE is_deleted = false'))
            async with asyncio.timeout(10):
                while await database.fetchval('SELECT to_regclass($1)::text', RosterIndexFixture.index_name) is None:
                    await asyncio.sleep(0.02)
            assert await database.fetchval('SELECT pg_cancel_backend($1)', builder.get_server_pid())
            with pytest.raises(asyncpg.QueryCanceledError):
                await asyncio.wait_for(build, 5)
            assert await database.fetchval('SELECT indisvalid FROM pg_index WHERE indexrelid=to_regclass($1)', RosterIndexFixture.index_name) is False
        finally:
            await writer.execute('ROLLBACK')
            if build is not None:
                await asyncio.gather(build, return_exceptions=True)
            await builder.close()
            await writer.close()
        RosterIndexFixture.assert_command(database.upgrade('head'))
        await RosterIndexFixture.assert_valid_index(database)
        assert await database.fetchval('SELECT count(*) FROM enrollments') == 8
        existing_oid: int = await database.fetchval('SELECT to_regclass($1)::oid', RosterIndexFixture.index_name)
        RosterIndexFixture.assert_command(database.run_alembic('stamp', 'rwp45_refresh_retention'))
        RosterIndexFixture.assert_command(database.upgrade('head'))
        assert await database.fetchval('SELECT to_regclass($1)::oid', RosterIndexFixture.index_name) == existing_oid
        await RosterIndexFixture.assert_valid_index(database)


@pytest.mark.skipif(os.environ.get('IMKON_RUN_SCALE') != '1', reason='scale measurement is opt-in: set IMKON_RUN_SCALE=1')
@pytest.mark.parametrize('population', [10000, 100000, 1000000])
@pytest.mark.asyncio
async def test_course_roster_scale_plan_uses_measured_index(population: int) -> None:
    database: DisposableMigrationDatabase
    async with DisposableMigrationDatabase(RosterIndexFixture.backend_root) as database:
        RosterIndexFixture.assert_command(database.upgrade('head'))
        await database.execute("INSERT INTO users(id,email,first_name,last_name,role) SELECT v,'wp64-scale-'||v||'@example.test','First','Last','student' FROM generate_series(1,$1::integer) v", population)
        await database.execute("INSERT INTO courses(id,title,description,start_date,end_date,exam_type,price,mentor_id) SELECT v,'Course'||v,'',DATE '2026-01-01',DATE '2026-12-31','monthly',100,1 FROM generate_series(1,$1::integer) v", population // 25)
        await database.execute("INSERT INTO enrollments(student_id,course_id,price_at_enrollment,color_hex,is_deleted) SELECT v,1+v%($1::integer/25),100,'#112233',v%13=0 FROM generate_series(1,$1::integer) v", population)
        await database.execute('ANALYZE enrollments')
        durations: list[float] = []
        plans: list[Any] = []
        trial: int
        for trial in range(23):
            raw: str = await database.fetchval('EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) SELECT count(id) FROM enrollments WHERE course_id=1 AND status=\'active\' AND is_deleted=false')
            plan: Any = json.loads(raw)[0]
            if trial >= 3:
                durations.append(plan['Execution Time'])
                plans.append(plan)
        assert all(RosterIndexFixture.index_name in json.dumps(plan) for plan in plans)
        assert await database.fetchval('SELECT count(*) FROM enrollments') == population
        print(json.dumps({'population': population, 'p95_ms': sorted(durations)[18], 'variance_ms2': statistics.pvariance(durations), 'plans': plans}))
