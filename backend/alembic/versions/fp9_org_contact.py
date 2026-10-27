from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "fp9_org_contact"
down_revision: str = "u07_audit_target_label"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("org_settings", sa.Column("address", sa.String(255), nullable=True))
    op.add_column("org_settings", sa.Column("phone", sa.String(16), nullable=True))


def downgrade() -> None:
    op.drop_column("org_settings", "phone")
    op.drop_column("org_settings", "address")
