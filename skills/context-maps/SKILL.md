---
name: context-maps
description: Builds mind-map presentations in the Context Maps app from the context of an application (code, specs, README, flows, architecture, decisions). Use when the user asks for a mind map, flow map, architecture map or a visual presentation of a system/process to open and edit in Context Maps. Também use quando pedirem "mapa mental", "mapa de fluxo" ou "mapa de arquitetura" (Portuguese).
---

# Context Maps — build presentations from context

> Português: [`SKILL.pt-BR.md`](SKILL.pt-BR.md). Full guide: [`docs/skill.md`](../../docs/skill.md).

The Context Maps app stores each presentation as a JSON file in `presentations/`. This skill turns
context (code, documents, conversation) into a tree of ideas and publishes it **through the local server API**.

## Requirements
- Node 18+ (uses `fetch`). No dependencies.
- App server running (default `http://127.0.0.1:4173`; change with `RM_URL`).
- Optional, for diagrams: `mmdc` (mermaid-cli) on PATH or in `MMDC`. Without Puppeteer's Chrome, point to an installed Chrome with `MMDC_BROWSER`.
- CLI messages follow `RM_LANG=en|pt` (default: system locale).

CLI: `node skills/context-maps/scripts/rm.mjs <command>` (from the app root).

| Command | What it does |
| --- | --- |
| `serve` | Starts the server if it is not running |
| `status` | Lists the existing presentations |
| `validate --outline f.md` | Checks the outline and prints warnings (exits with 3 if any) |
| `create --outline f.md [--id slug] [--dir folder] [--replace]` | Creates (or overwrites) the presentation, uploads images/diagrams and prints the URL |
| `upload <id> <file>` | Uploads an image and prints its `src` |

## Procedure
1. **Make sure the server is up:** `rm.mjs serve`. Run `rm.mjs status` to see what exists (do not overwrite without being asked).
2. **Gather the context** you need: README, specs, routes, modules, tests, existing diagrams. Do not invent
   what is not in the material; mark gaps as an idea "To be defined".
3. **Choose the shape of the map** (see `schema.md`):
   - *Flow / journey:* root = the flow; branches = steps in order; children = actions, decisions, errors and outputs.
   - *Architecture:* root = the system; branches = layers/modules; children = responsibilities, interfaces, dependencies.
   - *Both:* root = the system; an "Architecture" branch and a "Flows" branch, each with its own structure.
4. **Write the outline** in markdown (format below) in a temporary file. Short texts (≤ 90 characters),
   3–7 children per node, depth ≤ 5.
5. **Attach media when it exists:** project screenshots/diagrams with `[img:path|alt]`; complex flows as
   mermaid with `[mermaid:file.mmd]` (rendered to SVG when `mmdc` is available).
6. **Validate and publish:** `rm.mjs validate --outline f.md`, fix warnings, then `rm.mjs create --outline f.md --id <slug>`.
7. **Deliver:** report the URL (`…/?p=<id>`), the generated file (`presentations/<id>.json`), the node count and
   what was skipped (media not attached). Remind the user they can adjust it in **Edit** mode and version it in Git.

## Outline format
```markdown
# Presentation title [img:docs/cover.png|Cover]
- Step 1 {color=#c76a61}
  - Action or decision
  - Detailed flow [mermaid:docs/login.mmd]
- Step 2
  - Login screen [img:docs/screen.png|Screenshot]
```
- `# Title` (first line) becomes the first root card and the presentation name. Further `# Title` lines start **additional root cards** (independent flows); `--title` sets the presentation name separately.
- Each `-` is an idea; indentation (2 spaces or a tab) defines the hierarchy.
- `{color=#rrggbb}` only has effect on first-level branches.
- `{links=#rrggbb}` colours the lines from that idea to its children (any idea with children).
- A bullet may have **no title** when it carries a marker (e.g. `- [mermaid:flow.mmd]` or `- [subtitle:note]`): the card then shows only the media / secondary text.
- `[subtitle:Supporting text]` adds a subtitle shown only while hovering the card (no `]` inside).
- `[link:https://site.com|Label]` adds a clickable link below the card (label optional; several allowed; http/https only).
- An idea can have **several** media items: repeat the markers (`[img:a.png|A] [mermaid:flow.mmd] [img:b.png|B]`); they stack in the card, in the order written.
- Image/diagram paths are relative to the outline file. Remote URLs are **not** downloaded.
- Images: png, jpg, webp, gif, svg.

## Rules
- `--dir <folder>` saves the presentation in another folder of the machine (e.g. the project's `docs/maps`); the folder is registered automatically and images are stored relative to the file.
- Never delete presentations or use `--replace` unless the user asks.
- Do not copy protected content; summarise in your own words.
- If the server is down and `serve` fails, report the manual command (`node server.mjs`) instead of writing files directly.
- Report warnings and skipped items transparently.
