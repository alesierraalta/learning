#!/usr/bin/env bash
# Decides whether a deploy of one commit may restart the studio now. The studio
# writes the marker (`busy.json`) while it holds a tutor turn, and the rule is the
# studio's own (studio/state.ts): a marker whose pid is gone, or whose turn started
# before the turn timeout, is a crashed studio's leftover and never blocks a deploy.
#
# A busy studio defers the commit; the timer retries it every minute. The first
# deferral of a commit starts its clock (`deploy-pending`). Once the commit has waited
# the deadline, the turn is ended through the studio's own abort route, marked as an
# update, so the restart that follows is not a kill mid-write.
#
#   bash deploy/vps/wait-for-idle.sh <commit>
#     exit 0  restart now: the studio is idle, or the deadline passed and its turn was ended
#     exit 3  deferred: a turn is still running; prints its topic on stdout
#     exit 1  the studio still holds its turn after the deadline (no token, or the abort did not
#             release it): leave the service alone
#
# LEARNING_STUDIO_STATE_DIR, LEARNING_DEPLOY_DEADLINE (seconds, 600) and
# LEARNING_TURN_TIMEOUT_MS drive it; update.sh and the tests set them.
set -euo pipefail

repo="${LEARNING_REPO:-$HOME/learning}"
state_dir="${LEARNING_STUDIO_STATE_DIR:-${XDG_STATE_HOME:-$HOME/.local/state}/learning-studio}"
busy_file="$state_dir/busy.json"
pending_file="$state_dir/deploy-pending"
deadline_seconds="${LEARNING_DEPLOY_DEADLINE:-600}"
turn_timeout_ms="${LEARNING_TURN_TIMEOUT_MS:-3600000}"
commit=${1:?usage: wait-for-idle.sh <commit>}

# The marker is read by the studio's own TypeScript module, so the reader must be
# the Node the studio itself runs: the distro's older Node cannot execute .ts and
# once aborted a deploy after the pull. STUDIO_NODE wins, then the studio's own
# binary, then whatever PATH offers.
node_bin="${STUDIO_NODE:-}"
if [[ -z "$node_bin" && -x "$HOME/.local/node/bin/node" ]]; then
  node_bin="$HOME/.local/node/bin/node"
fi
if [[ -z "$node_bin" ]]; then
  node_bin=$(command -v node 2>/dev/null || true)
fi
[[ -n "$node_bin" ]] || { echo 'wait-for-idle: missing prerequisite: Node' >&2; exit 1; }
[[ -x "$node_bin" ]] || { echo "wait-for-idle: node is not executable: $node_bin" >&2; exit 1; }

status() { "$node_bin" "$repo/studio/state.ts" --busy "$busy_file" --timeout-ms "$turn_timeout_ms"; }

answer=$(status)
if [[ "$answer" == idle ]]; then
  rm -f "$pending_file"
  exit 0
fi
topic=${answer#busy}
topic=${topic# }

# The clock belongs to one commit: a newer commit starts its own deadline.
now=$(date +%s)
seen_commit="" seen_at=""
if [[ -f "$pending_file" ]]; then read -r seen_commit seen_at < "$pending_file" || true; fi
if [[ "$seen_commit" != "$commit" || ! "$seen_at" =~ ^[0-9]+$ ]]; then
  seen_at=$now
fi
mkdir -p "$state_dir"
printf '%s %s\n' "$commit" "$seen_at" > "$pending_file.tmp" && mv "$pending_file.tmp" "$pending_file"

if (( now - seen_at < deadline_seconds )); then
  printf '%s\n' "$topic"
  exit 3
fi

echo "wait-for-idle: ${commit:0:7} has waited ${deadline_seconds}s for the tutor; ending its turn${topic:+ on $topic} through the studio's abort route" >&2
# The marker decides, not the abort's answer: the studio clears it before it answers, so a
# studio whose runtime fails to answer afterwards is still idle.
bash "$repo/deploy/vps/abort-turn.sh" "$HOME/.config/learning-studio.env" update || true
if [[ "$(status)" != idle ]]; then
  echo 'wait-for-idle: the studio still holds its turn after the abort; not restarting' >&2
  exit 1
fi
rm -f "$pending_file"
exit 0
