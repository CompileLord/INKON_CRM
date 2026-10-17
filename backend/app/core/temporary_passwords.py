import secrets


class TemporaryPasswordGenerator:
    DIGIT_COUNT: int = 6

    def generate(self) -> str:
        upper_bound: int = 10 ** self.DIGIT_COUNT
        return str(secrets.randbelow(upper_bound)).zfill(self.DIGIT_COUNT)
