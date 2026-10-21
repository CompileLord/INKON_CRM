from collections.abc import Sequence

from alembic import op

revision: str = "rwp45_refresh_retention"
down_revision: str = "fin1a7d3e5b9c10"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

INDEX_NAME: str = "ix_refresh_tokens_expires_at_id"


def upgrade() -> None:
    with op.get_context().autocommit_block():
        op.create_index(
            INDEX_NAME,
            "refresh_tokens",
            ["expires_at", "id"],
            postgresql_concurrently=True,
            if_not_exists=True,
        )


def downgrade() -> None:
    with op.get_context().autocommit_block():
        op.drop_index(
            INDEX_NAME,
            table_name="refresh_tokens",
            postgresql_concurrently=True,
            if_exists=True,
        )
