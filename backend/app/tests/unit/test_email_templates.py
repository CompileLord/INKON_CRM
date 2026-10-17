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


def test_credentials_html_has_russian_tajik_and_english_sections() -> None:
    rendered: RenderedEmail = render_credentials()

    for expected_text in (
        "Добро пожаловать в KITOB",
        "при первом входе выберите новый пароль",
        "Хуш омадед ба KITOB",
        "пароли нав интихоб кунед",
        "Welcome to KITOB",
        "choose a new password the first time you sign in",
    ):
        assert expected_text in rendered.html_body


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


def test_credentials_plain_text_carries_the_same_facts() -> None:
    rendered: RenderedEmail = render_credentials()

    assert f"Login: {LOGIN_EMAIL}" in rendered.plain_text
    assert f"Temporary password: {TEMPORARY_PASSWORD}" in rendered.plain_text
    assert LOGIN_URL in rendered.plain_text
    assert "Farrukh" in rendered.plain_text
    assert "Добро пожаловать в KITOB" in rendered.plain_text
    assert "Хуш омадед ба KITOB" in rendered.plain_text
    assert "choose a new password" in rendered.plain_text


def test_credentials_subject_is_trilingual_and_branded() -> None:
    rendered: RenderedEmail = render_credentials()

    assert rendered.subject == "KITOB — Ваши данные для входа / Маълумоти воридшавӣ / Your login details"


def test_credentials_rendering_attaches_logo_png_under_size_budget() -> None:
    rendered: RenderedEmail = render_credentials()

    assert len(rendered.inline_images) == 1
    logo = rendered.inline_images[0]
    assert logo.content_id == LOGO_CONTENT_ID
    assert logo.data.startswith(b"\x89PNG")
    assert len(logo.data) < 30_000


@pytest.mark.parametrize(
    ("template_class", "plain_prefix", "tajik_heading"),
    [
        (VerificationCodeEmailTemplate, "Your verification code:", "Рамзи тасдиқи шумо"),
        (PasswordResetEmailTemplate, "Your password reset code:", "Рамз барои барқарор кардани парол"),
    ],
)
def test_code_templates_render_code_in_html_and_plain_text(
    template_class: type[VerificationCodeEmailTemplate] | type[PasswordResetEmailTemplate],
    plain_prefix: str,
    tajik_heading: str,
) -> None:
    rendered: RenderedEmail = template_class(code="123456").render()

    assert "123456" in rendered.html_body
    assert f"{plain_prefix} 123456" in rendered.plain_text
    assert f"cid:{LOGO_CONTENT_ID}" in rendered.html_body
    assert tajik_heading in rendered.html_body
    assert tajik_heading in rendered.plain_text
    assert rendered.subject.startswith("KITOB")
    assert "IMKON" not in rendered.html_body + rendered.plain_text + rendered.subject


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

    assert 'href="https://configured.example"' in rendered.html_body
    assert LOGIN_EMAIL in rendered.html_body


def test_factory_rejects_unsupported_event_kind() -> None:
    unsupported_kind: OutboxEventKind = "unsupported_kind"  # type: ignore[assignment]

    with pytest.raises(ValueError):
        OutboxEmailTemplateFactory().create(unsupported_kind, "a@b.c", "x")


def test_default_frontend_base_url_setting() -> None:
    assert type(settings).model_fields["FRONTEND_BASE_URL"].default == "https://imkon-crm.pages.dev"


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
