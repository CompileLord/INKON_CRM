import re
from typing import ClassVar
from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Message, Receive, Scope, Send


class JournalBodyLimitMiddleware:
    MAX_BODY_BYTES: ClassVar[int] = 4194304

    def __init__(self, app: ASGIApp, api_prefix: str) -> None:
        self.app: ASGIApp = app
        self.route_pattern: re.Pattern[str] = re.compile(rf"{re.escape(api_prefix)}/journals/[^/]+/entries/?")

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        path: str = scope["path"]
        root_path: str = scope.get("root_path", "")
        if root_path and path.startswith(root_path + "/"):
            path = path[len(root_path) :]
        if scope["method"] != "PUT" or self.route_pattern.fullmatch(path) is None:
            await self.app(scope, receive, send)
            return
        name: bytes
        value: bytes
        for name, value in scope.get("headers", []):
            if name.lower() == b"content-length":
                try:
                    declared_length: int = int(value)
                except ValueError:
                    continue
                if declared_length > self.MAX_BODY_BYTES:
                    await self._reject(scope, receive, send)
                    return
        buffered: bytearray = bytearray()
        while True:
            message: Message = await receive()
            if message["type"] == "http.disconnect":
                return
            chunk: bytes = message.get("body", b"")
            if len(buffered) + len(chunk) > self.MAX_BODY_BYTES:
                await self._reject(scope, receive, send)
                return
            buffered.extend(chunk)
            if not message.get("more_body", False):
                break
        body: bytes = bytes(buffered)
        replayed: bool = False

        async def replay() -> Message:
            nonlocal replayed
            if not replayed:
                replayed = True
                return {"type": "http.request", "body": body, "more_body": False}
            return await receive()

        await self.app(scope, replay, send)

    async def _reject(self, scope: Scope, receive: Receive, send: Send) -> None:
        response: JSONResponse = JSONResponse(status_code=413, content={"detail": "Request body too large"})
        await response(scope, receive, send)
