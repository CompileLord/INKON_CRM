import os
from typing import Protocol
from app.core.config import settings


class StorageService(Protocol):
    async def save(self, file_content: bytes, entity_type: str, entity_id: int, filename: str) -> str:
        ...

    async def get_url(self, filepath: str) -> str:
        ...

    async def read(self, filepath: str) -> bytes:
        ...

    async def delete(self, filepath: str) -> bool:
        ...


class LocalStorageService:
    def __init__(self, storage_path: str = settings.STORAGE_PATH) -> None:
        self.storage_path = os.path.abspath(storage_path)

    def _get_absolute_path(self, filepath: str) -> str:
        rel_path = filepath
        if rel_path.startswith("/storage/"):
            rel_path = rel_path[len("/storage/"):]
        elif rel_path.startswith("storage/"):
            rel_path = rel_path[len("storage/"):]
        storage_root = os.path.realpath(self.storage_path)
        resolved_path = os.path.realpath(os.path.join(storage_root, rel_path))
        if os.path.commonpath((storage_root, resolved_path)) != storage_root or resolved_path == storage_root:
            raise ValueError("Access denied: path traversal attempt detected.")
        return resolved_path

    async def save(self, file_content: bytes, entity_type: str, entity_id: int, filename: str) -> str:
        import anyio
        import re
        import uuid
        from fastapi import HTTPException, status

        # Sanitize parameters to prevent traversal
        entity_type = re.sub(r'[^a-zA-Z0-9_-]', '', entity_type)
        
        # Get only the basename to strip any path components
        filename = os.path.basename(filename)
        filename = re.sub(r'[^a-zA-Z0-9_.-]', '', filename)
        if not filename or filename in ('.', '..'):
            filename = f"file_{uuid.uuid4().hex}"

        target_dir = os.path.abspath(os.path.join(self.storage_path, entity_type, str(entity_id)))
        os.makedirs(target_dir, exist_ok=True)
        
        filepath = os.path.abspath(os.path.join(target_dir, filename))
        
        # Verify resolved path is strictly within the target directory
        if not filepath.startswith(target_dir + os.sep) and filepath != target_dir:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid file path structure"
            )

        path = anyio.Path(filepath)
        await path.write_bytes(file_content)

        return f"/storage/{entity_type}/{entity_id}/{filename}"

    async def get_url(self, filepath: str) -> str:
        if filepath.startswith("/storage/"):
            return filepath
        if filepath.startswith("storage/"):
            return "/" + filepath
        return f"/storage/{filepath}"

    async def read(self, filepath: str) -> bytes:
        import anyio

        absolute_path = self._get_absolute_path(filepath)
        path = anyio.Path(absolute_path)
        if not await path.is_file():
            raise FileNotFoundError(absolute_path)
        return await path.read_bytes()

    async def delete(self, filepath: str) -> bool:
        import anyio
        try:
            abs_path = self._get_absolute_path(filepath)
            path = anyio.Path(abs_path)
            if await path.exists():
                await path.unlink()
                return True
        except ValueError:
            pass
        return False


def get_storage_service() -> StorageService:
    return LocalStorageService()

