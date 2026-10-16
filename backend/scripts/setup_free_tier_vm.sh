#!/usr/bin/env bash
set -euo pipefail

echo "======================================================"
echo " IMKON CRM — Always Free Tier VM Setup (PostgreSQL + Redis)"
echo "======================================================"

POSTGRES_USER="${POSTGRES_USER:-postgres}"
POSTGRES_DB="${POSTGRES_DB:-imkon_db}"
POSTGRES_PORT="${POSTGRES_PORT:-5432}"
REDIS_PORT="${REDIS_PORT:-6379}"
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
POSTGRES_DATA_DIR="/var/lib/imkon/postgres_data"
POSTGRES_PASSWORD_FILE="${POSTGRES_PASSWORD_FILE:-/var/lib/imkon/postgres_password}"
POSTGRES_PASSWORD_CONTAINER_FILE="/run/secrets/postgres_password"
REDIS_DATA_DIR="/var/lib/imkon/redis_data"
REDIS_TLS_DIR="/var/lib/imkon/redis_tls"
REDIS_PASSWORD_FILE="${REDIS_DATA_DIR}/app.password"
REDIS_ACL_FILE="${REDIS_DATA_DIR}/users.acl"
REDIS_CONFIG_FILE="${REDIS_DATA_DIR}/redis.conf"
REDIS_URL_FILE="${REDIS_DATA_DIR}/redis.env"
REDIS_PASSWORD="${REDIS_PASSWORD:-}"

validate_postgres_password_file() {
    local password_file_mode

    if [[ -L "${POSTGRES_PASSWORD_FILE}" || ! -f "${POSTGRES_PASSWORD_FILE}" ]]; then
        echo "PostgreSQL password file must be a regular, non-symlink file." >&2
        exit 1
    fi

    password_file_mode="$(stat -c '%a' "${POSTGRES_PASSWORD_FILE}")"
    if [[ "${password_file_mode}" != "600" && "${password_file_mode}" != "400" ]]; then
        echo "PostgreSQL password file permissions must be 600 or 400." >&2
        exit 1
    fi

    if [[ ! -s "${POSTGRES_PASSWORD_FILE}" ]]; then
        echo "PostgreSQL password file must not be empty." >&2
        exit 1
    fi
}

if [[ -e "${POSTGRES_PASSWORD_FILE}" || -L "${POSTGRES_PASSWORD_FILE}" ]]; then
    validate_postgres_password_file
elif [[ -f "${POSTGRES_DATA_DIR}/PG_VERSION" && -z "${POSTGRES_PASSWORD:-}" ]]; then
    echo "An existing PostgreSQL database requires its known password file." >&2
    exit 1
fi

if [[ -z "${REDIS_PASSWORD}" && -f "${REDIS_PASSWORD_FILE}" ]]; then
    REDIS_PASSWORD="$(<"${REDIS_PASSWORD_FILE}")"
fi

if [[ -z "${REDIS_PASSWORD}" ]]; then
    REDIS_PASSWORD="$(openssl rand -hex 32)"
fi

if [[ ! "${REDIS_PASSWORD}" =~ ^[[:xdigit:]]{64}$ ]]; then
    echo "REDIS_PASSWORD must contain exactly 64 hexadecimal characters." >&2
    exit 1
fi

echo "[1/4] Checking and installing container runtime..."
if ! command -v docker &>/dev/null && ! command -v podman &>/dev/null; then
    echo "Installing Docker..."
    curl -fsSL https://get.docker.com | sh
    systemctl enable --now docker
fi

CONTAINER_CLI="docker"
if ! command -v docker &>/dev/null && command -v podman &>/dev/null; then
    CONTAINER_CLI="podman"
fi

REDIS_UID="$($CONTAINER_CLI run --rm --entrypoint id redis:7-alpine -u redis)"
REDIS_GID="$($CONTAINER_CLI run --rm --entrypoint id redis:7-alpine -g redis)"

echo "[2/4] Creating persistent storage directories..."
mkdir -p "${POSTGRES_DATA_DIR}" "$(dirname -- "${POSTGRES_PASSWORD_FILE}")"
mkdir -p "${REDIS_DATA_DIR}" "${REDIS_TLS_DIR}"
chmod 700 "${REDIS_DATA_DIR}"
chmod 755 "${REDIS_TLS_DIR}"

umask 077
if [[ ! -e "${POSTGRES_PASSWORD_FILE}" ]]; then
    if [[ -n "${POSTGRES_PASSWORD:-}" ]]; then
        printf '%s' "${POSTGRES_PASSWORD}" > "${POSTGRES_PASSWORD_FILE}"
    else
        openssl rand -hex 32 > "${POSTGRES_PASSWORD_FILE}"
    fi
    chmod 600 "${POSTGRES_PASSWORD_FILE}"
fi
validate_postgres_password_file

printf '%s' "${REDIS_PASSWORD}" > "${REDIS_PASSWORD_FILE}"
printf 'user default off\nuser imkon_app on >%s ~* &* +@read +@write +@connection +@transaction +@scripting -@admin -flushdb -flushall -config -acl -shutdown -replicaof -slaveof -debug +info +time\n' "${REDIS_PASSWORD}" > "${REDIS_ACL_FILE}"
install -m 600 "${SCRIPT_DIR}/../config/redis.conf.example" "${REDIS_CONFIG_FILE}"

if [[ ! -f "${REDIS_TLS_DIR}/server.key" || ! -f "${REDIS_TLS_DIR}/server.crt" ]]; then
    openssl req -x509 -newkey rsa:2048 -sha256 -nodes -days 3650 \
        -subj /CN=localhost \
        -addext 'subjectAltName=DNS:localhost,IP:127.0.0.1' \
        -keyout "${REDIS_TLS_DIR}/server.key" \
        -out "${REDIS_TLS_DIR}/server.crt"
    chmod 600 "${REDIS_TLS_DIR}/server.key"
fi

if [[ ! -f "${REDIS_TLS_DIR}/ca.crt" ]]; then
    cp "${REDIS_TLS_DIR}/server.crt" "${REDIS_TLS_DIR}/ca.crt"
fi

printf 'REDIS_URL=rediss://imkon_app:%s@127.0.0.1:%s/0?ssl_ca_certs=%s&ssl_cert_reqs=required&ssl_check_hostname=true\n' \
    "${REDIS_PASSWORD}" "${REDIS_PORT}" "${REDIS_TLS_DIR}/ca.crt" > "${REDIS_URL_FILE}"
chown -R "${REDIS_UID}:${REDIS_GID}" "${REDIS_DATA_DIR}" "${REDIS_TLS_DIR}"
chmod 600 "${REDIS_TLS_DIR}/server.key" "${REDIS_ACL_FILE}" "${REDIS_PASSWORD_FILE}" "${REDIS_URL_FILE}"
chmod 644 "${REDIS_TLS_DIR}/server.crt" "${REDIS_TLS_DIR}/ca.crt"

echo "[3/4] Launching PostgreSQL 16 container..."
$CONTAINER_CLI stop imkon_db 2>/dev/null || true
$CONTAINER_CLI rm imkon_db 2>/dev/null || true

$CONTAINER_CLI run -d \
    --name imkon_db \
    --restart always \
    -p "${POSTGRES_PORT}:5432" \
    -e POSTGRES_USER="${POSTGRES_USER}" \
    -e POSTGRES_PASSWORD_FILE="${POSTGRES_PASSWORD_CONTAINER_FILE}" \
    -e POSTGRES_DB="${POSTGRES_DB}" \
    -v "${POSTGRES_PASSWORD_FILE}:${POSTGRES_PASSWORD_CONTAINER_FILE}:ro" \
    -v /var/lib/imkon/postgres_data:/var/lib/postgresql/data \
    postgres:16-alpine

echo "[4/4] Launching Redis 7 container..."
$CONTAINER_CLI stop imkon_redis 2>/dev/null || true
$CONTAINER_CLI rm imkon_redis 2>/dev/null || true

$CONTAINER_CLI run -d \
    --name imkon_redis \
    --restart always \
    -p "127.0.0.1:${REDIS_PORT}:6379" \
    -v "${REDIS_DATA_DIR}:/data" \
    -v "${REDIS_TLS_DIR}:/tls:ro" \
    -v "${REDIS_CONFIG_FILE}:/usr/local/etc/redis/redis.conf:ro" \
    redis:7-alpine redis-server /usr/local/etc/redis/redis.conf

PUBLIC_IP=$(curl -s -4 ifconfig.me || hostname -I | awk '{print $1}')

echo ""
echo "======================================================"
echo " SUCCESS: Services are running on free-tier VM!"
echo "======================================================"
echo "Host IP:           ${PUBLIC_IP}"
echo "PostgreSQL Port:   ${POSTGRES_PORT}"
echo "PostgreSQL DB:     ${POSTGRES_DB}"
echo "PostgreSQL User:   ${POSTGRES_USER}"
echo "PostgreSQL password: stored in ${POSTGRES_PASSWORD_FILE} with restricted permissions"
echo "Redis Port:        ${REDIS_PORT}"
echo "Redis URL:         stored in ${REDIS_URL_FILE} with mode 600"
echo ""
echo "DATABASE_URL credentials are redacted; configure them from the protected password file."
echo "======================================================"
