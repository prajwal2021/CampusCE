#!/usr/bin/env bash
# Sets the Flumen admin password on 0001 and restarts the app. Run this yourself on 0001:
#   bash ~/campusce_pipeline/repo/flumen/scripts/set-admin-password.sh
# The password is typed at a hidden prompt and stored only in a chmod 600 file outside git.
set -euo pipefail

ENV_FILE="$HOME/campusce_pipeline/secrets/flumen.env"
mkdir -p "$(dirname "$ENV_FILE")"

read -rsp "New admin password (min 10 characters): " p1; echo
read -rsp "Repeat it: " p2; echo
[ "$p1" = "$p2" ] || { echo "Passwords do not match."; exit 1; }
[ "${#p1}" -ge 10 ] || { echo "Use at least 10 characters."; exit 1; }

umask 077
{
  printf 'ADMIN_PASSWORD=%s\n' "$p1"
  printf 'SESSION_SECRET=%s\n' "$(openssl rand -hex 32)"
} > "$ENV_FILE"
chmod 600 "$ENV_FILE"

bash "$(dirname "$0")/deploy.sh"
echo "Done. Sign in at /flumen/login."
