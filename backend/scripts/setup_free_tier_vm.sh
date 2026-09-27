#!/usr/bin/env bash
set -euo pipefail

echo "======================================================"
echo " IMKON CRM — Always Free Tier VM Setup (PostgreSQL + Redis)"
echo "======================================================"

POSTGRES_USER="${POSTGRES_USER:-postgres}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-$(openssl rand -hex 16)}"
POSTGRES_DB="${POSTGRES_DB:-imkon_db}"
POSTGRES_PORT="${POSTGRES_PORT:-5432}"
REDIS_PORT="${REDIS_PORT:-6379}"

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

echo "[2/4] Creating persistent storage directories..."
mkdir -p /var/lib/imkon/postgres_data
mkdir -p /var/lib/imkon/redis_data

echo "[3/4] Launching PostgreSQL 16 container..."
$CONTAINER_CLI stop imkon_db 2>/dev/null || true
$CONTAINER_CLI rm imkon_db 2>/dev/null || true

$CONTAINER_CLI run -d \
    --name imkon_db \
    --restart always \
    -p "${POSTGRES_PORT}:5432" \
    -e POSTGRES_USER="${POSTGRES_USER}" \
    -e POSTGRES_PASSWORD="${POSTGRES_PASSWORD}" \
    -e POSTGRES_DB="${POSTGRES_DB}" \
    -v /var/lib/imkon/postgres_data:/var/lib/postgresql/data \
    postgres:16-alpine

echo "[4/4] Launching Redis 7 container..."
$CONTAINER_CLI stop imkon_redis 2>/dev/null || true
$CONTAINER_CLI rm imkon_redis 2>/dev/null || true

$CONTAINER_CLI run -d \
    --name imkon_redis \
    --restart always \
    -p "${REDIS_PORT}:6379" \
    -v /var/lib/imkon/redis_data:/data \
    redis:7-alpine

PUBLIC_IP=$(curl -s -4 ifconfig.me || hostname -I | awk '{print $1}')

echo ""
echo "======================================================"
echo " SUCCESS: Services are running on free-tier VM!"
echo "======================================================"
echo "Host IP:           ${PUBLIC_IP}"
echo "PostgreSQL Port:   ${POSTGRES_PORT}"
echo "PostgreSQL DB:     ${POSTGRES_DB}"
echo "PostgreSQL User:   ${POSTGRES_USER}"
echo "PostgreSQL Pass:   ${POSTGRES_PASSWORD}"
echo "Redis Port:        ${REDIS_PORT}"
echo ""
echo "DATABASE_URL=postgresql+asyncpg://${POSTGRES_USER}:${POSTGRES_PASSWORD}@${PUBLIC_IP}:${POSTGRES_PORT}/${POSTGRES_DB}"
echo "REDIS_URL=redis://${PUBLIC_IP}:${REDIS_PORT}/0"
echo "======================================================"
