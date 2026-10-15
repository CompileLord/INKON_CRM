import argparse
import asyncio
import os
import re
import sys
import warnings
from getpass import GetPassWarning, getpass
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import select

from app.core.security import hash_password
from app.db.session import AsyncSessionLocal
from app.models.user import User, UserRole


class AdminSeedCommand:
    def __init__(self) -> None:
        self.parser: argparse.ArgumentParser = argparse.ArgumentParser(
            description="Seed a superadmin user into the database."
        )
        self.parser.add_argument("--email", help="Email address of the superadmin.")
        self.parser.add_argument("--first-name", help="First name of the superadmin.")
        self.parser.add_argument("--last-name", help="Last name of the superadmin.")
        password_source: argparse._MutuallyExclusiveGroup = self.parser.add_mutually_exclusive_group()
        password_source.add_argument(
            "--password-stdin",
            action="store_true",
            help="Read the password from standard input.",
        )
        password_source.add_argument(
            "--password-fd",
            type=int,
            help="Read the password from the specified file descriptor.",
        )
        self.parser.add_argument(
            "--non-interactive",
            action="store_true",
            help="Require email and a password source; default missing names.",
        )

    @staticmethod
    def _validate_email(email: str) -> bool:
        return bool(re.match(r"^[\w.-]+@[\w.-]+\.\w+$", email))

    @staticmethod
    def _validate_password(password: str) -> bool:
        return len(password) >= 8

    @staticmethod
    def _read_password_from_descriptor(file_descriptor: int) -> str:
        with os.fdopen(os.dup(file_descriptor), "r", encoding="utf-8") as password_stream:
            password_line: str = password_stream.readline()
        return password_line.removesuffix("\n").removesuffix("\r")

    @staticmethod
    def _read_terminal_password(prompt: str) -> str:
        try:
            terminal_descriptor: int = os.open("/dev/tty", os.O_RDWR | os.O_NOCTTY)
        except OSError:
            print(
                "Interactive password entry requires a controlling terminal; use protected input.",
                file=sys.stderr,
            )
            raise SystemExit(1)
        os.close(terminal_descriptor)

        try:
            with warnings.catch_warnings():
                warnings.simplefilter("error", GetPassWarning)
                return getpass(prompt)
        except GetPassWarning:
            print(
                "Unable to disable terminal echo; use protected input.",
                file=sys.stderr,
            )
            raise SystemExit(1)

    def _read_password(self, arguments: argparse.Namespace) -> str | None:
        if arguments.password_stdin:
            return sys.stdin.readline().removesuffix("\n").removesuffix("\r")
        if arguments.password_fd is not None:
            return self._read_password_from_descriptor(arguments.password_fd)
        if arguments.non_interactive:
            return None

        while True:
            candidate_password: str = self._read_terminal_password("Enter Password: ")
            if not candidate_password:
                print("Password cannot be empty.")
                continue
            if not self._validate_password(candidate_password):
                print("Password must be at least 8 characters long.")
                continue
            confirmed_password: str = self._read_terminal_password("Confirm Password: ")
            if candidate_password != confirmed_password:
                print("Passwords do not match. Please try again.")
                continue
            return candidate_password

    def _parse_arguments(self, argument_values: list[str]) -> argparse.Namespace:
        if any(
            argument == "--password" or argument.startswith("--password=")
            for argument in argument_values
        ):
            print("The password argument is not supported; provide it through a protected input.", file=sys.stderr)
            raise SystemExit(2)
        return self.parser.parse_args(argument_values)

    async def _seed_user(
        self,
        email: str,
        password: str,
        first_name: str,
        last_name: str,
    ) -> int:
        try:
            async with AsyncSessionLocal() as session:
                query: Any = select(User).filter(User.email == email)
                result = await session.execute(query)
                if result.scalars().first():
                    print("A user with that email already exists.", file=sys.stderr)
                    return 1

                admin_user: User = User(
                    email=email,
                    password_hash=hash_password(password),
                    first_name=first_name,
                    last_name=last_name,
                    role=UserRole.SUPERADMIN,
                    must_set_password=False,
                )
                session.add(admin_user)
                await session.commit()
        except Exception:
            print("Database operation failed; details are suppressed.", file=sys.stderr)
            return 1

        print("Superadmin user successfully created!")
        print(f"Email: {email}")
        return 0

    async def run(self, argument_values: list[str] | None = None) -> int:
        arguments: argparse.Namespace = self._parse_arguments(
            sys.argv[1:] if argument_values is None else argument_values
        )
        first_name: str = arguments.first_name or "Admin"
        last_name: str = arguments.last_name or "Super"
        if not arguments.non_interactive:
            if not arguments.first_name:
                first_name = input("Enter First Name [Admin]: ").strip() or "Admin"
            if not arguments.last_name:
                last_name = input("Enter Last Name [Super]: ").strip() or "Super"

        email: str | None = arguments.email
        if not email and not arguments.non_interactive:
            while True:
                email = input("Enter Email: ").strip()
                if not email:
                    print("Email cannot be empty. Please try again.")
                    continue
                if not self._validate_email(email):
                    print("Invalid email format. Please try again.")
                    continue
                break
        if not email:
            print("A valid email is required.", file=sys.stderr)
            return 1
        if not self._validate_email(email):
            print("Invalid email format.", file=sys.stderr)
            return 1

        password: str | None = self._read_password(arguments)
        if password is None:
            print("A password input source is required in non-interactive mode.", file=sys.stderr)
            return 1
        if not self._validate_password(password):
            print("Password must be at least 8 characters long.", file=sys.stderr)
            return 1

        print(f"\nSeeding superadmin: {first_name} {last_name} ({email})...")
        return await self._seed_user(email, password, first_name, last_name)


def main() -> int:
    return asyncio.run(AdminSeedCommand().run())


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        print("\nOperation cancelled by user.")
        sys.exit(1)
