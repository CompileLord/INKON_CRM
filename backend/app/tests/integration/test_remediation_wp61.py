import asyncio
import io
import struct
import threading
import time
import zlib
from collections.abc import Callable
from typing import Any

import pytest
from fastapi import HTTPException, UploadFile
from PIL import Image, ImageFile
from httpx import AsyncClient, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User
from app.services.storage_service import LocalStorageService
from app.services.user_service import UserService
from app.workers.storage_cleanup import StorageCleanupWorker


class RecordingUpload(UploadFile):
    def __init__(self, content: bytes) -> None:
        super().__init__(file=io.BytesIO(content), filename="avatar.png")
        self.read_sizes: list[int] = []

    async def read(self, size: int = -1) -> bytes:
        self.read_sizes.append(size)
        return await super().read(size)


class AvatarSamples:
    @staticmethod
    def image(format_name: str = "PNG", size: tuple[int, int] = (640, 320)) -> bytes:
        output: io.BytesIO = io.BytesIO()
        image: Image.Image
        with Image.new("RGB", size, "blue") as image:
            image.save(output, format=format_name)
        return output.getvalue()

    @staticmethod
    def oversized_header(width: int, height: int) -> bytes:
        header: bytes = b"IHDR" + struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
        return (b"\x89PNG\r\n\x1a\n" + struct.pack(">I", 13) + header
                + struct.pack(">I", zlib.crc32(header)) + AvatarSamples.image(size=(1, 1))[33:])


@pytest.mark.asyncio
async def test_upload_read_is_bounded(db_session: AsyncSession, test_student: User) -> None:
    upload: RecordingUpload = RecordingUpload(b"x" * (5 * 1024 * 1024 + 100))
    failure: pytest.ExceptionInfo[HTTPException]
    with pytest.raises(HTTPException) as failure:
        await UserService(db_session).upload_avatar(test_student.id, upload)
    assert failure.value.status_code == 413
    assert upload.read_sizes
    assert all(0 < size <= 5 * 1024 * 1024 + 1 for size in upload.read_sizes)
    assert upload.file.tell() <= 5 * 1024 * 1024 + 1


@pytest.mark.asyncio
@pytest.mark.parametrize("content", [
    b"", b"invalid", AvatarSamples.image()[:-20],
    AvatarSamples.image("JPEG")[:300], AvatarSamples.image("JPEG")[:-2],
])
async def test_invalid_or_truncated_images_are_rejected(
    db_session: AsyncSession, test_student: User, content: bytes,
) -> None:
    failure: pytest.ExceptionInfo[HTTPException]
    with pytest.raises(HTTPException) as failure:
        await UserService(db_session).upload_avatar(test_student.id, RecordingUpload(content))
    assert failure.value.status_code == 400
    stored: User | None = await db_session.get(User, test_student.id)
    assert stored is not None
    assert stored.photo_path is None
    assert stored.thumbnail_path is None


@pytest.mark.asyncio
@pytest.mark.parametrize("size", [(4097, 1), (4096, 4096), (100000, 100000)])
async def test_dimensions_and_pixels_rejected_before_decode(
    db_session: AsyncSession, test_student: User, monkeypatch: pytest.MonkeyPatch, size: tuple[int, int],
) -> None:
    content: bytes = (AvatarSamples.oversized_header(*size) if size[0] == 100000
                      else AvatarSamples.image(size=size))
    decode_calls: list[tuple[int, int]] = []
    original_load: Callable[..., Any] = Image.Image.load

    def recording_load(image: Image.Image, *args: Any, **kwargs: Any) -> Any:
        decode_calls.append(image.size)
        return original_load(image, *args, **kwargs)

    monkeypatch.setattr(Image.Image, "load", recording_load)
    failure: pytest.ExceptionInfo[HTTPException]
    with pytest.raises(HTTPException) as failure:
        await UserService(db_session).upload_avatar(test_student.id, RecordingUpload(content))
    assert failure.value.status_code == 400
    assert decode_calls == []


@pytest.mark.asyncio
@pytest.mark.parametrize("format_name", ["PNG", "JPEG"])
async def test_one_offloaded_resize_reused_and_replacement_cleanup(
    db_session: AsyncSession, test_student: User, monkeypatch: pytest.MonkeyPatch, format_name: str,
) -> None:
    storage: LocalStorageService = LocalStorageService()
    service: UserService = UserService(db_session, storage)
    resize_threads: list[int] = []
    original_thumbnail: Callable[..., Any] = Image.Image.thumbnail
    loop_thread: int = threading.get_ident()

    def recording_thumbnail(image: Image.Image, *args: Any, **kwargs: Any) -> Any:
        resize_threads.append(threading.get_ident())
        return original_thumbnail(image, *args, **kwargs)

    monkeypatch.setattr(Image.Image, "thumbnail", recording_thumbnail)
    updated: User = await service.upload_avatar(test_student.id, RecordingUpload(AvatarSamples.image(format_name)))
    assert len(resize_threads) == 1
    assert resize_threads[0] != loop_thread
    first_photo: str = updated.photo_path or ""
    first_thumbnail: str = updated.thumbnail_path or ""
    photo: bytes = await storage.read(first_photo)
    assert photo == await storage.read(first_thumbnail)
    decoded: Image.Image
    with Image.open(io.BytesIO(photo)) as decoded:
        assert decoded.size == (200, 100)
        assert decoded.format == format_name
    await db_session.commit()
    await service.upload_avatar(test_student.id, RecordingUpload(AvatarSamples.image(format_name, (80, 40))))
    await db_session.commit()
    assert await StorageCleanupWorker().run_once() == 2
    with pytest.raises(FileNotFoundError):
        await storage.read(first_photo)
    with pytest.raises(FileNotFoundError):
        await storage.read(first_thumbnail)
    with Image.open(io.BytesIO(await storage.read(updated.photo_path or ""))) as decoded:
        assert decoded.size == (80, 40)


@pytest.mark.asyncio
async def test_unsupported_format_rejected(db_session: AsyncSession, test_student: User) -> None:
    failure: pytest.ExceptionInfo[HTTPException]
    with pytest.raises(HTTPException) as failure:
        await UserService(db_session).upload_avatar(test_student.id, RecordingUpload(AvatarSamples.image("GIF")))
    assert failure.value.status_code == 400
    assert failure.value.detail == "Unsupported image format. PNG or JPEG only."


@pytest.mark.asyncio
async def test_cpu_work_is_bounded_and_heartbeat_responsive(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.services.user_service import AvatarTransformationService

    active: int = 0
    peak: int = 0
    lock: Any = threading.Lock()
    release: threading.Event = threading.Event()
    entered: threading.Event = threading.Event()
    original_thumbnail: Callable[..., Any] = Image.Image.thumbnail

    def blocking_thumbnail(image: Image.Image, *args: Any, **kwargs: Any) -> Any:
        nonlocal active, peak
        with lock:
            active += 1
            peak = max(peak, active)
            if active == 2:
                entered.set()
        try:
            assert release.wait(timeout=5)
            return original_thumbnail(image, *args, **kwargs)
        finally:
            with lock:
                active -= 1

    monkeypatch.setattr(Image.Image, "thumbnail", blocking_thumbnail)
    _: int
    uploads: list[RecordingUpload] = [RecordingUpload(AvatarSamples.image()) for _ in range(6)]
    upload: RecordingUpload
    tasks: list[asyncio.Task[tuple[bytes, str]]] = [
        asyncio.create_task(AvatarTransformationService().transform(upload)) for upload in uploads
    ]
    deadline: float = time.monotonic() + 3
    ticks: int = 0
    try:
        while not entered.is_set() and time.monotonic() < deadline:
            await asyncio.sleep(0.005)
            ticks += 1
        assert entered.is_set()
        await asyncio.sleep(0.03)
        assert peak == 2
        assert sum(bool(upload.read_sizes) for upload in uploads) == 2
        assert ticks > 0
        tasks[0].cancel()
        with pytest.raises(asyncio.CancelledError):
            await tasks[0]
        await asyncio.sleep(0.03)
        assert sum(bool(upload.read_sizes) for upload in uploads) == 2
    finally:
        release.set()
        await asyncio.gather(*tasks, return_exceptions=True)
    task: asyncio.Task[tuple[bytes, str]]
    assert all(task.cancelled() or task.exception() is None for task in tasks)
    assert tasks[0].cancelled()
    assert peak == 2


@pytest.mark.asyncio
async def test_concurrent_upload_measurements(monkeypatch: pytest.MonkeyPatch, client: AsyncClient) -> None:
    import json
    import resource
    from app.models.user import UserRole
    from app.tests.conftest import TestingSessionLocal

    content: bytes = AvatarSamples.image(size=(2048, 1024))
    measurements: list[dict[str, Any]] = []
    resize_count: int = 0
    resize_input_pixels: int = 0
    decoded_pixels: int = 0
    original_load: Callable[..., Any] = ImageFile.ImageFile.load
    counter_lock: Any = threading.Lock()
    original_thumbnail: Callable[..., Any] = Image.Image.thumbnail

    def measured_thumbnail(image: Image.Image, *args: Any, **kwargs: Any) -> Any:
        nonlocal resize_count, resize_input_pixels
        with counter_lock:
            resize_count += 1
            resize_input_pixels += image.width * image.height
        return original_thumbnail(image, *args, **kwargs)

    def measured_load(image: ImageFile.ImageFile, *args: Any, **kwargs: Any) -> Any:
        nonlocal decoded_pixels
        if image.fp is not None:
            with counter_lock:
                decoded_pixels += image.width * image.height
        return original_load(image, *args, **kwargs)

    monkeypatch.setattr(ImageFile.ImageFile, "load", measured_load)
    monkeypatch.setattr(Image.Image, "thumbnail", measured_thumbnail)

    async def upload(user_id: int) -> float:
        session: AsyncSession
        started: float = time.perf_counter()
        async with TestingSessionLocal() as session:
            await UserService(session).upload_avatar(user_id, RecordingUpload(content))
            await session.commit()
        return time.perf_counter() - started

    trial: int
    for trial in range(3):
        session: AsyncSession
        async with TestingSessionLocal() as session:
            index: int
            users: list[User] = [User(email=f"wp61-{trial}-{index}@example.com", first_name="Avatar",
                last_name="Measurement", role=UserRole.STUDENT) for index in range(4)]
            session.add_all(users)
            await session.commit()
        user: User
        tasks: list[asyncio.Task[float]] = [asyncio.create_task(upload(user.id)) for user in users]
        loop_delays: list[float] = []
        health_durations: list[float] = []
        while not all(task.done() for task in tasks):
            started: float = time.perf_counter()
            await asyncio.sleep(0.001)
            loop_delays.append(max(0.0, time.perf_counter() - started - 0.001))
            started = time.perf_counter()
            response: Response = await client.get("/health")
            health_durations.append(time.perf_counter() - started)
            assert response.status_code == 200
        durations: list[float] = await asyncio.gather(*tasks)
        ordered_delays: list[float] = sorted(loop_delays)
        ordered_health: list[float] = sorted(health_durations)
        measurements.append({"trial": trial, "upload_seconds": durations,
            "loop_lag_max_seconds": max(loop_delays),
            "unrelated_timer_p95_seconds": ordered_delays[int(0.95 * (len(ordered_delays) - 1))] + 0.001,
            "unrelated_health_p95_seconds": ordered_health[int(0.95 * (len(ordered_health) - 1))],
            "health_probe_count": len(ordered_health),
            "process_peak_rss_kib": resource.getrusage(resource.RUSAGE_SELF).ru_maxrss})
    print(json.dumps({"dataset": "PNG 2048x1024 solid RGB", "concurrency": 4,
        "resize_count": resize_count, "resize_input_pixels": resize_input_pixels,
        "decoded_pixels": decoded_pixels, "trials": measurements}))
    assert resize_count == 12
