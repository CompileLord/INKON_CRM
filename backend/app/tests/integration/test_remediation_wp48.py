import re
from pathlib import Path
from typing import Dict, List

REPOSITORY_ROOT: Path = Path(__file__).resolve().parents[4]
WORKFLOW_DIRECTORY: Path = REPOSITORY_ROOT / ".github" / "workflows"
FULL_COMMIT_SHA_PATTERN: re.Pattern[str] = re.compile(r"^[0-9a-f]{40}$")
IMAGE_DIGEST_PATTERN: re.Pattern[str] = re.compile(r"@sha256:[0-9a-f]{64}$")


class ReleaseFileReader:
    @staticmethod
    def read(relative_path: str) -> str:
        return (REPOSITORY_ROOT / relative_path).read_text(encoding="utf-8")

    @staticmethod
    def workflow_paths() -> List[Path]:
        return sorted(WORKFLOW_DIRECTORY.glob("*.yml"))

    @staticmethod
    def split_jobs(workflow_text: str) -> Dict[str, str]:
        jobs_body: str = workflow_text.split("\njobs:\n", 1)[1]
        job_blocks: Dict[str, str] = {}
        current_name: str = ""
        for line in jobs_body.splitlines():
            header_match: re.Match[str] | None = re.match(r"^  ([a-z0-9_-]+):\s*$", line)
            if header_match:
                current_name = header_match.group(1)
                job_blocks[current_name] = ""
            elif current_name:
                job_blocks[current_name] += line + "\n"
        return job_blocks


class LockfileReader:
    @classmethod
    def requirement_entries(cls) -> Dict[str, str]:
        lock_text: str = ReleaseFileReader.read("backend/requirements.lock")
        entries: Dict[str, str] = {}
        for block in re.split(r"\n(?=[A-Za-z0-9_.\-]+==)", lock_text.strip()):
            name_match: re.Match[str] | None = re.match(r"([A-Za-z0-9_.\-]+)==", block)
            if name_match:
                entries[name_match.group(1).lower().replace("_", "-")] = block
        return entries

    @staticmethod
    def direct_requirement_names() -> List[str]:
        names: List[str] = []
        for line in ReleaseFileReader.read("backend/requirements.txt").splitlines():
            stripped: str = line.strip()
            if stripped:
                names.append(re.split(r"[\[<>=!~ ]", stripped, maxsplit=1)[0].lower().replace("_", "-"))
        return names


class TestLockfileHashLocking:
    def test_every_locked_requirement_is_exactly_pinned_with_hashes(self) -> None:
        entries: Dict[str, str] = LockfileReader.requirement_entries()
        assert len(entries) > 20
        for name, block in entries.items():
            assert re.match(r"^[^\s]+==[^\s\\]+", block), name
            assert re.search(r"--hash=sha256:[0-9a-f]{64}", block), name

    def test_every_direct_requirement_appears_in_the_lock(self) -> None:
        entries: Dict[str, str] = LockfileReader.requirement_entries()
        missing: List[str] = [
            name for name in LockfileReader.direct_requirement_names() if name not in entries
        ]
        assert missing == []

    def test_lock_contains_no_unhashed_or_url_requirements(self) -> None:
        lock_text: str = ReleaseFileReader.read("backend/requirements.lock")
        for line in lock_text.splitlines():
            stripped: str = line.strip()
            if not stripped or stripped.startswith(("#", "--hash=")):
                continue
            assert re.match(r"^[A-Za-z0-9_.\-]+==", stripped), stripped
            assert "@" not in stripped.split("#", 1)[0]


class TestImageInstallsFromHashedLock:
    def test_dockerfile_installs_only_the_hashed_lock(self) -> None:
        dockerfile_text: str = ReleaseFileReader.read("backend/Dockerfile")
        assert "--require-hashes" in dockerfile_text
        assert "-r requirements.lock" in dockerfile_text
        assert "requirements.txt" not in dockerfile_text

    def test_dockerfile_base_images_are_digest_pinned(self) -> None:
        from_lines: List[str] = [
            line.split()[1]
            for line in ReleaseFileReader.read("backend/Dockerfile").splitlines()
            if line.startswith("FROM ")
        ]
        assert len(from_lines) == 2
        for image_reference in from_lines:
            assert IMAGE_DIGEST_PATTERN.search(image_reference), image_reference

    def test_ci_installs_and_audits_through_the_hashed_lock(self) -> None:
        ci_text: str = ReleaseFileReader.read(".github/workflows/ci.yml")
        assert "backend/requirements.txt" not in ci_text
        install_lines: List[str] = [line for line in ci_text.splitlines() if "pip install" in line]
        assert len(install_lines) == 5
        for line in install_lines:
            assert re.search(r"--require-hashes -r backend/requirements(-ci)?\.lock$", line.strip()), line
        assert "pip-audit --require-hashes -r backend/requirements.lock" in ci_text

    def test_ci_tooling_lock_pins_ruff_and_pip_audit_with_hashes(self) -> None:
        tooling_text: str = ReleaseFileReader.read("backend/requirements-ci.lock")
        for tool_name in ("ruff", "pip-audit"):
            assert re.search(rf"^{tool_name}==\d+(\.\d+)+ \\\n    --hash=sha256:[0-9a-f]{{64}}", tooling_text, re.MULTILINE), tool_name

    def test_wrangler_version_is_an_exact_pin(self) -> None:
        deploy_text: str = ReleaseFileReader.read(".github/workflows/deploy-frontend.yml")
        version_match: re.Match[str] | None = re.search(r"wranglerVersion:\s*'(\d+\.\d+\.\d+)'", deploy_text)
        assert version_match is not None


class TestWorkflowPinning:
    def test_every_action_reference_is_a_full_commit_sha(self) -> None:
        references: List[str] = []
        for workflow_path in ReleaseFileReader.workflow_paths():
            for match in re.finditer(r"uses:\s*(\S+)", workflow_path.read_text(encoding="utf-8")):
                references.append(match.group(1))
        assert len(references) > 20
        for reference in references:
            _, _, revision = reference.partition("@")
            assert FULL_COMMIT_SHA_PATTERN.match(revision), reference

    def test_every_workflow_and_compose_image_is_digest_pinned(self) -> None:
        image_references: List[str] = []
        sources: List[str] = [
            path.read_text(encoding="utf-8") for path in ReleaseFileReader.workflow_paths()
        ]
        sources.append(ReleaseFileReader.read("deploy/docker-compose.prod.yml"))
        for source in sources:
            for match in re.finditer(r"^\s*image:\s*(\S+)", source, re.MULTILINE):
                reference: str = match.group(1)
                if "${IMAGE_TAG" not in reference:
                    image_references.append(reference)
        assert len(image_references) >= 6
        for reference in image_references:
            assert IMAGE_DIGEST_PATTERN.search(reference), reference

    def test_vm_setup_script_does_not_pipe_a_remote_installer_into_a_shell(self) -> None:
        script_text: str = ReleaseFileReader.read("backend/scripts/setup_free_tier_vm.sh")
        assert not re.search(r"curl[^\n|]*\|\s*(sh|bash)", script_text)
        assert "get.docker.com" not in script_text


class TestFrontendCredentialIsolation:
    def jobs(self) -> Dict[str, str]:
        return ReleaseFileReader.split_jobs(ReleaseFileReader.read(".github/workflows/deploy-frontend.yml"))

    def test_workflow_is_split_into_target_build_and_deploy(self) -> None:
        assert list(self.jobs().keys()) == ["target", "build", "deploy"]

    def test_build_job_runs_repository_code_without_credentials(self) -> None:
        build_job: str = self.jobs()["build"]
        assert "npm ci" in build_job
        assert "secrets." not in build_job
        assert "CLOUDFLARE" not in build_job
        assert not re.search(r"^    environment:", build_job, re.MULTILINE)
        assert "persist-credentials: false" in build_job
        assert "wrangler" not in build_job

    def test_deploy_job_holds_credentials_but_never_runs_repository_code(self) -> None:
        deploy_job: str = self.jobs()["deploy"]
        assert "secrets.CLOUDFLARE_API_TOKEN" in deploy_job
        assert "needs: [target, build]" in deploy_job
        for forbidden in ("actions/checkout", "npm ", "npx ", "setup-node"):
            assert forbidden not in deploy_job

    def test_target_job_runs_no_repository_code(self) -> None:
        target_job: str = self.jobs()["target"]
        assert "actions/checkout" not in target_job
        assert "secrets." not in target_job


class TestReleaseGateRemainsIntact:
    def test_verify_release_gate_is_still_invoked_before_publishing(self) -> None:
        for workflow_name in ("build-image", "deploy-backend"):
            workflow_text: str = ReleaseFileReader.read(f".github/workflows/{workflow_name}.yml")
            assert "bash deploy/verify-release.sh" in workflow_text
            assert "ref: main" in workflow_text
