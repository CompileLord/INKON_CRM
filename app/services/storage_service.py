import os
from typing import Protocol
from app.core.config import settings


class StorageService(Protocol):
    async def save(self, file_content: bytes, entity_type: str, entity_id: int, filename: str) -> str:
        ...

    async def get_url(self, filepath: str) -> str:
        ...

    async def delete(self, filepath: str) -> bool:
        ...


class LocalStorageService:
    def __init__(self, storage_path: str = settings.STORAGE_PATH) -> None:
        self.storage_path = storage_path

    def _get_absolute_path(self, filepath: str) -> str:
        rel_path = filepath
        if rel_path.startswith("/storage/"):
            rel_path = rel_path[len("/storage/"):]
        elif rel_path.startswith("storage/"):
            rel_path = rel_path[len("storage/"):]
        return os.path.join(self.storage_path, rel_path)

    async def save(self, file_content: bytes, entity_type: str, entity_id: int, filename: str) -> str:
        import anyio
        target_dir = os.path.join(self.storage_path, entity_type, str(entity_id))
        os.makedirs(target_dir, exist_ok=True)
        filepath = os.path.join(target_dir, filename)

        path = anyio.Path(filepath)
        await path.write_bytes(file_content)

        return f"/storage/{entity_type}/{entity_id}/{filename}"

    async def get_url(self, filepath: str) -> str:
        if filepath.startswith("/storage/"):
            return filepath
        if filepath.startswith("storage/"):
            return "/" + filepath
        return f"/storage/{filepath}"

    async def delete(self, filepath: str) -> bool:
        import anyio
        abs_path = self._get_absolute_path(filepath)
        path = anyio.Path(abs_path)
        if await path.exists():
            await path.unlink()
            return True
        return False
