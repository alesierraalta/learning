#!/usr/bin/env bash
set -euo pipefail
repo="${LEARNING_REPO:-$HOME/learning}"

# The VPS installs Go under /usr/local/go, which a non-login shell (and the
# GitHub runner service) does not have in PATH.
if ! command -v go >/dev/null 2>&1 && [[ -x /usr/local/go/bin/go ]]; then
  export PATH="/usr/local/go/bin:$PATH"
fi

branch=$(git -C "$repo" rev-parse --abbrev-ref HEAD)
if [[ "$branch" != main ]]; then
  echo "Refusing to deploy: $repo is on '$branch', expected 'main'" >&2
  exit 1
fi
# A dirty live tree means someone edited the server by hand: stop and let a
# person decide instead of pulling on top of it or discarding the work.
if ! git -C "$repo" diff --quiet || ! git -C "$repo" diff --cached --quiet; then
  echo "Refusing to deploy: $repo has uncommitted changes" >&2
  exit 1
fi

git -C "$repo" pull --ff-only
commit=$(git -C "$repo" rev-parse --short HEAD)
echo "Deploying $repo at $commit"

command -v go >/dev/null 2>&1 || { echo 'Missing prerequisite: Go; install Go to rebuild the engine' >&2; exit 1; }
(cd "$repo" && GOOS=linux GOARCH=amd64 go build -o bin/learning ./cmd/learning)
[[ -x "$repo/bin/learning" ]] || { echo "Missing executable: $repo/bin/learning" >&2; exit 1; }
systemctl --user restart learning-studio
bash "$repo/deploy/vps/health.sh"
echo "Deployed $commit"
