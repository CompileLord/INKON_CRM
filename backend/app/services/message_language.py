from typing import Literal


class MessageLanguage:
    default: str = "ru"
    supported: tuple[str, ...] = ("en", "ru", "tg")

    @classmethod
    def resolve(cls, preferred: str | None, requested: str | None = None) -> str:
        if preferred is not None and preferred in cls.supported:
            return preferred
        if requested is not None and requested in cls.supported:
            return requested
        return cls.default

    @classmethod
    def from_accept_language(cls, header: str | None) -> Literal["en", "ru", "tg"] | None:
        candidates: list[tuple[float, int, str]] = []
        entry: str
        index: int
        for index, entry in enumerate((header or "").split(",")):
            parts: list[str] = entry.strip().split(";")
            language: str = parts[0].strip().lower().split("-")[0]
            quality: float = 1.0
            parameter: str
            for parameter in parts[1:]:
                if parameter.strip().startswith("q="):
                    try:
                        quality = float(parameter.strip()[2:])
                    except ValueError:
                        quality = 0.0
            if language in cls.supported and 0 < quality <= 1:
                candidates.append((quality, -index, language))
        if not candidates:
            return None
        selected: str = max(candidates)[2]
        if selected == "en":
            return "en"
        if selected == "tg":
            return "tg"
        return "ru"
