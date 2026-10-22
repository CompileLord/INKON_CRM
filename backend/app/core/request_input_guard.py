import re
from typing import Any, ClassVar
from urllib.parse import unquote_to_bytes

from fastapi import Request
from fastapi.responses import JSONResponse
from sqlalchemy.exc import DBAPIError, DataError
from starlette.types import ASGIApp, Message, Receive, Scope, Send


class RequestInputGuard:
    MAX_INTEGER_ID: ClassVar[int] = 2147483647
    NUL_PERCENT_ESCAPE: ClassVar[re.Pattern[bytes]] = re.compile(rb"%00")
    JSON_NUL_ESCAPE: ClassVar[re.Pattern[bytes]] = re.compile(rb"(?<!\\)(?:\\\\)*\\u0000", re.IGNORECASE)
    INTEGER_SEGMENT: ClassVar[re.Pattern[str]] = re.compile(r"^-?[0-9]+$")

    def __init__(self, app: ASGIApp) -> None:
        self.app: ASGIApp = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        rejection: dict[str, Any] | None = self._inspect_target(scope)
        if rejection is None and self._declares_json(scope):
            receive, rejection = await self._inspect_body(receive)
        if rejection is not None:
            response: JSONResponse = JSONResponse(status_code=422, content={"detail": [rejection]})
            await response(scope, receive, send)
            return
        await self.app(scope, receive, send)

    def _inspect_target(self, scope: Scope) -> dict[str, Any] | None:
        raw_path: bytes = scope.get("raw_path") or scope["path"].encode()
        query_string: bytes = scope.get("query_string", b"")
        if b"\x00" in unquote_to_bytes(raw_path) or b"\x00" in unquote_to_bytes(query_string) or b"\x00" in query_string:
            return {"type": "value_error", "loc": ["query" if query_string else "path"], "msg": "NUL characters are not allowed"}
        segment: str
        for segment in scope["path"].split("/"):
            if self.INTEGER_SEGMENT.fullmatch(segment) is not None and abs(int(segment)) > self.MAX_INTEGER_ID:
                return {"type": "int_parsing", "loc": ["path", segment], "msg": "Identifier is out of range"}
        return None

    @staticmethod
    def _declares_json(scope: Scope) -> bool:
        name: bytes
        value: bytes
        for name, value in scope.get("headers", []):
            if name.lower() == b"content-type":
                return b"json" in value.lower()
        return False

    async def _inspect_body(self, receive: Receive) -> tuple[Receive, dict[str, Any] | None]:
        buffered: bytearray = bytearray()
        while True:
            message: Message = await receive()
            if message["type"] == "http.disconnect":
                break
            buffered.extend(message.get("body", b""))
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

        if b"\x00" in body or self.JSON_NUL_ESCAPE.search(body) is not None:
            return replay, {"type": "value_error", "loc": ["body"], "msg": "NUL characters are not allowed"}
        return replay, None


class DatabaseValueErrorHandler:
    REJECTED_ARGUMENT_MARKER: ClassVar[str] = "invalid input for query argument"

    async def __call__(self, request: Request, error: DBAPIError) -> JSONResponse:
        if not isinstance(error, DataError) and self.REJECTED_ARGUMENT_MARKER not in str(error.orig):
            raise error
        return JSONResponse(
            status_code=422,
            content={"detail": [{"type": "value_error", "loc": ["request"], "msg": "A submitted value is out of range or not allowed"}]},
        )

