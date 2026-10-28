from alembic import op
import sqlalchemy as sa

revision: str = "p10_notification_amount"
down_revision: str = "p7_payment_targets"
branch_labels: tuple[str, ...] | None = None
depends_on: tuple[str, ...] | None = None


def upgrade() -> None:
    op.add_column("notification_logs", sa.Column("delivery_amount", sa.Numeric(10, 2), nullable=True))


def downgrade() -> None:
    op.drop_column("notification_logs", "delivery_amount")
