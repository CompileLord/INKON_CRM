# Disposable remediation baseline environment

Recorded on 2026-10-14 UTC for source commit `1be6342defedbda541c628b6dc652ee12b2d96cb`, branch `remediation/wp-01-baseline`, worktree `/home/compilelord/new/vibecoding/INKON_CRM-worktrees/backend-remediation`. The unrelated main checkout was read during workspace discovery but never changed.

## Isolation and preflight

Rootless Podman pod `remediation-wp01-20261014` owns new containers `remediation-wp01-postgres`, `remediation-wp01-redis`, and `remediation-wp01-runner`, all labeled `remediation.owner=wp01`. No existing service was stopped, repointed, or reused. `podman pod inspect remediation-wp01-20261014 --format '{{.Name}} {{.InfraConfig.HostNetwork}} {{.InfraConfig.PortBindings}}'` returned `remediation-wp01-20261014 false map[]` (exit 0). The runner shares only this pod's network namespace: fixture `localhost:5432/imkon_test_db` and configured `localhost:6379/0` resolve to these disposable services, not host services.

`podman inspect remediation-wp01-postgres remediation-wp01-redis --format '{{.Name}} {{.State.Status}} {{.Config.Labels}} {{.Mounts}}'` returned both containers running, ownership labels, and newly allocated anonymous volumes, with no bind mounts to operational data. PostgreSQL volume ID: `8abf34142bfce43835e4f358cf705a724aa8df382ee1ae3167acadb334ddd9da`; Redis volume ID: `4522ad0280e2e53431e5855624e8b00b08c325375e9ff0df631060d7d2f6291f`. `pg_isready` returned accepting connections; Redis `PING` returned `PONG`, and `DBSIZE` returned `0` before test collection. All exited 0.

These checks establish the destructive boundary before imports: schema deletion, table deletion, and Redis FLUSHDB can reach only the new pod services. The source is mounted read-only at `/source`; a new host temporary directory `/tmp/imkon-wp01.8HvzdO` is mounted at `/scratch`. Backend `app`, `requirements.txt`, and `pyproject.toml` were copied into `/scratch/backend`. Test storage and relative avatar-test storage both resolve to `/scratch/backend/storage`. No source `.env` was copied. Frontend was copied separately into `/scratch/frontend`; install/cache outputs stay in this temporary workspace.

## Interpreter and dependency environment

No Conda executable or installation was found on the host or at the task's example `/workspace/miniconda3` location. The host Python is 3.14.8; it was not used to run the test suite. This prerequisite was resolved by pulling `docker.io/continuumio/miniconda3:latest` (exit 0) and activating its sole Conda `base` environment at `/opt/conda`. No venv or custom Conda environment was created.

Runner image ID: `8769d9a9fc12eea293dd5952700b0aa3544e7e591e2dd805b64f0f4b9c370428`; repository digest `sha256:08e13ed38d9807f7bf2093ed0ba6403343bce05e83df6b6866d9223060bd4e6f`. The image prints a deprecation notice; this is a disposable verification runtime, not a deployment image.

PostgreSQL image ID: `81bd698b4594e751a3269e4dcd3e03a4a0ec0daf7b72e7aa1abd43cce9887542`; version 16.15. Redis image ID: `f84b0c4678011602b9b98c227a4dcd5468bf8b088b02fdd4165cb7758bad8058`; version 7.4.11. The fixture account and database were initialized with the existing test-only fixture values; no operational credentials were used or recorded here.

Commands in the runner:

```bash
source /opt/conda/etc/profile.d/conda.sh
conda activate base
python -m pip install --disable-pip-version-check -r requirements.txt
conda install -y --override-channels -c conda-forge nodejs=22
npm ci --ignore-scripts --cache=/scratch/npm-cache
```

Installation commands exited 0. Python 3.14.7; Conda 26.7.1; pytest 9.1.1; pytest-asyncio 1.4.0; SQLAlchemy 2.1.4; asyncpg 0.32.0; FastAPI 0.143.1; Starlette 1.8.0; redis Python client 5.3.1; bcrypt 5.0.0; Pillow 12.3.0; python-jose 3.5.0; aiogram 3.31.0; arq 0.28.0. Node 22.23.2 and npm 10.9.8. Requirements specify ranges rather than a Python lockfile: these are the versions measured, not guarantees about a future fresh install. Raw resolved-version inventory and install logs are in the temporary workspace.

Before app imports, process-only settings enabled `TESTING=true`, `ENVIRONMENT=testing`, the pod's PostgreSQL fixture target and Redis DB 0, storage `/scratch/backend/storage`, and `PYTHONDONTWRITEBYTECODE=1`. JWT, SMTP, cron, and Telegram required settings were synthetic; SMTP was pointed at localhost port 1, GCS bucket was empty, and CORS origins were empty. No production settings or secrets were loaded. TESTING bypasses queued deliveries; the existing suite mocks email sending. The ASGI test transport does not invoke application lifespan hooks.

## Recovery

Temporary scripts and logs are at `/tmp/imkon-wp01.8HvzdO`; authoritative accepted results are in `WP-01.md`. This pod belongs only to this remediation session. Before any disposal, read its ownership labels and exact volume identities again; never apply cleanup to ordinary services or a wider path. Later packages must recopy current source and establish process settings before imports. The existing test fixtures remain unsafe outside this isolated runtime until their dedicated remediation package lands.
