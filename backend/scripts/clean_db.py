import argparse
import asyncio
import logging
import sys
from pathlib import Path
from typing import Sequence

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.security import hash_password
import app.models.audit_log
import app.models.course
import app.models.course_mentor_history
import app.models.course_schedule
import app.models.document
import app.models.enrollment
import app.models.journal
import app.models.journal_entry
import app.models.journal_student_summary
import app.models.notification_log
import app.models.payment
import app.models.refresh_token
import app.models.user
from app.db.session import engine
from app.models.user import User, UserRole
from scripts.reset_tables import ResetTableCatalog
from scripts.reset_guard import CredentialProvisioner, ResetGuardError, ResetTarget, ResetTargetGuard


logging.basicConfig(level=logging.INFO)
logger: logging.Logger = logging.getLogger(__name__)

def create_reset_guard() -> ResetTargetGuard:
    backend_root: Path = Path(__file__).resolve().parents[1]
    return ResetTargetGuard(
        environment=settings.ENVIRONMENT,
        database_url=settings.DATABASE_URL,
        storage_path=settings.STORAGE_PATH,
        backend_root=backend_root,
    )


async def clean_database(target: ResetTarget, administrator_password: str) -> None:
    target = create_reset_guard().authorize_target(target)
    if target.dry_run:
        raise ResetGuardError("Dry-run targets cannot modify the database.")
    async with engine.begin() as connection:
        for table_name in ResetTableCatalog.tables_to_truncate():
            await connection.execute(text(f"TRUNCATE TABLE {table_name} RESTART IDENTITY CASCADE;"))

        async with AsyncSession(bind=connection, expire_on_commit=False) as session:
            administrator: User = User(
                email="superadmin@mail.com",
                password_hash=hash_password(administrator_password),
                first_name="Admin",
                last_name="Super",
                role=UserRole.SUPERADMIN,
                must_set_password=True,
            )
            session.add(administrator)
            await session.flush()



def main(arguments: Sequence[str] | None = None) -> None:
    argument_parser: argparse.ArgumentParser = argparse.ArgumentParser()
    try:
        target: ResetTarget = create_reset_guard().parse_and_validate(
            arguments if arguments is not None else sys.argv[1:]
        )
    except SystemExit:
        raise
    except ResetGuardError as error:
        argument_parser.exit(2, f"Reset refused: {error}\n")

    if target.dry_run:
        print(f"Dry run: database={target.database_identity} storage={target.storage_root}")
        return

    try:
        credentials = CredentialProvisioner().provision(["administrator"])
        asyncio.run(clean_database(target, credentials["administrator"]))
    except ResetGuardError as error:
        argument_parser.exit(2, f"Reset refused: {error}\n")
    except Exception:
        logger.error("Database reset failed; the database transaction was rolled back.")
        raise SystemExit(1) from None

    print("Database reset completed.")


if __name__ == "__main__":
    main()
