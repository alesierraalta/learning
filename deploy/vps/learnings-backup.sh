#!/usr/bin/env bash
# Commits and pushes the Learnings content (the VPS is its only working copy) when it changed.
# Before publishing it checks the notes that changed against the deck rules, so an edit never
# publishes a deck that breaks them. A note that already broke the rules before the edit is named
# but still published: the rules block new damage, they do not hold the backup hostage to old
# content. Set LEARNINGS_SKIP_DECK_LINT=1 to publish anyway.
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
  refused=0
  for path in "${changed[@]}"; do
    if node "$lint" "$path" >/dev/null 2>&1; then continue; fi
    if git cat-file -e "HEAD:$path" 2>/dev/null; then
      before=$(mktemp)
      git show "HEAD:$path" >"$before"
      if ! node "$lint" "$before" >/dev/null 2>&1; then
        rm -f "$before"
        echo "learnings-backup: $path already broke the deck rules before this edit; publishing anyway" >&2
        continue
      fi
      rm -f "$before"
    fi
    echo "learnings-backup: refusing to publish $path" >&2
    node "$lint" "$path" >&2 || true
    refused=1
  done
  if [ "$refused" = "1" ]; then
    echo "learnings-backup: the content is still on this machine; fix the note or set LEARNINGS_SKIP_DECK_LINT=1" >&2
    exit 1
  fi
fi
git commit -q -m "backup: $(date -u +%Y-%m-%dT%H:%MZ) ($(git diff --cached --name-only HEAD 2>/dev/null | wc -l | tr -d ' ') files)"
git push -q origin HEAD
echo "learnings-backup: pushed $(git rev-parse --short HEAD)"
