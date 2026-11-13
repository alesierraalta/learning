#!/usr/bin/env bash
# Installs the pull-based deployer (learning-autodeploy) and its user units from this
# checkout. Run as the service owner after a change to them reaches the host. It restarts
# nothing: the timer runs the new script on its next tick, and the units are re-read at
# the daemon-reload below.
#
# The first run also records the rollback target, the commit a failed health check goes
# back to. It must be the commit the studio runs, so it is taken from the autodeploy's
# `deployed` record and only when the checkout is at that commit. Otherwise the installer
# refuses before it changes anything, and a person writes the live commit by hand.
set -euo pipefail
assets=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
repo="${LEARNING_REPO:-$HOME/learning}"
state_dir="${LEARNING_STUDIO_STATE_DIR:-${XDG_STATE_HOME:-$HOME/.local/state}/learning-studio}"
autodeploy_state="${LEARNING_AUTODEPLOY_STATE:-$HOME/.local/state/learning-autodeploy}"

install -d "$HOME/.local/bin" "$HOME/.config/systemd/user" "$state_dir"
if [[ ! -s "$state_dir/live-commit" ]]; then
  if [[ ! -s "$autodeploy_state/deployed" ]]; then
    echo "install-autodeploy: no deployed commit is recorded in $autodeploy_state; write the commit the studio runs to $state_dir/live-commit by hand" >&2
    exit 1
  fi
  deployed=$(cat "$autodeploy_state/deployed")
  checked_out=$(git -C "$repo" rev-parse HEAD)
  if [[ "$checked_out" != "$deployed" ]]; then
    echo "install-autodeploy: $repo is at ${checked_out:0:7}, not the deployed ${deployed:0:7}; write the commit the studio runs to $state_dir/live-commit by hand" >&2
    exit 1
  fi
  printf '%s\n' "$deployed" > "$state_dir/live-commit"
  echo "Recorded the live commit ${deployed:0:7} as the rollback target"
fi

install -m 755 "$assets/learning-autodeploy.sh" "$HOME/.local/bin/learning-autodeploy"
install -m 644 "$assets/learning-autodeploy.service" "$assets/learning-autodeploy.timer" "$HOME/.config/systemd/user/"
systemctl --user daemon-reload
echo 'Installed learning-autodeploy; the timer runs the new script on its next tick'
