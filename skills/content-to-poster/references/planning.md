# Poster-flow planning

Read this file when converting source content into `poster-plan.json`.

## 1. Establish the communication contract

Record the source language, audience, channel, desired action, tone, fixed facts, required copy, forbidden claims, brand constraints, and any requested page count or aspect ratio. Separate content into three buckets:

- **Must show:** the core promise or thesis plus required names, dates, prices, locations, numbers, disclaimers, and CTA.
- **May show:** explanations, examples, proof, context, and supporting details that improve comprehension.
- **Omit:** repetition, navigation text, boilerplate, low-value background, and details that do not affect understanding or action.

Never promote a may-show item above a must-show fact merely because it is visually attractive. Keep a short `source_refs` value on every page so facts can be traced back to a heading, paragraph, URL fragment, or user-provided field.

## 2. Choose one mainline

Express the whole series as one sentence: “For [audience], communicate [core point] so they [desired outcome].” If the source contains unrelated themes, either omit the secondary theme, create a clearly labeled second volume, or ask the user when the choice changes the intended message.

Useful narrative arcs:

- **Educational:** promise → core idea → explanation → steps/examples → checklist → summary.
- **Event:** hook → value → speakers/agenda → time/place → participation details → CTA.
- **Product:** problem → promise → key benefits → proof/comparison → offer → CTA.
- **Opinion/report:** thesis → context → evidence → implications → recommendation → closing.
- **List/roundup:** cover → selection rule → grouped items → comparison → recommendation → save/share CTA.

## 3. Determine page count

Choose page boundaries by idea, not by equal character counts. A compact set of principles or rules should normally remain one `9:16` long poster when four to six cards can fit with readable type. These are starting points, not quotas:

| Source complexity | Typical flow |
|---|---|
| One message, little support | 1 long poster or 1-3 pages |
| Several related ideas | 4-6 pages |
| Long article or tutorial | 6-8 pages |
| Dense report | 8-10 pages or multiple volumes |

Use no more than 10 pages in one flow unless the user explicitly requests more. Each page must add a distinct job; remove pages that merely restate another page. When a reference image shows a single tall composition with repeated cards, preserve that single-canvas structure and compress copy to fit it.

## 4. Match information shape to page type

Load `layouts.json`, then select the page type whose information shape matches the source:

- identity/promise → `cover`
- one central claim → `thesis`
- one explained topic → `section`
- parallel tips/features → `list`
- ordered actions or chronology → `steps`
- two or more comparable options → `comparison`
- an exact sourced statement → `quote`
- metrics or evidence → `data`
- a concrete action → `cta`
- recap or checklist → `summary`

Do not invent a quote to justify a `quote` page or invent numbers to justify a `data` page. Use at least two page types in a multi-page series, normally three or more for flows of six pages or longer.

## 5. Copy budgets

Prefer splitting a dense page over shrinking all text. For Chinese copy, the following are practical soft limits; Latin-language copy may use roughly twice as many characters:

| Field | Soft limit |
|---|---:|
| kicker | 16 characters |
| headline | 28 characters |
| subheadline | 50 characters |
| body paragraph | 90 characters |
| item label | 12 characters |
| item text | 45 characters |
| items per page | 3-5 |
| total exact copy per page | about 220 characters |

Preserve required copy verbatim even when it exceeds a limit; instead change the page type, split the page, or flag the density risk.

## 6. Select style and aspect ratio

Load `styles.json`. Match style to audience, subject, tone, channel, and density. If the user names a style ID, use it. If they describe a look, map the description to the closest style and record why. For a dense Chinese single-page card, prefer `warm-neon-cards` when no style is specified. If there is no preference in other cases, auto-select the lowest-risk suitable style; `editorial-swiss` is the general fallback.

Common aspect choices:

- Single long poster / stacked information cards: `9:16`; use `9:21` when six cards or roughly 500-550 Chinese characters must remain on one canvas
- Xiaohongshu/feed carousel: `3:4` or `4:5`
- Instagram/feed: `4:5`
- Story/Reels/full-screen vertical: `9:16`
- Open Graph/banner: `16:9`
- General square card: `1:1`

The provider may restrict accepted pixel sizes. If a custom size fails, use a supported Image2 preset with the closest ratio and report the substitution.

## 7. Build the series system

Write a one-sentence `continuity` rule covering the recurring palette, type character, grid, motif, image treatment, page marker, and footer position. Give each page a distinct `visual_brief` that supports its content while staying inside the shared system. Avoid literal visual clichés when an abstract diagram, editorial object, or typographic composition communicates more clearly.

## 8. Pre-render review

Before rendering, verify:

- every number, name, date, price, quote, and CTA matches the source;
- page order tells one coherent story;
- no page exceeds its layout capacity without an explicit density note;
- exact copy contains no Markdown syntax, placeholder text, or unsupported emoji unless intentional;
- the chosen style supports the information density;
- `id` values are ordered, unique, and filename-safe;
- all assumptions and missing facts are visible in `notes` and are not presented as sourced claims.

## 9. Visual QA after rendering

Rendering success does not release a page. Follow the mandatory gate in [qa-gate.md](qa-gate.md), record the result in `qa-report.json`, and run `scripts/qa_gate.py`. Inspect every image for exact copy, character substitutions, missing punctuation, unwanted text, broken hands/faces when people appear, low contrast, type collisions, unsafe margins, inconsistent palette or typography, duplicated page numbers, and accidental brand marks. A visually attractive image with one incorrect required character is a failed page, and a series containing any failed page is not deliverable.
