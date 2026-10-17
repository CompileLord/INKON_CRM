import os
from dataclasses import dataclass
from functools import lru_cache
from typing import Mapping

UNSET_VERSION: str = "dev"
UNSET_VALUE: str = "unknown"


@dataclass(frozen=True)
class BuildInfo:
    version: str
    commit_sha: str
    commit_message: str
    built_at: str

    @classmethod
    def from_environment(cls, environment: Mapping[str, str]) -> "BuildInfo":
        return cls(
            version=cls._read(environment, "BUILD_VERSION", UNSET_VERSION),
            commit_sha=cls._read(environment, "BUILD_COMMIT_SHA", UNSET_VALUE),
            commit_message=cls._read(environment, "BUILD_COMMIT_MESSAGE", UNSET_VALUE),
            built_at=cls._read(environment, "BUILD_TIME", UNSET_VALUE),
        )

    @staticmethod
    def _read(environment: Mapping[str, str], name: str, default: str) -> str:
        value: str = environment.get(name, "").strip()
        return value or default


@lru_cache(maxsize=1)
def get_build_info() -> BuildInfo:
    return BuildInfo.from_environment(os.environ)
