#!/usr/bin/env python3
"""Initialize or validate the mandatory post-render QA release gate."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any


REQUIRED_CHECKS = (
    "text_fidelity",
    "content_accuracy",
    "design_compliance",
    "visual_integrity",
)


class GateError(ValueError):
    pass


def read_json(path: Path, label: str) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8-sig"))
    except FileNotFoundError as exc:
        raise GateError(f"{label} not found: {path}") from exc
    except json.JSONDecodeError as exc:
        raise GateError(f"{label} is not valid JSON: {exc}") from exc
    except OSError as exc:
        raise GateError(f"Could not read {label}: {exc}") from exc


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def require_object(value: Any, label: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise GateError(f"{label} must be an object.")
    return value


def require_nonempty_string(value: Any, label: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise GateError(f"{label} must be a non-empty string.")
    return value


def manifest_pages(manifest: dict[str, Any]) -> list[dict[str, Any]]:
    pages = manifest.get("pages")
    if not isinstance(pages, list) or not pages:
        raise GateError("manifest.pages must be a non-empty list.")
    seen: set[str] = set()
    normalized: list[dict[str, Any]] = []
    for index, raw_page in enumerate(pages):
        page = require_object(raw_page, f"manifest.pages[{index}]")
        page_id = require_nonempty_string(page.get("id"), f"manifest.pages[{index}].id")
        if page_id in seen:
            raise GateError(f"Duplicate manifest page id: {page_id}")
        seen.add(page_id)
        normalized.append(page)
    return normalized


def image_paths(page: dict[str, Any]) -> list[str]:
    render = page.get("render")
    if not isinstance(render, dict):
        return []
    images = render.get("images")
    if not isinstance(images, list):
        return []
    paths: list[str] = []
    for image in images:
        if isinstance(image, str) and image.strip():
            paths.append(image)
        elif isinstance(image, dict):
            for key in ("saved_path", "path", "output_path", "file", "filename"):
                value = image.get(key)
                if isinstance(value, str) and value.strip():
                    paths.append(value)
                    break
    return paths


def initialize_report(manifest_path: Path, report_path: Path, manifest: dict[str, Any]) -> None:
    pages = manifest_pages(manifest)
    report = {
        "version": 1,
        "overall_status": "pending",
        "manifest_path": str(manifest_path),
        "pages": [
            {
                "id": page["id"],
                "status": "pending",
                "image_paths": image_paths(page),
                "checks": {
                    check: {"status": "pending", "evidence": ""}
                    for check in REQUIRED_CHECKS
                },
                "issues": [],
            }
            for page in pages
        ],
        "notes": [],
    }
    write_json(report_path, report)
    print(json.dumps({"status": "qa-report-initialized", "report_path": str(report_path)}, ensure_ascii=False, indent=2))


def validate_report(manifest_path: Path, report_path: Path, manifest: dict[str, Any], report: Any) -> bool:
    report = require_object(report, "QA report")
    if report.get("version") != 1:
        raise GateError("QA report version must be 1.")
    overall_status = report.get("overall_status")
    if overall_status not in {"pass", "fail"}:
        raise GateError("QA report overall_status must be pass or fail before validation.")
    reported_manifest = Path(require_nonempty_string(report.get("manifest_path"), "QA report manifest_path")).expanduser().resolve()
    if reported_manifest != manifest_path:
        raise GateError(f"QA report manifest_path must reference the validated manifest: {manifest_path}")
    notes = report.get("notes")
    if not isinstance(notes, list) or any(not isinstance(note, str) for note in notes):
        raise GateError("QA report notes must be a list of strings.")

    expected_pages = manifest_pages(manifest)
    expected_ids = [page["id"] for page in expected_pages]
    report_pages = report.get("pages")
    if not isinstance(report_pages, list) or not report_pages:
        raise GateError("QA report pages must be a non-empty list.")

    by_id: dict[str, dict[str, Any]] = {}
    for index, raw_page in enumerate(report_pages):
        page = require_object(raw_page, f"QA report pages[{index}]")
        page_id = require_nonempty_string(page.get("id"), f"QA report pages[{index}].id")
        if page_id in by_id:
            raise GateError(f"Duplicate QA report page id: {page_id}")
        by_id[page_id] = page
    if set(by_id) != set(expected_ids):
        missing = sorted(set(expected_ids) - set(by_id))
        extra = sorted(set(by_id) - set(expected_ids))
        raise GateError(f"QA report pages must exactly match manifest pages. Missing: {missing}; extra: {extra}")

    failed_pages: list[str] = []
    structural_render_failures: list[str] = []
    for manifest_page in expected_pages:
        page_id = manifest_page["id"]
        page = by_id[page_id]
        if manifest_page.get("status") != "succeeded" or not image_paths(manifest_page):
            structural_render_failures.append(page_id)

        status = page.get("status")
        if status not in {"pass", "fail"}:
            raise GateError(f"QA page '{page_id}' status must be pass or fail.")
        paths = page.get("image_paths")
        if not isinstance(paths, list) or not paths or any(not isinstance(path, str) or not path.strip() for path in paths):
            raise GateError(f"QA page '{page_id}' image_paths must contain at least one non-empty string.")
        expected_paths = image_paths(manifest_page)
        if paths != expected_paths:
            raise GateError(f"QA page '{page_id}' image_paths must exactly match the final manifest render images.")
        missing_images = [path for path in expected_paths if not Path(path).expanduser().is_file()]
        if missing_images:
            raise GateError(f"QA page '{page_id}' final render image not found: {missing_images}")
        checks = require_object(page.get("checks"), f"QA page '{page_id}' checks")
        if set(checks) != set(REQUIRED_CHECKS):
            raise GateError(f"QA page '{page_id}' checks must be exactly: {', '.join(REQUIRED_CHECKS)}")

        check_failed = False
        for check_name in REQUIRED_CHECKS:
            check = require_object(checks[check_name], f"QA page '{page_id}' check '{check_name}'")
            check_status = check.get("status")
            if check_status not in {"pass", "fail"}:
                raise GateError(f"QA page '{page_id}' check '{check_name}' status must be pass or fail.")
            require_nonempty_string(check.get("evidence"), f"QA page '{page_id}' check '{check_name}' evidence")
            check_failed = check_failed or check_status == "fail"

        issues = page.get("issues")
        if not isinstance(issues, list):
            raise GateError(f"QA page '{page_id}' issues must be a list.")
        for issue_index, raw_issue in enumerate(issues):
            issue = require_object(raw_issue, f"QA page '{page_id}' issues[{issue_index}]")
            if issue.get("category") not in REQUIRED_CHECKS:
                raise GateError(f"QA page '{page_id}' issue category must be one of: {', '.join(REQUIRED_CHECKS)}")
            for key in ("location", "expected", "observed", "action"):
                require_nonempty_string(issue.get(key), f"QA page '{page_id}' issue {key}")

        if status == "pass" and (check_failed or issues):
            raise GateError(f"QA page '{page_id}' cannot pass with a failed check or recorded issue.")
        if status == "fail" and not (check_failed and issues):
            raise GateError(f"QA page '{page_id}' must include a failed check and at least one issue when status is fail.")
        if status == "fail":
            failed_pages.append(page_id)

    actual_pass = not failed_pages and not structural_render_failures
    if overall_status == "pass" and not actual_pass:
        raise GateError("overall_status cannot be pass while a page or render is failing.")
    if overall_status == "fail" and actual_pass:
        raise GateError("overall_status is fail but all pages and checks pass.")

    gate_status = "passed" if actual_pass else "failed"
    manifest["release_gate"] = {
        "status": gate_status,
        "qa_report_path": str(report_path),
        "required_checks": list(REQUIRED_CHECKS),
        "failed_pages": sorted(set(failed_pages + structural_render_failures)),
    }
    write_json(manifest_path, manifest)
    print(json.dumps({
        "status": f"qa-{gate_status}",
        "manifest_path": str(manifest_path),
        "report_path": str(report_path),
        "failed_pages": manifest["release_gate"]["failed_pages"],
    }, ensure_ascii=False, indent=2))
    return actual_pass


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Initialize or validate the content-to-poster QA release gate")
    parser.add_argument("--manifest", required=True, help="Path to the rendered series manifest.json")
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--init-report", help="Write a pending QA report template to this path")
    mode.add_argument("--report", help="Validate a completed QA report and update the manifest gate")
    return parser


def main() -> int:
    args = build_parser().parse_args()
    try:
        manifest_path = Path(args.manifest).expanduser().resolve()
        manifest = require_object(read_json(manifest_path, "manifest"), "manifest")
        if args.init_report:
            initialize_report(manifest_path, Path(args.init_report).expanduser().resolve(), manifest)
            return 0
        report_path = Path(args.report).expanduser().resolve()
        passed = validate_report(manifest_path, report_path, manifest, read_json(report_path, "QA report"))
        return 0 if passed else 1
    except GateError as exc:
        print(json.dumps({"error": str(exc)}, ensure_ascii=False), file=sys.stderr)
        return 2
    except OSError as exc:
        print(json.dumps({"error": f"Filesystem error: {exc}"}, ensure_ascii=False), file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
