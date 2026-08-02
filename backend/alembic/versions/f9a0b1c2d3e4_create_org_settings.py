"""Create org_settings table

Revision ID: f9a0b1c2d3e4
Revises: e8f9a0b1c2d3
Create Date: 2026-08-01 05:30:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f9a0b1c2d3e4'
down_revision: Union[str, Sequence[str], None] = 'e8f9a0b1c2d3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'org_settings',
        sa.Column('id', sa.Integer(), nullable=False, primary_key=True),
        sa.Column('org_name', sa.String(length=255), nullable=False, server_default='Учебный центр ИМКОН'),
        sa.Column('notify_payments', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('notify_debts', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False)
    )


def downgrade() -> None:
    op.drop_table('org_settings')
