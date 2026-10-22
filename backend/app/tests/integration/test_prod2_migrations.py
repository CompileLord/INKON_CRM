import importlib.util
from pathlib import Path
from types import ModuleType
from typing import Any
from unittest.mock import MagicMock

import pytest


class TestQueueDowngradeGuards:
    @pytest.mark.parametrize("filename,table", [
        ("fin1a_debt_reminder_notifications.py", "debt_reminder_notifications"),
        ("be3_exam_result_notifications.py", "exam_result_notifications"),
    ])
    @pytest.mark.parametrize("outstanding_count", [0, 1, 2])
    def test_downgrade_locks_then_refuses_outstanding_work(
        self, monkeypatch: pytest.MonkeyPatch, filename: str, table: str, outstanding_count: int,
    ) -> None:
        path: Path = Path(__file__).parents[3] / "alembic" / "versions" / filename
        specification: Any = importlib.util.spec_from_file_location("prod2_queue_migration", path)
        migration: ModuleType = importlib.util.module_from_spec(specification)
        specification.loader.exec_module(migration)
        operations: MagicMock = MagicMock()
        connection: MagicMock = operations.get_bind.return_value
        connection.scalar.return_value = outstanding_count
        monkeypatch.setattr(migration, "op", operations)
        if outstanding_count:
            with pytest.raises(RuntimeError, match="pending or claimed"):
                migration.downgrade()
            operations.drop_table.assert_not_called()
            operations.drop_index.assert_not_called()
        else:
            migration.downgrade()
            operations.drop_table.assert_called_once_with(table)
        assert str(connection.execute.call_args.args[0]) == f"LOCK TABLE {table} IN ACCESS EXCLUSIVE MODE"
        assert str(connection.scalar.call_args.args[0]) == f"SELECT count(*) FROM {table} WHERE status IN ('pending', 'claimed')"
