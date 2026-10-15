import os
from datetime import timedelta
from typing import TYPE_CHECKING, Protocol
from urllib.parse import unquote, urlparse
from app.core.config import settings

if TYPE_CHECKING:
    from google.cloud.storage.bucket import Bucket


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

    @staticmethod
    def _bucket_uses_uniform_access(bucket: "Bucket") -> bool:
        bucket.reload()
        iam_configuration = bucket.iam_configuration
        uniform_access = bool(iam_configuration.uniform_bucket_level_access_enabled)
        public_access_prevention = getattr(iam_configuration, "public_access_prevention", None)
        if public_access_prevention != "enforced":
            raise PermissionError("Private documents require enforced public access prevention.")
        policy = bucket.get_iam_policy(requested_policy_version=3)
        has_public_iam_binding = any(
            member in {"allUsers", "allAuthenticatedUsers"}
            for binding in policy.bindings
            for member in binding.get("members", [])
        )
        if has_public_iam_binding:
            raise PermissionError("Private documents cannot use a publicly readable bucket.")
        return uniform_access

    def _sync_save(self, file_content: bytes, blob_name: str, is_private: bool) -> None:
        bucket = self._get_bucket()
        uniform_access = self._bucket_uses_uniform_access(bucket) if is_private else False
        blob = bucket.blob(blob_name)
        blob.cache_control = "private, no-store" if is_private else "public, max-age=86400"
        blob.upload_from_string(
            file_content,
            predefined_acl="private" if is_private and not uniform_access else None,
        )

    def _blob_name(self, filepath: str) -> str:
        if filepath.startswith("gs://"):
            parsed_path = urlparse(filepath)
            if parsed_path.netloc != self.bucket_name:
                raise ValueError("Storage object belongs to a different bucket.")
            return unquote(parsed_path.path.lstrip("/"))
        if filepath.startswith(("https://", "http://")):
            parsed_path = urlparse(filepath)
            path_segments = unquote(parsed_path.path).lstrip("/").split("/", 1)
            if parsed_path.hostname != "storage.googleapis.com" or not path_segments:
                raise ValueError("Unsupported storage object URL.")
            if path_segments[0] != self.bucket_name or len(path_segments) != 2:
                raise ValueError("Storage object belongs to a different bucket.")
            return path_segments[1]
        normalized_path = filepath.removeprefix("/storage/").removeprefix("storage/").lstrip("/")
        return normalized_path

    @staticmethod
    def _is_local_storage_path(filepath: str) -> bool:
        return filepath.startswith(("/storage/", "storage/"))

    def _sync_read(self, blob_name: str) -> bytes:
        from google.api_core.exceptions import NotFound

        bucket = self._get_bucket()
        uniform_access = self._bucket_uses_uniform_access(bucket)
        blob = bucket.blob(blob_name)
        try:
            if not uniform_access:
                blob.acl.reload()
                public_acl_entities = {"allUsers", "allAuthenticatedUsers"}.intersection(
                    str(entity) for entity in blob.acl.get_entities()
                )
                if public_acl_entities:
                    raise PermissionError("Private document has a public object ACL.")
            return blob.download_as_bytes()
        except NotFound as exception:
            raise FileNotFoundError(blob_name) from exception

    def _sync_signed_url(self, blob_name: str) -> str:
        blob = self._get_bucket().blob(blob_name)
        return blob.generate_signed_url(expiration=timedelta(minutes=5), method="GET")

    def _sync_delete(self, blob_name: str) -> bool:
        bucket = self._get_bucket()
        blob = bucket.blob(blob_name)
        if blob.exists():
            blob.delete()
            return True
        return False

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
        is_private = entity_type in {"student", "mentor"}
        await asyncio.to_thread(self._sync_save, file_content, blob_name, is_private)
        if is_private:
            return f"gs://{self.bucket_name}/{blob_name}"
        return f"https://storage.googleapis.com/{self.bucket_name}/{blob_name}"

    async def get_url(self, filepath: str) -> str:
        import asyncio

        if self._is_local_storage_path(filepath):
            raise ValueError("Local private documents require the authenticated download route.")
        if filepath.startswith(("https://", "http://")) and urlparse(filepath).hostname != "storage.googleapis.com":
            return filepath
        blob_name = self._blob_name(filepath)
        if blob_name.startswith(("avatar/", "course/")):
            return f"https://storage.googleapis.com/{self.bucket_name}/{blob_name}"
        return await asyncio.to_thread(self._sync_signed_url, blob_name)

    async def read(self, filepath: str) -> bytes:
        import asyncio

        if self._is_local_storage_path(filepath):
            return await LocalStorageService().read(filepath)
        return await asyncio.to_thread(self._sync_read, self._blob_name(filepath))

    async def delete(self, filepath: str) -> bool:
        import asyncio
        if self._is_local_storage_path(filepath):
            return await LocalStorageService().delete(filepath)
        try:
            blob_name = self._blob_name(filepath)
        except ValueError:
            return False
        return await asyncio.to_thread(self._sync_delete, blob_name)


def get_storage_service() -> StorageService:
    if settings.GCS_BUCKET_NAME:
        return GoogleCloudStorageService(bucket_name=settings.GCS_BUCKET_NAME)
    return LocalStorageService()

