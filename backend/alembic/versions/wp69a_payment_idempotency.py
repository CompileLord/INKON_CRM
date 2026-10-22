from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "wp69a_payment_idempotency"
down_revision: str = "rwp64_roster_index"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

INDEX_NAME: str = "uq_ledger_recorder_idempotency_key"


def upgrade() -> None:
    op.execute("ALTER TABLE ledger_entries ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(128)")
    op.execute("ALTER TABLE ledger_entries ADD COLUMN IF NOT EXISTS idempotency_fingerprint VARCHAR(64)")
    with op.get_context().autocommit_block():
        if not op.get_context().as_sql:
            valid: bool | None = op.get_bind().execute(
                sa.text("SELECT indisvalid FROM pg_index WHERE indexrelid = to_regclass(:index_name)"),
                {"index_name": INDEX_NAME},
            ).scalar_one_or_none()
            if valid is False:
                op.drop_index(
                    INDEX_NAME,
                    table_name="ledger_entries",
                    postgresql_concurrently=True,
                    if_exists=True,
                )
        op.create_index(
            INDEX_NAME,
            "ledger_entries",
            ["recorded_by_id", "idempotency_key"],
            unique=True,
            postgresql_where=sa.text("idempotency_key IS NOT NULL"),
            postgresql_concurrently=True,
            if_not_exists=True,
        )


def downgrade() -> None:
    with op.get_context().autocommit_block():
        op.drop_index(
            INDEX_NAME,
            table_name="ledger_entries",
            postgresql_concurrently=True,
            if_exists=True,
        )
    op.execute("ALTER TABLE ledger_entries DROP COLUMN IF EXISTS idempotency_fingerprint")
    op.execute("ALTER TABLE ledger_entries DROP COLUMN IF EXISTS idempotency_key")
