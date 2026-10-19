import html
import json
from abc import ABC, abstractmethod
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol

from app.core.config import settings
from app.models.outbox_event import OutboxEventKind

LOGO_CONTENT_ID = "kitob-logo"
LOGO_ASSET_PATH = Path(__file__).resolve().parent.parent / "assets" / "email" / "kitob-logo.png"

BRAND_NAVY = "#083D91"
BRAND_BLUE = "#0E6BB8"
BRAND_ORANGE = "#F58220"
CANVAS_COLOR = "#F5F8FD"
CARD_COLOR = "#FFFFFF"
STRIP_COLOR = "#F0F5FC"
BORDER_COLOR = "#D5E1F2"
INK_COLOR = "#0B1F3F"
MUTED_COLOR = "#51627F"
SYSTEM_FONT_STACK = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif"
MONOSPACE_FONT_STACK = "'SFMono-Regular',Menlo,Consolas,'Liberation Mono','Courier New',monospace"


@dataclass(frozen=True)
class InlineImage:
    content_id: str
    data: bytes
    subtype: str


@dataclass(frozen=True)
class RenderedEmail:
    subject: str
    plain_text: str
    html_body: str
    inline_images: tuple[InlineImage, ...]


@dataclass(frozen=True)
class HighlightRow:
    label: str
    value: str
    letter_spaced: bool = False


@dataclass(frozen=True)
class CallToAction:
    label: str
    url: str


class EmailTemplate(Protocol):
    def render(self) -> RenderedEmail: ...


class LogoAssetLoader:
    def __init__(self, asset_path: Path = LOGO_ASSET_PATH) -> None:
        self._asset_path: Path = asset_path
        self._cached_logo: InlineImage | None = None

    def load(self) -> InlineImage:
        if self._cached_logo is None:
            self._cached_logo = InlineImage(
                content_id=LOGO_CONTENT_ID,
                data=self._asset_path.read_bytes(),
                subtype="png",
            )
        return self._cached_logo


class BrandedEmailLayout:
    def __init__(self, logo_loader: LogoAssetLoader | None = None) -> None:
        self._logo_loader: LogoAssetLoader = logo_loader or LogoAssetLoader()

    def render_html(
        self,
        preheader: str,
        highlight_rows: tuple[HighlightRow, ...],
        heading: str,
        body_lines: tuple[str, ...],
        call_to_action: CallToAction | None,
        footer_lines: tuple[str, ...],
    ) -> str:
        preheader_markup: str = (
            '<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;'
            f'mso-hide:all;">{html.escape(preheader)}</div>'
        )
        highlight_markup: str = self._render_highlight(highlight_rows)
        message_markup: str = self._render_message(heading, body_lines)
        action_markup: str = self._render_call_to_action(call_to_action)
        footer_markup: str = "".join(
            f'<p style="margin:0 0 4px 0;font-size:12px;line-height:18px;color:{MUTED_COLOR};">'
            f"{html.escape(line)}</p>"
            for line in footer_lines
        )
        logo_content_id: str = html.escape(self._logo_loader.load().content_id, quote=True)
        return (
            '<!DOCTYPE html><html lang="ru"><head><meta charset="utf-8">'
            '<meta name="viewport" content="width=device-width, initial-scale=1">'
            '<meta name="color-scheme" content="light only">'
            '<meta name="supported-color-schemes" content="light only">'
            "<title>KITOB</title></head>"
            f'<body style="margin:0;padding:0;background-color:{CANVAS_COLOR};" bgcolor="{CANVAS_COLOR}">'
            f"{preheader_markup}"
            f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" '
            f'bgcolor="{CANVAS_COLOR}" style="background-color:{CANVAS_COLOR};">'
            '<tr><td align="center" style="padding:24px 12px;">'
            '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" '
            f'style="max-width:600px;width:100%;font-family:{SYSTEM_FONT_STACK};">'
            f'<tr><td align="center" bgcolor="{BRAND_NAVY}" style="background-color:{BRAND_NAVY};'
            f'padding:24px 16px;border-radius:12px 12px 0 0;border-bottom:4px solid {BRAND_ORANGE};">'
            f'<img src="cid:{logo_content_id}" width="170" height="85" alt="KITOB" '
            'style="display:block;border:0;outline:none;text-decoration:none;width:170px;height:85px;'
            'border-radius:8px;">'
            "</td></tr>"
            f'<tr><td bgcolor="{CARD_COLOR}" style="background-color:{CARD_COLOR};padding:24px 28px 28px 28px;'
            f'border-left:1px solid {BORDER_COLOR};border-right:1px solid {BORDER_COLOR};color:{INK_COLOR};">'
            f"{highlight_markup}{message_markup}{action_markup}"
            "</td></tr>"
            f'<tr><td bgcolor="{STRIP_COLOR}" align="center" style="background-color:{STRIP_COLOR};'
            f"padding:16px 28px;border:1px solid {BORDER_COLOR};border-radius:0 0 12px 12px;"
            f'font-family:{SYSTEM_FONT_STACK};">{footer_markup}</td></tr>'
            "</table></td></tr></table></body></html>"
        )

    def _render_message(self, heading: str, body_lines: tuple[str, ...]) -> str:
        paragraphs: str = "".join(
            f'<p style="margin:0 0 8px 0;font-size:15px;line-height:23px;color:{INK_COLOR};">'
            f"{html.escape(line)}</p>"
            for line in body_lines
        )
        return (
            f'<h1 style="margin:0 0 10px 0;font-size:20px;line-height:28px;font-weight:700;'
            f'color:{BRAND_NAVY};">{html.escape(heading)}</h1>'
            f'<div style="margin:0 0 16px 0;">{paragraphs}</div>'
        )

    def _render_highlight(self, rows: tuple[HighlightRow, ...]) -> str:
        if not rows:
            return ""
        row_markup: list[str] = []
        for row in rows:
            letter_spacing: str = "6px" if row.letter_spaced else "0"
            font_size: str = "30px" if row.letter_spaced else "20px"
            row_markup.append(
                f'<p style="margin:0 0 4px 0;font-size:12px;line-height:18px;font-weight:600;'
                f'color:{MUTED_COLOR};">{html.escape(row.label)}</p>'
                f'<p style="margin:0 0 16px 0;font-family:{MONOSPACE_FONT_STACK};font-size:{font_size};'
                f"line-height:34px;font-weight:700;letter-spacing:{letter_spacing};color:{BRAND_NAVY};"
                f'word-break:break-all;">{html.escape(row.value)}</p>'
            )
        return (
            '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" '
            'style="margin:8px 0 24px 0;"><tr>'
            f'<td bgcolor="{STRIP_COLOR}" style="background-color:{STRIP_COLOR};padding:20px 20px 4px 20px;'
            f"border:1px solid {BORDER_COLOR};border-left:4px solid {BRAND_BLUE};border-radius:8px;\">"
            f"{''.join(row_markup)}</td></tr></table>"
        )

    def _render_call_to_action(self, call_to_action: CallToAction | None) -> str:
        if call_to_action is None:
            return ""
        safe_url: str = html.escape(call_to_action.url, quote=True)
        safe_label: str = html.escape(call_to_action.label)
        return (
            '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">'
            '<tr><td align="center" style="padding:0 0 16px 0;">'
            '<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>'
            f'<td align="center" bgcolor="{BRAND_BLUE}" style="background-color:{BRAND_BLUE};'
            'border-radius:8px;">'
            f'<a href="{safe_url}" target="_blank" style="display:inline-block;padding:14px 24px;white-space:nowrap;'
            f"font-family:{SYSTEM_FONT_STACK};font-size:16px;line-height:20px;font-weight:700;"
            f'color:#FFFFFF;text-decoration:none;border-radius:8px;">{safe_label}</a>'
            "</td></tr></table></td></tr>"
            '<tr><td align="center" style="padding:0;">'
            f'<a href="{safe_url}" target="_blank" style="font-size:13px;line-height:20px;'
            f'color:{BRAND_BLUE};word-break:break-all;">{safe_url}</a>'
            "</td></tr></table>"
        )

    @property
    def inline_images(self) -> tuple[InlineImage, ...]:
        return (self._logo_loader.load(),)


class BaseBrandedEmailTemplate(ABC):
    def __init__(self, layout: BrandedEmailLayout | None = None) -> None:
        self._layout: BrandedEmailLayout = layout or BrandedEmailLayout()

    @property
    @abstractmethod
    def subject(self) -> str: ...

    @property
    @abstractmethod
    def preheader(self) -> str: ...

    @abstractmethod
    def build_heading(self) -> str: ...

    @abstractmethod
    def build_body_lines(self) -> tuple[str, ...]: ...

    @abstractmethod
    def build_highlight_rows(self) -> tuple[HighlightRow, ...]: ...

    @abstractmethod
    def build_call_to_action(self) -> CallToAction | None: ...

    @abstractmethod
    def build_footer_lines(self) -> tuple[str, ...]: ...

    def build_plain_text(self) -> str:
        highlight_lines: list[str] = [f"{row.label}: {row.value}" for row in self.build_highlight_rows()]
        message_lines: list[str] = [self.build_heading(), *self.build_body_lines()]
        call_to_action: CallToAction | None = self.build_call_to_action()
        blocks: list[str] = ["\n".join(highlight_lines), "\n".join(message_lines)]
        if call_to_action is not None:
            blocks.append(f"{call_to_action.label}: {call_to_action.url}")
        blocks.append("KITOB — Educational Center")
        return "\n\n".join(blocks)

    def render(self) -> RenderedEmail:
        html_body: str = self._layout.render_html(
            preheader=self.preheader,
            highlight_rows=self.build_highlight_rows(),
            heading=self.build_heading(),
            body_lines=self.build_body_lines(),
            call_to_action=self.build_call_to_action(),
            footer_lines=self.build_footer_lines(),
        )
        return RenderedEmail(
            subject=self.subject,
            plain_text=self.build_plain_text(),
            html_body=html_body,
            inline_images=self._layout.inline_images,
        )


class CredentialsEmailTemplate(BaseBrandedEmailTemplate):
    SUBJECT: str = "Ваши данные для входа в KITOB"

    def __init__(
        self,
        first_name: str,
        login_email: str,
        temporary_password: str,
        login_url: str,
        layout: BrandedEmailLayout | None = None,
    ) -> None:
        super().__init__(layout)
        self._first_name: str = first_name
        self._login_email: str = login_email
        self._temporary_password: str = temporary_password
        self._login_url: str = login_url

    @property
    def subject(self) -> str:
        return self.SUBJECT

    @property
    def preheader(self) -> str:
        return "Логин и пароль для входа в KITOB"

    def build_heading(self) -> str:
        return f"Добро пожаловать в KITOB, {self._first_name}!"

    def build_body_lines(self) -> tuple[str, ...]:
        return ("Войдите с этими данными и при первом входе задайте новый пароль.",)

    def build_highlight_rows(self) -> tuple[HighlightRow, ...]:
        return (
            HighlightRow(label="Логин", value=self._login_email),
            HighlightRow(label="Пароль", value=self._temporary_password, letter_spaced=True),
        )

    def build_call_to_action(self) -> CallToAction | None:
        return CallToAction(label="Войти", url=self._login_url)

    def build_footer_lines(self) -> tuple[str, ...]:
        return (
            "KITOB — Educational Center",
            "Если вы не ожидали это письмо, просто проигнорируйте его.",
        )


class CodeEmailTemplate(BaseBrandedEmailTemplate, ABC):
    EXPIRY_LINE: str = "Код действует 10 минут."
    SHARING_WARNING: str = "Никому не сообщайте этот код."

    def __init__(self, code: str, layout: BrandedEmailLayout | None = None) -> None:
        super().__init__(layout)
        self._code: str = code

    @property
    @abstractmethod
    def subject_suffix(self) -> str: ...

    @property
    @abstractmethod
    def code_label(self) -> str: ...

    @abstractmethod
    def build_heading(self) -> str: ...

    @property
    def subject(self) -> str:
        return f"{self._code} — {self.subject_suffix}"

    @property
    def preheader(self) -> str:
        return f"{self.code_label}: {self._code}"

    def build_body_lines(self) -> tuple[str, ...]:
        return (self.SHARING_WARNING, self.EXPIRY_LINE)

    def build_highlight_rows(self) -> tuple[HighlightRow, ...]:
        return (HighlightRow(label=self.code_label, value=self._code, letter_spaced=True),)

    def build_call_to_action(self) -> CallToAction | None:
        return None

    def build_footer_lines(self) -> tuple[str, ...]:
        return ("KITOB — Educational Center", "Если это были не вы, проигнорируйте письмо.")


class VerificationCodeEmailTemplate(CodeEmailTemplate):
    SUBJECT: str = "Код подтверждения KITOB"

    @property
    def subject_suffix(self) -> str:
        return "код подтверждения KITOB"

    @property
    def code_label(self) -> str:
        return "Код подтверждения"

    def build_heading(self) -> str:
        return "Подтвердите вход в KITOB"


class PasswordResetEmailTemplate(CodeEmailTemplate):
    SUBJECT: str = "Код для сброса пароля KITOB"

    @property
    def subject_suffix(self) -> str:
        return "код для сброса пароля KITOB"

    @property
    def code_label(self) -> str:
        return "Код для сброса пароля"

    def build_heading(self) -> str:
        return "Сброс пароля в KITOB"


class OutboxEmailTemplateFactory:
    def __init__(self, login_url: str | None = None) -> None:
        self._login_url: str = login_url or settings.FRONTEND_BASE_URL

    def create(self, kind: OutboxEventKind, recipient_email: str, payload: str) -> EmailTemplate:
        if kind == OutboxEventKind.CREDENTIALS_EMAIL:
            details: dict[str, str] = json.loads(payload)
            return CredentialsEmailTemplate(
                first_name=details["first_name"],
                login_email=recipient_email,
                temporary_password=details["temporary_password"],
                login_url=self._login_url,
            )
        if kind == OutboxEventKind.VERIFICATION_EMAIL:
            return VerificationCodeEmailTemplate(code=payload)
        if kind == OutboxEventKind.PASSWORD_RESET_EMAIL:
            return PasswordResetEmailTemplate(code=payload)
        raise ValueError(f"No email template for outbox event kind {kind}")
