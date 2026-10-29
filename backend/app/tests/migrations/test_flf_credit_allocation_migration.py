from pathlib import Path
from alembic.config import Config
from alembic.script import ScriptDirectory


def test_flf_is_single_expand_only_head() -> None:
    root: Path = Path(__file__).resolve().parents[3]
    script: ScriptDirectory = ScriptDirectory.from_config(Config(str(root / 'alembic.ini')))
    assert script.get_revision('flf_credit_allocation').down_revision == 'p10_notification_retry'
    source: str = (root / 'alembic/versions/flf_credit_allocation.py').read_text()
    upgrade: str = source.split('def downgrade')[0]
    assert 'create_table' in upgrade and 'dispatched_amount' in upgrade
    assert 'drop_' not in upgrade and 'alter_column' not in upgrade
