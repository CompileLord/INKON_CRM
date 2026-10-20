from alembic import op
import sqlalchemy as sa

revision: str = "rwp37_installment_identity"
down_revision: str = "rwp33_grading_state"
branch_labels: None = None
depends_on: None = None


def upgrade() -> None:
    connection: sa.Connection = op.get_bind()
    connection.execute(sa.text("LOCK TABLE charges IN SHARE ROW EXCLUSIVE MODE"))
    duplicates: list[sa.Row[tuple[int, int, int]]] = list(connection.execute(sa.text(
        "SELECT enrollment_id, sequence_no, count(*) FROM charges "
        "WHERE is_deleted = false AND type = 'tuition' AND status != 'cancelled' "
        "GROUP BY enrollment_id, sequence_no HAVING count(*) > 1 "
        "ORDER BY enrollment_id, sequence_no LIMIT 20"
    )).all())
    if duplicates:
        raise RuntimeError(
            "Active tuition installment duplicates require explicit financial reconciliation before migration; "
            f"(enrollment_id, sequence_no, count), first 20: {duplicates}"
        )
    op.create_index(
        "uq_charges_active_tuition_installment",
        "charges",
        ["enrollment_id", "sequence_no"],
        unique=True,
        postgresql_where=sa.text("is_deleted = false AND type = 'tuition' AND status != 'cancelled'"),
    )


def downgrade() -> None:
    op.drop_index("uq_charges_active_tuition_installment", table_name="charges")
