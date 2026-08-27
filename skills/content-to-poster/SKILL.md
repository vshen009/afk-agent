---
name: content-to-poster
description: Turn raw text, Markdown, articles, briefs, or structured notes into a coherent single poster or multi-page poster flow, then render it through the configurable image2-api skill. Use for 内容转海报、文章转海报流、小红书图文卡片、系列信息图、社媒海报组, or when exact content hierarchy and cross-page visual consistency matter. Do not use for editing an existing image without content restructuring.
---

# Content to Poster

Convert source content into an auditable poster plan, one prompt per page, and a visually consistent poster series. Preserve facts and required copy; do not invent dates, prices, names, statistics, quotes, or calls to action.

## vstack Update Guard

Before executing this skill, call the `vstack-update` skill. If it reports an update, show the local and remote versions and wait for **现在更新** or **本次跳过**. If it cannot check remotely, state that fact and continue this run.

After the guard, read the `image2-api` skill before rendering. Reuse its configured provider, authentication, model, endpoint handling, and output safeguards. Never copy or expose its API key.

## Inputs and Defaults

Accept pasted text, local files, URLs already available to the agent, or structured briefs. Honor explicit audience, channel, aspect ratio, page count, language, style, brand, and required-copy constraints.

- Default to a single long poster when the user supplies a compact set of principles, rules, tips, or a reference long-poster image. Use a multi-page flow only when the source has distinct sections that cannot remain readable on one canvas or the user explicitly asks for a series.
- Default language to the source language.
- Default channel to general social sharing. Use `9:16` for a single long poster or a reference image with stacked information cards; use `4:5` for an ordinary feed card and `3:4` for a compact carousel card. Honor an explicit ratio.
- For dense Chinese single-page cards, use the reusable `warm-neon-cards` style unless the user names another style or the reference clearly calls for a different visual system.
- Auto-select a style when none is specified. Do not block solely to ask the user to choose a style.
- Ask only when missing information would make a material fact or mandatory CTA incorrect. Otherwise proceed and record the assumption.

## Workflow

1. **Analyze and trace the content.** Read [references/planning.md](references/planning.md). Identify the communication goal, audience, mainline, must-show facts, optional support, omissions, missing facts, and source references. For a compact single-page brief, compress before designing rather than automatically creating one page per principle.
2. **Choose the system.** Read [references/styles.json](references/styles.json) only when selecting or resolving a visual style. Read [references/layouts.json](references/layouts.json) only when mapping information shapes to page types. Use one style across the series and vary page types to create rhythm.
3. **Write `poster-plan.json`.** Follow [references/poster-plan.schema.json](references/poster-plan.schema.json). Every factual page field must be traceable to the source or explicitly labeled as an assumption. Keep exact required copy verbatim.
4. **Build and validate prompts.** Run:

   ```powershell
   py scripts/content_to_poster.py --plan <poster-plan.json> --output-dir <series-directory>
   ```

   This writes `prompts/*.md` and `manifest.json` without calling an image API. Resolve validation errors and review the prompt files before rendering.
5. **Render through Image2.** Run:

   ```powershell
   py scripts/content_to_poster.py --plan <poster-plan.json> --output-dir <series-directory> --render
   ```

   Use `--env-file`, `--model`, `--provider-name`, `--preset`, `--size`, or `--quality` only when needed. Use `--pages 01-cover,03-steps` to render or retry selected pages. The script locates the sibling `image2-api` skill by default; use `--image2-script` only for a nonstandard installation.
6. **Pass the mandatory release QA gate.** A successful render is only `rendered-awaiting-qa`, never a deliverable result. Read [references/qa-gate.md](references/qa-gate.md), initialize `qa-report.json`, inspect every rendered image at readable scale, and compare all visible copy against the prompt's exact-copy contract character by character. Chinese review must cover every visible Han character, punctuation mark, Latin token, and number; OCR may assist but may not approve a page. Also verify factual/technical accuracy, design-plan compliance, and visual integrity. Any failed check blocks the affected page and the whole series. After corrections, run:

   ```powershell
   py scripts/qa_gate.py --manifest <series-directory>/manifest.json --report <series-directory>/qa-report.json
   ```

   Only exit code `0` and `release_gate.status: passed` authorize delivery. If required text remains unreliable after targeted retries, leave the gate failed and report the limitation; never silently accept or present the image as finished.

## Prompt and Rendering Invariants

- Treat `headline`, `subheadline`, `kicker`, `body`, `items`, `quote`, `attribution`, `facts`, `cta`, and `footer` as exact on-image copy. The renderer may not rewrite, translate, expand, or add text.
- Keep the series palette, typography category, grid logic, motif, image treatment, and footer placement consistent. Do not make every page composition identical.
- Prefer concise copy and strong hierarchy over shrinking type to fit. Move overflow to another page.
- For a single long poster, prefer four to six compact cards over many paragraphs. Each card should use a short principle title, an optional micro-label, and no more than two or three short lines of explanation.
- When a reference image is supplied, learn its composition, spacing, color roles, card geometry, and decorative rhythm. Do not copy its wording, logos, recognizable characters, or unrelated claims.
- Render pages separately so one failure can be retried without regenerating the series.
- Do not claim pixel-perfect text accuracy from an image model. Verification is mandatory when exact copy matters.
- Do not equate API success with delivery success. `rendered-awaiting-qa` and `release_gate.status: required|failed` are blocking states.

## Output

Use `generated/content-to-poster/<slug>/` by default, unless the user requests another location:

```text
<slug>/
|-- poster-plan.json
|-- manifest.json
|-- qa-report.json
|-- prompts/
|   |-- 01-cover.md
|   `-- ...
`-- images/
    |-- 01-cover-*.png
    `-- ...
```

Report the plan, manifest, and QA-report paths; saved image paths in page order; chosen style; aspect/size; quality; provider and endpoint; per-page render status; and final QA-gate status. Show images as finished deliverables only when the release gate passed. If it failed, identify the affected pages and issues without describing the series as complete.

## References

- [references/planning.md](references/planning.md): content extraction, page count, copy budgets, story flow, and QA
- [references/styles.json](references/styles.json): selectable visual systems and prompt atoms
- [references/layouts.json](references/layouts.json): page types, composition guidance, and density limits
- [references/poster-plan.schema.json](references/poster-plan.schema.json): machine-readable plan contract
- [references/qa-gate.md](references/qa-gate.md): mandatory post-render inspection and release criteria
- [references/qa-report.schema.json](references/qa-report.schema.json): machine-readable QA report contract
- [references/sources.md](references/sources.md): local reference-image and curated-style notes

## Curated Reference Styles

For a visual overview of every supported style and aspect ratio, open [style-catalog.html](style-catalog.html) in this skill directory.

- `warm-neon-cards` — 暖白荧光卡片 / Warm Neon Cards; see [assets/references/warm-neon-cards-reference.png](assets/references/warm-neon-cards-reference.png)
- `office-project-update` — 办公项目同步 / Office Project Update; see [assets/references/office-project-update-reference.png](assets/references/office-project-update-reference.png)
- `japanese-bubble-city-pop` — 日本泡沫经济 City Pop; see [assets/references/japanese-bubble-city-pop-reference.png](assets/references/japanese-bubble-city-pop-reference.png)
- `hand-drawn-knowledge-diagram` — 手绘知识图解 / Hand-drawn Knowledge Diagram; use for high-readability explainers that combine notebook, whiteboard, and consulting-report infographic cues.
