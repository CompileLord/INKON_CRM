#!/usr/bin/env bash
set -euo pipefail

echo "======================================================"
echo " IMKON CRM — Google Cloud Run Always Free Deployer"
echo "======================================================"

SERVICE_NAME="${SERVICE_NAME:-imkon-backend}"
REGION="${REGION:-us-central1}"
MEMORY="${MEMORY:-512Mi}"
CPU="${CPU:-1}"
MIN_INSTANCES="${MIN_INSTANCES:-0}"
MAX_INSTANCES="${MAX_INSTANCES:-5}"
PORT="${PORT:-8080}"

if ! command -v gcloud &>/dev/null; then
    echo "Error: gcloud CLI is not installed or not in PATH."
    echo "Please install the Google Cloud SDK: https://cloud.google.com/sdk/docs/install"
    exit 1
fi

if [ ! -f ".gcloudignore" ]; then
    echo "Error: .gcloudignore is required before building or deploying."
    exit 1
fi

if ! UPLOAD_FILE_LIST=$(gcloud meta list-files-for-upload .); then
    echo "Error: Could not verify the Google Cloud Build upload context."
    exit 1
fi

if grep -Eq '(^|/)(storage|\.seed_cache)(/|$)' <<< "$UPLOAD_FILE_LIST"; then
    echo "Error: Storage uploads or seed caches are present in the Cloud Build upload context."
    exit 1
fi

PROJECT_ID=$(gcloud config get-value project 2>/dev/null)
if [ -z "$PROJECT_ID" ] || [ "$PROJECT_ID" = "(unset)" ]; then
    echo "Error: No GCP Project configured in gcloud."
    echo "Set your project with: gcloud config set project YOUR_PROJECT_ID"
    exit 1
fi

IMAGE_TAG="gcr.io/${PROJECT_ID}/${SERVICE_NAME}:latest"

echo "Project:       ${PROJECT_ID}"
echo "Region:        ${REGION} (GCP Free Tier region)"
echo "Service:       ${SERVICE_NAME}"
echo "Memory:        ${MEMORY}"
echo "CPU:           ${CPU}"
echo "Scaling:       ${MIN_INSTANCES} to ${MAX_INSTANCES} instances (Scale to 0 on idle)"
echo "======================================================"

echo "[1/3] Building container image via Cloud Build..."
gcloud builds submit --tag "${IMAGE_TAG}" .

echo "[2/3] Running Alembic migrations before deployment..."
if [ -f ".env" ]; then
    echo "Applying database schema migrations..."
    alembic upgrade head || echo "Note: Run migrations directly against your production DB if local network does not have direct access."
fi

echo "[3/3] Deploying service to Google Cloud Run..."
ENV_VARS_FLAG=""
if [ -f ".env.production" ]; then
    ENV_VARS_FLAG="--env-vars-file=.env.production"
elif [ -f ".env" ]; then
    ENV_VARS_FLAG="--env-vars-file=.env"
fi

gcloud run deploy "${SERVICE_NAME}" \
    --image "${IMAGE_TAG}" \
    --platform managed \
    --region "${REGION}" \
    --memory "${MEMORY}" \
    --cpu "${CPU}" \
    --min-instances "${MIN_INSTANCES}" \
    --max-instances "${MAX_INSTANCES}" \
    --port "${PORT}" \
    --allow-unauthenticated \
    ${ENV_VARS_FLAG}

SERVICE_URL=$(gcloud run services describe "${SERVICE_NAME}" --platform managed --region "${REGION}" --format 'value(status.url)')

echo ""
echo "======================================================"
echo " DEPLOYMENT SUCCESSFUL!"
echo " Service URL: ${SERVICE_URL}"
echo " API Docs:    ${SERVICE_URL}/docs"
echo " Healthcheck: ${SERVICE_URL}/health"
echo "======================================================"
