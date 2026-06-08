#!/usr/bin/env bash
# Symlink every skill in skills/ into the Codex and Claude discovery dirs.
# Re-runnable (idempotent): -sfn overwrites existing symlinks in place.
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILLS_DIR="$REPO/skills"

TARGETS=(
  "$HOME/.codex/skills"
  "$HOME/.claude/skills"
)

if [[ ! -d "$SKILLS_DIR" ]]; then
  echo "error: $SKILLS_DIR does not exist" >&2
  exit 1
fi

linked=0
for skill_path in "$SKILLS_DIR"/*/; do
  [[ -f "${skill_path}SKILL.md" ]] || continue
  name="$(basename "$skill_path")"
  src="$SKILLS_DIR/$name"
  for target_dir in "${TARGETS[@]}"; do
    mkdir -p "$target_dir"
    ln -sfn "$src" "$target_dir/$name"
    echo "linked  $target_dir/$name -> $src"
  done
  linked=$((linked + 1))
done

echo ""
echo "Installed $linked skill(s) into ${#TARGETS[@]} discovery dir(s)."
