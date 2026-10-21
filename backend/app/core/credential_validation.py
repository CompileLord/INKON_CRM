from typing import Any

from fastapi import Request
from fastapi.exception_handlers import request_validation_exception_handler
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse


class CredentialValidationErrorHandler:
    async def __call__(self, request: Request, error: RequestValidationError) -> JSONResponse:
        if not request.url.path.startswith("/api/v1/auth/"):
            return await request_validation_exception_handler(request, error)
        validation_errors: list[dict[str, Any]] = [
            {key: value for key, value in validation_error.items() if key not in {"input", "ctx"}}
            for validation_error in error.errors()
        ]
        return JSONResponse(status_code=422, content={"detail": validation_errors})
