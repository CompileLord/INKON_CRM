from scripts.demo_seed_assets import COURSE_PHOTO_URLS, MENTOR_PHOTO_URLS, stage_downloadable_assets
from scripts.demo_data_populator import DemoDataPopulator

import asyncio
import argparse
import sys
import logging
from pathlib import Path
from typing import Awaitable, Callable, List, Dict, Sequence
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker
from app.db.session import engine
from app.core.config import settings
from scripts.reset_guard import CredentialProvisioner, ResetGuardError, ResetTarget, ResetTargetGuard, StorageReplacement

populate_demo_data: Callable[..., Awaitable[None]] = DemoDataPopulator.populate_demo_data

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

TABLES_TO_TRUNCATE: List[str] = [
    "refresh_tokens",
    "audit_logs",
    "notification_logs",
    "documents",
    "allocations",
    "ledger_entries",
    "charges",
    "payments",
    "journal_student_summaries",
    "journal_entries",
    "journals",
    "enrollments",
    "course_mentor_history",
    "course_schedules",
    "courses",
    "users"
]


def create_reset_guard() -> ResetTargetGuard:
    backend_root: Path = Path(__file__).resolve().parents[1]
    return ResetTargetGuard(
        environment=settings.ENVIRONMENT,
        database_url=settings.DATABASE_URL,
        storage_path=settings.STORAGE_PATH,
        backend_root=backend_root,
    )


async def seed_demo_data(target: ResetTarget, administrator_password: str, demo_password: str) -> None:
    target = create_reset_guard().authorize_target(target)
    if target.dry_run:
        raise ResetGuardError("Dry-run targets cannot modify the database or storage.")
    staged_assets: Dict[str, bytes] = stage_downloadable_assets()
    storage_replacement: StorageReplacement = StorageReplacement(target)
    staged_storage_root: Path = storage_replacement.prepare()

    try:
        async with engine.begin() as connection:
            for table_name in TABLES_TO_TRUNCATE:
                await connection.execute(text(f"TRUNCATE TABLE {table_name} RESTART IDENTITY CASCADE;"))

            session_factory: async_sessionmaker[AsyncSession] = async_sessionmaker(
                bind=connection,
                expire_on_commit=False,
                join_transaction_mode="rollback_only",
            )
            await populate_demo_data(
                session_factory=session_factory,
                storage_root=staged_storage_root,
                staged_assets=staged_assets,
                administrator_password=administrator_password,
                demo_password=demo_password,
            )
            storage_replacement.install()
    except BaseException:
        try:
            storage_replacement.rollback()
        except Exception:
            logger.error("Storage rollback failed; the disposable backup was retained for recovery.")
            raise
        raise

    try:
        storage_replacement.finalize()
    except Exception:
        logger.error("The previous disposable storage backup could not be removed.")


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
        credentials = CredentialProvisioner().provision(["administrator", "demo users"])
        asyncio.run(seed_demo_data(target, credentials["administrator"], credentials["demo users"]))
    except ResetGuardError as error:
        argument_parser.exit(2, f"Reset refused: {error}\n")
    except Exception:
        logger.error("Demo reset failed; database changes were rolled back.")
        raise SystemExit(1) from None

    print("Demo database reset completed.")


if __name__ == "__main__":
    main()
