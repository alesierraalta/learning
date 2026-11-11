#!/usr/bin/env bash
# Links the tutor's instructions to this repository: every skill each runtime
# reads, and the Learnings `AGENTS.md` that frames a study session. The repo is
# the only source; a live copy that is not a link is moved to a timestamped
# backup first, never deleted, so a hand edit survives the deploy.
#
#   bash deploy/vps/link-tutor-context.sh            link, then verify
#   bash deploy/vps/link-tutor-context.sh --verify   verify only, change nothing
#
# HOME, LEARNING_REPO, LEARNING_ROOT and LEARNING_BACKUP_DIR can be overridden,
# which is how the tests drive it in temporary directories.
set -euo pipefail

repo="${LEARNING_REPO:-$HOME/learning}"
learnings_root="${LEARNING_ROOT:-$HOME/Learnings}"
backup_root="${LEARNING_BACKUP_DIR:-$HOME/.local/share/learning/backups}"
agents_md="$repo/deploy/vps/learnings/AGENTS.md"
stamp=$(date -u +%Y%m%dT%H%M%SZ)

mode=link
case "${1:-}" in
  --verify) mode=verify ;;
  '') ;;
  *) echo "link-tutor-context: unknown argument $1" >&2; exit 2 ;;
esac

die() { echo "link-tutor-context: $*" >&2; exit 1; }

# Every directory under skills/ with a SKILL.md is a skill; one without it is
# content no runtime reads, so it is not linked.
skills=()
for file in "$repo"/skills/*/SKILL.md; do
  [[ -f "$file" ]] || continue
  skills+=("$(basename "$(dirname "$file")")")
done
[[ ${#skills[@]} -gt 0 ]] || die "no skills found under $repo/skills"

# A real file or directory where a link belongs is kept, not deleted: it moves
# to $backup_root/<stamp>/<path relative to $HOME>.
kept=0
backup() {
  local target=$1 rel dir
  rel=${target#"$HOME"/}
  rel=${rel#/}
  dir="$backup_root/$stamp"
  while [[ -e "$dir/$rel" ]]; do
    kept=$((kept + 1))
    dir="$backup_root/$stamp.$kept"
  done
  mkdir -p -- "$dir/$(dirname -- "$rel")"
  mv -- "$target" "$dir/$rel"
  echo "link-tutor-context: $target was not a link; kept at $dir/$rel" >&2
}

link() {
  local target=$1 source=$2
  mkdir -p -- "$(dirname -- "$target")"
  # A link is replaced in place (-n keeps ln from following it into the target).
  if [[ -e "$target" && ! -L "$target" ]]; then backup "$target"; fi
  ln -sfn -- "$source" "$target"
}

verify() {
  local target=$1 source=$2 got want
  want=$(realpath -e -- "$source" 2>/dev/null) || die "missing $source"
  got=$(realpath -e -- "$target" 2>/dev/null) || die "$target does not resolve; expected $want. Run deploy/vps/update.sh."
  [[ "$got" == "$want" ]] || die "$target resolves to $got, expected $want. Run deploy/vps/update.sh."
}

if [[ "$mode" == link ]]; then
  [[ -f "$agents_md" ]] || die "missing $agents_md"
  mkdir -p -- "$learnings_root"
  for name in "${skills[@]}"; do
    for runtime in .claude .agents; do
      link "$HOME/$runtime/skills/$name" "$repo/skills/$name"
    done
  done
  link "$learnings_root/AGENTS.md" "$agents_md"
fi

for name in "${skills[@]}"; do
  for runtime in .claude .agents; do
    verify "$HOME/$runtime/skills/$name" "$repo/skills/$name"
  done
done
verify "$learnings_root/AGENTS.md" "$agents_md"
echo "link-tutor-context: $(( ${#skills[@]} * 2 + 1 )) links resolve to $repo"
