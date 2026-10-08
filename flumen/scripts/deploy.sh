#!/usr/bin/env bash
# Build and (re)start the Flumen container on 0001.
# Admin sign-in settings live in ~/campusce_pipeline/secrets/flumen.env (never in git).
set -euo pipefail
cd "$(dirname "$0")/.."

ENV_FILE="$HOME/campusce_pipeline/secrets/flumen.env"
mkdir -p "$(dirname "$ENV_FILE")"
[ -f "$ENV_FILE" ] || { touch "$ENV_FILE"; chmod 600 "$ENV_FILE"; }

docker build -q -t flumen .
docker rm -f flumen >/dev/null 2>&1 || true
docker run -d --name flumen --restart unless-stopped --memory 512m --network host \
  -e HOSTNAME=0.0.0.0 -e PORT=3100 \
  --env-file "$ENV_FILE" \
  -v "$HOME/.ssh/id_ed25519_ttu:/ssh/id_ed25519_ttu:ro" \
  flumen
echo "Flumen is up on port 3100."
