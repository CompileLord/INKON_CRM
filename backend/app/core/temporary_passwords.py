import secrets


class TemporaryPasswordGenerator:
    LETTER_ALPHABET: str = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz"
    DIGIT_ALPHABET: str = "23456789"
    DEFAULT_LENGTH: int = 14
    MINIMUM_LENGTH: int = 12

    def __init__(self, length: int = DEFAULT_LENGTH) -> None:
        if length < self.MINIMUM_LENGTH:
            raise ValueError("Temporary password length is below the allowed minimum")
        self._length: int = length

    def generate(self) -> str:
        combined_alphabet: str = self.LETTER_ALPHABET + self.DIGIT_ALPHABET
        characters: list[str] = [secrets.choice(self.DIGIT_ALPHABET), secrets.choice(self.LETTER_ALPHABET)]
        characters.extend(secrets.choice(combined_alphabet) for _ in range(self._length - len(characters)))
        secrets.SystemRandom().shuffle(characters)
        return "".join(characters)
