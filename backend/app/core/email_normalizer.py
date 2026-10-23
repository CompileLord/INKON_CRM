class EmailNormalizer:
    @staticmethod
    def normalize(email: str) -> str:
        return email.strip().lower()

    @classmethod
    def normalize_optional(cls, email: str | None) -> str | None:
        if email is None:
            return None
        normalized_email: str = cls.normalize(email)
        return normalized_email or None
