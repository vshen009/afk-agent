#!/usr/bin/env bash
# Remove the symlinks created by install.sh.
# Only removes links that actually point back into this repo's skills/ dir,
# so it never deletes a real skill directory by mistake.
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILLS_DIR="$REPO/skills"

TARGETS=(
  "$HOME/.codex/skills"
  "$HOME/.claude/skills"
)

removed=0
for skill_path in "$SKILLS_DIR"/*/; do
  [[ -f "${skill_path}SKILL.md" ]] || continue
  name="$(basename "$skill_path")"
  src="$SKILLS_DIR/$name"
  for target_dir in "${TARGETS[@]}"; do
    link="$target_dir/$name"
    if [[ -L "$link" && "$(readlink "$link")" == "$src" ]]; then
      rm "$link"
      echo "removed $link"
      removed=$((removed + 1))
    fi
  done
done

echo ""
echo "Removed $removed symlink(s)."
