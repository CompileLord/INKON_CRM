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
        self.storage_path = os.path.abspath(storage_path)

    def _get_absolute_path(self, filepath: str) -> str:
        rel_path = filepath
        if rel_path.startswith("/storage/"):
            rel_path = rel_path[len("/storage/"):]
        elif rel_path.startswith("storage/"):
            rel_path = rel_path[len("storage/"):]
        resolved_path = os.path.abspath(os.path.join(self.storage_path, rel_path))
        if not resolved_path.startswith(self.storage_path + os.sep) and resolved_path != self.storage_path:
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
