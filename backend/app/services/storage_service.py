import os
import secrets
from pathlib import Path
from typing import Protocol
from app.core.config import settings


class StorageService(Protocol):
    async def save(self, file_content: bytes, entity_type: str, entity_id: int, filename: str) -> str:
        ...

    async def get_url(self, filepath: str) -> str:
        ...

    async def read(self, filepath: str) -> bytes | None:
        ...

    async def delete(self, filepath: str) -> bool:
        ...


class LocalStorageService:
    def __init__(self, storage_path: str = settings.STORAGE_PATH) -> None:
        self.storage_path = Path(storage_path).resolve()

    def _get_absolute_path(self, filepath: str) -> Path:
        rel_path = filepath
        if rel_path.startswith("/storage/"):
            rel_path = rel_path[len("/storage/"):]
        elif rel_path.startswith("storage/"):
            rel_path = rel_path[len("storage/"):]
        resolved_path = (self.storage_path / rel_path).resolve()
        if self.storage_path not in resolved_path.parents:
            raise ValueError("Access denied: path traversal attempt detected.")
        return resolved_path

    def _safe_storage_directory(self, entity_type: str, entity_id: int) -> Path:
        storage_directory = self.storage_path / entity_type / str(entity_id)
        storage_directory.mkdir(parents=True, exist_ok=True)
        resolved_directory = storage_directory.resolve(strict=True)
        if self.storage_path not in resolved_directory.parents:
            raise ValueError("Access denied: storage directory escapes the storage root.")
        return resolved_directory

    def _write_exclusive(self, filepath: Path, file_content: bytes) -> None:
        file_descriptor = os.open(filepath, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
        with os.fdopen(file_descriptor, "wb") as target_file:
            target_file.write(file_content)

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

        try:
            target_directory = self._safe_storage_directory(entity_type, entity_id)
        except ValueError as error:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid file path structure"
            ) from error

        filepath = (target_directory / filename).resolve()
        if target_directory not in filepath.parents:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid file path structure"
            )

        path = anyio.Path(filepath)
        await path.write_bytes(file_content)

        return f"/storage/{entity_type}/{entity_id}/{filename}"

    async def save_unique(self, file_content: bytes, entity_type: str, entity_id: int) -> str:
        import anyio
        import re

        sanitized_entity_type = re.sub(r"[^a-zA-Z0-9_-]", "", entity_type)
        if not sanitized_entity_type or entity_id < 1:
            raise ValueError("Invalid storage owner")
        target_directory = self._safe_storage_directory(sanitized_entity_type, entity_id)
        while True:
            filename = secrets.token_hex(16)
            filepath = target_directory / filename
            try:
                await anyio.to_thread.run_sync(self._write_exclusive, filepath, file_content)
                return f"/storage/{sanitized_entity_type}/{entity_id}/{filename}"
            except FileExistsError:
                continue

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
            path = anyio.Path(str(abs_path))
            if await path.exists():
                await path.unlink()
                return True
        except ValueError:
            pass
        return False

    async def read(self, filepath: str) -> bytes | None:
        import anyio

        try:
            resolved_path = self._get_absolute_path(filepath)
            if not resolved_path.is_file():
                return None
            return await anyio.Path(str(resolved_path)).read_bytes()
        except (OSError, ValueError):
            return None


class GoogleCloudStorageService:
    def __init__(self, bucket_name: str) -> None:
        self.bucket_name = bucket_name
        self._client = None
        self._bucket = None

    def _get_bucket(self):
        if self._bucket is None:
            from google.cloud import storage
            self._client = storage.Client()
            self._bucket = self._client.bucket(self.bucket_name)
        return self._bucket

    def _sync_save(self, file_content: bytes, blob_name: str) -> None:
        bucket = self._get_bucket()
        blob = bucket.blob(blob_name)
        blob.upload_from_string(file_content)

    def _sync_delete(self, blob_name: str) -> bool:
        bucket = self._get_bucket()
        blob = bucket.blob(blob_name)
        if blob.exists():
            blob.delete()
            return True
        return False

    def _sync_read(self, blob_name: str) -> bytes | None:
        blob = self._get_bucket().blob(blob_name)
        if not blob.exists():
            return None
        return blob.download_as_bytes()

    async def save(self, file_content: bytes, entity_type: str, entity_id: int, filename: str) -> str:
        import asyncio
        import re
        import uuid
        entity_type = re.sub(r'[^a-zA-Z0-9_-]', '', entity_type)
        filename = os.path.basename(filename)
        filename = re.sub(r'[^a-zA-Z0-9_.-]', '', filename)
        if not filename or filename in ('.', '..'):
            filename = f"file_{uuid.uuid4().hex}"
        blob_name = f"{entity_type}/{entity_id}/{filename}"
        await asyncio.to_thread(self._sync_save, file_content, blob_name)
        return f"https://storage.googleapis.com/{self.bucket_name}/{blob_name}"

    async def get_url(self, filepath: str) -> str:
        if filepath.startswith("https://") or filepath.startswith("http://"):
            return filepath
        blob_name = filepath.lstrip("/")
        return f"https://storage.googleapis.com/{self.bucket_name}/{blob_name}"

    async def delete(self, filepath: str) -> bool:
        import asyncio
        blob_name = filepath
        prefix = f"https://storage.googleapis.com/{self.bucket_name}/"
        if blob_name.startswith(prefix):
            blob_name = blob_name[len(prefix):]
        blob_name = blob_name.lstrip("/")
        return await asyncio.to_thread(self._sync_delete, blob_name)

    async def read(self, filepath: str) -> bytes | None:
        import asyncio

        prefix = f"https://storage.googleapis.com/{self.bucket_name}/"
        if not filepath.startswith(prefix):
            return None
        blob_name = filepath[len(prefix):]
        if not blob_name or any(part in {"", ".", ".."} for part in blob_name.split("/")):
            return None
        return await asyncio.to_thread(self._sync_read, blob_name)


def get_storage_service() -> StorageService:
    if settings.GCS_BUCKET_NAME:
        return GoogleCloudStorageService(bucket_name=settings.GCS_BUCKET_NAME)
    return LocalStorageService()

