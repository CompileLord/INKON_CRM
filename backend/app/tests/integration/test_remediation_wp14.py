from fnmatch import fnmatchcase
import os
from pathlib import Path
import subprocess

import pytest


class BuildExclusionPolicy:
    def __init__(self, backend_root: Path) -> None:
        self.backend_root: Path = backend_root

    def reads_rules(self, ignore_filename: str) -> list[str]:
        ignore_path: Path = self.backend_root / ignore_filename
        if not ignore_path.is_file():
            return []
        return [
            line.strip()
            for line in ignore_path.read_text(encoding="utf-8").splitlines()
            if line.strip() and not line.lstrip().startswith("#")
        ]

    def excludes(self, relative_path: str, ignore_filename: str) -> bool:
        is_excluded: bool = False
        for rule in self.reads_rules(ignore_filename):
            is_reinclusion: bool = rule.startswith("!")
            normalized_rule: str = (rule[1:] if is_reinclusion else rule).lstrip("/")
            directory_rule: str = normalized_rule.removesuffix("/**").rstrip("/")
            matches_rule: bool = (
                relative_path == directory_rule
                or relative_path.startswith(f"{directory_rule}/")
                or fnmatchcase(relative_path, normalized_rule)
            )
            if matches_rule:
                is_excluded = not is_reinclusion
        return is_excluded


@pytest.mark.parametrize("ignore_filename", [".dockerignore"])
@pytest.mark.parametrize(
    "sentinel_path",
    ["storage/wp14-harmless-sentinel.bin", "scripts/.seed_cache/wp14-harmless-cache.bin"],
)
def test_build_upload_sentinels_are_excluded_from_contexts(
    ignore_filename: str,
    sentinel_path: str,
) -> None:
    backend_root: Path = Path(__file__).resolve().parents[3]
    exclusion_policy: BuildExclusionPolicy = BuildExclusionPolicy(backend_root)

    assert exclusion_policy.excludes(sentinel_path, ignore_filename)


@pytest.mark.parametrize(
    "sentinel_path,reinclusion_rules",
    [
        ("storage/wp14-harmless-sentinel.bin", "!storage/\n!storage/**"),
        ("scripts/.seed_cache/wp14-harmless-cache.bin", "!scripts/.seed_cache/\n!scripts/.seed_cache/**"),
    ],
)
def test_ordered_reinclusion_rules_restore_sentinel_to_context(
    tmp_path: Path,
    sentinel_path: str,
    reinclusion_rules: str,
) -> None:
    (tmp_path / ".dockerignore").write_text(
        f"storage/**\nscripts/.seed_cache/**\n{reinclusion_rules}\n",
        encoding="utf-8",
    )
    exclusion_policy: BuildExclusionPolicy = BuildExclusionPolicy(tmp_path)

    assert not exclusion_policy.excludes(sentinel_path, ".dockerignore")


def test_runtime_image_creates_empty_writable_storage_without_copying_uploads() -> None:
    dockerfile_path: Path = Path(__file__).resolve().parents[3] / "Dockerfile"
    dockerfile_lines: list[str] = dockerfile_path.read_text(encoding="utf-8").splitlines()
    copy_instructions: list[str] = [
        line.strip().lower()
        for line in dockerfile_lines
        if line.strip().lower().startswith("copy ")
    ]
    runtime_storage_initialization: bool = any(
        "mkdir -p /app/storage" in line.lower() for line in dockerfile_lines
    )

    assert not any("storage/" in instruction for instruction in copy_instructions)
    assert runtime_storage_initialization
