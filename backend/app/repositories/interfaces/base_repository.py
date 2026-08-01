from typing import Any, Generic, List, Optional, TypeVar
from typing_extensions import Protocol

T = TypeVar("T")


class BaseRepository(Protocol[T]):
    async def get_by_id(self, id: Any, include_deleted: bool = False) -> Optional[T]:
        ...

    async def get_list(
        self,
        skip: int = 0,
        limit: int = 100,
        include_deleted: bool = False
    ) -> List[T]:
        ...

    async def create(self, entity: T) -> T:
        ...

    async def update(self, entity: T) -> T:
        ...

    async def delete(self, id: Any) -> bool:
        ...

    async def soft_delete(self, id: Any) -> bool:
        ...
