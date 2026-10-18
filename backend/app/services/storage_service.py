import os
import errno
import re
import stat
from pathlib import PurePosixPath
from collections.abc import AsyncIterator, Callable
from typing import BinaryIO, Protocol
from uuid import uuid4

import anyio

from app.core.config import settings


STREAM_CHUNK_SIZE: int = 64 * 1024
PRIVATE_URL_TTL_SECONDS: int = 300


class StorageService(Protocol):
    def canonical_key(self, filepath: str) -> str: ...
    def new_key(self, entity_type: str, entity_id: int, filename: str) -> str: ...
    def validate_key(self, key: str) -> str: ...
    async def write_reserved(self, file_content: bytes, key: str) -> str: ...
    async def save(self, file_content: bytes, entity_type: str, entity_id: int, filename: str) -> str: ...
    async def get_url(self, filepath: str) -> str: ...
    async def read(self, filepath: str) -> bytes: ...
    def stream(self, filepath: str, chunk_size: int = STREAM_CHUNK_SIZE) -> AsyncIterator[bytes]: ...
    async def create_private_url(self, filepath: str, ttl_seconds: int = PRIVATE_URL_TTL_SECONDS) -> str | None: ...
    async def delete(self, filepath: str) -> bool: ...


class ObjectStoreClient(Protocol):
    async def put_object(self, key: str, content: bytes) -> None: ...
    async def get_object(self, key: str) -> bytes: ...
    def stream_object(self, key: str, chunk_size: int) -> AsyncIterator[bytes]: ...
    async def delete_object(self, key: str) -> bool: ...
    async def sign_url(self, key: str, ttl_seconds: int) -> str: ...


class StorageKeyPolicy:
    def canonical_key(self, filepath: str) -> str:
        key: str = filepath.removeprefix('/storage/').removeprefix('storage/')
        parts: tuple[str, ...] = PurePosixPath(key).parts
        if (len(key) > 246 or len(parts) != 3 or '/'.join(parts) != key
            or parts[0] not in ('student', 'mentor', 'avatar', 'course')
            or not parts[1].isascii() or not parts[1].isdecimal() or int(parts[1]) <= 0
            or str(int(parts[1])) != parts[1] or not re.fullmatch(r'[a-zA-Z0-9_.-]+', parts[2])
            or parts[2] in ('.', '..')):
            raise ValueError('Invalid storage key')
        return key

    def new_key(self, entity_type: str, entity_id: int, filename: str) -> str:
        suffix: str = os.path.splitext(filename)[1].lower()
        if not re.fullmatch(r'\.[a-z0-9]{1,12}', suffix):
            suffix = ''
        return self.canonical_key(f'{entity_type}/{entity_id}/{uuid4().hex}{suffix}')

    def validate_key(self, key: str) -> str:
        return self.canonical_key(key)


class LocalStorageService(StorageKeyPolicy):
    def __init__(self, storage_path: str = settings.STORAGE_PATH) -> None:
        self.storage_path: str = os.path.realpath(storage_path)

    def _get_absolute_path(self, filepath: str) -> str:
        key: str = self.canonical_key(filepath)
        path: str = os.path.join(self.storage_path, key)
        if os.path.realpath(path) != path:
            raise ValueError('Invalid storage path')
        return path

    def validate_key(self, key: str) -> str:
        self._get_absolute_path(key)
        return self.canonical_key(key)

    def _owner_directory(self, key: str, create: bool) -> int:
        parts: tuple[str, ...] = PurePosixPath(self.canonical_key(key)).parts
        if create:
            os.makedirs(self.storage_path, exist_ok=True)
        descriptor: int = os.open(self.storage_path, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
        try:
            component: str
            for component in parts[:2]:
                if create:
                    try:
                        os.mkdir(component, dir_fd=descriptor)
                    except FileExistsError:
                        pass
                    os.fsync(descriptor)
                child: int = os.open(component, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=descriptor)
                os.close(descriptor)
                descriptor = child
            return descriptor
        except BaseException as error:
            os.close(descriptor)
            if isinstance(error, OSError) and error.errno in (errno.ELOOP, errno.ENOTDIR):
                raise ValueError('Invalid storage path') from None
            raise

    def _write(self, key: str, content: bytes) -> None:
        directory: int = self._owner_directory(key, True)
        try:
            descriptor: int = os.open(PurePosixPath(key).name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600, dir_fd=directory)
            output: BinaryIO
            with os.fdopen(descriptor, 'wb') as output:
                output.write(content)
                output.flush()
                os.fsync(output.fileno())
            os.fsync(directory)
        finally:
            os.close(directory)

    async def write_reserved(self, file_content: bytes, key: str) -> str:
        canonical: str = self.canonical_key(key)
        await anyio.to_thread.run_sync(self._write, canonical, file_content)
        return f'/storage/{canonical}'

    async def save(self, file_content: bytes, entity_type: str, entity_id: int, filename: str) -> str:
        return await self.write_reserved(file_content, self.new_key(entity_type, entity_id, filename))

    async def get_url(self, filepath: str) -> str:
        return f'/storage/{self.canonical_key(filepath)}'

    def _open(self, key: str) -> BinaryIO:
        directory: int = self._owner_directory(key, False)
        try:
            try:
                descriptor: int = os.open(PurePosixPath(key).name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=directory)
            except OSError as error:
                if error.errno == errno.ELOOP:
                    raise ValueError('Invalid storage object') from None
                raise
            if not stat.S_ISREG(os.fstat(descriptor).st_mode):
                os.close(descriptor)
                raise ValueError('Invalid storage object')
            return os.fdopen(descriptor, 'rb')
        finally:
            os.close(directory)

    def _read(self, key: str) -> bytes:
        source: BinaryIO
        with self._open(key) as source:
            return source.read()

    async def read(self, filepath: str) -> bytes:
        return await anyio.to_thread.run_sync(self._read, self.canonical_key(filepath))

    async def stream(self, filepath: str, chunk_size: int = STREAM_CHUNK_SIZE) -> AsyncIterator[bytes]:
        source: BinaryIO = await anyio.to_thread.run_sync(self._open, self.canonical_key(filepath))
        try:
            while True:
                chunk: bytes = await anyio.to_thread.run_sync(source.read, chunk_size)
                if not chunk:
                    return
                yield chunk
        finally:
            await anyio.to_thread.run_sync(source.close)

    async def create_private_url(self, filepath: str, ttl_seconds: int = PRIVATE_URL_TTL_SECONDS) -> str | None:
        self.canonical_key(filepath)
        return None

    def _delete(self, key: str) -> bool:
        try:
            directory: int = self._owner_directory(key, False)
        except FileNotFoundError:
            return False
        try:
            name: str = PurePosixPath(key).name
            try:
                metadata: os.stat_result = os.stat(name, dir_fd=directory, follow_symlinks=False)
            except FileNotFoundError:
                return False
            if not stat.S_ISREG(metadata.st_mode):
                raise ValueError('Invalid storage object')
            os.unlink(name, dir_fd=directory)
            os.fsync(directory)
            return True
        finally:
            os.close(directory)

    async def delete(self, filepath: str) -> bool:
        return await anyio.to_thread.run_sync(self._delete, self.canonical_key(filepath))


class ObjectStorageService(StorageKeyPolicy):
    def __init__(self, client: ObjectStoreClient) -> None:
        self.client: ObjectStoreClient = client

    async def write_reserved(self, file_content: bytes, key: str) -> str:
        canonical: str = self.canonical_key(key)
        await self.client.put_object(canonical, file_content)
        return f'/storage/{canonical}'

    async def save(self, file_content: bytes, entity_type: str, entity_id: int, filename: str) -> str:
        return await self.write_reserved(file_content, self.new_key(entity_type, entity_id, filename))

    async def get_url(self, filepath: str) -> str:
        return f'/storage/{self.canonical_key(filepath)}'

    async def read(self, filepath: str) -> bytes:
        return await self.client.get_object(self.canonical_key(filepath))

    async def stream(self, filepath: str, chunk_size: int = STREAM_CHUNK_SIZE) -> AsyncIterator[bytes]:
        chunk: bytes
        async for chunk in self.client.stream_object(self.canonical_key(filepath), chunk_size):
            yield chunk

    async def create_private_url(self, filepath: str, ttl_seconds: int = PRIVATE_URL_TTL_SECONDS) -> str | None:
        return await self.client.sign_url(self.canonical_key(filepath), ttl_seconds)

    async def delete(self, filepath: str) -> bool:
        return await self.client.delete_object(self.canonical_key(filepath))


class StorageBackendRegistry:
    def __init__(self) -> None:
        self.factories: dict[str, Callable[[], StorageService]] = {'local': LocalStorageService}

    def register(self, name: str, factory: Callable[[], StorageService]) -> None:
        self.factories[name] = factory

    def unregister(self, name: str) -> None:
        self.factories.pop(name, None)

    def resolve(self, name: str) -> StorageService:
        factory: Callable[[], StorageService] | None = self.factories.get(name)
        if factory is None:
            raise RuntimeError(f'Storage backend {name} is not registered')
        return factory()


storage_backends: StorageBackendRegistry = StorageBackendRegistry()


def get_storage_service() -> StorageService:
    return storage_backends.resolve(settings.STORAGE_BACKEND)
