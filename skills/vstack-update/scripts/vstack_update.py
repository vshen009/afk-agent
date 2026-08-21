#!/usr/bin/env python3
"""Check and safely fast-forward an installed vstack checkout."""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path
from typing import Callable


UPSTREAM_OWNER = "vshen009"
UPSTREAM_REPO = "vstack"
UPSTREAM_BRANCH = "main"
EXPECTED_REMOTE_SUFFIXES = ("github.com/vshen009/vstack.git", "github.com/vshen009/vstack")


class GitError(RuntimeError):
    pass


def default_repo() -> Path:
    return Path(__file__).resolve().parents[3]


def run_git(repo: Path, *args: str) -> str:
    result = subprocess.run(
        ["git", "-C", str(repo), *args],
        text=True,
        encoding="utf-8",
        errors="replace",
        capture_output=True,
        check=False,
    )
    if result.returncode:
        detail = (result.stderr or result.stdout).strip()
        raise GitError(detail or f"git {' '.join(args)} failed")
    return result.stdout.strip()


def is_expected_remote(remote_url: str) -> bool:
    normalized = remote_url.strip().rstrip("/").lower()
    return normalized.endswith(EXPECTED_REMOTE_SUFFIXES)


def fetch_remote_metadata(sha: str) -> dict:
    try:
        gh = subprocess.run(
            ["gh", "api", f"repos/{UPSTREAM_OWNER}/{UPSTREAM_REPO}/commits/{sha}"],
            text=True,
            encoding="utf-8",
            errors="replace",
            capture_output=True,
            check=False,
        )
        if gh.returncode == 0 and gh.stdout:
            payload = json.loads(gh.stdout)
            commit = payload["commit"]
            return {"sha": payload["sha"], "date": commit["author"]["date"], "subject": commit["message"].splitlines()[0]}
    except (OSError, json.JSONDecodeError, KeyError, TypeError):
        pass

    url = f"https://api.github.com/repos/{UPSTREAM_OWNER}/{UPSTREAM_REPO}/commits/{sha}"
    request = urllib.request.Request(url, headers={"Accept": "application/vnd.github+json", "User-Agent": "vstack-update"})
    with urllib.request.urlopen(request, timeout=10) as response:
        payload = json.loads(response.read().decode("utf-8"))
    commit = payload["commit"]
    return {"sha": payload["sha"], "date": commit["author"]["date"], "subject": commit["message"].splitlines()[0]}


def local_version(repo: Path, git: Callable[..., str] = run_git) -> dict:
    root = Path(git(repo, "rev-parse", "--show-toplevel"))
    sha, date, subject = git(repo, "show", "-s", "--format=%H%x00%cI%x00%s", "HEAD").split("\x00", 2)
    return {
        "root": str(root),
        "sha": sha,
        "short_sha": sha[:12],
        "date": date,
        "subject": subject,
        "branch": git(repo, "branch", "--show-current"),
        "dirty": bool(git(repo, "status", "--porcelain")),
        "origin": git(repo, "remote", "get-url", "origin"),
    }


def check_repository(repo: Path, git: Callable[..., str] = run_git, metadata_fetcher: Callable[[str], dict] = fetch_remote_metadata) -> dict:
    try:
        local = local_version(repo, git)
    except (GitError, ValueError) as exc:
        return {"status": "check_failed", "reason": f"无法读取本地 vstack Git 版本：{exc}"}

    if not is_expected_remote(local["origin"]):
        return {"status": "check_failed", "local": local, "reason": "origin 不是 https://github.com/vshen009/vstack.git"}

    try:
        remote_sha = git(repo, "ls-remote", "--heads", "origin", f"refs/heads/{UPSTREAM_BRANCH}").split()[0]
    except (GitError, IndexError) as exc:
        return {"status": "check_failed", "local": local, "reason": f"无法检查 origin/{UPSTREAM_BRANCH}：{exc}"}

    remote = {"sha": remote_sha, "short_sha": remote_sha[:12], "date": "未知", "subject": "提交摘要不可用"}
    metadata_error = None
    try:
        remote.update(metadata_fetcher(remote_sha))
        remote["short_sha"] = remote["sha"][:12]
    except (OSError, urllib.error.URLError, urllib.error.HTTPError, KeyError, TypeError, ValueError) as exc:
        metadata_error = str(exc)

    status = "up_to_date" if local["sha"] == remote["sha"] else "update_available"
    result = {"status": status, "local": local, "remote": remote}
    if metadata_error:
        result["metadata_warning"] = metadata_error
    return result


def update_repository(repo: Path, git: Callable[..., str] = run_git, metadata_fetcher: Callable[[str], dict] = fetch_remote_metadata) -> dict:
    report = check_repository(repo, git, metadata_fetcher)
    if report["status"] == "check_failed":
        return report
    if report["status"] == "up_to_date":
        report["action"] = "no_change"
        return report

    local = report["local"]
    if local["branch"] != UPSTREAM_BRANCH:
        return {**report, "status": "update_blocked", "reason": f"当前分支为 {local['branch'] or '(detached HEAD)'}，不是 {UPSTREAM_BRANCH}"}
    if local["dirty"]:
        return {**report, "status": "update_blocked", "reason": "工作树有未提交改动；请先提交、暂存或还原后再更新"}

    try:
        git(repo, "pull", "--ff-only", "origin", UPSTREAM_BRANCH)
    except GitError as exc:
        return {**report, "status": "update_blocked", "reason": f"快进更新失败：{exc}"}

    updated = check_repository(repo, git, metadata_fetcher)
    updated["action"] = "updated"
    return updated


def format_report(report: dict) -> str:
    if report["status"] == "check_failed":
        return f"vstack 更新检查未完成：{report['reason']}\n将继续本次技能运行。"

    local = report["local"]
    remote = report["remote"]
    lines = [
        "vstack 版本检查",
        f"当前版本：{local['short_sha']} · {local['date']} · {local['subject']}",
        f"远端版本：{remote['short_sha']} · {remote['date']} · {remote['subject']}",
    ]
    if report["status"] == "up_to_date":
        lines.append("状态：已是最新版本。")
    elif report["status"] == "update_available":
        lines.append("状态：发现可用更新；请选择“现在更新”或“本次跳过”。")
    elif report["status"] == "update_blocked":
        lines.append(f"状态：更新未执行：{report['reason']}")
    if report.get("metadata_warning"):
        lines.append("提示：无法读取远端提交摘要，但版本 SHA 已验证。")
    if report.get("action") == "updated":
        lines.append("更新：已通过 fast-forward 完成。")
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("check", "update"), nargs="?", default="check")
    parser.add_argument("--repo", type=Path, default=default_repo(), help="vstack Git checkout path")
    parser.add_argument("--json", action="store_true", help="print structured JSON")
    args = parser.parse_args()

    report = update_repository(args.repo) if args.command == "update" else check_repository(args.repo)
    print(json.dumps(report, ensure_ascii=False) if args.json else format_report(report))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
