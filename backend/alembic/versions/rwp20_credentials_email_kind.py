from collections.abc import Sequence

from alembic import op


revision: str = "d4e5f6a7b8c9"
down_revision: str | None = "c91f0a4b7e19"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE outbox_event_kind ADD VALUE IF NOT EXISTS 'credentials_email'")


def downgrade() -> None:
    pass
