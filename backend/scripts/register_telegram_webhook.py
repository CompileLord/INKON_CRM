import argparse
import asyncio
import logging
import sys

from aiogram import Bot


class TelegramWebhookRegistrationCommand:
    def __init__(
        self,
        bot: Bot,
        webhook_url: str,
        secret_token: str,
        logger: logging.Logger | None = None,
    ) -> None:
        self.bot: Bot = bot
        self.webhook_url: str = webhook_url
        self.secret_token: str = secret_token
        self.logger: logging.Logger = logger or logging.getLogger(__name__)

    def _validate_configuration(self) -> None:
        from app.core.config import Settings, settings

        if (
            not 1 <= len(self.secret_token) <= 256
            or not self.secret_token.isascii()
            or not all(
                character.isalnum() or character in "_-"
                for character in self.secret_token
            )
        ):
            raise ValueError("Telegram webhook secret token has an invalid format.")

        configuration_values: dict[str, object] = settings.model_dump()
        configuration_values["TESTING"] = False
        configuration_values["TELEGRAM_WEBHOOK_URL"] = self.webhook_url
        Settings(**configuration_values)

    async def run(self) -> int:
        result_code: int = 1
        try:
            self._validate_configuration()
            registration_succeeded: bool = await self.bot.set_webhook(
                url=self.webhook_url,
                secret_token=self.secret_token,
            )
            if registration_succeeded:
                self.logger.info("Telegram webhook registration completed.")
                result_code = 0
            else:
                self.logger.error("Telegram webhook registration was rejected.")
        except Exception as error:
            self.logger.error(
                "Telegram webhook registration failed (%s).",
                type(error).__name__,
            )
        finally:
            try:
                await self.bot.session.close()
            except Exception as error:
                self.logger.error(
                    "Telegram bot session cleanup failed (%s).",
                    type(error).__name__,
                )
                result_code = 1
        return result_code


async def main() -> int:
    argument_parser: argparse.ArgumentParser = argparse.ArgumentParser(
        description="Register the Telegram webhook once per deployment.",
        epilog=(
            "Run from the backend root with: "
            "python -m scripts.register_telegram_webhook"
        ),
    )
    argument_parser.parse_args()

    try:
        from app.core.config import settings

        bot: Bot = Bot(token=settings.TELEGRAM_BOT_TOKEN)
        command: TelegramWebhookRegistrationCommand = TelegramWebhookRegistrationCommand(
            bot,
            settings.TELEGRAM_WEBHOOK_URL,
            settings.TELEGRAM_BOT_SECRET_TOKEN,
        )
    except Exception as error:
        logging.getLogger(__name__).error(
            "Telegram webhook registration configuration failed (%s).",
            type(error).__name__,
        )
        return 1

    return await command.run()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    sys.exit(asyncio.run(main()))
