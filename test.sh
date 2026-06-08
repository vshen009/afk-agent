#!/usr/bin/env bash
# Run each skill's test suite. Skills use Node's built-in test runner (node --test),
# no pnpm. A skill is tested only if it has a package.json.
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILLS_DIR="$REPO/skills"

failed=0
tested=0
for skill_path in "$SKILLS_DIR"/*/; do
  [[ -f "${skill_path}package.json" ]] || continue
  name="$(basename "$skill_path")"
  echo "==> testing $name"
  if ( cd "$skill_path" && node --test ); then
    echo "    ok"
  else
    echo "    FAILED"
    failed=$((failed + 1))
  fi
  tested=$((tested + 1))
done

echo ""
echo "Tested $tested skill(s), $failed failed."
[[ "$failed" -eq 0 ]]
