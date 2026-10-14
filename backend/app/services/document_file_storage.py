from pathlib import Path
from uuid import uuid4

from app.core.config import settings
from app.services.storage_service import LocalStorageService


class LocalDocumentFileStorage(LocalStorageService):
    def __init__(self, storage_path: str = settings.STORAGE_PATH) -> None:
        super().__init__(storage_path)
        self.document_root: Path = Path(self.storage_path).resolve()

    def resolve_document_path(self, file_path: str, owner_type: str, owner_id: int) -> Path:
        if owner_type not in ("student", "mentor") or owner_id <= 0:
            raise ValueError("Invalid document owner")
        relative_path: str = file_path.removeprefix("/storage/").removeprefix("storage/")
        candidate: Path = Path(relative_path)
        if candidate.is_absolute() or ".." in candidate.parts:
            raise ValueError("Invalid document path")
        owner_root: Path = self.document_root / owner_type / str(owner_id)
        resolved: Path = (self.document_root / candidate).resolve(strict=True)
        if not resolved.is_relative_to(owner_root) or not resolved.is_file():
            raise ValueError("Invalid document path")
        return resolved

    async def save(self, file_content: bytes, entity_type: str, entity_id: int, filename: str) -> str:
        if entity_type not in ("student", "mentor") or entity_id <= 0:
            raise ValueError("Invalid document owner")
        owner_root: Path = self.document_root / entity_type / str(entity_id)
        if owner_root.resolve() != owner_root:
            raise ValueError("Invalid document storage directory")
        owner_root.mkdir(parents=True, exist_ok=True)
        if owner_root.resolve() != owner_root:
            raise ValueError("Invalid document storage directory")
        stored_filename: str = uuid4().hex
        return await super().save(file_content, entity_type, entity_id, stored_filename)
