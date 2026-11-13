#!/usr/bin/env bash
set -euo pipefail
repo="${LEARNING_REPO:-$HOME/learning}"
state_dir="${LEARNING_STUDIO_STATE_DIR:-${XDG_STATE_HOME:-$HOME/.local/state}/learning-studio}"
export LEARNING_STUDIO_STATE_DIR="$state_dir"
mkdir -p "$state_dir"

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

# One deploy at a time. The deploy workflow and the autodeploy timer both run this
# script, and a second copy would pull, build and restart under the first. A lock
# held elsewhere defers (exit 3): its holder finishes the commit. The lock is taken
# before the pull and held through the re-exec, which inherits the descriptor.
if [[ "${LEARNING_UPDATE_REEXEC:-0}" != 1 ]]; then
  exec 8>"$state_dir/deploy.lock"
  if ! flock -n 8; then
    echo 'deferring: another deploy is running; it will finish this commit' >&2
    exit 3
  fi
  # Pull once, then re-exec so the deploy runs the version it just pulled.
  # The second pass does not pull again: a repeated `git pull` adds nothing and
  # brings its own failure mode, which once aborted a deploy right after the
  # fast-forward had already moved the live tree.
  git -C "$repo" pull --ff-only
  echo 'Re-executing the updated deploy script' >&2
  exec env LEARNING_UPDATE_REEXEC=1 bash "$repo/deploy/vps/update.sh"
fi
git -C "$repo" fetch --quiet origin main
if [[ "$(git -C "$repo" rev-parse HEAD)" != "$(git -C "$repo" rev-parse origin/main)" ]]; then
  echo "Refusing to deploy: $repo is not at origin/main" >&2
  exit 1
fi
full=$(git -C "$repo" rev-parse HEAD)
commit=$(git -C "$repo" rev-parse --short HEAD)
echo "Deploying $repo at $commit"

systemctl_bin="${SYSTEMCTL:-systemctl}"

build_engine() {
  command -v go >/dev/null 2>&1 || { echo 'Missing prerequisite: Go; install Go to rebuild the engine' >&2; exit 1; }
  (cd "$repo" && GOOS=linux GOARCH=amd64 go build -o bin/learning ./cmd/learning)
  [[ -x "$repo/bin/learning" ]] || { echo "Missing executable: $repo/bin/learning" >&2; exit 1; }
}
build_engine

# The tutor reads its skill and the Learnings `AGENTS.md` from links this repo
# owns: a link left pointing at an older copy would teach with another standard,
# so the deploy links them and refuses to restart when a link does not resolve.
# The Learnings root is the studio's own (`learning-studio.env`), not a guess,
# and the linker reads that file the way the shell does: one parser for the
# deploy and the installer, so quotes and inline comments never reach a path.
bash "$repo/deploy/vps/link-tutor-context.sh" --env-file "$HOME/.config/learning-studio.env"

# The restart is what ends a tutor turn, so the gate decides first whether this commit
# may restart the studio now: idle, or past its deadline with the turn ended through the
# studio's abort route. A busy studio defers the commit: the new engine and links are
# already in place, the service keeps serving, and the autodeploy timer retries the
# commit every minute until the restart is due.
gate_status=0
topic=$(bash "$repo/deploy/vps/wait-for-idle.sh" "$full") || gate_status=$?
if (( gate_status == 3 )); then
  echo "deferring: the tutor is working on ${topic:-un tema}; the studio keeps serving and the next retry restarts it" >&2
  exit 3
fi
if (( gate_status != 0 )); then
  # A broken gate is not a busy tutor: say which one it is and leave the service alone.
  echo "wait-for-idle failed (exit $gate_status); not restarting" >&2
  exit "$gate_status"
fi

# The commit the studio runs now is the one a failed health check goes back to. It is
# read before the restart and recorded only once the new commit has proven healthy.
previous=$(cat "$state_dir/live-commit" 2>/dev/null || true)
"$systemctl_bin" --user restart learning-studio
if bash "$repo/deploy/vps/health.sh"; then
  printf '%s\n' "$full" > "$state_dir/live-commit"
  echo "Deployed $commit"
  exit 0
fi

# The restarted service is unhealthy: put back the commit it ran, rebuild it, restart it
# and report the failure. Without a recorded commit there is nothing safe to go back to.
if [[ -z "$previous" || "$previous" == "$full" ]]; then
  echo "Deploy of $commit failed its health check and there is no recorded commit to roll back to; the studio is on $commit" >&2
  exit 1
fi
echo "Deploy of $commit failed its health check; rolling back to ${previous:0:7}" >&2
git -C "$repo" reset --quiet --hard "$previous"
( build_engine ) || { echo "Rollback to ${previous:0:7} could not be built; the studio is still on $commit" >&2; exit 1; }
bash "$repo/deploy/vps/link-tutor-context.sh" --env-file "$HOME/.config/learning-studio.env"
"$systemctl_bin" --user restart learning-studio
if bash "$repo/deploy/vps/health.sh"; then
  echo "Deploy of $commit failed its health check; rolled back to ${previous:0:7}, which is running" >&2
  exit 1
fi
echo "Rolled back to ${previous:0:7}, and its health check fails too; the studio needs a person" >&2
exit 1
