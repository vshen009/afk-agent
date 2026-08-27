# Mandatory post-render QA gate

Read this file after images are rendered and before showing or describing them as finished deliverables. Rendering and API success do not satisfy this gate.

## Gate sequence

1. Initialize an auditable report from the final manifest:

   ```powershell
   py scripts/qa_gate.py --manifest <series-directory>/manifest.json --init-report <series-directory>/qa-report.json
   ```

2. Inspect each final image twice: once as a whole canvas for hierarchy and composition, then at readable or 100% scale for text and local defects. Review the actual final file, not a prompt, thumbnail, or earlier attempt.
3. Fill every page and check in `qa-report.json` according to [qa-report.schema.json](qa-report.schema.json). Evidence must state what was compared or observed; a bare “looks good” is insufficient.
4. For any failure, record the location, expected value, observed value, and corrective action. Retry or edit only the affected page where practical, then inspect the new final image from the beginning. Never reuse a pass recorded against an earlier image.
5. Validate the completed report:

   ```powershell
   py scripts/qa_gate.py --manifest <series-directory>/manifest.json --report <series-directory>/qa-report.json
   ```

The series is deliverable only when this command exits `0` and writes `release_gate.status: passed` to `manifest.json`. A structurally valid report containing any failure exits nonzero and writes a failed gate.

## Required checks for every page

### `text_fidelity`

Compare every visible text run with `EXACT ON-IMAGE COPY` in the page prompt, character by character and in reading order.

- Check every Han character, including visually similar substitutions such as 者/着, 未/末, 已/己, and 土/士.
- Check punctuation, spaces that affect meaning, capitalization, Latin product or protocol names, numbers, units, dates, ports, and page labels.
- Check for missing, duplicated, reordered, translated, paraphrased, or unintended text.
- For Chinese-heavy pages, inspect every line, not only headlines and highlighted phrases.
- OCR may identify candidates, but the reviewer must visually confirm each character against the exact copy. OCR output alone cannot produce a pass.

Any single incorrect required character or unintended visible word fails this check.

### `content_accuracy`

Verify that the rendered meaning and relationships still match the sourced plan:

- names, claims, values, dates, prices, and CTA;
- technical components, actions, protocols, ports, data flow, and arrow directions;
- item numbering, sequence, grouping, comparison sides, and causal direction;
- no invented component, metric, logo, citation, or conclusion.

### `design_compliance`

Compare the final image with `poster-plan.json`, the selected style, layout type, and continuity rule:

- requested aspect ratio, page count, module count, and reading order;
- title dominance, information hierarchy, copy budgets, and sufficient whitespace;
- palette, typography category, grid, motif, card geometry, image treatment, and footer placement;
- stable cross-page design tokens without making every composition identical;
- no microtype, dense table, or decorative element that defeats the planned readability.

### `visual_integrity`

Check production quality at full canvas and readable scale:

- no clipping, cropped glyphs, overlap, collision, unsafe margins, or illegible contrast;
- no malformed icons, diagrams, hands, faces, or objects where they matter;
- no accidental watermark, signature, brand mark, duplicated page number, rendering artifact, or unexplained blank area;
- all required content remains legible at the intended viewing size.

## Failure handling

- A failed check makes the page `fail`; one failed page makes `overall_status` `fail`.
- Prefer a targeted input-fidelity edit for an isolated wrong glyph and a page-only rerender for broader failures.
- After two unsuccessful targeted attempts for the same blocking text or structural issue, stop retrying automatically. Keep the gate failed, preserve the evidence, and report the limitation to the user.
- Do not hide a failure behind a caveat while presenting the image as complete. The user may explicitly choose to accept a failed artifact, but the QA report must remain truthful and must not be changed to `pass`.
