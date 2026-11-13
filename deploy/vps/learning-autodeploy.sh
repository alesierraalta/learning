#!/usr/bin/env bash
# learning-autodeploy — pull-based deploy for the Learnings studio on the VPS.
# This host polls origin/main and, when it moved past the last successful deploy,
# runs the repository's own deploy/vps/update.sh. GitHub never executes code here.
# Run by the user unit learning-autodeploy.timer; the «Deploy studio» workflow runs
# the same update.sh, and its lock keeps the two from overlapping.
#
# Success is tracked in a state file, not by comparing HEAD: update.sh pulls
# before it builds, so after a failed build HEAD already equals origin/main. A
# failed deploy keeps the unit failed and is retried every LEARNING_RETRY_SECONDS.
# A deferral (update.sh exit 3: the tutor is busy, or another deploy holds the lock)
# is not a failure: the commit stays pending and the next minute retries it.
set -euo pipefail
export PATH="${LEARNING_AUTODEPLOY_PATH:-/usr/local/go/bin:$HOME/.local/node/bin:/usr/local/bin:/usr/bin:/bin}"
repo="${LEARNING_REPO:-$HOME/learning}"
branch="${LEARNING_BRANCH:-main}"
state="${LEARNING_AUTODEPLOY_STATE:-$HOME/.local/state/learning-autodeploy}"
retry_seconds="${LEARNING_RETRY_SECONDS:-900}"
exec 9>"${XDG_RUNTIME_DIR:-/tmp}/learning-autodeploy.lock"
flock -n 9 || exit 0
mkdir -p "$state"
git -C "$repo" fetch --quiet origin "$branch"
target=$(git -C "$repo" rev-parse FETCH_HEAD)
head=$(git -C "$repo" rev-parse HEAD)
# Write state atomically so an interrupted write never leaves a truncated file.
save() { printf '%s\n' "$2" > "$state/$1.tmp" && mv "$state/$1.tmp" "$state/$1"; }
# First run: whatever the live tree runs is what is deployed.
[ -f "$state/deployed" ] || save deployed "$head"
deployed=$(cat "$state/deployed")
if [ "$target" = "$deployed" ]; then
  rm -f "$state/failed"
  exit 0
fi
if ! git -C "$repo" merge-base --is-ancestor "$head" "$target"; then
  echo "Refusing to deploy: origin/$branch ($target) does not fast-forward from $head" >&2
  exit 1
fi
# An unreadable failure record means "retry now", never "wait forever".
failed_rev="" failed_at=""
[ -f "$state/failed" ] && { read -r failed_rev failed_at < "$state/failed" || true; }
if [ "$failed_rev" = "$target" ] && [[ "$failed_at" =~ ^[0-9]+$ ]]; then
  if [ $(( $(date +%s) - failed_at )) -lt "$retry_seconds" ]; then
    echo "Deploy of ${target:0:7} failed at $(date -d "@$failed_at" -Is); retrying after ${retry_seconds}s" >&2
    exit 1
  fi
fi
echo "origin/$branch at ${target:0:7} (deployed ${deployed:0:7}); deploying"
if bash "$repo/deploy/vps/update.sh"; then
  save deployed "$target"
  rm -f "$state/failed"
else
  rc=$?
  if [ "$rc" -eq 3 ]; then
    # Deferred, not failed: the commit stays pending and the next minute retries it, with no backoff.
    rm -f "$state/failed"
    echo "Deploy of ${target:0:7} deferred: the studio is busy or another deploy is running; retrying next minute" >&2
    exit 0
  fi
  save failed "$target $(date +%s)"
  echo "Deploy of ${target:0:7} failed with exit $rc" >&2
  exit "$rc"
fi
