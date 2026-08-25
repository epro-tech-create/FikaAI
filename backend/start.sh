#!/bin/sh
# Render/production entrypoint: migrate, fetch models, then serve on $PORT.
set -e

echo "Running database migrations..."
alembic upgrade head

if [ "${SKIP_MODEL_DOWNLOAD:-0}" != "1" ]; then
  echo "Ensuring AI models are present in ${MODELS_DIR:-./models_data}..."
  python scripts/download_models.py
fi

exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}" --workers "${WEB_CONCURRENCY:-1}"
