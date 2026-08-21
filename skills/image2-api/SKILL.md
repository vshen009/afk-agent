---
name: image2-api
description: Generate or edit raster images through any OpenAI-compatible Image2 API with a configurable base URL, API key, authentication header, and model. Use when the user asks for 通用生图、Image2 生图、图生图、图片编辑、自定义生图接口、切换生图 API 前缀，or wants one reusable gpt-image-2 client instead of a provider-specific skill.
---

# Image2 API

Use this skill as a provider-neutral client for OpenAI-compatible image generation and editing APIs. Prefer a provider-specific skill when the user explicitly names one and that skill exists.

## Configure

Copy `.env.example` to `.env` beside this file and set at least:

```env
IMAGE2_BASE_URL=https://provider.example.com/
IMAGE2_API_KEY=replace-with-local-secret
```

Never commit `.env`, print the key, or ask the user to paste a full key into chat.

Derive these endpoints automatically from `IMAGE2_BASE_URL`:

- Generate: `/v1/images/generations`
- Edit: `/v1/images/edits`

Accept a base URL ending in either `/` or `/v1`. Use `IMAGE2_GENERATE_ENDPOINT` and `IMAGE2_EDIT_ENDPOINT` only when a provider uses nonstandard paths.

Use these optional settings for provider differences:

```env
IMAGE2_MODEL=gpt-image-2
IMAGE2_AUTH_HEADER=Authorization
IMAGE2_AUTH_SCHEME=Bearer
IMAGE2_EXTRA_HEADERS_JSON={}
```

Set `IMAGE2_AUTH_HEADER=x-api-key` and leave `IMAGE2_AUTH_SCHEME=` empty for raw-key authentication.

Resolve configuration in this order: CLI option, process environment, explicit `--env-file`, current-directory `.env`, skill-directory `.env`, default value.

## Run

On Windows:

```powershell
py scripts/image2_api.py --prompt "<prompt>"
```

On macOS or Linux:

```bash
python3 scripts/image2_api.py --prompt "<prompt>"
```

Useful examples:

```powershell
# Inspect configuration without sending a request
py scripts/image2_api.py --prompt "test" --preset square --dry-run

# 4K landscape generation
py scripts/image2_api.py --prompt "<prompt>" --preset 4k

# Image-to-image or image editing
py scripts/image2_api.py --image source.png --input-fidelity high --prompt "<edit prompt>"

# Masked edit
py scripts/image2_api.py --image source.png --mask mask.png --input-fidelity high --prompt "<edit prompt>"
```

Use `--mode auto` to select edit mode when `--image` is present and generation mode otherwise.

## Request

Send JSON to the generation endpoint and multipart form data to the edit endpoint. Use model `gpt-image-2` by default. Support `url` and `b64_json` responses and save images locally immediately.

Important options:

- `--env-file <path>`
- `--base-url <url>`
- `--api-key <key>`
- `--generate-endpoint <url>` / `--edit-endpoint <url>`
- `--auth-header <name>` / `--auth-scheme <scheme>`
- `--model <model>`
- `--mode auto|generate|edit`
- `--prompt <text>` / `--prompt-file <path>`
- `--preset square|hd|2k|4k|4k-portrait`
- `--size <WxH|auto>`
- `--quality low|medium|high|auto`
- `--image <path>` / `--mask <path>`
- `--output-dir <path>`
- `--dry-run`

## Output

Save images under `generated/image2-api/` by default. Do not print base64 image data, authentication headers, signed image URLs, or API keys.

Always report:

- saved image path
- prompt
- size or preset and quality
- provider name and endpoint
- whether generation or editing succeeded

Show requested results with absolute local Markdown image paths.

## Failure Handling

- Missing configuration: ask the user to set `IMAGE2_BASE_URL` and `IMAGE2_API_KEY` locally.
- HTTP 401/403: report invalid or unauthorized credentials without exposing them.
- HTTP 429: report rate limiting, balance, queue, or capacity protection and preserve the response summary.
- Gateway or non-JSON response: report a concise truncated error.
- Missing `data[*].url` and `data[*].b64_json`: report the unexpected response shape and stop.
