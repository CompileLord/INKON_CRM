from alembic import op
import sqlalchemy as sa

revision: str = "u16_debt_reminder_sms"
down_revision: str = "fp9_org_contact"
branch_labels: tuple[str, ...] | None = None
depends_on: tuple[str, ...] | None = None


def upgrade() -> None:
    op.add_column("debt_reminder_notifications", sa.Column("channel", sa.String(16), nullable=True))
    op.add_column("debt_reminder_notifications", sa.Column("masked_destination", sa.String(24), nullable=True))
    op.create_table(
        "debt_reminder_enrollments",
        sa.Column("notification_id", sa.Integer(), sa.ForeignKey("debt_reminder_notifications.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("enrollment_id", sa.Integer(), sa.ForeignKey("enrollments.id", ondelete="CASCADE"), primary_key=True),
    )
    op.create_index("ix_debt_reminder_enrollments_enrollment_id", "debt_reminder_enrollments", ["enrollment_id"])
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE outbox_event_kind ADD VALUE IF NOT EXISTS 'debt_reminder_sms'")


def downgrade() -> None:
    op.drop_table("debt_reminder_enrollments")
    op.drop_column("debt_reminder_notifications", "masked_destination")
    op.drop_column("debt_reminder_notifications", "channel")
