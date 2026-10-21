from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op


revision: str = "sms1b_pending_password"
down_revision: str = "sms1a7c3e9b2d10"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("users", sa.Column("pending_password_hash", sa.String(255), nullable=True))
    op.add_column("users", sa.Column("pending_password_expires_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "pending_password_expires_at")
    op.drop_column("users", "pending_password_hash")
