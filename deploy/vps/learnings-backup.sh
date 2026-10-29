#!/usr/bin/env bash
# Commits and pushes the Learnings content (the VPS is its only working copy) when it changed.
# Before publishing it checks the notes that changed against the deck rules, so a note whose
# guided decks break them never reaches the pushed history. Set LEARNINGS_SKIP_DECK_LINT=1 to
# publish anyway (the check is fast, but a broken note should never need a bypass to be saved).
set -euo pipefail
root=${LEARNING_ROOT:-$HOME/Learnings}
lint=${LEARNING_DECK_LINT:-$HOME/learning/tools/deck-lint.mjs}
cd "$root"
git add -A
if git diff --cached --quiet; then
  echo "learnings-backup: no changes"
  exit 0
fi
if [ "${LEARNINGS_SKIP_DECK_LINT:-}" != "1" ] && [ -f "$lint" ]; then
  changed=()
  while IFS= read -r path; do changed+=("$path"); done < <(git diff --cached --name-only --diff-filter=ACM -- '*.md')
  if [ ${#changed[@]} -gt 0 ]; then
    if ! node "$lint" "${changed[@]}"; then
      echo "learnings-backup: refusing to publish a note whose guided decks break the rules" >&2
      echo "learnings-backup: the content is still on this machine; fix the note or set LEARNINGS_SKIP_DECK_LINT=1" >&2
      exit 1
    fi
  fi
fi
git commit -q -m "backup: $(date -u +%Y-%m-%dT%H:%MZ) ($(git diff --cached --name-only HEAD 2>/dev/null | wc -l | tr -d ' ') files)"
git push -q origin HEAD
echo "learnings-backup: pushed $(git rev-parse --short HEAD)"
