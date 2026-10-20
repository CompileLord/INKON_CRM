import secrets
import string
import hashlib
import hmac


class StudentPasswordCodeGenerator:
    DIGIT_COUNT: int = 5
    LETTER_COUNT: int = 1
    CODE_LENGTH: int = DIGIT_COUNT + LETTER_COUNT

    def generate(self) -> str:
        characters: list[str] = [secrets.choice(string.digits) for _ in range(self.DIGIT_COUNT)]
        characters.extend(secrets.choice(string.ascii_uppercase) for _ in range(self.LETTER_COUNT))
        index: int
        for index in range(len(characters) - 1, 0, -1):
            swap_index: int = secrets.randbelow(index + 1)
            characters[index], characters[swap_index] = characters[swap_index], characters[index]
        return "".join(characters)


class PendingStudentPasswordHasher:
    DOMAIN: bytes = b"imkon-crm:pending-student-password:v1:"

    def __init__(self, secret_key: str) -> None:
        self._secret_key: bytes = secret_key.encode("utf-8")

    def hash(self, user_id: int, code: str) -> str:
        payload: bytes = self.DOMAIN + str(user_id).encode("ascii") + b":" + code.encode("utf-8")
        return hmac.new(self._secret_key, payload, hashlib.sha256).hexdigest()

    def verify(self, user_id: int, code: str, password_hash: str) -> bool:
        return hmac.compare_digest(self.hash(user_id, code), password_hash)
