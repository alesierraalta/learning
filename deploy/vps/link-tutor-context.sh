#!/usr/bin/env bash
# Links the tutor's instructions to this repository: every skill each runtime
# reads, and the Learnings `AGENTS.md` that frames a study session. The repo is
# the only source; a live copy that is not a link is moved to a timestamped
# backup first, never deleted, so a hand edit survives the deploy.
#
#   bash deploy/vps/link-tutor-context.sh            link, then verify
#   bash deploy/vps/link-tutor-context.sh --verify   verify only, change nothing
#   bash deploy/vps/link-tutor-context.sh --env-file ~/.config/learning-studio.env
#
# HOME, LEARNING_REPO, LEARNING_ROOT and LEARNING_BACKUP_DIR can be overridden,
# which is how the tests drive it in temporary directories.
set -euo pipefail

die() { echo "link-tutor-context: $*" >&2; exit 1; }

mode="link"
env_file=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --verify) mode=verify ;;
    --env-file)
      [[ $# -ge 2 ]] || { echo 'link-tutor-context: --env-file needs a path' >&2; exit 2; }
      env_file=$2
      shift
      ;;
    --env-file=*) env_file=${1#--env-file=} ;;
    *) echo "link-tutor-context: unknown argument $1" >&2; exit 2 ;;
  esac
  shift
done

# LEARNING_ROOT is the studio's own, read from its env file the way the shell
# reads it: sourcing it in a subshell drops the quotes and the inline comment,
# which a `sed` line kept, and a quoted value made the deploy link a directory
# literally named `"/x"` while reporting success. An explicit LEARNING_ROOT wins.
if [[ -z "${LEARNING_ROOT:-}" && -n "$env_file" && -f "$env_file" ]]; then
  # shellcheck disable=SC1090 # the path is the operator's env file, not a literal
  LEARNING_ROOT=$( ( set -a; . "$env_file"; printf '%s' "${LEARNING_ROOT:-}" ) ) \
    || die "cannot read $env_file"
fi

repo="${LEARNING_REPO:-$HOME/learning}"
learnings_root="${LEARNING_ROOT:-$HOME/Learnings}"
backup_root="${LEARNING_BACKUP_DIR:-$HOME/.local/share/learning/backups}"
agents_md="$repo/deploy/vps/learnings/AGENTS.md"
stamp=$(date -u +%Y%m%dT%H%M%SZ)

# A relative root resolves against the caller's working directory, so the links
# would land wherever the deploy happened to run: refuse it instead.
[[ "$learnings_root" == /* ]] || die "LEARNING_ROOT must be an absolute path, got '$learnings_root'"

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
  if [[ -e "$target" && ! -L "$target" ]]; then backup "$target"; fi
  # The link is built beside the target and renamed over it: `ln -sfn` unlinks and
  # recreates in two steps, so anything touching the path in between (a sync, a
  # tutor reading its skill) failed a deploy with "Already exists". A rename is
  # atomic, and -T keeps mv from moving the new link into a linked directory.
  local fresh="$target.link.$$"
  ln -s -- "$source" "$fresh"
  mv -fT -- "$fresh" "$target"
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
