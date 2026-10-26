#!/usr/bin/env bash
set -euo pipefail
repo="$HOME/learning"
git -C "$repo" pull --ff-only
command -v go >/dev/null 2>&1 || { echo 'Missing prerequisite: Go; install Go to rebuild the engine' >&2; exit 1; }
(cd "$repo" && GOOS=linux GOARCH=amd64 go build -o bin/learning ./cmd/learning)
[[ -x "$repo/bin/learning" ]] || { echo "Missing executable: $repo/bin/learning" >&2; exit 1; }
systemctl --user restart learning-studio
bash "$repo/deploy/vps/health.sh"
