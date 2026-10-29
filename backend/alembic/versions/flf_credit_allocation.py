from alembic import op
import sqlalchemy as sa

revision: str = "flf_credit_allocation"
down_revision: str = "p10_notification_retry"
branch_labels: tuple[str, ...] | None = None
depends_on: tuple[str, ...] | None = None


def upgrade() -> None:
    op.add_column("outbox_events", sa.Column("dispatched_amount", sa.Numeric(10, 2), nullable=True))
    op.create_table(
        "credit_allocation_idempotency",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("recorder_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("idempotency_key", sa.String(128), nullable=False),
        sa.Column("fingerprint", sa.String(64), nullable=False),
        sa.Column("result", sa.JSON(), nullable=False),
        sa.UniqueConstraint("recorder_id", "idempotency_key", name="uq_credit_allocation_recorder_key"),
    )


def downgrade() -> None:
    op.drop_table("credit_allocation_idempotency")
    op.drop_column("outbox_events", "dispatched_amount")
