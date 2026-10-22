FROM python:3.12-slim@sha256:a6e34c598f2467ed0e9a8d349809fcd8b5c603269512df273a0bb1784edc11b1 AS builder

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.lock .

RUN pip install --no-cache-dir --require-hashes --prefix=/install -r requirements.lock


FROM python:3.12-slim@sha256:a6e34c598f2467ed0e9a8d349809fcd8b5c603269512df273a0bb1784edc11b1 AS runtime

WORKDIR /app

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONPATH=/app \
    PORT=8080

RUN groupadd -g 10001 appgroup && \
    useradd -u 10001 -g appgroup -s /bin/sh -d /app appuser

COPY --from=builder /install /usr/local

COPY --chown=appuser:appgroup alembic.ini .
COPY --chown=appuser:appgroup alembic/ ./alembic/
COPY --chown=appuser:appgroup app/ ./app/
COPY --chown=appuser:appgroup scripts/ ./scripts/

RUN mkdir -p /app/storage && chown -R appuser:appgroup /app/storage

ARG BUILD_VERSION=dev
ARG BUILD_COMMIT_SHA=unknown
ARG BUILD_COMMIT_MESSAGE=unknown
ARG BUILD_TIME=unknown
ENV BUILD_VERSION=${BUILD_VERSION} \
    BUILD_COMMIT_SHA=${BUILD_COMMIT_SHA} \
    BUILD_COMMIT_MESSAGE=${BUILD_COMMIT_MESSAGE} \
    BUILD_TIME=${BUILD_TIME}

USER appuser

EXPOSE 8080

CMD ["sh", "-c", "exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8080} --workers 1"]
