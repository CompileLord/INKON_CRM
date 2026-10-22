import asyncio
import os
import sys

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection, AsyncEngine, create_async_engine
from sqlalchemy.pool import NullPool


class AlembicVersionRepair:
    redundant_revision: str = "d4e5f6a7b8c9"
    retained_revision: str = "d025a01b34e5"

    async def run(self, database_url: str) -> None:
        engine: AsyncEngine = create_async_engine(database_url, poolclass=NullPool)
        try:
            connection: AsyncConnection
            async with engine.begin() as connection:
                await connection.execute(text("SET LOCAL lock_timeout = '10s'"))
                await connection.execute(text("SET LOCAL statement_timeout = '30s'"))
                exists: bool = await connection.scalar(text("SELECT to_regclass('alembic_version') IS NOT NULL"))
                if not exists:
                    print("No change: alembic_version table is absent")
                    return
                await connection.execute(text("LOCK TABLE alembic_version IN SHARE ROW EXCLUSIVE MODE"))
                revisions: list[str] = list((await connection.scalars(
                    text("SELECT version_num FROM alembic_version ORDER BY version_num FOR UPDATE")
                )).all())
                if revisions != sorted([self.redundant_revision, self.retained_revision]):
                    print(f"No change: alembic_version contains {revisions}")
                    return
                credentials_email_exists: bool = await connection.scalar(text(
                    "SELECT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid "
                    "WHERE t.typname = 'outbox_event_kind' AND pg_type_is_visible(t.oid) "
                    "AND e.enumlabel = 'credentials_email')"
                ))
                if not credentials_email_exists:
                    raise RuntimeError("Alembic version repair refused: RWP20 outbox_event_kind.credentials_email is missing")
                await connection.execute(
                    text("DELETE FROM alembic_version WHERE version_num = :revision"),
                    {"revision": self.redundant_revision},
                )
            print(f"Repaired alembic_version: removed {self.redundant_revision}; retained {self.retained_revision}")
        finally:
            await engine.dispose()

    @classmethod
    def main(cls) -> None:
        database_url: str | None = os.environ.get("DATABASE_URL")
        if not database_url:
            print("DATABASE_URL must be set for Alembic version repair", file=sys.stderr)
            raise SystemExit(1)
        try:
            asyncio.run(cls().run(database_url))
        except RuntimeError as error:
            print(str(error), file=sys.stderr)
            raise SystemExit(1) from None


if __name__ == "__main__":
    AlembicVersionRepair.main()
