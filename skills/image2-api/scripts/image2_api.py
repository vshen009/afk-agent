#!/usr/bin/env python3
"""Provider-neutral client for OpenAI-compatible Image2 APIs."""

import argparse
import base64
import json
import mimetypes
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from pathlib import Path


DEFAULT_MODEL = "gpt-image-2"
DEFAULT_SIZE = "1024x1024"
DEFAULT_QUALITY = "high"
DEFAULT_OUTPUT_FORMAT = "png"
DEFAULT_RESPONSE_FORMAT = "url"
DEFAULT_AUTH_HEADER = "Authorization"
DEFAULT_AUTH_SCHEME = "Bearer"
DEFAULT_TIMEOUT = 300
SKILL_DIR = Path(__file__).resolve().parent.parent


def configure_tls_roots():
    """Use certifi's CA bundle when this Python installation lacks one."""
    if os.environ.get("SSL_CERT_FILE"):
        return
    try:
        import certifi
    except ImportError:
        return
    bundle = Path(certifi.where())
    if bundle.is_file():
        os.environ["SSL_CERT_FILE"] = str(bundle)


configure_tls_roots()

PRESETS = {
    "default": {},
    "square": {"size": "1024x1024", "quality": "medium"},
    "hd": {"size": "1920x1080", "quality": "high"},
    "2k": {"size": "2048x1152", "quality": "high"},
    "2k-landscape": {"size": "2048x1152", "quality": "high"},
    "4k": {"size": "3840x2160", "quality": "high"},
    "4k-landscape": {"size": "3840x2160", "quality": "high"},
    "4k16x9": {"size": "3840x2160", "quality": "high"},
    "4k-portrait": {"size": "2160x3840", "quality": "high"},
    "4k9x16": {"size": "2160x3840", "quality": "high"},
}


def fail(message: str, code: int = 1):
    print(json.dumps({"error": message}, ensure_ascii=False), file=sys.stderr)
    raise SystemExit(code)


def read_env_file(path: Path) -> dict:
    values = {}
    if not path.exists() or not path.is_file():
        return values
    try:
        for line in path.read_text(encoding="utf-8-sig").splitlines():
            stripped = line.strip()
            if not stripped or stripped.startswith("#") or "=" not in stripped:
                continue
            key, value = stripped.split("=", 1)
            key = key.strip()
            value = value.strip()
            if not key:
                continue
            if len(value) >= 2 and value[0] == value[-1] and value[0] in {"'", '"'}:
                value = value[1:-1]
            values[key] = value
    except Exception as exc:
        fail(f"Failed to read config file {path}: {exc}")
    return values


def collect_file_config(explicit_env_file: str) -> tuple[dict, list[str]]:
    candidates = [SKILL_DIR / ".env"]
    cwd_env = Path.cwd() / ".env"
    if cwd_env.resolve() != candidates[0].resolve():
        candidates.append(cwd_env)
    if explicit_env_file:
        explicit = Path(explicit_env_file).expanduser()
        if not explicit.exists():
            fail(f"Environment file not found: {explicit}")
        candidates.append(explicit)

    config = {}
    loaded = []
    for path in candidates:
        values = read_env_file(path)
        if values:
            config.update(values)
            loaded.append(str(path.resolve()))
    return config, loaded


def resolve_config(cli_value, env_name: str, file_config: dict, default=None):
    if cli_value is not None:
        return cli_value, "cli"
    if env_name in os.environ:
        return os.environ[env_name], f"env:{env_name}"
    if env_name in file_config:
        return file_config[env_name], f"file:{env_name}"
    return default, "default"


def derive_endpoints(base_url: str) -> tuple[str, str]:
    base = (base_url or "").strip().rstrip("/")
    if not base:
        return "", ""
    parsed = urllib.parse.urlparse(base)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        fail("IMAGE2_BASE_URL must be an absolute http(s) URL.")

    if base.endswith("/v1/images/generations"):
        prefix = base[: -len("generations")]
        return base, prefix + "edits"
    if base.endswith("/v1/images/edits"):
        prefix = base[: -len("edits")]
        return prefix + "generations", base
    if base.endswith("/images"):
        return base + "/generations", base + "/edits"
    if base.endswith("/v1"):
        return base + "/images/generations", base + "/images/edits"
    return base + "/v1/images/generations", base + "/v1/images/edits"


def validate_endpoint(url: str, label: str):
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        fail(f"{label} must be an absolute http(s) URL.")


def parse_extra_headers(raw: str) -> dict:
    if not raw:
        return {}
    try:
        value = json.loads(raw)
    except json.JSONDecodeError as exc:
        fail(f"IMAGE2_EXTRA_HEADERS_JSON is invalid JSON: {exc}")
    if not isinstance(value, dict):
        fail("IMAGE2_EXTRA_HEADERS_JSON must be a JSON object.")
    headers = {}
    for key, item in value.items():
        if not isinstance(key, str) or not isinstance(item, (str, int, float, bool)):
            fail("Extra request headers must contain scalar string keys and values.")
        headers[key] = str(item)
    return headers


def build_headers(api_key: str, auth_header: str, auth_scheme: str, extra_headers: dict) -> dict:
    headers = dict(extra_headers)
    headers.setdefault("Accept", "*/*")
    if auth_header and api_key:
        auth_value = f"{auth_scheme} {api_key}".strip() if auth_scheme else api_key
        headers[auth_header] = auth_value
    return headers


def concise_body(body: str, limit: int = 2000) -> str:
    compact = " ".join(body.split())
    return compact if len(compact) <= limit else compact[:limit] + "..."


def parse_json_response(body: bytes) -> dict:
    text = body.decode("utf-8", errors="replace")
    if not text:
        return {}
    try:
        payload = json.loads(text)
    except json.JSONDecodeError:
        fail(f"Provider returned a non-JSON response: {concise_body(text)}")
    if isinstance(payload, dict) and payload.get("error"):
        error = payload["error"]
        if isinstance(error, dict):
            error = error.get("message") or error
        fail(f"Provider error: {concise_body(str(error))}")
    if not isinstance(payload, dict):
        fail("Provider returned an unexpected non-object JSON response.")
    return payload


def send_request(request: urllib.request.Request, timeout: int) -> dict:
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return parse_json_response(response.read())
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        fail(f"Request failed HTTP {exc.code}: {concise_body(body or str(exc.reason))}")
    except urllib.error.URLError as exc:
        fail(f"Request failed: {exc.reason}")
    except TimeoutError:
        fail(f"Request timed out after {timeout} seconds.")
    except Exception as exc:
        fail(f"Request failed: {exc}")


def http_json(url: str, headers: dict, payload: dict, timeout: int) -> dict:
    request_headers = dict(headers)
    request_headers["Content-Type"] = "application/json"
    request = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers=request_headers,
        method="POST",
    )
    return send_request(request, timeout)


def http_multipart(url: str, headers: dict, fields: dict, files: dict, timeout: int) -> dict:
    boundary = "----image2-api-" + uuid.uuid4().hex
    chunks = []

    for key, value in fields.items():
        if value in ("", None):
            continue
        chunks.extend(
            [
                f"--{boundary}\r\n".encode(),
                f'Content-Disposition: form-data; name="{key}"\r\n\r\n'.encode(),
                str(value).encode("utf-8"),
                b"\r\n",
            ]
        )

    for key, raw_path in files.items():
        if not raw_path:
            continue
        path = Path(raw_path)
        if not path.exists() or not path.is_file():
            fail(f"File not found for {key}: {path}")
        content_type = mimetypes.guess_type(str(path))[0] or "application/octet-stream"
        chunks.extend(
            [
                f"--{boundary}\r\n".encode(),
                (
                    f'Content-Disposition: form-data; name="{key}"; '
                    f'filename="{path.name}"\r\n'
                ).encode("utf-8"),
                f"Content-Type: {content_type}\r\n\r\n".encode(),
                path.read_bytes(),
                b"\r\n",
            ]
        )

    chunks.append(f"--{boundary}--\r\n".encode())
    request_headers = dict(headers)
    request_headers["Content-Type"] = f"multipart/form-data; boundary={boundary}"
    request = urllib.request.Request(
        url,
        data=b"".join(chunks),
        headers=request_headers,
        method="POST",
    )
    return send_request(request, timeout)


def extract_image_refs(payload: dict) -> list[dict]:
    data = payload.get("data")
    items = data if isinstance(data, list) else [payload]
    refs = []
    for item in items:
        if not isinstance(item, dict):
            continue
        if item.get("url"):
            refs.append({"kind": "url", "value": item["url"], "revised_prompt": item.get("revised_prompt", "")})
        elif item.get("b64_json"):
            refs.append({"kind": "b64", "value": item["b64_json"], "revised_prompt": item.get("revised_prompt", "")})
    return refs


def extension_for_format(output_format: str) -> str:
    return ".jpg" if output_format == "jpeg" else f".{output_format}"


def download_image(url: str, output_path: Path, timeout: int) -> Path:
    request = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            content = response.read()
            content_type = response.headers.get_content_type()
    except Exception as exc:
        fail(f"Failed to download generated image: {exc}")
    suffix = mimetypes.guess_extension(content_type) if content_type else None
    if suffix in {".png", ".jpg", ".jpeg", ".webp"}:
        output_path = output_path.with_suffix(suffix)
    output_path.write_bytes(content)
    return output_path


def save_images(refs: list[dict], output_dir: Path, filename: str, output_format: str, timeout: int) -> list[dict]:
    output_dir.mkdir(parents=True, exist_ok=True)
    timestamp = time.strftime("%Y%m%d-%H%M%S")
    results = []
    for index, ref in enumerate(refs, start=1):
        suffix = extension_for_format(output_format)
        numbered = f"-{index}" if len(refs) > 1 else ""
        output_path = output_dir / f"{filename}-{timestamp}{numbered}{suffix}"
        if ref["kind"] == "b64":
            try:
                output_path.write_bytes(base64.b64decode(ref["value"], validate=True))
            except Exception as exc:
                fail(f"Failed to decode generated image: {exc}")
        else:
            output_path = download_image(ref["value"], output_path, timeout)
        results.append({"saved_path": str(output_path.resolve()), "revised_prompt": ref["revised_prompt"]})
    return results


def add_optional(payload: dict, key: str, value):
    if value not in ("", None):
        payload[key] = value


def apply_preset(
    preset: str,
    size: str,
    quality: str,
    preserve_size: bool = False,
    preserve_quality: bool = False,
) -> tuple[str, str]:
    normalized = (preset or "").strip().lower()
    if not normalized:
        return size, quality
    if normalized not in PRESETS:
        fail(f"Unknown preset: {preset}. Available: {', '.join(sorted(PRESETS))}")
    values = PRESETS[normalized]
    selected_size = size if preserve_size else values.get("size", size)
    selected_quality = quality if preserve_quality else values.get("quality", quality)
    return selected_size, selected_quality


def positive_int(value, label: str, minimum: int = 1) -> int:
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        fail(f"{label} must be an integer.")
    if parsed < minimum:
        fail(f"{label} must be at least {minimum}.")
    return parsed


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Generate or edit images through a configurable Image2 API")
    parser.add_argument("--env-file")
    parser.add_argument("--base-url")
    parser.add_argument("--api-key")
    parser.add_argument("--generate-endpoint")
    parser.add_argument("--edit-endpoint")
    parser.add_argument("--auth-header")
    parser.add_argument("--auth-scheme")
    parser.add_argument("--extra-headers-json")
    parser.add_argument("--provider-name")
    parser.add_argument("--model")
    parser.add_argument("--prompt", default="")
    parser.add_argument("--prompt-file", default="")
    parser.add_argument("--mode", default="auto", choices=["auto", "generate", "edit"])
    parser.add_argument("--preset", default="")
    parser.add_argument("--size")
    parser.add_argument("--quality")
    parser.add_argument("--output-format", choices=["png", "jpeg", "webp"])
    parser.add_argument("--response-format", choices=["url", "b64_json"])
    parser.add_argument("--n", type=int)
    parser.add_argument("--image", default="")
    parser.add_argument("--mask", default="")
    parser.add_argument("--background")
    parser.add_argument("--output-compression", type=int)
    parser.add_argument("--moderation")
    parser.add_argument("--input-fidelity")
    parser.add_argument("--partial-images", type=int)
    parser.add_argument("--user")
    parser.add_argument("--timeout", type=int)
    parser.add_argument("--output-dir")
    parser.add_argument("--filename", default="image2")
    parser.add_argument("--dry-run", action="store_true")
    return parser


def main():
    args = build_parser().parse_args()
    file_config, loaded_files = collect_file_config(args.env_file or "")

    base_url, _ = resolve_config(args.base_url, "IMAGE2_BASE_URL", file_config, "")
    api_key, key_source = resolve_config(args.api_key, "IMAGE2_API_KEY", file_config, "")
    generate_override, _ = resolve_config(args.generate_endpoint, "IMAGE2_GENERATE_ENDPOINT", file_config, "")
    edit_override, _ = resolve_config(args.edit_endpoint, "IMAGE2_EDIT_ENDPOINT", file_config, "")
    auth_header, _ = resolve_config(args.auth_header, "IMAGE2_AUTH_HEADER", file_config, DEFAULT_AUTH_HEADER)
    auth_scheme, _ = resolve_config(args.auth_scheme, "IMAGE2_AUTH_SCHEME", file_config, DEFAULT_AUTH_SCHEME)
    extra_headers_raw, _ = resolve_config(args.extra_headers_json, "IMAGE2_EXTRA_HEADERS_JSON", file_config, "{}")
    provider_name, _ = resolve_config(args.provider_name, "IMAGE2_PROVIDER_NAME", file_config, "image2-api")
    model, _ = resolve_config(args.model, "IMAGE2_MODEL", file_config, DEFAULT_MODEL)
    size, size_source = resolve_config(args.size, "IMAGE2_SIZE", file_config, DEFAULT_SIZE)
    quality, quality_source = resolve_config(args.quality, "IMAGE2_QUALITY", file_config, DEFAULT_QUALITY)
    output_format, _ = resolve_config(args.output_format, "IMAGE2_OUTPUT_FORMAT", file_config, DEFAULT_OUTPUT_FORMAT)
    response_format, _ = resolve_config(args.response_format, "IMAGE2_RESPONSE_FORMAT", file_config, DEFAULT_RESPONSE_FORMAT)
    raw_timeout, _ = resolve_config(args.timeout, "IMAGE2_TIMEOUT", file_config, DEFAULT_TIMEOUT)
    raw_n, _ = resolve_config(args.n, "IMAGE2_N", file_config, 1)

    if args.prompt_file:
        try:
            args.prompt = Path(args.prompt_file).read_text(encoding="utf-8")
        except Exception as exc:
            fail(f"Failed to read prompt file: {exc}")
    if not args.prompt.strip():
        fail("Missing prompt: pass --prompt or --prompt-file.")

    mode = args.mode if args.mode != "auto" else ("edit" if args.image else "generate")
    derived_generate, derived_edit = derive_endpoints(base_url)
    generate_endpoint = generate_override or derived_generate
    edit_endpoint = edit_override or derived_edit
    endpoint = edit_endpoint if mode == "edit" else generate_endpoint
    if not endpoint:
        fail("Missing endpoint: set IMAGE2_BASE_URL or the mode-specific endpoint variable.")
    validate_endpoint(endpoint, "Image2 endpoint")
    if not api_key and not args.dry_run:
        fail("Missing API key: set IMAGE2_API_KEY locally or pass --api-key.")
    if mode == "edit" and not args.image:
        fail("Edit mode requires --image.")
    if mode == "generate" and args.mask:
        fail("--mask is only valid in edit mode with --image.")

    timeout = positive_int(raw_timeout, "timeout")
    n = positive_int(raw_n, "n")
    size, quality = apply_preset(
        args.preset,
        str(size),
        str(quality),
        preserve_size=size_source == "cli",
        preserve_quality=quality_source == "cli",
    )
    if output_format not in {"png", "jpeg", "webp"}:
        fail("output format must be png, jpeg, or webp.")
    if response_format not in {"url", "b64_json"}:
        fail("response format must be url or b64_json.")

    payload = {
        "model": model,
        "prompt": args.prompt,
        "n": n,
        "size": size,
        "quality": quality,
        "output_format": output_format,
        "response_format": response_format,
    }
    add_optional(payload, "background", args.background)
    add_optional(payload, "output_compression", args.output_compression)
    add_optional(payload, "moderation", args.moderation)
    add_optional(payload, "user", args.user)
    add_optional(payload, "input_fidelity", args.input_fidelity)
    if mode == "generate":
        add_optional(payload, "partial_images", args.partial_images)

    if args.dry_run:
        print(
            json.dumps(
                {
                    "provider": provider_name,
                    "mode": mode,
                    "endpoint": endpoint,
                    "api_key_configured": bool(api_key),
                    "api_key_source": key_source if api_key else "missing",
                    "auth_header": auth_header,
                    "auth_scheme": auth_scheme,
                    "loaded_env_files": loaded_files,
                    "payload": payload,
                    "files": {key: value for key, value in {"image": args.image, "mask": args.mask}.items() if value},
                },
                ensure_ascii=False,
            )
        )
        return

    extra_headers = parse_extra_headers(extra_headers_raw)
    headers = build_headers(api_key, auth_header, auth_scheme, extra_headers)
    if mode == "edit":
        result = http_multipart(endpoint, headers, payload, {"image": args.image, "mask": args.mask}, timeout)
    else:
        result = http_json(endpoint, headers, payload, timeout)

    refs = extract_image_refs(result)
    if not refs:
        fail("Response succeeded, but no data[*].url or data[*].b64_json image was found.")
    output_dir_value = args.output_dir or str(Path.cwd() / "generated" / "image2-api")
    saved = save_images(refs, Path(output_dir_value), args.filename, output_format, timeout)
    print(
        json.dumps(
            {
                "provider": provider_name,
                "mode": mode,
                "endpoint": endpoint,
                "prompt": args.prompt,
                "size": size,
                "quality": quality,
                "images": saved,
            },
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
