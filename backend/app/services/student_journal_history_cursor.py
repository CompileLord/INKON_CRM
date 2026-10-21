import base64
import binascii
import hashlib
import hmac
import re
from pydantic import ValidationError
from app.schemas.student_journal_history import StudentJournalHistoryCursorPayload


class StudentJournalHistoryCursorCodec:
    maximum_length: int = 1024

    def __init__(self, secret: str) -> None:
        self._key: bytes = secret.encode("utf-8")

    def encode(self, payload: StudentJournalHistoryCursorPayload) -> str:
        encoded: str = base64.urlsafe_b64encode(payload.model_dump_json().encode("utf-8")).decode("ascii").rstrip("=")
        signature: str = hmac.new(self._key, b"student-journal-history-v1:" + encoded.encode("ascii"), hashlib.sha256).hexdigest()
        return f"{encoded}.{signature}"

    def decode(self, token: str, student_id: int, course_id: int | None, started_only: bool) -> StudentJournalHistoryCursorPayload:
        try:
            if len(token) > self.maximum_length:
                raise ValueError("Invalid history cursor")
            encoded: str
            signature: str
            encoded, signature = token.split(".")
            if re.fullmatch(r"[A-Za-z0-9_-]+", encoded) is None or re.fullmatch(r"[0-9a-f]{64}", signature) is None:
                raise ValueError("Invalid history cursor")
            expected: str = hmac.new(self._key, b"student-journal-history-v1:" + encoded.encode("ascii"), hashlib.sha256).hexdigest()
            if not hmac.compare_digest(signature, expected):
                raise ValueError("Invalid history cursor")
            raw: bytes = base64.b64decode(encoded + "=" * (-len(encoded) % 4), altchars=b"-_", validate=True)
            payload: StudentJournalHistoryCursorPayload = StudentJournalHistoryCursorPayload.model_validate_json(raw)
            if (payload.student_id, payload.course_id, payload.started_only) != (student_id, course_id, started_only):
                raise ValueError("Invalid history cursor")
            return payload
        except (ValueError, UnicodeError, binascii.Error, ValidationError) as error:
            raise ValueError("Invalid history cursor") from error
