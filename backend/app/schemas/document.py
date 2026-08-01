from datetime import datetime
from typing import Optional
from pydantic import BaseModel
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
