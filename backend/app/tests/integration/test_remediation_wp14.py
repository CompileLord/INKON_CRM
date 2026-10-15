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


class GcloudDeployHarness:
    def __init__(self, working_directory: Path) -> None:
        self.working_directory: Path = working_directory
        self.deploy_script: Path = working_directory / "gcp_deploy.sh"
        self.command_log: Path = working_directory / "gcloud-calls.log"
        self.fake_gcloud: Path = working_directory / "gcloud"

    def install(self, backend_root: Path, *, include_ignore_file: bool = True) -> None:
        self.deploy_script.write_bytes((backend_root / "scripts" / "gcp_deploy.sh").read_bytes())
        self.deploy_script.chmod(0o755)
        if include_ignore_file:
            (self.working_directory / ".gcloudignore").write_text(
                "storage/**\nscripts/.seed_cache/**\n",
                encoding="utf-8",
            )
        self.fake_gcloud.write_text(
            "#!/bin/sh\n"
            "printf '%s\\n' \"$*\" >> \"$WP14_GCLOUD_CALL_LOG\"\n"
            "case \"$1:$2:$3\" in\n"
            "  config:get-value:project) printf 'wp14-synthetic-project\\n' ;;\n"
            "  meta:list-files-for-upload:.) printf '%s\\n' \"$WP14_GCLOUD_LISTING\"; exit \"${WP14_GCLOUD_LIST_EXIT:-0}\" ;;\n"
            "  *) exit 0 ;;\n"
            "esac\n",
            encoding="utf-8",
        )
        self.fake_gcloud.chmod(0o755)

    def run(self, upload_listing: str) -> subprocess.CompletedProcess[str]:
        command_environment: dict[str, str] = os.environ.copy()
        command_environment.update({
            "PATH": f"{self.working_directory}:{command_environment['PATH']}",
            "WP14_GCLOUD_CALL_LOG": str(self.command_log),
            "WP14_GCLOUD_LISTING": upload_listing,
        })
        return subprocess.run(
            ["bash", str(self.deploy_script)],
            cwd=self.working_directory,
            env=command_environment,
            capture_output=True,
            text=True,
            timeout=20,
            check=False,
        )

    def recorded_calls(self) -> str:
        return self.command_log.read_text(encoding="utf-8") if self.command_log.exists() else ""


@pytest.mark.parametrize("ignore_filename", [".dockerignore", ".gcloudignore"])
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
    (tmp_path / ".gcloudignore").write_text(
        f"storage/**\nscripts/.seed_cache/**\n{reinclusion_rules}\n",
        encoding="utf-8",
    )
    exclusion_policy: BuildExclusionPolicy = BuildExclusionPolicy(tmp_path)

    assert not exclusion_policy.excludes(sentinel_path, ".gcloudignore")


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


@pytest.mark.parametrize(
    "unsafe_listing",
    [
        "storage/wp14-harmless-sentinel.bin",
        "scripts/.seed_cache/wp14-harmless-cache.bin",
    ],
)
def test_deployer_refuses_upload_listings_with_storage_or_seed_cache(
    tmp_path: Path,
    unsafe_listing: str,
) -> None:
    backend_root: Path = Path(__file__).resolve().parents[3]
    harness: GcloudDeployHarness = GcloudDeployHarness(tmp_path)
    harness.install(backend_root)

    process: subprocess.CompletedProcess[str] = harness.run(unsafe_listing)
    recorded_calls: str = harness.recorded_calls()

    assert process.returncode != 0
    assert "storage" in process.stdout.lower() + process.stderr.lower() or ".seed_cache" in process.stdout.lower() + process.stderr.lower()
    assert "builds submit" not in recorded_calls
    assert "run deploy" not in recorded_calls
    assert "services describe" not in recorded_calls



@pytest.mark.parametrize(
    "unsafe_path",
    ["storage/wp14-harmless-sentinel.bin", "scripts/.seed_cache/wp14-harmless-cache.bin"],
)
@pytest.mark.parametrize("unsafe_entry_position", ["first", "last"])
def test_deployer_refuses_large_upload_listings_with_private_files(
    tmp_path: Path,
    unsafe_path: str,
    unsafe_entry_position: str,
) -> None:
    backend_root: Path = Path(__file__).resolve().parents[3]
    harness: GcloudDeployHarness = GcloudDeployHarness(tmp_path)
    harness.install(backend_root)
    safe_paths: list[str] = [f"safe/file-{index:05d}.txt" for index in range(4000)]
    upload_paths: list[str] = (
        [unsafe_path, *safe_paths]
        if unsafe_entry_position == "first"
        else [*safe_paths, unsafe_path]
    )

    process: subprocess.CompletedProcess[str] = harness.run("\n".join(upload_paths))
    recorded_calls: str = harness.recorded_calls()

    assert process.returncode != 0
    assert "Storage uploads or seed caches" in process.stdout
    assert "meta list-files-for-upload ." in recorded_calls
    assert "config get-value project" not in recorded_calls
    assert "builds submit" not in recorded_calls
    assert "run deploy" not in recorded_calls
    assert "services describe" not in recorded_calls



def test_deployer_accepts_large_upload_listing_without_private_files(tmp_path: Path) -> None:
    backend_root: Path = Path(__file__).resolve().parents[3]
    harness: GcloudDeployHarness = GcloudDeployHarness(tmp_path)
    harness.install(backend_root)
    safe_listing: str = "\n".join(f"safe/file-{index:05d}.txt" for index in range(4000))

    process: subprocess.CompletedProcess[str] = harness.run(safe_listing)
    recorded_calls: str = harness.recorded_calls()

    assert process.returncode == 0
    assert "builds submit" in recorded_calls
    assert "run deploy" in recorded_calls
    assert "services describe" in recorded_calls


def test_deployer_refuses_missing_gcloudignore_before_running_gcloud(tmp_path: Path) -> None:
    backend_root: Path = Path(__file__).resolve().parents[3]
    harness: GcloudDeployHarness = GcloudDeployHarness(tmp_path)
    harness.install(backend_root, include_ignore_file=False)

    process: subprocess.CompletedProcess[str] = harness.run("")

    assert process.returncode != 0
    assert "gcloudignore" in process.stdout.lower() + process.stderr.lower()
    assert harness.recorded_calls() == ""


def test_deployer_refuses_failed_gcloud_upload_listing_before_build_or_deploy(tmp_path: Path) -> None:
    backend_root: Path = Path(__file__).resolve().parents[3]
    harness: GcloudDeployHarness = GcloudDeployHarness(tmp_path)
    harness.install(backend_root)
    listing_failure_environment: dict[str, str] = os.environ.copy()
    listing_failure_environment.update({
        "PATH": f"{tmp_path}:{listing_failure_environment['PATH']}",
        "WP14_GCLOUD_CALL_LOG": str(harness.command_log),
        "WP14_GCLOUD_LISTING": "",
        "WP14_GCLOUD_LIST_EXIT": "9",
    })

    process: subprocess.CompletedProcess[str] = subprocess.run(
        ["bash", str(harness.deploy_script)],
        cwd=tmp_path,
        env=listing_failure_environment,
        capture_output=True,
        text=True,
        timeout=20,
        check=False,
    )
    recorded_calls: str = harness.recorded_calls()

    assert process.returncode != 0
    assert "meta list-files-for-upload ." in recorded_calls
    assert "builds submit" not in recorded_calls
    assert "run deploy" not in recorded_calls
    assert "services describe" not in recorded_calls
