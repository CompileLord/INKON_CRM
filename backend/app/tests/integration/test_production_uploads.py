import io
from pathlib import Path

import pytest
from fastapi import HTTPException, UploadFile
from PIL import Image
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.datastructures import Headers

from app.models.course import Course
from app.models.document import Document
from app.models.user import User
from app.services.course_service import CourseService
from app.services.document_service import DocumentService
from app.services.storage_service import LocalStorageService
from app.tests.integration.test_production_access import AccessFixtures


class TrackedUpload(UploadFile):
    def __init__(self, content: bytes, filename: str, content_type: str) -> None:
        super().__init__(file=io.BytesIO(content), filename=filename, headers=Headers({"content-type": content_type}))
        self.read_sizes: list[int] = []
        self.bytes_read: int = 0

    async def read(self, size: int = -1) -> bytes:
        assert 0 < size <= 64 * 1024, "Uploads must use bounded reads"
        self.read_sizes.append(size)
        content: bytes = await super().read(size)
        self.bytes_read += len(content)
        return content


@pytest.mark.asyncio
@pytest.mark.parametrize("kind,limit", [("document", 50 * 1024 * 1024), ("course", 5 * 1024 * 1024)])
@pytest.mark.parametrize("excess", [0, 1, 200_000])
async def test_upload_limit_reads_only_through_first_excess_byte(
    kind: str, limit: int, excess: int, db_session: AsyncSession,
    test_admin: User, test_student: User, test_mentor: User, tmp_path: Path,
) -> None:
    storage: LocalStorageService = LocalStorageService(str(tmp_path))
    course: Course = await AccessFixtures.course(db_session, test_mentor, "Upload boundary")
    await db_session.commit()
    prefix: bytes = b"%PDF-1.7\n"
    filename: str = "boundary.pdf"
    content_type: str = "application/pdf"
    if kind == "course":
        image_buffer: io.BytesIO = io.BytesIO()
        Image.new("RGB", (1, 1)).save(image_buffer, format="PNG")
        prefix = image_buffer.getvalue()
        filename = "boundary.png"
        content_type = "image/png"
    upload: TrackedUpload = TrackedUpload(prefix + b"x" * (limit + excess - len(prefix)), filename, content_type)
    document_service: DocumentService = DocumentService(db_session, storage)
    course_service: CourseService = CourseService(db_session, storage)
    result: Document | Course
    if excess:
        with pytest.raises(HTTPException) as exception:
            if kind == "document":
                await document_service.upload_document(upload, "student", test_student.id, None, test_admin)
            else:
                await course_service.upload_course_image(course.id, upload)
        assert exception.value.status_code == 413
        assert upload.bytes_read == limit + 1
        assert upload.read_sizes[-1] == 1
        assert list(tmp_path.rglob("*")) == []
    else:
        if kind == "document":
            result = await document_service.upload_document(upload, "student", test_student.id, None, test_admin)
            assert result.file_size == limit
            assert len(await storage.read(result.file_path)) == limit
        else:
            result = await course_service.upload_course_image(course.id, upload)
            assert result.photo_path is not None
            assert len(await storage.read(result.photo_path)) == limit
        assert upload.bytes_read == limit
        assert upload.read_sizes[-1] == 1
    await upload.close()
