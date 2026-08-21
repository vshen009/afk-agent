import importlib.util
import json
import unittest
from unittest.mock import patch
from pathlib import Path


SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "vstack_update.py"
SPEC = importlib.util.spec_from_file_location("vstack_update", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


LOCAL_SHA = "a" * 40
REMOTE_SHA = "b" * 40


def fake_git_factory(local_sha=LOCAL_SHA, remote_sha=LOCAL_SHA, branch="main", dirty="", origin="https://github.com/vshen009/vstack.git"):
    def fake_git(_repo, *args):
        if args == ("rev-parse", "--show-toplevel"):
            return "/repo"
        if args == ("show", "-s", "--format=%H%x00%cI%x00%s", "HEAD"):
            return f"{local_sha}\x002026-08-21T00:00:00+00:00\x00local subject"
        if args == ("branch", "--show-current"):
            return branch
        if args == ("status", "--porcelain"):
            return dirty
        if args == ("remote", "get-url", "origin"):
            return origin
        if args == ("ls-remote", "--heads", "origin", "refs/heads/main"):
            return f"{remote_sha}\trefs/heads/main"
        if args == ("pull", "--ff-only", "origin", "main"):
            return ""
        raise AssertionError(args)
    return fake_git


def metadata(sha):
    return {"sha": sha, "date": "2026-08-22T00:00:00Z", "subject": "remote subject"}


class VstackUpdateTests(unittest.TestCase):
    def test_gh_metadata_uses_utf8_on_windows(self):
        payload = {"sha": REMOTE_SHA, "commit": {"author": {"date": "2026-08-22T00:00:00Z"}, "message": "包含 Unicode 的提交"}}
        completed = type("Completed", (), {"returncode": 0, "stdout": json.dumps(payload, ensure_ascii=False)})()
        with patch.object(MODULE.subprocess, "run", return_value=completed) as run:
            result = MODULE.fetch_remote_metadata(REMOTE_SHA)
        self.assertEqual(result["subject"], "包含 Unicode 的提交")
        self.assertEqual(run.call_args.kwargs["encoding"], "utf-8")
        self.assertEqual(run.call_args.kwargs["errors"], "replace")

    def test_metadata_failure_is_reported_without_crashing_check(self):
        def broken_metadata(_sha):
            raise UnicodeDecodeError("gbk", b"\x80", 0, 1, "invalid byte")
        report = MODULE.check_repository(Path("/repo"), fake_git_factory(), broken_metadata)
        self.assertEqual(report["status"], "up_to_date")
        self.assertIn("metadata_warning", report)

    def test_up_to_date(self):
        report = MODULE.check_repository(Path("/repo"), fake_git_factory(), metadata)
        self.assertEqual(report["status"], "up_to_date")
        self.assertIn("当前版本", MODULE.format_report(report))

    def test_remote_update_is_reported(self):
        report = MODULE.check_repository(Path("/repo"), fake_git_factory(remote_sha=REMOTE_SHA), metadata)
        self.assertEqual(report["status"], "update_available")
        self.assertEqual(report["remote"]["sha"], REMOTE_SHA)

    def test_unexpected_origin_fails_safely(self):
        report = MODULE.check_repository(Path("/repo"), fake_git_factory(origin="https://github.com/example/fork.git"), metadata)
        self.assertEqual(report["status"], "check_failed")

    def test_missing_git_metadata_fails_safely(self):
        def missing_git(_repo, *_args):
            raise MODULE.GitError("not a git repository")
        report = MODULE.check_repository(Path("/not-a-repo"), missing_git, metadata)
        self.assertEqual(report["status"], "check_failed")

    def test_remote_failure_does_not_block(self):
        def unavailable_git(repo, *args):
            if args == ("ls-remote", "--heads", "origin", "refs/heads/main"):
                raise MODULE.GitError("network unavailable")
            return fake_git_factory()(repo, *args)
        report = MODULE.check_repository(Path("/repo"), unavailable_git, metadata)
        self.assertEqual(report["status"], "check_failed")
        self.assertIn("无法检查", report["reason"])

    def test_dirty_tree_blocks_update(self):
        report = MODULE.update_repository(Path("/repo"), fake_git_factory(remote_sha=REMOTE_SHA, dirty=" M SKILL.md"), metadata)
        self.assertEqual(report["status"], "update_blocked")
        self.assertIn("未提交", report["reason"])

    def test_non_main_branch_blocks_update(self):
        report = MODULE.update_repository(Path("/repo"), fake_git_factory(remote_sha=REMOTE_SHA, branch="experiment"), metadata)
        self.assertEqual(report["status"], "update_blocked")

    def test_successful_update_rechecks_version(self):
        calls = []
        first = fake_git_factory(local_sha=LOCAL_SHA, remote_sha=REMOTE_SHA)
        second = fake_git_factory(local_sha=REMOTE_SHA, remote_sha=REMOTE_SHA)
        def git(_repo, *args):
            calls.append(args)
            if args == ("pull", "--ff-only", "origin", "main"):
                return ""
            return (second if ("pull", "--ff-only", "origin", "main") in calls else first)(_repo, *args)
        report = MODULE.update_repository(Path("/repo"), git, metadata)
        self.assertEqual(report["status"], "up_to_date")
        self.assertEqual(report["action"], "updated")
        self.assertIn(("pull", "--ff-only", "origin", "main"), calls)


if __name__ == "__main__":
    unittest.main()
