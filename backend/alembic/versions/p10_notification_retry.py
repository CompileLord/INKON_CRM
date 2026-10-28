from alembic import op
import sqlalchemy as sa

revision: str = "p10_notification_retry"
down_revision: str = "p10_notification_amount"
branch_labels: tuple[str, ...] | None = None
depends_on: tuple[str, ...] | None = None


def upgrade() -> None:
    op.add_column("notification_logs", sa.Column("retry_requested", sa.Boolean(), nullable=True))


def downgrade() -> None:
    op.drop_column("notification_logs", "retry_requested")
