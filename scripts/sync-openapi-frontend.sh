#!/usr/bin/env bash
set -euo pipefail

BACKEND_OPENAPI="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/openapi.yaml"
FRONTEND_DIR_DEFAULT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)/check-frontend"
FRONTEND_OPENAPI="${1:-${FRONTEND_DIR_DEFAULT}/public/openapi.yaml}"

if [[ ! -f "$BACKEND_OPENAPI" ]]; then
  echo "[error] Backend OpenAPI not found: $BACKEND_OPENAPI" >&2
  exit 1
fi

if [[ ! -d "$(dirname "$FRONTEND_OPENAPI")" ]]; then
  echo "[error] Frontend path not found: $(dirname "$FRONTEND_OPENAPI")" >&2
  exit 1
fi

cp "$BACKEND_OPENAPI" "$FRONTEND_OPENAPI"

echo "[ok] Synced OpenAPI to: $FRONTEND_OPENAPI"

if diff -q "$BACKEND_OPENAPI" "$FRONTEND_OPENAPI" >/dev/null; then
  echo "[ok] Files are identical"
else
  echo "[error] Files differ after sync" >&2
  exit 1
fi
