#!/usr/bin/env bash
# Sets the Flumen admin and user logins on 0001 and restarts the app. Run it yourself on 0001:
#   bash ~/campusce_pipeline/repo/flumen/scripts/set-credentials.sh
# Passwords are typed at hidden prompts and stored only in a chmod 600 file outside git.
set -euo pipefail

ENV_FILE="$HOME/campusce_pipeline/secrets/flumen.env"
mkdir -p "$(dirname "$ENV_FILE")"

ask() { # label -> sets REPLY
  local u p1 p2
  read -rp "$1 username: " u
  read -rsp "$1 password: " p1; echo
  read -rsp "Repeat password: " p2; echo
  [ -n "$u" ] && [ "$p1" = "$p2" ] && [ -n "$p1" ] || { echo "Empty or mismatched; try again."; exit 1; }
  REPLY="$u"$'\n'"$p1"
}

ask "Admin"; AU=${REPLY%%$'\n'*}; AP=${REPLY#*$'\n'}
ask "User";  VU=${REPLY%%$'\n'*}; VP=${REPLY#*$'\n'}

umask 077
{
  printf 'ADMIN_USER=%s\nADMIN_PASSWORD=%s\n' "$AU" "$AP"
  printf 'VIEWER_USER=%s\nVIEWER_PASSWORD=%s\n' "$VU" "$VP"
  printf 'SESSION_SECRET=%s\n' "$(openssl rand -hex 32)"
} > "$ENV_FILE"
chmod 600 "$ENV_FILE"

bash "$(dirname "$0")/deploy.sh"
