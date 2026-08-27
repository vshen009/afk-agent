#!/usr/bin/env python3
"""Validate a poster plan, build per-page prompts, and optionally render with image2-api."""

from __future__ import annotations

import argparse
import json
import re
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any


SKILL_DIR = Path(__file__).resolve().parent.parent
REFERENCES_DIR = SKILL_DIR / "references"
DEFAULT_IMAGE2_SCRIPT = SKILL_DIR.parent / "image2-api" / "scripts" / "image2_api.py"
ID_PATTERN = re.compile(r"^[a-z0-9][a-z0-9-]{0,63}$")
SIZE_PATTERN = re.compile(r"^[0-9]+x[0-9]+$")
ASPECT_SIZES = {
    "1:1": "2048x2048",
    "3:4": "2048x2731",
    "4:5": "2048x2560",
    "9:16": "2160x3840",
    "9:21": "2160x5040",
    "16:9": "3840x2160",
}
ROOT_KEYS = {
    "title",
    "audience",
    "channel",
    "language",
    "aspect_ratio",
    "style",
    "continuity",
    "footer",
    "notes",
    "render",
    "pages",
}
PAGE_KEYS = {
    "id",
    "type",
    "kicker",
    "headline",
    "subheadline",
    "body",
    "items",
    "quote",
    "attribution",
    "facts",
    "cta",
    "footer",
    "visual_brief",
    "source_refs",
    "notes",
}
ITEM_KEYS = {"label", "text"}


class PlanError(ValueError):
    pass


def read_json(path: Path, label: str) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8-sig"))
    except FileNotFoundError as exc:
        raise PlanError(f"{label} not found: {path}") from exc
    except json.JSONDecodeError as exc:
        raise PlanError(f"{label} is not valid JSON: {exc}") from exc
    except OSError as exc:
        raise PlanError(f"Could not read {label}: {exc}") from exc


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def require_string(value: Any, path: str, allow_empty: bool = False) -> str:
    if not isinstance(value, str):
        raise PlanError(f"{path} must be a string.")
    if not allow_empty and not value.strip():
        raise PlanError(f"{path} must not be empty.")
    return value


def require_string_list(value: Any, path: str, *, min_items: int = 0, max_items: int | None = None) -> list[str]:
    if not isinstance(value, list) or any(not isinstance(item, str) or not item.strip() for item in value):
        raise PlanError(f"{path} must be a list of non-empty strings.")
    if len(value) < min_items:
        raise PlanError(f"{path} must contain at least {min_items} item(s).")
    if max_items is not None and len(value) > max_items:
        raise PlanError(f"{path} must contain no more than {max_items} item(s).")
    return value


def validate_plan(plan: Any, styles: dict[str, Any], layouts: dict[str, Any], style_override: str = "") -> tuple[dict[str, Any], list[str]]:
    if not isinstance(plan, dict):
        raise PlanError("Plan root must be a JSON object.")

    unknown_root = sorted(set(plan) - ROOT_KEYS)
    if unknown_root:
        raise PlanError(f"Unknown plan field(s): {', '.join(unknown_root)}")

    required = ["title", "audience", "channel", "language", "aspect_ratio", "style", "continuity", "pages"]
    for key in required:
        if key not in plan:
            raise PlanError(f"Missing required plan field: {key}")

    for key in ["title", "audience", "channel", "language", "aspect_ratio", "style", "continuity"]:
        require_string(plan[key], key)

    if plan["aspect_ratio"] not in ASPECT_SIZES:
        raise PlanError(f"aspect_ratio must be one of: {', '.join(ASPECT_SIZES)}")

    if style_override:
        plan = dict(plan)
        plan["style"] = style_override
    if plan["style"] not in styles:
        raise PlanError(f"Unknown style '{plan['style']}'. Available: {', '.join(sorted(styles))}")

    if "footer" in plan:
        require_string(plan["footer"], "footer", allow_empty=True)
    if "notes" in plan:
        require_string_list(plan["notes"], "notes")
    if "render" in plan:
        render = plan["render"]
        if not isinstance(render, dict):
            raise PlanError("render must be an object.")
        unknown_render = sorted(set(render) - {"preset", "size", "quality"})
        if unknown_render:
            raise PlanError(f"Unknown render field(s): {', '.join(unknown_render)}")
        if "preset" in render:
            require_string(render["preset"], "render.preset")
        if "size" in render and (not isinstance(render["size"], str) or not SIZE_PATTERN.fullmatch(render["size"])):
            raise PlanError("render.size must use WIDTHxHEIGHT, for example 2048x2560.")
        if "quality" in render and render["quality"] not in {"low", "medium", "high", "auto"}:
            raise PlanError("render.quality must be low, medium, high, or auto.")

    pages = plan["pages"]
    if not isinstance(pages, list) or not 1 <= len(pages) <= 10:
        raise PlanError("pages must contain between 1 and 10 page objects.")

    warnings: list[str] = []
    seen_ids: set[str] = set()
    seen_types: set[str] = set()
    for index, page in enumerate(pages, start=1):
        prefix = f"pages[{index - 1}]"
        if not isinstance(page, dict):
            raise PlanError(f"{prefix} must be an object.")
        unknown_page = sorted(set(page) - PAGE_KEYS)
        if unknown_page:
            raise PlanError(f"Unknown field(s) in {prefix}: {', '.join(unknown_page)}")
        for key in ["id", "type", "headline", "visual_brief", "source_refs"]:
            if key not in page:
                raise PlanError(f"Missing required field: {prefix}.{key}")
        page_id = require_string(page["id"], f"{prefix}.id")
        if not ID_PATTERN.fullmatch(page_id):
            raise PlanError(f"{prefix}.id must contain only lowercase letters, digits, and hyphens.")
        if page_id in seen_ids:
            raise PlanError(f"Duplicate page id: {page_id}")
        seen_ids.add(page_id)

        page_type = require_string(page["type"], f"{prefix}.type")
        if page_type not in layouts:
            raise PlanError(f"Unknown page type '{page_type}'. Available: {', '.join(sorted(layouts))}")
        seen_types.add(page_type)
        require_string(page["headline"], f"{prefix}.headline")
        require_string(page["visual_brief"], f"{prefix}.visual_brief")
        require_string_list(page["source_refs"], f"{prefix}.source_refs", min_items=1)

        for key in ["kicker", "subheadline", "quote", "attribution", "cta", "footer"]:
            if key in page:
                require_string(page[key], f"{prefix}.{key}", allow_empty=True)
        for key, maximum in [("body", 3), ("facts", 5), ("notes", None)]:
            if key in page:
                require_string_list(page[key], f"{prefix}.{key}", max_items=maximum)

        items = page.get("items", [])
        if not isinstance(items, list) or len(items) > 6:
            raise PlanError(f"{prefix}.items must be a list with at most 6 items.")
        for item_index, item in enumerate(items):
            item_path = f"{prefix}.items[{item_index}]"
            if not isinstance(item, dict):
                raise PlanError(f"{item_path} must be an object.")
            unknown_item = sorted(set(item) - ITEM_KEYS)
            if unknown_item:
                raise PlanError(f"Unknown field(s) in {item_path}: {', '.join(unknown_item)}")
            for key in ITEM_KEYS:
                if key not in item:
                    raise PlanError(f"Missing required field: {item_path}.{key}")
                require_string(item[key], f"{item_path}.{key}")

        if page_type in {"list", "steps", "comparison"} and len(items) < 2:
            raise PlanError(f"Page '{page_id}' of type {page_type} needs at least 2 items.")
        if page_type == "quote" and not page.get("quote"):
            raise PlanError(f"Quote page '{page_id}' needs a non-empty quote field.")
        if page_type == "data" and not page.get("facts"):
            raise PlanError(f"Data page '{page_id}' needs at least one sourced fact.")
        if page_type == "cta" and not page.get("cta"):
            raise PlanError(f"CTA page '{page_id}' needs a non-empty cta field.")

        exact_length = sum(len(text) for _, text in collect_exact_copy(page, plan.get("footer", "")))
        if exact_length > 260:
            warnings.append(f"{page_id}: exact on-image copy is dense ({exact_length} characters); consider splitting the page.")
        if len(items) > 5:
            warnings.append(f"{page_id}: 6 items may render tightly; 3-5 is safer.")

    if len(pages) >= 6 and len(seen_types) < 3:
        warnings.append("The flow has 6 or more pages but fewer than 3 page types; consider more compositional rhythm.")

    return plan, warnings


def collect_exact_copy(page: dict[str, Any], default_footer: str = "") -> list[tuple[str, str]]:
    copy: list[tuple[str, str]] = []
    for key in ["kicker", "headline", "subheadline"]:
        if page.get(key):
            copy.append((key.upper(), page[key]))
    for index, paragraph in enumerate(page.get("body", []), start=1):
        copy.append((f"BODY {index}", paragraph))
    for index, item in enumerate(page.get("items", []), start=1):
        copy.append((f"ITEM {index} LABEL", item["label"]))
        copy.append((f"ITEM {index} TEXT", item["text"]))
    if page.get("quote"):
        copy.append(("QUOTE", page["quote"]))
    if page.get("attribution"):
        copy.append(("ATTRIBUTION", page["attribution"]))
    for index, fact in enumerate(page.get("facts", []), start=1):
        copy.append((f"FACT {index}", fact))
    if page.get("cta"):
        copy.append(("CTA", page["cta"]))
    footer = page.get("footer", default_footer)
    if footer:
        copy.append(("FOOTER", footer))
    return copy


def build_prompt(plan: dict[str, Any], page: dict[str, Any], index: int, total: int, style: dict[str, Any], layout: dict[str, Any]) -> str:
    exact_lines = []
    for label, value in collect_exact_copy(page, plan.get("footer", "")):
        exact_lines.append(f"[{label}]\n{value}")
    exact_copy = "\n\n".join(exact_lines)
    source_refs = "; ".join(page["source_refs"])
    notes = "; ".join(page.get("notes", [])) or "None."

    return f"""Create page {index} of {total} in a coherent poster flow.

CANVAS AND CONTEXT
- Aspect ratio: {plan['aspect_ratio']}
- Channel: {plan['channel']}
- Language: {plan['language']}
- Audience: {plan['audience']}
- Series title: {plan['title']}
- Page ID: {page['id']}
- Page type: {page['type']}

SERIES CONTINUITY — apply this literally across every page
{plan['continuity']}

VISUAL STYLE — {style['name']}
{style['prompt']}
Style-specific avoid rule: {style['avoid']}

PAGE COMPOSITION
Purpose: {layout['best_for']}
Structure: {layout['composition']}
Capacity: {layout['limits']}

CONTENT-SPECIFIC VISUAL BRIEF
{page['visual_brief']}

EXACT COPY CONTRACT
Render every text block below exactly as written, preserving language, characters, capitalization, punctuation, numbers, units, and order. Do not paraphrase, translate, correct, expand, repeat, or add words. Do not render the bracketed field labels. Do not add lorem ipsum, fake credits, URLs, logos, dates, prices, statistics, captions, watermarks, QR codes, or signatures unless they appear in the exact copy. Use crisp solid high-contrast text, generous line spacing, and safe margins. If space is tight, simplify imagery and decoration rather than shrinking the text.

EXACT ON-IMAGE COPY
{exact_copy}

PRODUCTION NOTES
- Source traceability: {source_refs}
- Page notes: {notes}
- Keep all important content inside an 8% safe margin.
- Make the reading order immediately obvious at thumbnail size and all exact copy legible at full size.
- Use one focal idea, disciplined spacing, and production-ready finish.
- Keep the composition distinct from adjacent pages while retaining the shared visual system.
- No unintended text, spelling changes, character substitutions, cropped glyphs, fake brand marks, or watermarks.

Generate one finished poster image only.
"""


def choose_pages(pages: list[dict[str, Any]], raw: str) -> set[str]:
    if not raw.strip():
        return {page["id"] for page in pages}
    requested = {item.strip() for item in raw.split(",") if item.strip()}
    available = {page["id"] for page in pages}
    unknown = sorted(requested - available)
    if unknown:
        raise PlanError(f"Unknown page id(s) in --pages: {', '.join(unknown)}")
    if not requested:
        raise PlanError("--pages did not contain any page IDs.")
    return requested


def concise_error(value: str, limit: int = 2000) -> str:
    compact = " ".join(value.split())
    return compact if len(compact) <= limit else compact[:limit] + "..."


def render_page(
    image2_script: Path,
    prompt_path: Path,
    images_dir: Path,
    page_id: str,
    preset: str,
    size: str,
    quality: str,
    env_file: str,
    model: str,
    provider_name: str,
) -> dict[str, Any]:
    command = [
        sys.executable,
        str(image2_script),
        "--prompt-file",
        str(prompt_path),
        "--output-dir",
        str(images_dir),
        "--filename",
        page_id,
        "--quality",
        quality,
    ]
    if size:
        command.extend(["--size", size])
    elif preset:
        command.extend(["--preset", preset])
    if env_file:
        command.extend(["--env-file", env_file])
    if model:
        command.extend(["--model", model])
    if provider_name:
        command.extend(["--provider-name", provider_name])

    completed = subprocess.run(
        command,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        check=False,
    )
    if completed.returncode != 0:
        message = completed.stderr.strip() or completed.stdout.strip() or f"image2-api exited with code {completed.returncode}"
        return {"status": "failed", "error": concise_error(message)}

    output = completed.stdout.strip()
    try:
        payload = json.loads(output)
    except json.JSONDecodeError:
        return {"status": "failed", "error": f"image2-api returned unexpected output: {concise_error(output)}"}

    images = payload.get("images", [])
    return {
        "status": "succeeded",
        "provider": payload.get("provider", ""),
        "endpoint": payload.get("endpoint", ""),
        "mode": payload.get("mode", "generate"),
        "size": payload.get("size", size or preset),
        "quality": payload.get("quality", quality),
        "images": images,
    }


def example_plan() -> dict[str, Any]:
    return {
        "title": "把复杂内容讲清楚",
        "audience": "需要快速理解主题的社交媒体读者",
        "channel": "xiaohongshu",
        "language": "zh-CN",
        "aspect_ratio": "4:5",
        "style": "editorial-swiss",
        "continuity": "米白底、黑色无衬线字体与钴蓝强调色；统一左对齐网格、细线页码和抽象纸张切片视觉。",
        "footer": "CONTENT NOTES · 01",
        "notes": ["Replace all example copy with source-grounded content before rendering."],
        "pages": [
            {
                "id": "01-cover",
                "type": "cover",
                "kicker": "内容设计方法",
                "headline": "把复杂内容讲清楚",
                "subheadline": "先组织信息，再设计视觉",
                "body": [],
                "items": [],
                "facts": [],
                "visual_brief": "一个由散乱纸片逐渐对齐为清晰网格的抽象编辑视觉。",
                "source_refs": ["example only"]
            },
            {
                "id": "02-steps",
                "type": "steps",
                "headline": "三步形成海报流",
                "items": [
                    {"label": "01 提取", "text": "保留必须出现的事实与行动信息"},
                    {"label": "02 组织", "text": "按信息形状匹配页面结构"},
                    {"label": "03 统一", "text": "用同一视觉系统建立系列感"}
                ],
                "visual_brief": "三段递进的蓝色模块沿垂直网格展开，连接线简洁克制。",
                "source_refs": ["example only"]
            }
        ]
    }


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Build and render a structured poster flow through image2-api")
    parser.add_argument("--plan", help="Path to poster-plan.json")
    parser.add_argument("--output-dir", help="Series output directory")
    parser.add_argument("--render", action="store_true", help="Call image2-api after building prompts")
    parser.add_argument("--pages", default="", help="Comma-separated page IDs to render")
    parser.add_argument("--style", default="", help="Override the plan style ID")
    parser.add_argument("--image2-script", default=str(DEFAULT_IMAGE2_SCRIPT))
    parser.add_argument("--env-file", default="")
    parser.add_argument("--preset", default="")
    parser.add_argument("--size", default="")
    parser.add_argument("--quality", choices=["low", "medium", "high", "auto"], default="")
    parser.add_argument("--model", default="")
    parser.add_argument("--provider-name", default="")
    parser.add_argument("--list-styles", action="store_true")
    parser.add_argument("--list-layouts", action="store_true")
    parser.add_argument("--print-example", action="store_true")
    return parser


def main() -> int:
    args = build_parser().parse_args()
    try:
        styles = read_json(REFERENCES_DIR / "styles.json", "style catalog")
        layouts = read_json(REFERENCES_DIR / "layouts.json", "layout catalog")

        if args.list_styles:
            print(json.dumps({key: {"name": value["name"], "best_for": value["best_for"], "density": value["density"], "risk": value["risk"]} for key, value in styles.items()}, ensure_ascii=False, indent=2))
            return 0
        if args.list_layouts:
            print(json.dumps(layouts, ensure_ascii=False, indent=2))
            return 0
        if args.print_example:
            print(json.dumps(example_plan(), ensure_ascii=False, indent=2))
            return 0
        if not args.plan:
            raise PlanError("--plan is required unless --list-styles, --list-layouts, or --print-example is used.")
        if not args.output_dir:
            raise PlanError("--output-dir is required when processing a plan.")

        plan_path = Path(args.plan).expanduser().resolve()
        output_dir = Path(args.output_dir).expanduser().resolve()
        raw_plan = read_json(plan_path, "poster plan")
        plan, warnings = validate_plan(raw_plan, styles, layouts, args.style)
        selected = choose_pages(plan["pages"], args.pages)

        prompts_dir = output_dir / "prompts"
        images_dir = output_dir / "images"
        prompts_dir.mkdir(parents=True, exist_ok=True)
        output_dir.mkdir(parents=True, exist_ok=True)

        saved_plan_path = output_dir / "poster-plan.json"
        write_json(saved_plan_path, plan)

        manifest_path = output_dir / "manifest.json"
        old_pages: dict[str, dict[str, Any]] = {}
        if manifest_path.exists():
            try:
                old_manifest = read_json(manifest_path, "existing manifest")
                old_pages = {item.get("id", ""): item for item in old_manifest.get("pages", []) if isinstance(item, dict)}
            except PlanError:
                old_pages = {}

        manifest_pages: list[dict[str, Any]] = []
        total = len(plan["pages"])
        for index, page in enumerate(plan["pages"], start=1):
            prompt = build_prompt(plan, page, index, total, styles[plan["style"]], layouts[page["type"]])
            prompt_path = prompts_dir / f"{page['id']}.md"
            prompt_path.write_text(prompt, encoding="utf-8")
            entry: dict[str, Any] = {
                "id": page["id"],
                "index": index,
                "type": page["type"],
                "prompt_path": str(prompt_path),
                "status": "prompt-ready",
            }
            if page["id"] not in selected and page["id"] in old_pages:
                for key in ["status", "render"]:
                    if key in old_pages[page["id"]]:
                        entry[key] = old_pages[page["id"]][key]
            manifest_pages.append(entry)

        render_config = plan.get("render", {})
        preset = args.preset or render_config.get("preset", "")
        size = args.size or render_config.get("size", "")
        if not preset and not size:
            size = ASPECT_SIZES[plan["aspect_ratio"]]
        quality = args.quality or render_config.get("quality", "high")
        if size and not SIZE_PATTERN.fullmatch(size):
            raise PlanError("--size must use WIDTHxHEIGHT, for example 2048x2560.")

        manifest: dict[str, Any] = {
            "title": plan["title"],
            "style": plan["style"],
            "style_name": styles[plan["style"]]["name"],
            "aspect_ratio": plan["aspect_ratio"],
            "requested_size_or_preset": size or preset,
            "quality": quality,
            "plan_path": str(saved_plan_path),
            "warnings": warnings,
            "pages": manifest_pages,
        }
        write_json(manifest_path, manifest)

        failures = 0
        if args.render:
            image2_script = Path(args.image2_script).expanduser().resolve()
            if not image2_script.is_file():
                raise PlanError(f"image2-api script not found: {image2_script}")
            images_dir.mkdir(parents=True, exist_ok=True)
            for entry in manifest_pages:
                if entry["id"] not in selected:
                    continue
                result = render_page(
                    image2_script=image2_script,
                    prompt_path=Path(entry["prompt_path"]),
                    images_dir=images_dir,
                    page_id=entry["id"],
                    preset=preset,
                    size=size,
                    quality=quality,
                    env_file=args.env_file,
                    model=args.model,
                    provider_name=args.provider_name,
                )
                entry["status"] = result["status"]
                entry["render"] = result
                if result["status"] != "succeeded":
                    failures += 1
                write_json(manifest_path, manifest)

        summary = {
            "status": "failed" if failures else ("rendered" if args.render else "prompts-ready"),
            "plan_path": str(saved_plan_path),
            "manifest_path": str(manifest_path),
            "style": plan["style"],
            "aspect_ratio": plan["aspect_ratio"],
            "size_or_preset": size or preset,
            "quality": quality,
            "warnings": warnings,
            "pages": [
                {
                    "id": entry["id"],
                    "status": entry["status"],
                    "prompt_path": entry["prompt_path"],
                    "images": entry.get("render", {}).get("images", []),
                    "error": entry.get("render", {}).get("error", ""),
                }
                for entry in manifest_pages
            ],
        }
        print(json.dumps(summary, ensure_ascii=False, indent=2))
        return 1 if failures else 0
    except PlanError as exc:
        print(json.dumps({"error": str(exc)}, ensure_ascii=False), file=sys.stderr)
        return 2
    except OSError as exc:
        print(json.dumps({"error": f"Filesystem error: {exc}"}, ensure_ascii=False), file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
