from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "e1f7a8c9d0b2"
down_revision: Union[str, None] = "c9e3f0a1b2c4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    connection = op.get_bind()
    duplicate_voids = connection.execute(
        sa.text(
            """
            SELECT reverses_entry_id, array_agg(id ORDER BY id) AS void_entry_ids
            FROM ledger_entries
            WHERE type = 'void' AND reverses_entry_id IS NOT NULL
            GROUP BY reverses_entry_id
            HAVING COUNT(*) > 1
            ORDER BY reverses_entry_id
            """
        )
    ).all()
    if duplicate_voids:
        raise RuntimeError(
            "Cannot enforce one void per payment; resolve duplicate ledger history first: "
            f"{duplicate_voids!r}"
        )
    op.create_index(
        "uq_ledger_void_per_payment",
        "ledger_entries",
        ["reverses_entry_id"],
        unique=True,
        postgresql_where=sa.text("type = 'void'"),
    )


def downgrade() -> None:
    op.drop_index("uq_ledger_void_per_payment", table_name="ledger_entries")
