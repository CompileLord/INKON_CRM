import asyncio
from collections.abc import Awaitable, Callable, Sequence


class ResourceCleanup:
    @classmethod
    async def _close_each(cls, closers: Sequence[Callable[[], Awaitable[None]]]) -> None:
        failures: list[BaseException] = []
        closer: Callable[[], Awaitable[None]]
        for closer in closers:
            try:
                await closer()
            except BaseException as error:
                failures.append(error)
        if failures:
            raise BaseExceptionGroup("Process resource cleanup failed", failures)

    @classmethod
    async def close_all(cls, closers: Sequence[Callable[[], Awaitable[None]]]) -> None:
        cleanup_task: asyncio.Task[None] = asyncio.create_task(cls._close_each(closers))
        cancellation: asyncio.CancelledError | None = None
        while not cleanup_task.done():
            try:
                await asyncio.shield(cleanup_task)
            except asyncio.CancelledError as error:
                cancellation = error
            except BaseException:
                break
        if cancellation is not None:
            if not cleanup_task.cancelled():
                cleanup_task.exception()
            raise cancellation
        cleanup_task.result()


class ProcessResources:
    @classmethod
    async def close(cls) -> None:
        from app.core.redis import close_arq_pool, redis_client_owner
        from app.db.session import engine
        from app.db.storage_intent_session import storage_intent_sessions
        from app.telegram_bot.bot import bot

        await ResourceCleanup.close_all([
            bot.session.close,
            close_arq_pool,
            redis_client_owner.close,
            engine.dispose,
            storage_intent_sessions.close,
        ])
