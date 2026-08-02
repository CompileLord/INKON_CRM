"""finance charge/credit ledger

Creates the charge/ledger/allocation/accounting-period tables introduced by the
finance redesign (FINANCE_REDESIGN_PLAN.md).

The legacy ``payments`` table is deliberately left in place: it is the source
for the historical backfill (``app/scripts/backfill_finance.py``) and is dropped
only after that backfill has been reconciled and signed off.

Revision ID: b7c1d2e3f4a5
Revises: f9a0b1c2d3e4
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'b7c1d2e3f4a5'
down_revision: Union[str, Sequence[str], None] = 'f9a0b1c2d3e4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'charges',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('enrollment_id', sa.Integer(), nullable=False),
        sa.Column('student_id', sa.Integer(), nullable=False),
        sa.Column('sequence_no', sa.Integer(), nullable=False),
        sa.Column('amount', sa.Numeric(10, 2), nullable=False),
        sa.Column('due_date', sa.Date(), nullable=False),
        sa.Column('type', sa.String(20), server_default='tuition', nullable=False),
        sa.Column('status', sa.String(20), server_default='open', nullable=False),
        sa.Column('is_deleted', sa.Boolean(), server_default=sa.false(), nullable=False),
        sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['enrollment_id'], ['enrollments.id'], ondelete='RESTRICT'),
        sa.ForeignKeyConstraint(['student_id'], ['users.id'], ondelete='RESTRICT'),
        sa.CheckConstraint('amount > 0', name='check_charge_amount_positive'),
        sa.CheckConstraint('sequence_no >= 1', name='check_charge_sequence_positive'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('idx_charges_student_due_date', 'charges', ['student_id', 'due_date'])
    op.create_index('idx_charges_enrollment', 'charges', ['enrollment_id'])
    op.create_index('idx_charges_due_date', 'charges', ['due_date'])

    op.create_table(
        'ledger_entries',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('student_id', sa.Integer(), nullable=False),
        sa.Column('type', sa.String(20), nullable=False),
        sa.Column('amount', sa.Numeric(10, 2), nullable=False),
        sa.Column('method', sa.String(20), nullable=True),
        sa.Column('occurred_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('recorded_by_id', sa.Integer(), nullable=False),
        sa.Column('reverses_entry_id', sa.Integer(), nullable=True),
        sa.Column('is_cash_out', sa.Boolean(), nullable=True),
        sa.Column('reason_code', sa.String(50), nullable=True),
        sa.Column('comment', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(['student_id'], ['users.id'], ondelete='RESTRICT'),
        sa.ForeignKeyConstraint(['recorded_by_id'], ['users.id'], ondelete='RESTRICT'),
        sa.ForeignKeyConstraint(['reverses_entry_id'], ['ledger_entries.id'], ondelete='RESTRICT'),
        sa.CheckConstraint('amount > 0', name='check_ledger_amount_positive'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('idx_ledger_student_occurred', 'ledger_entries', ['student_id', 'occurred_at'])
    op.create_index('idx_ledger_type_occurred', 'ledger_entries', ['type', 'occurred_at'])
    op.create_index('idx_ledger_reverses', 'ledger_entries', ['reverses_entry_id'])

    op.create_table(
        'allocations',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('ledger_entry_id', sa.Integer(), nullable=False),
        sa.Column('charge_id', sa.Integer(), nullable=False),
        sa.Column('amount', sa.Numeric(10, 2), nullable=False),
        sa.Column('reversed_by_entry_id', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(['ledger_entry_id'], ['ledger_entries.id'], ondelete='RESTRICT'),
        sa.ForeignKeyConstraint(['charge_id'], ['charges.id'], ondelete='RESTRICT'),
        sa.ForeignKeyConstraint(['reversed_by_entry_id'], ['ledger_entries.id'], ondelete='RESTRICT'),
        sa.CheckConstraint('amount > 0', name='check_allocation_amount_positive'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('idx_allocations_charge', 'allocations', ['charge_id'])
    op.create_index('idx_allocations_ledger_entry', 'allocations', ['ledger_entry_id'])
    op.create_index('idx_allocations_active', 'allocations', ['charge_id', 'reversed_by_entry_id'])

    op.create_table(
        'accounting_periods',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('year', sa.Integer(), nullable=False),
        sa.Column('month', sa.Integer(), nullable=False),
        sa.Column('status', sa.String(20), server_default='open', nullable=False),
        sa.Column('closed_by_id', sa.Integer(), nullable=True),
        sa.Column('closed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('reopen_reason', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(['closed_by_id'], ['users.id'], ondelete='RESTRICT'),
        sa.CheckConstraint('month >= 1 AND month <= 12', name='check_valid_month'),
        sa.UniqueConstraint('year', 'month', name='uq_period_year_month'),
        sa.PrimaryKeyConstraint('id'),
    )


def downgrade() -> None:
    op.drop_table('accounting_periods')
    op.drop_index('idx_allocations_active', table_name='allocations')
    op.drop_index('idx_allocations_ledger_entry', table_name='allocations')
    op.drop_index('idx_allocations_charge', table_name='allocations')
    op.drop_table('allocations')
    op.drop_index('idx_ledger_reverses', table_name='ledger_entries')
    op.drop_index('idx_ledger_type_occurred', table_name='ledger_entries')
    op.drop_index('idx_ledger_student_occurred', table_name='ledger_entries')
    op.drop_table('ledger_entries')
    op.drop_index('idx_charges_due_date', table_name='charges')
    op.drop_index('idx_charges_enrollment', table_name='charges')
    op.drop_index('idx_charges_student_due_date', table_name='charges')
    op.drop_table('charges')
