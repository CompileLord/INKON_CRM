import app.models
from app.db.base import Base


class ResetTableCatalog:
    preserved_tables: frozenset[str] = frozenset({"org_settings", "cache_generations"})

    @classmethod
    def tables_to_truncate(cls) -> list[str]:
        return [table.name for table in Base.metadata.sorted_tables if table.name not in cls.preserved_tables]
