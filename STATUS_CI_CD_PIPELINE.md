# CI/CD Pipeline Status

Specification: [docs/CI_CD_PIPELINE_PLAN.md](docs/CI_CD_PIPELINE_PLAN.md).

Statuses: `not started` · `in progress` · `blocked` · `finished`.
Update a row when a task starts, finishes or blocks. `finished` requires its acceptance check to have run; record the evidence in Notes.

**Current stage:** Staging pipeline works end to end (push to main, CI, image, VPS deploy, Pages staging). Remaining: production environment and tag release, real SMTP/Telegram values, off-site backups, branch protection, monitoring.
**Last updated:** 2026-10-17 (staging deploy verified)

| ID | Task | Phase | Depends on | Status | Notes |
| --- | --- | --- | --- | --- | --- |
| CI-01 | `ci.yml` with backend tests, migrations check, contract check, frontend gates, Docker build | 1 | — | finished | Ran on GitHub for main push 89dd260: all jobs green. First run failed only on a non-existent trivy-action tag, fixed in 89dd260 |
| CI-02 | Ruff lint baseline for the backend | 1 | CI-01 | finished | 8699b56; `ruff check backend` passes with E9,F63,F7,F82. F401 (123 hits) and `ruff format` (160/187 files) deferred |
| CI-03 | Security scans (npm audit, pip-audit, gitleaks, Trivy) | 1 | CI-01 | blocked | 8699b56; npm audit (7 high), pip-audit (python-jose, ecdsa, no fix) and frontend ESLint (163 errors) are pre-existing red and continue-on-error. Fix debt, then make strict |
| CI-04 | Dependabot configuration | 1 | — | finished | 8699b56; YAML parsed |
| CI-05 | Branch protection on `main` | 1 | CI-01, CI-02, CI-03 | not started | Manual GitHub setting by the user |
| CD-01 | `build-image.yml` pushing SHA-tagged images to GHCR | 2 | CI-01 | finished | Build Image succeeded on GitHub after CI; image ghcr.io/compilelord/inkon_crm-api:89dd260 pushed |
| CD-02 | Remove Cloud Run / GCS leftovers | 2 | CD-04 | finished | 5592a13 + 015c6ce; backend suite 545 passed; grep shows no GCS references. Cloud Run workflow replaced |
| VPS-01 | VPS provisioning script | 3 | — | finished | Ran on 178.18.253.11 (Ubuntu 24.04) on 2026-10-17: Docker 29.9, Compose, ufw 22/80/443, fail2ban, `deploy` CI user, `imkon` admin user, data dirs, systemd units installed. sshd hardening file fixed to `00-` so password and root login are really off |
| VPS-02 | Production Compose file and Caddyfile | 3 | CD-01 | finished | Compose + Caddy running on the VPS; Let's Encrypt certificate obtained for api-kitob-crm.shadowme.pro (works behind Cloudflare proxy); /health 200 via domain |
| VPS-03 | Production configuration template and CORS/webhook values | 3 | VPS-02 | in progress | /etc/imkon/backend.env created on server with generated secrets and CORS for imkon-crm.pages.dev and staging.imkon-crm.pages.dev. SMTP and Telegram bot token are still placeholders (dummy token format only) |
| VPS-04 | Persistent storage verification | 3 | VPS-02, VPS-03 | not started | |
| CD-03 | `deploy/deploy.sh` with backup, migrate, health check, auto-rollback | 4 | VPS-02 | finished | deploy.sh ran on the VPS via GitHub Actions: pull, pre-deploy backup, migrations, api+worker up, health poll. First attempt failed on placeholder Telegram token; rerun succeeded. Rollback path not yet exercised |
| CD-04 | New `deploy-backend.yml` (staging auto, production approval) | 4 | CD-01, CD-03, VPS-01 | finished | Deploy Backend to staging succeeded (run 39027967946) after Build Image. Production environment not created yet |
| CD-05 | `rollback.yml` and expand/contract migration rule | 4 | CD-04 | blocked | e3bd66c `rollback.yml`; expand/contract rule in AGENTS.md §3.3; awaiting first real run |
| CD-06 | Staging Compose project on the VPS | 4 | CD-04 | not started | Optional; staging is selected by separate VPS_* environment secrets |
| FE-01 | Rework `deploy-frontend.yml` (PR previews, staging, production after backend) | 5 | CI-01, CD-04 | in progress | Deploy Frontend succeeded for staging (staging.imkon-crm.pages.dev, 200). Production Pages (main) not yet deployed by the new pipeline: needs a v* tag after Deploy Backend production |
| FE-02 | `frontend/public/_headers` security and cache headers | 5 | — | finished | 4547fe7 `frontend/public/_headers`; present in dist after build. Browser CSP console check not run |
| FE-03 | Frontend rollback procedure | 5 | FE-01 | finished | 4547fe7 + 12e8ff2 docs/deploy/FRONTEND_ROLLBACK.md |
| OPS-01 | Nightly DB and storage backups off-site | 6 | VPS-02 | blocked | e3bd66c backup.sh + systemd units installed on server (not enabled); needs off-site bucket credentials |
| OPS-02 | Restore drill script | 6 | OPS-01 | blocked | e3bd66c restore_check.sh + timer installed (not enabled); untested until OPS-01 has data |
| OPS-03 | Uptime, disk and error monitoring; post-deploy smoke test | 6 | CD-04, FE-01 | not started | |
| OPS-04 | Deployment runbook | 6 | CD-05, FE-03, OPS-02 | finished | e3bd66c docs/deploy/RUNBOOK.md |

## Blockers

- Real `SMTP_*` and `TELEGRAM_BOT_TOKEN` values in `/etc/imkon/backend.env` on the server.
- Production: GitHub Environment `production` (reviewers, same VPS secrets) and a decision how it is separated from staging on the single VPS.
- Off-site backup bucket credentials (OPS-01) before enabling the systemd timers.
- Branch protection on `main` (CI-05), after CI has been stable.
- Pre-existing red gates: frontend ESLint, npm audit, pip-audit (CI-03).
- Open Dependabot PRs for major upgrades fail CI and add noise.

## Open decisions

- Staging on the same VPS (CD-06) or skip it.
- Off-site backup target (Backblaze B2, Cloudflare R2 or other).
