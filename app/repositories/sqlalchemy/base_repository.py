from datetime import datetime, timezone
from typing import Any, Generic, List, Optional, Type, TypeVar
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from app.repositories.interfaces.base_repository import BaseRepository

T = TypeVar("T")


class SQLAlchemyBaseRepository(Generic[T]):
    def __init__(self, model: Type[T], session: AsyncSession) -> None:
        self.model = model
        self.session = session

    async def get_by_id(self, id: Any, include_deleted: bool = False) -> Optional[T]:
        query = select(self.model).filter(self.model.id == id)
        if not include_deleted and hasattr(self.model, "is_deleted"):
            query = query.filter(self.model.is_deleted == False)
        result = await self.session.execute(query)
        return result.scalars().first()

    async def get_list(
        self,
        skip: int = 0,
        limit: int = 100,
        include_deleted: bool = False
    ) -> List[T]:
        query = select(self.model)
        if not include_deleted and hasattr(self.model, "is_deleted"):
            query = query.filter(self.model.is_deleted == False)
        query = query.offset(skip).limit(limit)
        result = await self.session.execute(query)
        return list(result.scalars().all())

    async def create(self, entity: T) -> T:
        self.session.add(entity)
        await self.session.flush()
        return entity

    async def update(self, entity: T) -> T:
        await self.session.flush()
        return entity

    async def delete(self, id: Any) -> bool:
        entity = await self.get_by_id(id)
        if not entity:
            return False
        await self.session.delete(entity)
        await self.session.flush()
        return True

    async def soft_delete(self, id: Any) -> bool:
        entity = await self.get_by_id(id)
        if not entity:
            return False
        if hasattr(entity, "is_deleted"):
            entity.is_deleted = True
            if hasattr(entity, "deleted_at"):
                entity.deleted_at = datetime.now(timezone.utc)
            await self.session.flush()
            return True
        return False

    async def get_paginated(
        self,
        base_query: Any,
        page: int = 1,
        page_size: int = 20
    ) -> dict:
        from sqlalchemy import func
        page_size = min(max(1, page_size), 100)
        
        count_query = select(func.count()).select_from(base_query.subquery())
        total_result = await self.session.execute(count_query)
        total = total_result.scalar() or 0
        
        total_pages = (total + page_size - 1) // page_size if total > 0 else 0
        
        if page > total_pages and total_pages > 0:
            return {
                "items": [],
                "total": total,
                "page": page,
                "page_size": page_size,
                "total_pages": total_pages
            }
            
        offset = (page - 1) * page_size
        query = base_query.offset(offset).limit(page_size)
        result = await self.session.execute(query)
        items = list(result.scalars().all())
        
        return {
            "items": items,
            "total": total,
            "page": page,
            "page_size": page_size,
            "total_pages": total_pages
        }
