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
# The Learnings root is the studio's own (`learning-studio.env`), not a guess,
# and the linker reads that file the way the shell does: one parser for the
# deploy and the installer, so quotes and inline comments never reach a path.
bash "$repo/deploy/vps/link-tutor-context.sh" --env-file "$HOME/.config/learning-studio.env"

# The restart is what ends a tutor turn, so the deploy waits for the studio to be
# idle first: a turn that is still writing is never killed. The marker lives next
# to opened.json and the rule is the studio's own (studio/state.ts). Past the bound
# the deploy defers and exits 3: the new engine and links are already in place, the
# service keeps serving, and the next deploy only has to restart it (idempotent).
topic=""
wait_status=0
topic=$(bash "$repo/deploy/vps/wait-for-idle.sh") || wait_status=$?
if (( wait_status == 3 )); then
  echo "deferring: the tutor is working on ${topic:-un tema}; the studio keeps serving and the next deploy will restart it" >&2
  exit 3
fi
if (( wait_status != 0 )); then
  # A broken gate is not a busy tutor: say which one it is and leave the service alone.
  echo "wait-for-idle failed (exit $wait_status); not restarting" >&2
  exit "$wait_status"
fi

# The restart command is overridable so the deploy tests record it instead of
# touching a service.
systemctl_bin="${SYSTEMCTL:-systemctl}"
"$systemctl_bin" --user restart learning-studio
bash "$repo/deploy/vps/health.sh"
echo "Deployed $commit"
