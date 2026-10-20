from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "fin1a7d3e5b9c10"
down_revision: str = "rwp37_installment_identity"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "debt_reminder_notifications",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("student_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("status", sa.String(16), nullable=False, server_default="pending"),
        sa.Column("due_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("attempt_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("max_attempts", sa.Integer(), nullable=False, server_default="5"),
        sa.Column("lease_owner", sa.String(64), nullable=True),
        sa.Column("lease_expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("send_started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_error", sa.String(500), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_debt_reminders_student_created", "debt_reminder_notifications", ["student_id", "created_at"])
    op.create_index("ix_debt_reminders_status_due", "debt_reminder_notifications", ["status", "due_at"])


def downgrade() -> None:
    connection: sa.engine.Connection = op.get_bind()
    connection.execute(sa.text("LOCK TABLE debt_reminder_notifications IN ACCESS EXCLUSIVE MODE"))
    pending_count: int = connection.scalar(
        sa.text("SELECT count(*) FROM debt_reminder_notifications WHERE status IN ('pending', 'claimed')")
    ) or 0
    if pending_count > 0:
        raise RuntimeError(
            f"Cannot downgrade debt_reminder_notifications: {pending_count} pending or claimed notification(s) remain unprocessed"
        )
    op.drop_index("ix_debt_reminders_status_due", table_name="debt_reminder_notifications")
    op.drop_index("ix_debt_reminders_student_created", table_name="debt_reminder_notifications")
    op.drop_table("debt_reminder_notifications")
