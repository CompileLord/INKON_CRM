from alembic import op
import sqlalchemy as sa

revision: str = "p4_enrollment_billing_mode"
down_revision: str = "u16_debt_reminder_sms"
branch_labels: tuple[str, ...] | None = None
depends_on: tuple[str, ...] | None = None


def upgrade() -> None:
    op.add_column(
        "enrollments",
        sa.Column("billing_mode", sa.String(20), nullable=True, server_default="paid"),
    )
    op.execute("UPDATE enrollments SET billing_mode = 'paid' WHERE billing_mode IS NULL")
    op.create_check_constraint(
        "check_enrollment_billing_mode", "enrollments", "billing_mode IN ('paid', 'grant')"
    )


def downgrade() -> None:
    op.drop_constraint("check_enrollment_billing_mode", "enrollments", type_="check")
    op.drop_column("enrollments", "billing_mode")
