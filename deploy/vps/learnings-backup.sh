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
  # A commit can exist without being published: a push that failed, or a hand-made commit.
  # Without this the timer would report «no changes» forever and never retry the push.
  ahead=$(git rev-list --count '@{u}..HEAD' 2>/dev/null || echo 0)
  if [ "$ahead" != "0" ]; then
    git push -q origin HEAD
    echo "learnings-backup: pushed $ahead pending commit(s) $(git rev-parse --short HEAD)"
    exit 0
  fi
  echo "learnings-backup: no changes"
  exit 0
fi
changed=()
while IFS= read -r path; do changed+=("$path"); done < <(git diff --cached --name-only --diff-filter=ACM -- '*.md')

if [ "${LEARNINGS_SKIP_DECK_LINT:-}" != "1" ] && [ -f "$lint" ]; then
  refused=0
  for path in "${changed[@]}"; do
    if node "$lint" "$path" >/dev/null 2>&1; then continue; fi
    if git cat-file -e "HEAD:$path" 2>/dev/null; then
      # The gate only looks at notes named .md, so the temporary copy keeps the suffix.
      before=$(mktemp --suffix=.md)
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

# Second layer: the rules the structure cannot see — a word that leaves its box, a caption on an
# arrow — need a browser. When it cannot run we publish and say so; a missing browser is not the
# author's problem.
gate=${LEARNING_DECK_GATE:-$HOME/learning/tools/deck-gate.mjs}
# The VPS keeps a newer Node beside the system one, because Debian's build cannot read the
# TypeScript the gate imports; anywhere else the local `node` is enough.
if [ -x "$HOME/node24/bin/node" ]; then gate_node=${LEARNING_GATE_NODE:-$HOME/node24/bin/node}; else gate_node=${LEARNING_GATE_NODE:-node}; fi
if [ "${LEARNINGS_SKIP_DECK_LINT:-}" != "1" ] && [ -f "$gate" ] && command -v "$gate_node" >/dev/null 2>&1; then
  ink_refused=0
  for path in "${changed[@]}"; do
    out=$(PLAYWRIGHT_MODULE=${LEARNING_PLAYWRIGHT_MODULE:-$HOME/.npm-global/lib/node_modules/playwright/index.mjs} \
          PLAYWRIGHT_BROWSERS_PATH=${LEARNING_PLAYWRIGHT_BROWSERS:-$HOME/.cache/ms-playwright} \
          "$gate_node" "$gate" "$path" 2>&1) || true
    case "$out" in
      *"GATE FAILED"*)
        if git cat-file -e "HEAD:$path" 2>/dev/null; then
          # The gate only looks at notes named .md, so the temporary copy keeps the suffix.
      before=$(mktemp --suffix=.md)
          git show "HEAD:$path" >"$before"
          was=$(PLAYWRIGHT_MODULE=${LEARNING_PLAYWRIGHT_MODULE:-$HOME/.npm-global/lib/node_modules/playwright/index.mjs} \
                PLAYWRIGHT_BROWSERS_PATH=${LEARNING_PLAYWRIGHT_BROWSERS:-$HOME/.cache/ms-playwright} \
                "$gate_node" "$gate" "$before" 2>&1) || true
          rm -f "$before"
          case "$was" in
            *"GATE FAILED"*)
              echo "learnings-backup: $path already failed the ink gate before this edit; publishing anyway" >&2
              continue
              ;;
          esac
        fi
        echo "learnings-backup: refusing to publish $path (ink)" >&2
        printf '%s\n' "$out" | grep -E '"[a-z-]+":|GATE' >&2 || true
        ink_refused=1
        ;;
      *"GATE PASSED"*) : ;;
      *)
        echo "learnings-backup: the ink gate could not run for $path; publishing anyway" >&2
        ;;
    esac
  done
  if [ "$ink_refused" = "1" ]; then
    echo "learnings-backup: the content is still on this machine; fix the note or set LEARNINGS_SKIP_DECK_LINT=1" >&2
    exit 1
  fi
fi
git commit -q -m "backup: $(date -u +%Y-%m-%dT%H:%MZ) ($(git diff --cached --name-only HEAD 2>/dev/null | wc -l | tr -d ' ') files)"
git push -q origin HEAD
echo "learnings-backup: pushed $(git rev-parse --short HEAD)"
