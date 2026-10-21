from datetime import datetime, timedelta, timezone
from typing import Any, Callable, Protocol
from zoneinfo import ZoneInfo
from fastapi import HTTPException, status
from app.repositories.interfaces.debt_reminder_repository import DebtReminderRepository, DebtReminderSource
from app.schemas.debt_reminder import DebtReminderResponse, DebtReminderResult


class DebtReminderAudit(Protocol):
    async def log(self, user_id: int | None, action: str, entity_type: str, entity_id: int, changes: dict[str, Any]) -> None: ...


class DebtReminderService:
    def __init__(
        self, repository: DebtReminderRepository, audit: DebtReminderAudit,
        clock: Callable[[], datetime] = lambda: datetime.now(timezone.utc),
    ) -> None:
        self._repository: DebtReminderRepository = repository
        self._audit: DebtReminderAudit = audit
        self._clock: Callable[[], datetime] = clock

    async def queue(self, student_ids: list[int], actor_id: int) -> DebtReminderResponse:
        if not await self._repository.notifications_enabled():
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Debt notifications are disabled")
        await self._repository.lock_students(sorted(student_ids))
        now: datetime = self._clock()
        sources: dict[int, DebtReminderSource] = await self._repository.load_sources(
            student_ids, now.astimezone(ZoneInfo("Asia/Dushanbe")).date()
        )
        last_reminder_times: dict[int, datetime] = await self._repository.last_reminder_times(student_ids)
        results: list[DebtReminderResult] = []
        student_id: int
        for student_id in student_ids:
            source: DebtReminderSource | None = sources.get(student_id)
            result: DebtReminderResult = DebtReminderResult(student_id=student_id, outcome="not_found", next_allowed_at=None)
            if source is None:
                results.append(result)
                continue
            if source.total_debt <= 0:
                result.outcome = "no_debt"
            elif source.parent_chat_id is None:
                result.outcome = "no_parent_chat"
            else:
                previous: datetime | None = last_reminder_times.get(student_id)
                if previous is not None and previous + timedelta(hours=24) > now:
                    result.outcome = "recently_reminded"
                    result.next_allowed_at = previous + timedelta(hours=24)
                else:
                    await self._repository.queue(student_id, now)
                    await self._audit.log(actor_id, "create", "debt_reminder", student_id,
                                          {"amount": (None, format(source.total_debt, ".2f"))})
                    result.outcome = "queued"
            results.append(result)
        await self._repository.commit()
        return DebtReminderResponse(results=results)

    async def list_debts(self, filters: dict[str, Any], page: int, page_size: int) -> dict[str, Any]:
        return await self._repository.list_debts(
            self._clock().astimezone(ZoneInfo("Asia/Dushanbe")).date(), filters, page, min(max(page_size, 1), 100)
        )
