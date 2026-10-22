from dataclasses import dataclass, field
from datetime import datetime


@dataclass(frozen=True)
class DemoCredential:
    role: str
    name: str
    login: str
    password_source: str


@dataclass(frozen=True)
class DemoParentLinkCode:
    student_name: str
    code: str
    expires_at: datetime


@dataclass
class DemoSeedReport:
    credentials: list[DemoCredential] = field(default_factory=list)
    parent_link_codes: list[DemoParentLinkCode] = field(default_factory=list)

    def render(self) -> str:
        lines: list[str] = ["", "Demo logins (log in with the email or phone shown):"]
        lines.append(f"{'Role':<12}{'Name':<28}{'Login':<34}Password")
        credential: DemoCredential
        for credential in self.credentials:
            lines.append(f"{credential.role:<12}{credential.name:<28}{credential.login:<34}{credential.password_source}")
        lines.append("")
        lines.append("One-time parent Telegram link codes (send to the bot to link; no chat ids are seeded):")
        link_code: DemoParentLinkCode
        for link_code in self.parent_link_codes:
            lines.append(f"  {link_code.code}  {link_code.student_name}  expires {link_code.expires_at.isoformat(timespec='minutes')}")
        return "\n".join(lines)
