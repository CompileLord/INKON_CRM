from typing_extensions import Protocol
from app.models.document import Document
from app.repositories.interfaces.base_repository import BaseRepository


class DocumentRepository(BaseRepository[Document], Protocol):
    pass
