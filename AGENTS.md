# Context Maps — agent instructions

Local mind-map app (HTML/CSS/JS + `server.mjs` on Node, no runtime dependencies).
Each presentation is a file `presentations/<id>.json`.

## Build a presentation from context (flows, architecture)

Single source of instructions: **`skills/context-maps/SKILL.md`** (procedure) and
**`skills/context-maps/schema.md`** (format and best practices). Read both before starting.
Full guide: `docs/skill.md` (English) · `docs/skill.pt-BR.md` (Português).

Summary:

1. `node skills/context-maps/scripts/rm.mjs serve` — makes sure the server is on `http://127.0.0.1:4173`.
2. Read the context (code, README, specs). Do not invent; use "To be defined" for gaps.
3. Write a markdown outline (`# Title`, indented `- idea` items; markers
   `[img:file|alt]`, `[mermaid:file.mmd]`, `[link:https://…|label]`, `[subtitle:text]`, `[rel:Other idea title]`, `{color=#hex}`).
4. `node skills/context-maps/scripts/rm.mjs validate --outline file.md`
5. `node skills/context-maps/scripts/rm.mjs create --outline file.md --id <slug>`
   (use `--replace` only when the user asks to overwrite). To refresh an existing map after changes use
   `node skills/context-maps/scripts/rm.mjs update --id <slug> --outline file.md [--dry-run] [--prune]`
   (keeps ids, colours, positions and manual edits).
6. Report the URL (`…/?p=<id>`), the node count and what was skipped.

Mermaid diagrams need `mmdc` (mermaid-cli) on PATH or in `MMDC`; use `MMDC_BROWSER` to point to an
installed Chrome. CLI messages follow `RM_LANG=en|pt`.

## Development

- Server: `node server.mjs` (`PORT`, `PRESENTATIONS_DIR` variables).
- Tests: `npm test` (model) and `npm run test:e2e` (all browser/skill/a11y suites with an isolated temp server;
  needs `playwright-core` installed or `PLAYWRIGHT_MODULE` set, and Chrome). CI runs both on Linux, macOS and Windows.
- Every behaviour change adds a line under `## [Unreleased]` in `CHANGELOG.md`; releases follow `docs/releasing.md` (version in `package.json` + `version.js`).
- Do not add runtime dependencies; Mermaid in `vendor/` is loaded on demand by the diagram editor only.
