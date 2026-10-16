from datetime import datetime, timezone

from alembic import op
import sqlalchemy as sa


revision: str = "c9e3f0a1b2c4"
down_revision: str | None = "d8e9f0a1b2c3"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    refresh_tokens: sa.Table = sa.table(
        "refresh_tokens",
        sa.column("revoked_at", sa.DateTime(timezone=True)),
    )
    op.execute(
        refresh_tokens.update()
        .where(refresh_tokens.c.revoked_at.is_(None))
        .values(revoked_at=datetime.now(timezone.utc))
    )
    op.drop_index("ix_refresh_tokens_token_hash", table_name="refresh_tokens")
    op.create_index(
        "uq_refresh_tokens_active_hash",
        "refresh_tokens",
        ["token_hash"],
        unique=True,
        postgresql_where=sa.text("revoked_at IS NULL"),
    )


def downgrade() -> None:
    op.drop_index(
        "uq_refresh_tokens_active_hash",
        table_name="refresh_tokens",
    )
    op.create_index(
        "ix_refresh_tokens_token_hash",
        "refresh_tokens",
        ["token_hash"],
    )
