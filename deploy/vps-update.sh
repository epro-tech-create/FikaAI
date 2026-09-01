#!/usr/bin/env bash
# Rebuild CCD-Attendance on the VPS and apply pending database migrations.
# Run from the repository root on the server.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

ENV_FILE="${ENV_FILE:-.env.production}"
COMPOSE=(docker compose --env-file "$ENV_FILE" -f docker-compose.prod.yml)

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE. Copy .env.vps.example first." >&2
  exit 1
fi

if [[ -d .git ]]; then
  git pull --ff-only
fi

"${COMPOSE[@]}" up -d --build

echo
echo "Waiting for the backend to become healthy..."
for _ in $(seq 1 60); do
  if "${COMPOSE[@]}" exec -T backend python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/ready', timeout=3)" >/dev/null 2>&1; then
    echo "Backend is ready."
    break
  fi
  sleep 2
done

echo
echo "Preview CCD student IDs (no writes):"
"${COMPOSE[@]}" exec -T backend python scripts/assign_membership_ids.py
echo
echo "If the preview looks right, assign them with:"
echo "  ${COMPOSE[*]} exec -T backend python scripts/assign_membership_ids.py --apply"
