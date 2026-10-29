import math
import hashlib
import json
from datetime import date, datetime, timedelta, timezone
from typing import Any, Callable, Protocol
from zoneinfo import ZoneInfo
from fastapi import HTTPException, status
from app.repositories.interfaces.debt_reminder_repository import DebtReminderRepository, DebtReminderSource
from app.services.debt_reminder_sms import DebtReminderSms
from app.services.debt_reminder_messages import DebtReminderMessages
from app.schemas.debt_reminder import DebtReminderResponse, DebtReminderResult
from app.schemas.debt import DebtPageResponse
from app.repositories.interfaces.cache_generation_repository import CacheGenerationRepository
from app.services.analytics_cache_service import AnalyticsCacheService
from app.core.redis import redis_client


class DebtReminderAudit(Protocol):
    async def log(self, user_id: int | None, action: str, entity_type: str, entity_id: int, changes: dict[str, Any]) -> None: ...


class DebtReminderService:
    def __init__(
        self, repository: DebtReminderRepository, audit: DebtReminderAudit,
        clock: Callable[[], datetime] = lambda: datetime.now(timezone.utc),
        sms: DebtReminderSms | None = None, interval_seconds: int = 86400,
        cache_generation: CacheGenerationRepository | None = None,
    ) -> None:
        self._cache_generation: CacheGenerationRepository | None = cache_generation
        self._sms: DebtReminderSms | None = sms
        self._interval: timedelta = timedelta(seconds=interval_seconds)
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
        last_reminder_times: dict[int, datetime] = await self._repository.last_reminder_times(sources)
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
            elif source.parent_chat_id is None and not (source.parent_phone or source.student_phone):
                result.outcome = "no_channel"
            else:
                previous: datetime | None = last_reminder_times.get(student_id)
                if previous is not None and previous + self._interval > now:
                    result.outcome = "recently_reminded"
                    result.next_allowed_at = previous + self._interval
                else:
                    result.channel = "telegram" if source.parent_chat_id is not None else "sms"
                    destination: str = str(source.parent_chat_id) if result.channel == "telegram" else str(source.parent_phone or source.student_phone)
                    result.masked_destination = DebtReminderMessages.mask(destination)
                    notification_id: int = await self._repository.queue(source, now, result.channel, result.masked_destination)
                    if result.channel == "sms":
                        if self._sms is None:
                            raise RuntimeError("Debt reminder SMS is not configured")
                        await self._sms.queue(source, destination, notification_id, now)
                    await self._audit.log(actor_id, "create", "debt_reminder", student_id,
                                          {"amount": (None, format(source.total_debt, ".2f"))})
                    result.outcome = "queued"
            results.append(result)
        limited_times: list[datetime] = [result.next_allowed_at for result in results if result.next_allowed_at is not None]
        if not any(result.outcome == "queued" for result in results):
            if limited_times:
                await self._repository.rollback()
                retry_after: int = max(1, math.ceil((max(limited_times) - now).total_seconds()))
                raise HTTPException(status_code=429, detail={"code": "debt_reminder_rate_limited"},
                                    headers={"Retry-After": str(retry_after)})
            if any(result.outcome == "no_channel" for result in results):
                await self._repository.rollback()
                raise HTTPException(status_code=422, detail={"code": "debt_reminder_no_channel"})
        if self._cache_generation is not None and any(result.outcome == "queued" for result in results):
            await self._cache_generation.advance()
        await self._repository.commit()
        return DebtReminderResponse(results=results)

    async def list_debts(self, filters: dict[str, Any], page: int, page_size: int) -> dict[str, Any]:
        today = self._clock().astimezone(ZoneInfo("Asia/Dushanbe")).date()
        page_size = min(max(page_size, 1), 100)
        generation = self._cache_generation
        if generation is None or not generation.can_use_shared_cache():
            return await self._list_debts(today, filters, page, page_size)
        version: int = await generation.read_committed_generation()
        parameters: str = json.dumps({"filters": filters, "page": page, "page_size": page_size}, sort_keys=True, default=str)
        digest: str = hashlib.sha256(parameters.encode()).hexdigest()
        key: str = f"finance:debtors:{version}:{today.isoformat()}:{digest}"
        async def compute() -> dict[str, object]:
            result: dict[str, Any] = await self._list_debts(today, filters, page, page_size)
            return DebtPageResponse.model_validate(result).model_dump(mode="json")
        return await AnalyticsCacheService(redis_client).get_or_compute(key, compute, generation.can_use_shared_cache)

    async def _list_debts(self, today: date, filters: dict[str, Any], page: int, page_size: int) -> dict[str, Any]:
        response: dict[str, Any] = await self._repository.list_debts(today, filters, page, page_size)
        item: dict[str, Any]
        for item in response["items"]:
            chat: int | None = item.pop("_parent_chat_id")
            parent_phone: str | None = item.pop("_parent_phone")
            phone: str | None = item.pop("_student_phone")
            destination: str | None = str(chat) if chat is not None else parent_phone or phone
            item["reminder_channel"] = "telegram" if chat is not None else "sms" if destination else None
            item["reminder_masked_destination"] = DebtReminderMessages.mask(destination) if destination else None
        return response
