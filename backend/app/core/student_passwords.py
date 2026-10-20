import secrets
import string


class StudentPasswordCodeGenerator:
    DIGIT_COUNT: int = 5
    LETTER_COUNT: int = 1
    CODE_LENGTH: int = DIGIT_COUNT + LETTER_COUNT

    def generate(self) -> str:
        characters: list[str] = [secrets.choice(string.digits) for _ in range(self.DIGIT_COUNT)]
        characters.extend(secrets.choice(string.ascii_uppercase) for _ in range(self.LETTER_COUNT))
        for index in range(len(characters) - 1, 0, -1):
            swap_index: int = secrets.randbelow(index + 1)
            characters[index], characters[swap_index] = characters[swap_index], characters[index]
        return "".join(characters)
