from fastapi import HTTPException, UploadFile, status


class BoundedUploadReader:
    chunk_size: int = 64 * 1024

    async def read(self, file: UploadFile, maximum_bytes: int, error_detail: str) -> bytes:
        content: bytearray = bytearray()
        chunk: bytes
        while chunk := await file.read(min(self.chunk_size, maximum_bytes + 1 - len(content))):
            content.extend(chunk)
            if len(content) > maximum_bytes:
                raise HTTPException(status.HTTP_413_CONTENT_TOO_LARGE, error_detail)
        return bytes(content)
