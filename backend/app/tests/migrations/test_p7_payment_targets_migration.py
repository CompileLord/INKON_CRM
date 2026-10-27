from pathlib import Path

from alembic.config import Config
from alembic.script import Script, ScriptDirectory


BACKEND_ROOT: Path = Path(__file__).resolve().parents[3]


def test_payment_targets_is_single_expand_only_head() -> None:
    script: ScriptDirectory = ScriptDirectory.from_config(Config(str(BACKEND_ROOT / 'alembic.ini')))
    revision: Script | None = script.get_revision('p7_payment_targets')
    assert revision is not None
    assert revision.down_revision == 'p4_enrollment_billing_mode'
    assert script.get_heads() == ['p7_payment_targets']
    source: str = (BACKEND_ROOT / 'alembic/versions/p7_payment_targets.py').read_text().split('def downgrade')[0]
    assert 'create_table' in source
    assert 'create_index' in source
    assert 'drop_' not in source
    assert 'alter_column' not in source
