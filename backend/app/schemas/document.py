from datetime import datetime
from typing import Any, Optional
from pydantic import BaseModel, model_validator
from app.core.config import settings
from app.models.document import DocumentOwnerType


class DocumentResponse(BaseModel):
    id: int
    owner_type: DocumentOwnerType
    owner_id: int
    journal_id: Optional[int]
    file_path: str
    file_name: str
    file_type: str
    file_size: int
    uploaded_by_id: int
    uploaded_at: datetime
    is_deleted: bool

    @model_validator(mode="before")
    @classmethod
    def hide_google_storage_path(cls, value: Any) -> Any:
        if isinstance(value, dict):
            file_path = value.get("file_path", "")
            document_id = value.get("id")
            document_values: dict[str, Any] = value.copy()
        else:
            file_path = getattr(value, "file_path", "")
            document_id = getattr(value, "id", None)
            document_values = {
                field_name: getattr(value, field_name)
                for field_name in cls.model_fields
                if hasattr(value, field_name)
            }
        if isinstance(file_path, str) and (
            file_path.startswith("gs://")
            or file_path.startswith("https://storage.googleapis.com/")
            or file_path.startswith("http://storage.googleapis.com/")
        ):
            document_values["file_path"] = f"{settings.API_V1_STR}/documents/{document_id}/download"
            return document_values
        return value
