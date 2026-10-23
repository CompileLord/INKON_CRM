import math
from typing import Any

from fastapi import Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse


class CredentialValidationErrorHandler:
    async def __call__(self, request: Request, error: RequestValidationError) -> JSONResponse:
        if not request.url.path.startswith("/api/v1/auth/"):
            return JSONResponse(status_code=422, content={"detail": jsonable_encoder(self._without_unserializable_input(error.errors()))})
        validation_errors: list[dict[str, Any]] = [
            {key: value for key, value in validation_error.items() if key not in {"input", "ctx"}}
            for validation_error in error.errors()
        ]
        return JSONResponse(status_code=422, content={"detail": validation_errors})

    @staticmethod
    def _without_unserializable_input(validation_errors: list[Any]) -> list[Any]:
        sanitized: list[Any] = []
        validation_error: Any
        for validation_error in validation_errors:
            offending_input: Any = validation_error.get("input")
            if isinstance(offending_input, float) and not math.isfinite(offending_input):
                validation_error = {**validation_error, "input": str(offending_input)}
            sanitized.append(validation_error)
        return sanitized
