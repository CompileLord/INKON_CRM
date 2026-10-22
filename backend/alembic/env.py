import asyncio
import os
import sys
from logging.config import fileConfig
from sqlalchemy import pool, text
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import async_engine_from_config
from alembic import context

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.db.base import Base
from app.db.connection_policy import DatabaseDeploymentSettings

connection_policy: DatabaseDeploymentSettings = DatabaseDeploymentSettings()
from app.models.user import User
from app.models.refresh_token import RefreshToken
from app.models.course import Course
from app.models.course_schedule import CourseSchedule
from app.models.course_mentor_history import CourseMentorHistory
from app.models.enrollment import Enrollment
from app.models.journal import Journal
from app.models.journal_entry import JournalEntry
from app.models.journal_student_summary import JournalStudentSummary
from app.models.document import Document
from app.models.payment import Payment
from app.models.notification_log import NotificationLog
from app.models.audit_log import AuditLog
from app.models.org_settings import OrgSettings


config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata

database_url = os.environ.get("DATABASE_URL")
if not database_url:
    raise RuntimeError("DATABASE_URL must be set for database migrations")

config.set_main_option("sqlalchemy.url", database_url.replace("%", "%%"))


def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection: Connection) -> None:
    lock_timeout_ms: int = int(os.environ.get("MIGRATION_LOCK_TIMEOUT_MS", "5000"))
    statement_timeout_ms: int = int(os.environ.get("MIGRATION_STATEMENT_TIMEOUT_MS", "900000"))
    if lock_timeout_ms <= 0 or statement_timeout_ms <= 0:
        raise ValueError("Migration timeouts must be positive milliseconds")
    connection.execute(text("SELECT set_config('lock_timeout', :timeout, false)"), {"timeout": f"{lock_timeout_ms}ms"})
    connection.execute(text("SELECT set_config('statement_timeout', :timeout, false)"), {"timeout": f"{statement_timeout_ms}ms"})
    connection.commit()
    context.configure(connection=connection, target_metadata=target_metadata)

    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
        connect_args={"server_settings": connection_policy.server_settings(maintenance=True)},
    )

    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)

    await connectable.dispose()


def run_migrations_online() -> None:
    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
