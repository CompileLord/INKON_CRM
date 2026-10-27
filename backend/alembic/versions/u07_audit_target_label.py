from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "u07_audit_target_label"
down_revision: str = "u12_preferred_language"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("audit_logs", sa.Column("entity_label", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("audit_logs", "entity_label")
