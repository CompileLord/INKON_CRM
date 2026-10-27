import json
import re
from email.message import Message

import pytest

from app.core.config import settings
from app.models.outbox_event import OutboxEventKind
from app.services.email_service import EmailService
from app.services.email_templates import (
    LOGO_CONTENT_ID,
    CredentialsEmailTemplate,
    OutboxEmailTemplateFactory,
    PasswordResetEmailTemplate,
    RenderedEmail,
    VerificationCodeEmailTemplate,
)

LOGIN_URL: str = "https://app.kitob.example/login?x=1&y=2"
LOGIN_EMAIL: str = "student@example.com"
TEMPORARY_PASSWORD: str = "493027"


TAJIK_LETTER_PATTERN: re.Pattern[str] = re.compile("[ӣӯқғҳҷӢӮҚҒҲҶ]")
LOGO_TAG_PATTERN: re.Pattern[str] = re.compile(r"<img[^>]*>")
HIDDEN_PREHEADER_PATTERN: re.Pattern[str] = re.compile(r"<div style=\"display:none[^>]*>.*?</div>")
TAG_PATTERN: re.Pattern[str] = re.compile(r"<[^>]+>")


def visible_text_after_logo(html_body: str) -> str:
    after_logo: str = LOGO_TAG_PATTERN.split(html_body, maxsplit=1)[1]
    without_preheader: str = HIDDEN_PREHEADER_PATTERN.sub("", after_logo)
    return " ".join(TAG_PATTERN.sub(" ", without_preheader).split())


def render_credentials(first_name: str = "Farrukh") -> RenderedEmail:
    return CredentialsEmailTemplate(
        first_name=first_name,
        login_email=LOGIN_EMAIL,
        temporary_password=TEMPORARY_PASSWORD,
        login_url=LOGIN_URL,
    ).render()


def test_credentials_html_carries_logo_login_password_and_button_url() -> None:
    rendered: RenderedEmail = render_credentials()

    assert f"cid:{LOGO_CONTENT_ID}" in rendered.html_body
    assert LOGIN_EMAIL in rendered.html_body
    assert rendered.html_body.count(TEMPORARY_PASSWORD) == 1
    assert rendered.html_body.count(LOGIN_EMAIL) == 1
    assert 'href="https://app.kitob.example/login?x=1&amp;y=2"' in rendered.html_body
    assert "<script" not in rendered.html_body
    assert "IMKON" not in rendered.html_body


def test_credentials_html_is_russian_only_without_language_tag() -> None:
    rendered: RenderedEmail = render_credentials()

    assert '<html lang="ru">' in rendered.html_body
    assert "Добро пожаловать в KITOB" in rendered.html_body
    assert "задайте новый пароль" in rendered.html_body
    for forbidden_text in ("РУССКИЙ", "ТОҶИКӢ", "ENGLISH", "Welcome", "Temporary password", "Log in", "Хуш омадед"):
        assert forbidden_text not in rendered.html_body
        assert forbidden_text not in rendered.plain_text
    assert not TAJIK_LETTER_PATTERN.search(rendered.html_body + rendered.plain_text)


def test_credentials_credentials_come_first_after_logo_in_html() -> None:
    rendered: RenderedEmail = render_credentials()

    text_after_logo: str = visible_text_after_logo(rendered.html_body)
    assert text_after_logo.startswith(f"Логин {LOGIN_EMAIL} Пароль {TEMPORARY_PASSWORD}")


def test_credentials_html_escapes_injected_first_name() -> None:
    rendered: RenderedEmail = render_credentials(first_name='<script>alert("x")</script>')

    assert "<script>" not in rendered.html_body
    assert "&lt;script&gt;" in rendered.html_body
    assert '<script>alert("x")</script>' in rendered.plain_text


def test_credentials_html_escapes_injected_login_and_url() -> None:
    rendered: RenderedEmail = CredentialsEmailTemplate(
        first_name="Ali",
        login_email="a<b>@example.com",
        temporary_password=TEMPORARY_PASSWORD,
        login_url='https://x.example/"><script>1</script>',
    ).render()

    assert "<b>" not in rendered.html_body
    assert "<script>1" not in rendered.html_body


def test_credentials_plain_text_starts_with_login_and_password() -> None:
    rendered: RenderedEmail = render_credentials()

    plain_lines: list[str] = rendered.plain_text.splitlines()
    assert plain_lines[0] == f"Логин: {LOGIN_EMAIL}"
    assert plain_lines[1] == f"Пароль: {TEMPORARY_PASSWORD}"
    assert LOGIN_URL in rendered.plain_text
    assert "Farrukh" in rendered.plain_text


def test_credentials_subject_is_short_russian() -> None:
    rendered: RenderedEmail = render_credentials()

    assert rendered.subject == "Ваши данные для входа в KITOB"


def test_credentials_preheader_is_hidden_and_does_not_repeat_password() -> None:
    rendered: RenderedEmail = render_credentials()

    assert "mso-hide:all;\">Логин и пароль для входа в KITOB</div>" in rendered.html_body
    assert rendered.html_body.count(TEMPORARY_PASSWORD) == 1


def test_credentials_rendering_attaches_logo_png_under_size_budget() -> None:
    rendered: RenderedEmail = render_credentials()

    assert len(rendered.inline_images) == 1
    logo = rendered.inline_images[0]
    assert logo.content_id == LOGO_CONTENT_ID
    assert logo.data.startswith(b"\x89PNG")
    assert len(logo.data) < 30_000


@pytest.mark.parametrize(
    ("template_class", "label", "subject"),
    [
        (VerificationCodeEmailTemplate, "Код подтверждения", "123456 — код подтверждения KITOB"),
        (PasswordResetEmailTemplate, "Код для сброса пароля", "123456 — код для сброса пароля KITOB"),
    ],
)
def test_code_templates_put_code_first_in_russian_only(
    template_class: type[VerificationCodeEmailTemplate] | type[PasswordResetEmailTemplate],
    label: str,
    subject: str,
) -> None:
    rendered: RenderedEmail = template_class(code="123456").render()

    assert rendered.subject == subject
    assert f"cid:{LOGO_CONTENT_ID}" in rendered.html_body
    assert '<html lang="ru">' in rendered.html_body
    assert visible_text_after_logo(rendered.html_body).startswith(f"{label} 123456 ")
    assert rendered.plain_text.splitlines()[0] == f"{label}: 123456"
    assert f">{label}: 123456</div>" in rendered.html_body
    assert "Код действует 10 минут." in rendered.html_body
    assert "Код действует 10 минут." in rendered.plain_text
    combined_copy: str = rendered.html_body + rendered.plain_text + rendered.subject
    for forbidden_text in ("РУССКИЙ", "ТОҶИКӢ", "ENGLISH", "Your ", "Do not share", "Рамз"):
        assert forbidden_text not in combined_copy
    assert not TAJIK_LETTER_PATTERN.search(combined_copy)
    assert "IMKON" not in combined_copy


def test_code_template_escapes_code_value() -> None:
    rendered: RenderedEmail = VerificationCodeEmailTemplate(code="<img src=x>").render()

    assert "<img src=x>" not in rendered.html_body
    assert "&lt;img src=x&gt;" in rendered.html_body


def test_factory_uses_frontend_base_url_setting(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "FRONTEND_BASE_URL", "https://configured.example")
    payload: str = json.dumps({"first_name": "Ali", "temporary_password": TEMPORARY_PASSWORD})

    rendered: RenderedEmail = OutboxEmailTemplateFactory().create(
        OutboxEventKind.CREDENTIALS_EMAIL, LOGIN_EMAIL, payload
    ).render()

    assert 'href="https://configured.example/login"' in rendered.html_body
    assert LOGIN_EMAIL in rendered.html_body


def test_factory_rejects_unsupported_event_kind() -> None:
    unsupported_kind: OutboxEventKind = "unsupported_kind"  # type: ignore[assignment]

    with pytest.raises(ValueError):
        OutboxEmailTemplateFactory().create(unsupported_kind, "a@b.c", "x")


def test_default_frontend_base_url_setting() -> None:
    assert type(settings).model_fields["FRONTEND_BASE_URL"].default == "https://crm.kitobedu.com"


def test_email_service_builds_alternative_inside_related_with_inline_logo() -> None:
    rendered: RenderedEmail = render_credentials()

    message = EmailService().build_message(
        LOGIN_EMAIL,
        rendered.subject,
        rendered.plain_text,
        rendered.html_body,
        rendered.inline_images,
    )

    assert message.get_content_type() == "multipart/related"
    root_parts: list[Message] = message.get_payload()
    assert root_parts[0].get_content_type() == "multipart/alternative"
    alternative_types: list[str] = [part.get_content_type() for part in root_parts[0].get_payload()]
    assert alternative_types == ["text/plain", "text/html"]
    image_part: Message = root_parts[1]
    assert image_part.get_content_type() == "image/png"
    assert image_part["Content-ID"] == f"<{LOGO_CONTENT_ID}>"
    assert image_part.get_content_disposition() == "inline"
    assert str(message["To"]) == LOGIN_EMAIL
    raw: str = message.as_string()
    assert re.search(r"^Subject: =\?utf-8\?", raw, re.MULTILINE)


def test_email_service_without_html_keeps_plain_multipart() -> None:
    message = EmailService().build_message("a@example.com", "Plain subject", "plain body")

    assert message.get_content_type() == "multipart/mixed"
    assert [part.get_content_type() for part in message.get_payload()] == ["text/plain"]
    assert message["Subject"] == "Plain subject"
