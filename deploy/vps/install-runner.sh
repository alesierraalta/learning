#!/usr/bin/env bash
# Install a repository-scoped GitHub Actions runner as a systemd user unit.
#
# The runner only serves the deploy workflow (label learning-vps); CI runs
# on GitHub-hosted runners. Registration needs a short-lived token:
#
#   gh api -X POST \
#     repos/alesierraalta/learning/actions/runners/registration-token \
#     --jq .token
#   RUNNER_TOKEN=<token> bash deploy/vps/install-runner.sh
#
# Re-register a host whose runner was removed in GitHub: stop the service,
# delete ~/actions-runner and run this script again. Logs:
#   journalctl --user -u github-runner
set -euo pipefail

repo_url=${RUNNER_REPO_URL:-https://github.com/alesierraalta/learning}
runner_dir=${RUNNER_DIR:-$HOME/actions-runner}
runner_name=${RUNNER_NAME:-$(hostname)-learning}
runner_labels=${RUNNER_LABELS:-learning-vps}
token=${RUNNER_TOKEN:?set RUNNER_TOKEN to a repository registration token}

for tool in curl tar sha256sum python3 systemctl; do
  command -v "$tool" >/dev/null 2>&1 || {
    echo "Missing prerequisite: $tool" >&2
    exit 1
  }

done

if [[ ! -f "$runner_dir/config.sh" ]]; then
  version=${RUNNER_VERSION:-}
  if [[ -z "$version" ]]; then
    version=$(curl -fsSL \
      https://api.github.com/repos/actions/runner/releases/latest \
      | sed -n 's/.*"tag_name": *"v\([^"]*\)".*/\1/p' | head -n 1)
  fi
  if [[ -z "$version" ]]; then
    echo 'Could not resolve the latest runner; set RUNNER_VERSION' >&2
    exit 1
  fi
  archive="actions-runner-linux-x64-$version.tar.gz"
  base="https://github.com/actions/runner/releases/download/v$version"
  mkdir -p "$runner_dir"
  tmp=$(mktemp -d)
  curl -fsSL -o "$tmp/$archive" "$base/$archive"
  # GitHub no longer publishes .sha256 assets; the release API carries the
  # digest for each asset, so verify against that before unpacking.
  digest=$(curl -fsSL \
    "https://api.github.com/repos/actions/runner/releases/tags/v$version" \
    | python3 -c '
import json, sys
name = sys.argv[1]
assets = json.load(sys.stdin)["assets"]
print(next(a["digest"] for a in assets if a["name"] == name))
' "$archive")
  actual=$(sha256sum "$tmp/$archive" | cut -d' ' -f1)
  if [[ "$actual" != "${digest#sha256:}" ]]; then
    echo "Checksum mismatch for $archive" >&2
    exit 1
  fi
  tar -xzf "$tmp/$archive" -C "$runner_dir"
  find "$tmp" -mindepth 1 -delete
  rmdir "$tmp"
fi

if [[ -f "$runner_dir/.runner" ]]; then
  echo "Runner already configured in $runner_dir; keeping it." >&2
else
  (cd "$runner_dir" && ./config.sh \
    --url "$repo_url" \
    --token "$token" \
    --name "$runner_name" \
    --labels "$runner_labels" \
    --unattended --replace)
fi

unit_dir="$HOME/.config/systemd/user"
mkdir -p "$unit_dir"
cat > "$unit_dir/github-runner.service" <<EOF
[Unit]
Description=GitHub Actions runner for the learning deploy
StartLimitIntervalSec=0

[Service]
Type=simple
WorkingDirectory=$runner_dir
ExecStart=$runner_dir/run.sh
Restart=always
RestartSec=5

[Install]
WantedBy=default.target
EOF

systemctl --user daemon-reload
systemctl --user enable --now github-runner
systemctl --user --no-pager --lines=5 status github-runner || true
