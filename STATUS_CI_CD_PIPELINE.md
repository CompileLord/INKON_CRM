# CI/CD Pipeline Status

Specification: [docs/CI_CD_PIPELINE_PLAN.md](docs/CI_CD_PIPELINE_PLAN.md).

Statuses: `not started` · `in progress` · `blocked` · `finished`.
Update a row when a task starts, finishes or blocks. `finished` requires its acceptance check to have run; record the evidence in Notes.

**Current stage:** All files implemented and merged to main. Remaining work needs GitHub settings, Cloudflare and the VPS.
**Last updated:** 2026-10-17

| ID | Task | Phase | Depends on | Status | Notes |
| --- | --- | --- | --- | --- | --- |
| CI-01 | `ci.yml` with backend tests, migrations check, contract check, frontend gates, Docker build | 1 | — | blocked | Implemented in 8699b56; locally verified migrations round trip, contract no-drift, tsc. awaiting first real run on GitHub (backend-test, Trivy, gitleaks not run locally) |
| CI-02 | Ruff lint baseline for the backend | 1 | CI-01 | finished | 8699b56; `ruff check backend` passes with E9,F63,F7,F82. F401 (123 hits) and `ruff format` (160/187 files) deferred |
| CI-03 | Security scans (npm audit, pip-audit, gitleaks, Trivy) | 1 | CI-01 | blocked | 8699b56; npm audit (7 high), pip-audit (python-jose, ecdsa, no fix) and frontend ESLint (163 errors) are pre-existing red and continue-on-error. Fix debt, then make strict |
| CI-04 | Dependabot configuration | 1 | — | finished | 8699b56; YAML parsed |
| CI-05 | Branch protection on `main` | 1 | CI-01, CI-02, CI-03 | not started | Manual GitHub setting by the user |
| CD-01 | `build-image.yml` pushing SHA-tagged images to GHCR | 2 | CI-01 | blocked | e3bd66c `build-image.yml`, actionlint clean; awaiting first real run on GitHub (GHCR push) |
| CD-02 | Remove Cloud Run / GCS leftovers | 2 | CD-04 | finished | 5592a13 + 015c6ce; backend suite 545 passed; grep shows no GCS references. Cloud Run workflow replaced |
| VPS-01 | VPS provisioning script | 3 | — | finished | Ran on 178.18.253.11 (Ubuntu 24.04) on 2026-10-17: Docker 29.9, Compose, ufw 22/80/443, fail2ban, `deploy` CI user, `imkon` admin user, data dirs, systemd units installed. sshd hardening file fixed to `00-` so password and root login are really off |
| VPS-02 | Production Compose file and Caddyfile | 3 | CD-01 | blocked | e3bd66c compose + Caddyfile; `caddy validate` passed, image builds; `docker compose config` not run (no compose plugin); needs VPS |
| VPS-03 | Production configuration template and CORS/webhook values | 3 | VPS-02 | in progress | Templates in e3bd66c. Server /etc/imkon/backend.env still to be created (needs SMTP and Telegram values from the user) |
| VPS-04 | Persistent storage verification | 3 | VPS-02, VPS-03 | not started | |
| CD-03 | `deploy/deploy.sh` with backup, migrate, health check, auto-rollback | 4 | VPS-02 | blocked | e3bd66c `deploy/deploy.sh` (backup, migrate, health poll, auto-rollback); shellcheck clean; awaiting first real run on VPS |
| CD-04 | New `deploy-backend.yml` (staging auto, production approval) | 4 | CD-01, CD-03, VPS-01 | blocked | e3bd66c `deploy-backend.yml`; actionlint clean; needs GitHub Environments + secrets |
| CD-05 | `rollback.yml` and expand/contract migration rule | 4 | CD-04 | blocked | e3bd66c `rollback.yml`; expand/contract rule in AGENTS.md §3.3; awaiting first real run |
| CD-06 | Staging Compose project on the VPS | 4 | CD-04 | not started | Optional; staging is selected by separate VPS_* environment secrets |
| FE-01 | Rework `deploy-frontend.yml` (PR previews, staging, production after backend) | 5 | CI-01, CD-04 | blocked | 4547fe7 + 12e8ff2; PR previews, staging, production after `Deploy Backend` on v* tags; actionlint clean, build verified. Needs Cloudflare secrets and Environment variables; first GitHub run pending |
| FE-02 | `frontend/public/_headers` security and cache headers | 5 | — | finished | 4547fe7 `frontend/public/_headers`; present in dist after build. Browser CSP console check not run |
| FE-03 | Frontend rollback procedure | 5 | FE-01 | finished | 4547fe7 + 12e8ff2 docs/deploy/FRONTEND_ROLLBACK.md |
| OPS-01 | Nightly DB and storage backups off-site | 6 | VPS-02 | blocked | e3bd66c backup.sh + systemd units installed on server (not enabled); needs off-site bucket credentials |
| OPS-02 | Restore drill script | 6 | OPS-01 | blocked | e3bd66c restore_check.sh + timer installed (not enabled); untested until OPS-01 has data |
| OPS-03 | Uptime, disk and error monitoring; post-deploy smoke test | 6 | CD-04, FE-01 | not started | |
| OPS-04 | Deployment runbook | 6 | CD-05, FE-03, OPS-02 | finished | e3bd66c docs/deploy/RUNBOOK.md |

## Blockers

- GitHub: create Environments `staging`/`production` (reviewers on production), secrets `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`, `VPS_KNOWN_HOSTS`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, variable `VITE_API_BASE_URL` per environment; branch protection (CI-05).
- VPS: steps 1–7 in docs/deploy/RUNBOOK.md.
- Pre-existing red gates: frontend ESLint, npm audit, pip-audit (CI-03).

## Open decisions

- Staging on the same VPS (CD-06) or skip it.
- Off-site backup target (Backblaze B2, Cloudflare R2 or other).
- VPS host, SSH access and GHCR pull credentials for VPS-01 and CD-04.
