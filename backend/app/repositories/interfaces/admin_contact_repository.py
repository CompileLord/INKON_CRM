from dataclasses import dataclass
from typing_extensions import Protocol


@dataclass(frozen=True)
class AdminContact:
    email: str | None
    phone: str | None


class AdminContactRepository(Protocol):
    async def list_superadmin_contacts(self) -> list[AdminContact]:
        ...
