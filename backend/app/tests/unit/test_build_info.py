import dataclasses

import pytest

from app.core.build_info import BuildInfo


def test_unset_environment_yields_safe_defaults() -> None:
    build_info: BuildInfo = BuildInfo.from_environment({})
    assert build_info == BuildInfo(version="dev", commit_sha="unknown", commit_message="unknown", built_at="unknown")


def test_environment_values_are_read_and_trimmed() -> None:
    build_info: BuildInfo = BuildInfo.from_environment(
        {
            "BUILD_VERSION": " 1.2.3 ",
            "BUILD_COMMIT_SHA": "abc1234def",
            "BUILD_COMMIT_MESSAGE": "feat(system): add version",
            "BUILD_TIME": "2026-10-17T10:00:00Z",
        }
    )
    assert build_info.version == "1.2.3"
    assert build_info.commit_sha == "abc1234def"
    assert build_info.commit_message == "feat(system): add version"
    assert build_info.built_at == "2026-10-17T10:00:00Z"


def test_blank_values_fall_back_to_defaults() -> None:
    build_info: BuildInfo = BuildInfo.from_environment({"BUILD_VERSION": "  ", "BUILD_COMMIT_SHA": ""})
    assert build_info.version == "dev"
    assert build_info.commit_sha == "unknown"


def test_build_info_is_immutable() -> None:
    build_info: BuildInfo = BuildInfo.from_environment({})
    with pytest.raises(dataclasses.FrozenInstanceError):
        build_info.version = "changed"  # type: ignore[misc]
