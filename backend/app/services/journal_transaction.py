from types import TracebackType
from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.exc import StaleDataError as StaleObjectError


class JournalCommandTransaction:
    def __init__(self, db: AsyncSession) -> None:
        self.db: AsyncSession = db

    async def __aenter__(self) -> "JournalCommandTransaction":
        return self

    async def __aexit__(
        self,
        exception_type: type[BaseException] | None,
        exception: BaseException | None,
        traceback: TracebackType | None,
    ) -> None:
        if exception is not None:
            await self.db.rollback()
            if isinstance(exception, StaleObjectError):
                raise self._conflict() from exception
            return
        try:
            await self.db.commit()
        except StaleObjectError as conflict:
            await self.db.rollback()
            raise self._conflict() from conflict
        except BaseException:
            await self.db.rollback()
            raise

    @staticmethod
    def _conflict() -> HTTPException:
        return HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Conflict: The journal entries have been updated by another user. Please refresh and try again.",
        )
