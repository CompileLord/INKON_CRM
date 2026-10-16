# CI/CD Pipeline Status

Specification: [docs/CI_CD_PIPELINE_PLAN.md](docs/CI_CD_PIPELINE_PLAN.md).

Statuses: `not started` · `in progress` · `blocked` · `finished`.
Update a row when a task starts, finishes or blocks. `finished` requires its acceptance check to have run; record the evidence in Notes.

**Current stage:** Phase 1 — CI quality gates (not started)
**Last updated:** 2026-10-16

| ID | Task | Phase | Depends on | Status | Notes |
| --- | --- | --- | --- | --- | --- |
| CI-01 | `ci.yml` with backend tests, migrations check, contract check, frontend gates, Docker build | 1 | — | not started | |
| CI-02 | Ruff lint baseline for the backend | 1 | CI-01 | not started | |
| CI-03 | Security scans (npm audit, pip-audit, gitleaks, Trivy) | 1 | CI-01 | not started | |
| CI-04 | Dependabot configuration | 1 | — | not started | |
| CI-05 | Branch protection on `main` | 1 | CI-01, CI-02, CI-03 | not started | Manual GitHub setting by the user |
| CD-01 | `build-image.yml` pushing SHA-tagged images to GHCR | 2 | CI-01 | not started | |
| CD-02 | Remove Cloud Run / GCS leftovers | 2 | CD-04 | not started | Delete old workflow only once the VPS deploy works |
| VPS-01 | VPS provisioning script | 3 | — | not started | Needs VPS access |
| VPS-02 | Production Compose file and Caddyfile | 3 | CD-01 | not started | |
| VPS-03 | Production configuration template and CORS/webhook values | 3 | VPS-02 | not started | |
| VPS-04 | Persistent storage verification | 3 | VPS-02, VPS-03 | not started | |
| CD-03 | `deploy/deploy.sh` with backup, migrate, health check, auto-rollback | 4 | VPS-02 | not started | |
| CD-04 | New `deploy-backend.yml` (staging auto, production approval) | 4 | CD-01, CD-03, VPS-01 | not started | |
| CD-05 | `rollback.yml` and expand/contract migration rule | 4 | CD-04 | not started | |
| CD-06 | Staging Compose project on the VPS | 4 | CD-04 | not started | Optional; depends on VPS RAM |
| FE-01 | Rework `deploy-frontend.yml` (PR previews, staging, production after backend) | 5 | CI-01, CD-04 | not started | |
| FE-02 | `frontend/public/_headers` security and cache headers | 5 | — | not started | |
| FE-03 | Frontend rollback procedure | 5 | FE-01 | not started | |
| OPS-01 | Nightly DB and storage backups off-site | 6 | VPS-02 | not started | Needs off-site bucket credentials |
| OPS-02 | Restore drill script | 6 | OPS-01 | not started | |
| OPS-03 | Uptime, disk and error monitoring; post-deploy smoke test | 6 | CD-04, FE-01 | not started | |
| OPS-04 | Deployment runbook | 6 | CD-05, FE-03, OPS-02 | not started | |

## Blockers

None recorded.

## Open decisions

- Staging on the same VPS (CD-06) or skip it.
- Off-site backup target (Backblaze B2, Cloudflare R2 or other).
- VPS host, SSH access and GHCR pull credentials for VPS-01 and CD-04.
