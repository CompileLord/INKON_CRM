from typing import ClassVar, FrozenSet


class PasswordPolicy:
    minimum_length: ClassVar[int] = 8
    violation_message: ClassVar[str] = (
        "Password must be at least 8 characters, contain a digit, not be all digits and not be a common password"
    )
    common_passwords: ClassVar[FrozenSet[str]] = frozenset(
        {
            "password", "password1", "password12", "password123", "password1234", "passw0rd", "p@ssw0rd",
            "p@ssword1", "pa55word", "pa55w0rd", "qwerty123", "qwerty1234", "qwertyui1", "qwertyuiop1",
            "1qaz2wsx", "1q2w3e4r", "1q2w3e4r5t", "q1w2e3r4", "q1w2e3r4t5", "zaq12wsx", "abc12345",
            "abcd1234", "abcd12345", "abc123456", "a1b2c3d4", "asdf1234", "asdfghjk1", "zxcvbnm1",
            "iloveyou1", "iloveyou12", "welcome1", "welcome12", "welcome123", "letmein1", "letmein123",
            "admin123", "admin1234", "admin12345", "administrator1", "root1234", "changeme1",
            "changeme123", "default123", "master123", "monkey123", "dragon123", "football1",
            "football123", "baseball1", "superman1", "batman123", "sunshine1", "princess1", "shadow123",
            "trustno1", "freedom1", "whatever1", "starwars1", "hello123", "hello1234", "test1234",
            "test12345", "testing123", "user1234", "login123", "guest1234", "secret123", "temp1234",
            "temp12345", "qazwsx123", "qazwsxedc1", "123qweasd", "123qwe123", "qwe123qwe", "qwe12345",
            "pass1234", "pass12345", "kitob123", "kitob1234", "imkon123", "imkon1234", "student123",
            "mentor123", "teacher123", "dushanbe1", "tajikistan1", "somoni123",
        }
    )

    @classmethod
    def violation(cls, password: str) -> str | None:
        if (
            len(password) < cls.minimum_length
            or password.isdigit()
            or not any(character.isdigit() for character in password)
            or password.casefold() in cls.common_passwords
        ):
            return cls.violation_message
        return None
