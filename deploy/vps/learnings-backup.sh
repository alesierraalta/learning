#!/usr/bin/env bash
# Commits and pushes the Learnings content (the VPS is its only working copy) when it changed.
set -euo pipefail
root=${LEARNING_ROOT:-$HOME/Learnings}
cd "$root"
git add -A
if git diff --cached --quiet; then
  echo "learnings-backup: no changes"
  exit 0
fi
git commit -q -m "backup: $(date -u +%Y-%m-%dT%H:%MZ) ($(git diff --cached --name-only HEAD 2>/dev/null | wc -l | tr -d ' ') files)"
git push -q origin HEAD
echo "learnings-backup: pushed $(git rev-parse --short HEAD)"
