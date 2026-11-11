#!/usr/bin/env bash
# Waits for the studio to finish the tutor turn it is holding before a deploy
# restarts it. The studio writes the marker (`busy.json`) and this script reads
# it through the studio's own module, so the rule has one implementation
# (studio/state.ts): a marker whose pid is gone, or whose turn started before the
# turn timeout, is a crashed studio's leftover and never blocks a deploy.
#
#   bash deploy/vps/wait-for-idle.sh
#     exit 0  the studio is idle (or its marker is stale): restart now
#     exit 3  a turn is still running: prints its topic on stdout, restart later
#
# LEARNING_STUDIO_STATE_DIR, LEARNING_DEPLOY_IDLE_WAIT (seconds, 600),
# LEARNING_DEPLOY_IDLE_POLL (seconds, 15) and LEARNING_TURN_TIMEOUT_MS drive it;
# update.sh and the tests set them.
set -euo pipefail

repo="${LEARNING_REPO:-$HOME/learning}"
state_dir="${LEARNING_STUDIO_STATE_DIR:-${XDG_STATE_HOME:-$HOME/.local/state}/learning-studio}"
busy_file="$state_dir/busy.json"
wait_seconds="${LEARNING_DEPLOY_IDLE_WAIT:-600}"
poll_seconds="${LEARNING_DEPLOY_IDLE_POLL:-15}"
turn_timeout_ms="${LEARNING_TURN_TIMEOUT_MS:-3600000}"

# The studio runs on Node; the marker is read by the studio's own module.
node_bin=$(command -v node 2>/dev/null || true)
if [[ -z "$node_bin" && -x "$HOME/.local/node/bin/node" ]]; then
  node_bin="$HOME/.local/node/bin/node"
fi
[[ -n "$node_bin" ]] || { echo 'wait-for-idle: missing prerequisite: Node' >&2; exit 1; }

status() { "$node_bin" "$repo/studio/state.ts" --busy "$busy_file" --timeout-ms "$turn_timeout_ms"; }

deadline=$(( $(date +%s) + wait_seconds ))
while :; do
  answer=$(status)
  if [[ "$answer" == idle ]]; then
    exit 0
  fi
  topic=${answer#busy}
  topic=${topic# }
  if (( $(date +%s) >= deadline )); then
    printf '%s\n' "$topic"
    exit 3
  fi
  sleep "$poll_seconds"
done
