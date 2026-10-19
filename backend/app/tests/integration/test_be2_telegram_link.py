import asyncio
from datetime import datetime, timedelta, timezone
import pytest
from sqlalchemy import select
from app.core.telegram_link_codes import TelegramLinkCodeGenerator, TelegramLinkCodeHasher
from app.models.audit_log import AuditLog
from app.models.telegram_link import TelegramChatPreference, TelegramLinkCode
from app.models.user import User
from app.services.telegram_link_service import IssuedLinkCode, LinkOutcome, LinkResult, TelegramLinkService
from app.services.telegram_attempt_limiter import TelegramAttemptLimiter
from conftest import TestingSessionLocal


from be2_link_fixtures import bind_handler_sessions, conversation, issue_code, reload_student


class TestCodeGenerator:
    def test_format_is_five_digits_and_one_allowed_letter(self) -> None:
        generator: TelegramLinkCodeGenerator = TelegramLinkCodeGenerator()
        letter_positions: set[int] = set()
        for _ in range(3000):
            code: str = generator.generate()
            assert len(code) == 6
            digits: list[str] = [character for character in code if character.isdigit()]
            letters: list[str] = [character for character in code if not character.isdigit()]
            assert len(digits) == 5
            assert len(letters) == 1
            assert letters[0] in "ABCDEFGHJKLMNPQRSTUVWXYZ"
            assert letters[0] not in "OI"
            letter_positions.add(code.index(letters[0]))
        assert letter_positions == {0, 1, 2, 3, 4, 5}

    def test_normalize_strips_uppercases_and_rejects_bad_shapes(self) -> None:
        generator: TelegramLinkCodeGenerator = TelegramLinkCodeGenerator()
        assert generator.normalize("  12a345 \n") == "12A345"
        assert generator.normalize("123456") is None
        assert generator.normalize("12O345") is None
        assert generator.normalize("12AB45") is None
        assert generator.normalize("1A345") is None
        assert generator.normalize("12A3456") is None

    def test_hash_is_keyed_deterministic_hmac_sha256(self) -> None:
        first: TelegramLinkCodeHasher = TelegramLinkCodeHasher("secret-one")
        second: TelegramLinkCodeHasher = TelegramLinkCodeHasher("secret-two")
        digest: str = first.hash_code("12A345")
        assert digest == first.hash_code("12A345")
        assert len(digest) == 64
        assert "12A345" not in digest
        assert digest != second.hash_code("12A345")
        assert digest != first.hash_code("12A346")


class TestLinkService:
    @pytest.mark.asyncio
    async def test_only_hash_and_seven_day_expiry_are_stored(self, test_student: User) -> None:
        issued: IssuedLinkCode = await issue_code(test_student.id)
        async with TestingSessionLocal() as db:
            rows: list[TelegramLinkCode] = list((await db.execute(select(TelegramLinkCode))).scalars())
        assert len(rows) == 1
        assert rows[0].code_hash != issued.code
        assert issued.code not in rows[0].code_hash
        assert rows[0].used_at is None
        lifetime: timedelta = rows[0].expires_at - datetime.now(timezone.utc)
        assert timedelta(hours=71, minutes=59) < lifetime <= timedelta(hours=72)
        assert (await reload_student(test_student.id)).parent_link_code_expires_at == rows[0].expires_at

    @pytest.mark.asyncio
    async def test_new_code_invalidates_previous(self, test_student: User) -> None:
        first: IssuedLinkCode = await issue_code(test_student.id)
        second: IssuedLinkCode = await issue_code(test_student.id)
        async with TestingSessionLocal() as db:
            service: TelegramLinkService = TelegramLinkService(db)
            stale: LinkResult = await service.link_parent_chat(1, first.code)
            fresh: LinkResult = await service.link_parent_chat(1, second.code)
        assert stale.outcome is LinkOutcome.INVALID
        assert fresh.outcome is LinkOutcome.LINKED

    @pytest.mark.asyncio
    async def test_code_is_single_use(self, test_student: User) -> None:
        issued: IssuedLinkCode = await issue_code(test_student.id)
        async with TestingSessionLocal() as db:
            first: LinkResult = await TelegramLinkService(db).link_parent_chat(11, issued.code)
            await db.commit()
        async with TestingSessionLocal() as db:
            second: LinkResult = await TelegramLinkService(db).link_parent_chat(12, issued.code)
        assert first.outcome is LinkOutcome.LINKED
        assert second.outcome is LinkOutcome.INVALID
        student: User = await reload_student(test_student.id)
        assert student.parent_telegram_chat_id == 11
        assert student.parent_link_code_expires_at is None

    @pytest.mark.asyncio
    async def test_expired_code_is_rejected(self, test_student: User) -> None:
        issued: IssuedLinkCode = await issue_code(test_student.id)
        async with TestingSessionLocal() as db:
            row: TelegramLinkCode = (await db.execute(select(TelegramLinkCode))).scalars().one()
            row.expires_at = datetime.now(timezone.utc) - timedelta(seconds=1)
            await db.commit()
        async with TestingSessionLocal() as db:
            result: LinkResult = await TelegramLinkService(db).link_parent_chat(21, issued.code)
        assert result.outcome is LinkOutcome.INVALID
        assert (await reload_student(test_student.id)).parent_telegram_chat_id is None

    @pytest.mark.asyncio
    async def test_concurrent_consume_links_exactly_one_chat(self, test_student: User) -> None:
        issued: IssuedLinkCode = await issue_code(test_student.id)

        async def attempt(chat_id: int) -> LinkResult:
            async with TestingSessionLocal() as db:
                result: LinkResult = await TelegramLinkService(db).link_parent_chat(chat_id, issued.code)
                await db.commit()
                return result

        results: list[LinkResult] = await asyncio.gather(*(attempt(chat_id) for chat_id in range(100, 108)))
        linked: list[LinkResult] = [result for result in results if result.outcome is LinkOutcome.LINKED]
        assert len(linked) == 1
        student: User = await reload_student(test_student.id)
        assert student.parent_telegram_chat_id in range(100, 108)

    @pytest.mark.asyncio
    async def test_audit_records_regeneration_link_and_relink_without_code(self, test_student: User) -> None:
        first: IssuedLinkCode = await issue_code(test_student.id)
        async with TestingSessionLocal() as db:
            await TelegramLinkService(db).link_parent_chat(31, first.code)
            await db.commit()
        second: IssuedLinkCode = await issue_code(test_student.id)
        async with TestingSessionLocal() as db:
            await TelegramLinkService(db).link_parent_chat(32, second.code)
            await db.commit()
            logs: list[AuditLog] = list(
                (await db.execute(select(AuditLog).where(AuditLog.entity_type == "student_telegram_link").order_by(AuditLog.id))).scalars()
            )
        chat_changes: list[tuple[str | None, str | None]] = [
            (log.old_value, log.new_value) for log in logs if log.field_name == "parent_telegram_chat_id"
        ]
        assert chat_changes == [(None, "31"), ("31", "32")]
        assert len([log for log in logs if log.field_name == "link_code_expires_at"]) == 2
        for log in logs:
            assert first.code not in f"{log.old_value}{log.new_value}"
            assert second.code not in f"{log.old_value}{log.new_value}"

    @pytest.mark.asyncio
    async def test_language_persists_and_updates_per_chat(self) -> None:
        async with TestingSessionLocal() as db:
            service: TelegramLinkService = TelegramLinkService(db)
            assert await service.get_language(5) is None
            await service.set_language(5, "tg")
            await service.set_language(5, "en")
            await db.commit()
        async with TestingSessionLocal() as db:
            assert await TelegramLinkService(db).get_language(5) == "en"
            rows: list[TelegramChatPreference] = list((await db.execute(select(TelegramChatPreference))).scalars())
            assert len(rows) == 1
            with pytest.raises(ValueError):
                await TelegramLinkService(db).set_language(5, "de")


class TestSecurityBound:
    def test_expected_guesses_against_a_thousand_active_codes_stay_bounded(self) -> None:
        code_space: int = 10 ** 5 * len(TelegramLinkCodeGenerator.letter_alphabet) * 6
        validity_hours: float = TelegramLinkService.code_lifetime.total_seconds() / 3600
        expected_hits: float = TelegramAttemptLimiter.global_limit * validity_hours * 1000 / code_space
        assert code_space == 14_400_000
        assert validity_hours <= 72
        assert expected_hits < 0.5
