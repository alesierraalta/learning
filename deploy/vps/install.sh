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
need sudo 'sudo is required for lingering'
need loginctl 'systemd login manager is required'
need systemctl 'systemd user services are required'
need docker 'install Docker and add this user to the docker group (TLS front and code exercises)'
if [[ ! -r /srv/certs/docker/infra.pem || ! -r /srv/certs/docker/infra-key.pem ]]; then
  echo 'Missing prerequisite: /srv/certs/docker/infra.pem and infra-key.pem (Infra Root CA service certificate with SAN IP:10.154.59.151)' >&2
  missing=1
fi
need curl 'install curl for health checks'
# Distribution builds (e.g. Ubuntu's nodejs) can lack TypeScript support, so the studio uses its own Node.
node_bin="$HOME/.local/node/bin/node"
if [[ ! -x "$node_bin" ]] || ! "$node_bin" -e 'process.exit(process.features.typescript ? 0 : 1)'; then
  echo "Missing prerequisite: official Node >=24 with TypeScript support at $node_bin (unpack the nodejs.org linux-x64 tarball into ~/.local/node-<version> and symlink ~/.local/node to it)" >&2
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
# HTTPS on the ZeroTier address only, with the Infra Root CA service certificate.
if docker container inspect learning-studio-caddy >/dev/null 2>&1; then
  run docker restart learning-studio-caddy
else
  run docker run -d --name learning-studio-caddy --restart unless-stopped --network host \
    -v "$assets/Caddyfile:/etc/caddy/Caddyfile:ro" -v /srv/certs/docker:/certs:ro caddy:latest
fi
# UFW drops everything not listed: open the two ports on the ZeroTier interface only.
zt_if=$(ip -o -4 addr show | awk '/ 10\.154\.59\.151\//{print $2; exit}')
if [[ -n "$zt_if" ]]; then
  run sudo ufw allow in on "$zt_if" to any port 8445:8446 proto tcp comment 'learning studio (ZeroTier)'
else
  echo 'Warning: no interface holds 10.154.59.151; is ZeroTier joined? Skipping the firewall rule.' >&2
fi
run bash "$assets/health.sh"
exit "$missing"
