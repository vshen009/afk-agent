import unittest
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[3]
SKILLS_ROOT = REPO_ROOT / "skills"
GUARD = "## vstack Update Guard"


class UpdateGuardCoverageTests(unittest.TestCase):
    def test_every_non_guard_skill_has_the_shared_update_gate(self):
        missing = []
        for skill_dir in SKILLS_ROOT.iterdir():
            if not skill_dir.is_dir() or skill_dir.name == "vstack-update":
                continue
            skill_file = skill_dir / "SKILL.md"
            if not skill_file.is_file() or GUARD not in skill_file.read_text(encoding="utf-8"):
                missing.append(skill_dir.name)
        self.assertEqual(missing, [])
