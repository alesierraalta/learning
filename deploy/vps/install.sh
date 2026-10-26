#!/usr/bin/env bash
set -euo pipefail

dry_run=false
case "${1:-}" in
  --dry-run) dry_run=true ;;
  '') ;;
  *) echo 'Usage: bash install.sh [--dry-run]' >&2; exit 2 ;;
esac
[[ $# -le 1 ]] || { echo 'Too many arguments' >&2; exit 2; }
assets=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
repo="$HOME/learning"
env_file="$HOME/.config/learning-studio.env"
NPM_PREFIX=${NPM_PREFIX:-$HOME/.npm-global}
export PATH="$NPM_PREFIX/bin:$PATH"
LEARNING_ROOT=${LEARNING_ROOT:-$HOME/Learnings}
# This is an operator-owned, shell-compatible environment file.
if [[ -f "$env_file" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$env_file"
  set +a
fi
missing=0
need() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing prerequisite: $1 ($2)" >&2
    missing=1
  fi
}
need git 'install git'
need pi "install Pi under $NPM_PREFIX and add its bin directory to PATH"
need sudo 'sudo is required for lingering and Tailscale'
need loginctl 'systemd login manager is required'
need systemctl 'systemd user services are required'
need tailscale 'install and authenticate Tailscale'
need curl 'install curl for health checks'
if [[ ! -x /usr/bin/node ]] || ! /usr/bin/node -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 22 ? 0 : 1)'; then
  echo 'Missing prerequisite: Node >=22 at /usr/bin/node (use Node 22.22 or newer for direct TypeScript execution)' >&2
  missing=1
fi
if [[ ! -x "$repo/bin/learning" ]]; then
  echo "Missing prerequisite: executable $repo/bin/learning; from $repo run: GOOS=linux GOARCH=amd64 go build -o bin/learning ./cmd/learning" >&2
  missing=1
fi
if [[ ! -d "$LEARNING_ROOT" ]]; then
  echo "Missing prerequisite: LEARNING_ROOT directory $LEARNING_ROOT (configure Syncthing first)" >&2
  missing=1
fi
run() {
  if "$dry_run"; then printf 'DRY-RUN:'; printf ' %q' "$@"; printf '\n'; else "$@"; fi
}
if ! "$dry_run" && (( missing )); then exit 1; fi
run mkdir -p "$HOME/.config/systemd/user"
if [[ ! -e "$env_file" ]]; then
  if "$dry_run"; then
    printf 'DRY-RUN: create %s (LEARNING_ROOT=%s; npm prefix=%s)\n' "$env_file" "$LEARNING_ROOT" "$NPM_PREFIX"
  else
    umask 077
    content=$(<"$assets/learning-studio.env.example")
    content=${content//\/home\/ale\/Learnings/$LEARNING_ROOT}
    content=${content//\/home\/ale\/.npm-global/$NPM_PREFIX}
    printf '%s\n' "$content" > "$env_file"
  fi
else
  printf 'Preserving existing %s\n' "$env_file"
fi
run install -m 644 "$assets/learning-studio.service" "$HOME/.config/systemd/user/learning-studio.service"
run sudo loginctl enable-linger "${USER:?USER must name the service owner}"
run systemctl --user daemon-reload
run systemctl --user enable --now learning-studio
run sudo tailscale serve --bg --https=8445 http://127.0.0.1:4747
run sudo tailscale serve --bg --https=8446 http://127.0.0.1:4748
run bash "$assets/health.sh"
exit "$missing"
