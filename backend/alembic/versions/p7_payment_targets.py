from alembic import op
import sqlalchemy as sa

revision: str = 'p7_payment_targets'
down_revision: str = 'p4_enrollment_billing_mode'
branch_labels: tuple[str, ...] | None = None
depends_on: tuple[str, ...] | None = None


def upgrade() -> None:
    op.create_table(
        'payment_targets',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('ledger_entry_id', sa.Integer(), sa.ForeignKey('ledger_entries.id', ondelete='RESTRICT'), nullable=False),
        sa.Column('enrollment_id', sa.Integer(), sa.ForeignKey('enrollments.id', ondelete='RESTRICT'), nullable=False),
        sa.Column('amount', sa.Numeric(10, 2), nullable=False),
        sa.CheckConstraint('amount > 0', name='check_payment_target_amount_positive'),
        sa.UniqueConstraint('ledger_entry_id', 'enrollment_id', name='uq_payment_target_entry_enrollment'),
    )
    op.create_index('ix_payment_targets_enrollment_id', 'payment_targets', ['enrollment_id'])


def downgrade() -> None:
    op.drop_table('payment_targets')
