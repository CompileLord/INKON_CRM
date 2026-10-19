import hashlib
import hmac
import re
import secrets
from typing import ClassVar, Pattern


class TelegramLinkCodeGenerator:
    digit_count: ClassVar[int] = 5
    letter_alphabet: ClassVar[str] = "ABCDEFGHJKLMNPQRSTUVWXYZ"
    digit_alphabet: ClassVar[str] = "0123456789"
    format_pattern: ClassVar[Pattern[str]] = re.compile(r"^[0-9A-HJ-NP-Z]{6}$")

    def generate(self) -> str:
        characters: list[str] = [secrets.choice(self.digit_alphabet) for _ in range(self.digit_count)]
        letter_position: int = secrets.randbelow(self.digit_count + 1)
        characters.insert(letter_position, secrets.choice(self.letter_alphabet))
        return "".join(characters)

    def normalize(self, raw_text: str) -> str | None:
        candidate: str = raw_text.strip().upper()
        digits: int = sum(character.isdigit() for character in candidate)
        if self.format_pattern.fullmatch(candidate) is None or digits != self.digit_count:
            return None
        return candidate


class TelegramLinkCodeHasher:
    domain_separator: ClassVar[bytes] = b"telegram-link-code:"

    def __init__(self, application_secret: str) -> None:
        self._key: bytes = self.domain_separator + application_secret.encode("utf-8")

    def hash_code(self, code: str) -> str:
        return hmac.new(self._key, code.encode("utf-8"), hashlib.sha256).hexdigest()
