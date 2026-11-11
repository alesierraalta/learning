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
# person decide instead of pulling on top of it or discarding the work. The
# tutor's links live outside the tree and are re-made below, so they never
# count as local changes.
if ! git -C "$repo" diff --quiet || ! git -C "$repo" diff --cached --quiet; then
  echo "Refusing to deploy: $repo has uncommitted changes" >&2
  exit 1
fi

# Pull once, then re-exec so the deploy runs the version it just pulled.
# The second pass does not pull again: a repeated `git pull` adds nothing and
# brings its own failure mode, which once aborted a deploy right after the
# fast-forward had already moved the live tree.
if [[ "${LEARNING_UPDATE_REEXEC:-0}" != 1 ]]; then
  git -C "$repo" pull --ff-only
  echo 'Re-executing the updated deploy script' >&2
  exec env LEARNING_UPDATE_REEXEC=1 bash "$repo/deploy/vps/update.sh"
fi
git -C "$repo" fetch --quiet origin main
if [[ "$(git -C "$repo" rev-parse HEAD)" != "$(git -C "$repo" rev-parse origin/main)" ]]; then
  echo "Refusing to deploy: $repo is not at origin/main" >&2
  exit 1
fi
commit=$(git -C "$repo" rev-parse --short HEAD)
echo "Deploying $repo at $commit"

command -v go >/dev/null 2>&1 || { echo 'Missing prerequisite: Go; install Go to rebuild the engine' >&2; exit 1; }
(cd "$repo" && GOOS=linux GOARCH=amd64 go build -o bin/learning ./cmd/learning)
[[ -x "$repo/bin/learning" ]] || { echo "Missing executable: $repo/bin/learning" >&2; exit 1; }

# The tutor reads its skill and the Learnings `AGENTS.md` from links this repo
# owns: a link left pointing at an older copy would teach with another standard,
# so the deploy links them and refuses to restart when a link does not resolve.
# The Learnings root is the studio's own (`learning-studio.env`), not a guess.
learnings_root="${LEARNING_ROOT:-}"
if [[ -z "$learnings_root" && -r "$HOME/.config/learning-studio.env" ]]; then
  learnings_root=$(sed -n 's/^LEARNING_ROOT=//p' "$HOME/.config/learning-studio.env" | tail -n 1)
fi
LEARNING_ROOT="${learnings_root:-$HOME/Learnings}" bash "$repo/deploy/vps/link-tutor-context.sh"

systemctl --user restart learning-studio
bash "$repo/deploy/vps/health.sh"
echo "Deployed $commit"
