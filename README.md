<div align="center">

<img src="docs/images/banner.svg" alt="Context Maps — mind maps built from context" width="100%">

<br>

[![CI](https://github.com/p-oliveira7/context-maps/actions/workflows/ci.yml/badge.svg)](https://github.com/p-oliveira7/context-maps/actions/workflows/ci.yml)
[![Node](https://img.shields.io/badge/node-%E2%89%A518-5fa04e?logo=node.js&logoColor=white)](#getting-started)
[![Dependencies](https://img.shields.io/badge/runtime%20dependencies-0-2ea44f)](#getting-started)
[![Local first](https://img.shields.io/badge/local--first-127.0.0.1-blue)](#security)
[![Agent skill](https://img.shields.io/badge/agent%20skill-Claude%20%C2%B7%20Codex%20%C2%B7%20Cursor-8a63d2)](#agent-skill)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
[![Mermaid](https://img.shields.io/badge/diagrams-Mermaid-ff3670)](#images-diagrams-and-links)

**English** · [Português (BR)](README.pt-BR.md)

[Getting started](#getting-started) · [Features](#features) · [Agent skill](#agent-skill) · [Data format](#data-format) · [API](#server-api) · [Tests](#tests) · [Changelog](CHANGELOG.md)

</div>

---

**Context Maps** is a local app to view and edit presentations as mind maps, plus an agent *skill*
(Claude, Codex, Cursor) that reads the context of an application — code, specs, flows, decisions — and
publishes the finished map with images, diagrams and links.

> No external backend, no CDN, no runtime dependencies. Everything runs on `127.0.0.1`, and every
> presentation is a JSON file you version with Git.

<p align="center">
  <img src="docs/images/01-overview.png" alt="A presentation with three root cards, open on the overview" width="920">
</p>

## Contents

- [Why Context Maps](#why-context-maps)
- [How it fits together](#how-it-fits-together)
- [Getting started](#getting-started)
- [Features](#features) — [navigate](#navigate-and-read) · [edit](#edit) · [diagrams](#images-diagrams-and-links) · [export](#export-import-and-share) · [save as](#save-as-and-folders)
- [Agent skill](#agent-skill)
- [Data format](#data-format) · [Server API](#server-api) · [Security](#security)
- [Tests](#tests) · [Regenerating the screenshots](#regenerating-the-screenshots)
- [Known limitations](#known-limitations) · [License](#license) · [Third-party](#third-party) · [Origin](#origin)

## Why Context Maps

Explaining a system usually needs three things that live in different places: **text** (README, specs),
**diagrams** (flows, architecture) and **evidence** (screenshots, links). A mind map brings the three onto
one navigable surface: you start from the overview and open branches as the conversation goes.

| | |
| --- | --- |
| **Versioning for free** | Each presentation is a small JSON file: `git diff` shows exactly which idea changed. |
| **No account, no cloud** | The content of your architecture never leaves your machine. |
| **Agent-friendly** | The format is small and documented ([`schema.md`](skills/context-maps/schema.md)); a CLI validates and publishes outlines. |
| **Reviewable and reproducible** | Edit by hand in the app, or ask the skill to regenerate or extend the map when the system changes. |

## How it fits together

```mermaid
flowchart LR
    ctx["Context<br/>code · specs · README"] --> agent["Agent + skill"]
    agent -- outline --> cli["rm.mjs<br/>validate · create"]
    cli --> srv["server.mjs<br/>127.0.0.1"]
    app["App in the browser<br/>view · edit · diagrams"] <-- "GET / PUT / upload" --> srv
    srv --> files[("presentations/&lt;id&gt;.json<br/>+ assets/")]
    files --> git[["Git"]]
```

| Piece | What it is | Where |
| --- | --- | --- |
| **App** | Map viewer and editor (HTML/CSS/ES modules) | `index.html`, `app.js`, `motion.js`, `model.js`, `store.js`, `styles.css` |
| **Local server** | Plain Node: serves the app and stores presentations | `server.mjs` |
| **Presentations** | One JSON per map + an images folder | `presentations/<id>.json`, `presentations/<id>/assets/` |
| **Skill** | Procedure + CLI for agents to build maps | `skills/context-maps/` ([guide](docs/skill.md)) |
| **Tests** | Model, browser, cards, motion, edit and skill | `tests/` |

## Getting started

Requirements: **Node 18+** (tested on Node 24). No `npm install` is needed to use the app.

```bash
node server.mjs          # or: npm start
```

Open <http://127.0.0.1:4173>. On first run the server creates the demo presentation in `presentations/`.

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `4173` | Server port |
| `PRESENTATIONS_DIR` | `./presentations` | Main library folder |
| `CONTEXT_MAPS_CONFIG` | `./.context-maps.json` | Where the extra folders are remembered |

> Without the server (for example `python -m http.server`) the app opens in **view mode only**, with the
> built-in demo map. Do not open `index.html` through `file://` (it uses ES modules).

**Language:** the interface follows your browser's language — Portuguese (BR) or English (any other language falls back to English). Add `?lang=pt` or `?lang=en` to the URL to force one; the choice is remembered in the browser. Presentation content is yours and is never translated (the bundled example is in Portuguese).

`presentations/cidades-para-pessoas.json` ships with the repository and shows **every feature** in one
place: open it, expand everything and switch on *Edit* mode.

## Features

### Navigate and read

<p align="center">
  <img src="docs/images/02-hover-subtitle.png" alt="Hovering a card enlarges it and shows its subtitle" width="820"><br>
  <sub>Hovering a card highlights the line that leads to it, enlarges it a little and reveals its subtitle.</sub>
</p>

- **Pan** by dragging the background (or holding the **middle mouse button** anywhere); **scroll** to zoom; the − / + and ⌗ (fit) buttons sit in the corner.
- **Click a title** (or Enter/Space) to expand or collapse a branch. Opening animates the cards for 420 ms and highlights the connection to the first child (honours `prefers-reduced-motion`).
- **Several root cards** never overlap: when an open tree would cover another, the one that was **below (or to the right)** moves aside, so the original order is kept, and it returns to its saved position when collapsed.
- **Expand all / Collapse all**, **Full screen** and **Text mode** (linear reading of the whole map) live in the bottom bar.
- **Subtitles** show in a small panel under the card **only while hovering it**.
- **Search** (🔍 in the bottom bar, **Ctrl+K** or **/**) finds ideas by title or subtitle, ignoring case and accents; picking a result opens the branches that hide it and centres the map on it.

<p align="center">
  <img src="docs/images/09-text-mode.png" alt="Text mode: the whole map as a linear outline" width="820"><br>
  <sub>Text mode turns the map into a linear outline, handy for reading, searching and sharing.</sub>
</p>

### Images, diagrams and links

<p align="center">
  <img src="docs/images/03-media-links.png" alt="Cards with one image, several images, an image plus a diagram and links" width="920"><br>
  <sub>A card can carry several images and diagrams at once, plus one or more links.</sub>
</p>

- **Images and diagrams** open full screen; with several items there are ‹ › arrows (or ← →) and a counter.
- **Links** show as a "🔗 N link(s)" badge below the card: one link opens directly, several open a list.
- **Diagrams** are [Mermaid](https://mermaid.js.org/), edited in the app with a live preview.

<p align="center">
  <img src="docs/images/07-diagram-editor.png" alt="The Mermaid diagram editor with live preview" width="820"><br>
  <sub>The Mermaid editor: source on the left, live preview on the right.</sub>
</p>

### Edit

Turn on the **Edit** switch in the bottom bar. Hover a card and click the **✎** button at its top-centre:
a **wheel of actions** opens around it (it closes with **Esc**, ×, or by clicking outside).

<p align="center">
  <img src="docs/images/04-edit-wheel.png" alt="The wheel of editing actions around a card" width="820">
</p>

| Action | How |
| --- | --- |
| Edit text | Click the text; Enter confirms |
| Add an idea | **+ Child**, **+ Sibling** (after), **+ Before** (sibling before) or **+ Parent** (wraps the idea in a new parent card); unlimited depth |
| Root cards | **Root card** (bottom bar) adds another starting point anywhere on the map. Drag a root by its **⋮⋮** handle to place it freely. **Make root** in the wheel (or dropping any card on empty space) turns a branch into a new root |
| Presentation name | **Double-click** the name in the top-left menu to rename it (separate from the text of the root cards). Names are unique: a repeated name is refused, and *new/copy* add " (2)", " (3)"… |
| Images | **+ Image** (several files) or **drag image files onto a card**; each file is **copied** into `presentations/<id>/assets/` and the original is untouched; **×** removes one |
| Reorder media | With 2+ images/diagrams in a card: **↑ ↓** or drag the **⋮⋮** grip (a green line shows where it lands) |
| Diagrams | **+ Diagram** opens the Mermaid editor; **Edit** reopens it |
| Title-less cards | Clear the title of a card that has an image/diagram or a subtitle: it then shows only that content |
| Subtitle · Links | Type in the "Subtitle" field under the title; **+ Link** accepts http/https, with chips and **×** to remove |
| Duplicate · Copy · Paste | In the wheel: **Duplicate** clones an idea with everything below it next to the original; **Copy** keeps it, and **Paste** (shown after copying) adds it as a child of another idea — also in another presentation, copying its images |
| Undo / redo | **↶ ↷** buttons in the bottom bar, or **Ctrl+Z** / **Ctrl+Shift+Z** (**Ctrl+Y**). Works for every edit, up to 100 steps; typing in one field is a single step |
| Delete | **Delete** (asks for confirmation when there are ideas below) |

**Autosave** is on (status next to the name: *Saved / Saving… / Save error*).

#### Move ideas by dragging

<p align="center">
  <img src="docs/images/06-drag-move.png" alt="Dragging a branch: the card and its subtree follow the cursor" width="920">
</p>

Drag the **⋮⋮ handle** on the left of a card. The card and **everything below it** leave the map and follow
the cursor as a small tree. Drop on another card (it becomes its child) or on its top/bottom edge (it becomes a
sibling). Hovering a **collapsed branch opens it by itself**, so you can walk through its sub-branches. Hold the
**middle mouse button** to pan while dragging, use the wheel to zoom, **Esc** to cancel; an **Undo** toast
follows every move.

#### Line colours

<p align="center">
  <img src="docs/images/05-line-colors.png" alt="The line colour panel with its two scopes" width="820">
</p>

**Colour lines** (in the wheel, on any idea with children) opens a palette. Choose **Only direct children**
(the lines leaving that card) or **The whole branch below**. The card itself, its children and the line
arriving at it never change.

### Export, import and share

- **Export as HTML…** downloads a single `.html` file with the viewer, the map and all images inside. It opens offline in any browser, read-only — send it by e-mail or attach it to a ticket.
- **Export as ZIP…** downloads the presentation files: `<name>.json` plus the `<name>/assets/` folder with its images. Unzip it into a repository folder (and **Add folder…**) or hand it to a teammate.
- **Import…** (same menu) reads a **ZIP package** or an **exported HTML file** and opens the result as a new presentation. Names stay unique (a repeated name gets " (2)"), images are copied into `presentations/<id>/assets/`, and references to files that are not in the package are dropped. Nothing in the file is executed.

### Save as and folders

<p align="center">
  <img src="docs/images/08-save-as.png" alt="The Save as dialog: name, folder and what to do next" width="640">
</p>

**Save as…** and **Save a copy…** (in the presentation menu, or **Ctrl+Shift+S**) open a window where you
choose the **name**, the **folder** and what happens next:

- **Folder:** the app library (`presentations/`), any folder you registered before, or **Other folder…** — type a full path or press **Choose…** (a native folder window opens). The folder is created if needed, remembered in `.context-maps.json` (not versioned) and listed in the menu, so you can **open and edit presentations in place**, e.g. inside another project's repository. **Add folder…** registers a folder that already has presentations; the **×** beside a folder only removes it from the list (no file is deleted).
- **After saving:** *Open the new presentation* (default for *Save as*) or *Keep working on this one* (default for *Save a copy*). The file and its images are copied together; names stay unique.
- In extra folders, image paths are stored **relative to the file** (`<name>/assets/…`), so the whole folder is portable.

## Agent skill

The skill turns context into a map. Flow summary (details in [`docs/skill.md`](docs/skill.md)):

1. The agent makes sure the server is up: `node skills/context-maps/scripts/rm.mjs serve`.
2. It reads the relevant context (code, README, specs, existing diagrams).
3. It writes a markdown **outline**:

   ```markdown
   # Login flow [img:docs/cover.png|Cover]
   - Authenticate {color=#c76a61}
     - Validate credentials [link:https://owasp.org/|OWASP]
     - Detailed flow [mermaid:docs/login.mmd]
   - Session
     - Refresh token
   ```
4. It validates and publishes:

   ```bash
   node skills/context-maps/scripts/rm.mjs validate --outline map.md
   node skills/context-maps/scripts/rm.mjs create   --outline map.md --id login-flow
   ```
5. It gets the URL (`http://127.0.0.1:4173/?p=login-flow`), the generated file and a report (nodes, media, skipped items).

Example requests: *"map this repository's architecture"*, *"map the payment flows using the diagrams in
`docs/`"*, *"turn this specification into a map for tomorrow's meeting"*.

**Outline cheat sheet**

| Marker | Effect |
| --- | --- |
| `# Title` | A root card (several `#` lines make several roots) |
| `- Title` (indented) | A child card; indentation sets the depth |
| `[img:path\|alt]` | Attach a local image |
| `[mermaid:file.mmd]` | Render a Mermaid file as a diagram (needs `mmdc`) |
| `[link:url\|label]` | Add a link |
| `[subtitle:text]` | Supporting text shown on hover |
| `{color=#hex}` · `{links=#hex}` | Card colour · colour of the lines leaving the card |

CLI options: `--id`, `--title`, `--replace`, `--dir <folder>` (create in another folder). To refresh a map after the system changed, run `update --id <slug> --outline map.md`: it matches ideas by title and keeps ids, colours, positions and manual edits (`--dry-run` previews, `--prune` removes ideas missing from the outline). Messages follow
`RM_LANG=en|pt`; `MMDC` / `MMDC_BROWSER` point to mermaid-cli and its browser.

### Agent compatibility

| Agent | How the skill is found | Status |
| --- | --- | --- |
| **Claude (Claude Code)** | `skills/context-maps/SKILL.md` (copy to `~/.claude/skills/` for global use) | Native format |
| **Codex** | `AGENTS.md` at the root points to `SKILL.md` | Files checked in CI; real-app run pending ([how to verify](docs/skill.md#codex-and-cursor)) |
| **Cursor** | `.cursor/rules/context-maps.mdc` and `AGENTS.md` | Files checked in CI; real-app run pending ([how to verify](docs/skill.md#codex-and-cursor)) |

The heavy lifting lives in a Node CLI (`rm.mjs`), so any agent with terminal access can use it. Agent-facing
instructions (`SKILL.md`, `schema.md`, `AGENTS.md`) are in English, with Portuguese copies (`*.pt-BR.md`).

## Data format

```json
{
  "id": "my-flow",
  "title": "Presentation name",
  "roots": [{
    "id": "root",
    "title": "First root card",
    "x": 0, "y": 0,
    "children": [
      {
        "id": "n-1a2b3c4d",
        "title": "Idea",
        "color": "#c76a61",
        "linksColor": "#ffffff",
        "subtitle": "Supporting text shown on hover",
        "images": [
          {"src": "presentations/my-flow/assets/screen.png", "alt": "Home screen"},
          {"src": "presentations/my-flow/assets/d.svg", "alt": "Diagram", "kind": "diagram", "source": "flowchart TD…"}
        ],
        "links": [{"url": "https://example.com/docs", "label": "Docs"}],
        "children": []
      }
    ]
  }]
}
```

Full reference and modelling best practices: [`skills/context-maps/schema.md`](skills/context-maps/schema.md).
The older `{id, tree}` form is still read and migrated on save.

## Server API

Listens on `127.0.0.1` only. Every route answers JSON with `Cache-Control: no-store`.

| Method and route | Purpose |
| --- | --- |
| `GET /api/presentations` | List (`id`, `title`, `updatedAt`) |
| `POST /api/presentations` | Create (`{title, id?, dir?}`; `dir` = any absolute folder) |
| `GET /api/presentations/:id` | Read |
| `PUT /api/presentations/:id` | Save `{title, roots}` (validates unique ids, depth ≤ 40, ≤ 50 media/links per node) |
| `POST /api/presentations/:id/copy` | Copy under a new name (`{title, dir?}`), including images, into the library or another folder |
| `GET/POST /api/libraries`, `DELETE /api/libraries/:key` | List, add or forget extra folders |
| `POST /api/pick-folder` | Opens the system folder picker and returns the chosen path |
| `GET /api/presentations/:id/export?format=html\|zip` | Download the presentation as one self-contained HTML file or as a ZIP package |
| `POST /api/import?name=…` | Import a ZIP package or an exported HTML file (raw body) as a new presentation |
| `DELETE /api/presentations/:id` | Remove the file and its images |
| `POST /api/presentations/:id/assets?name=…` | Upload an image (png, jpg, webp, gif, svg; up to 15 MB) |

### Security

Every request that changes something must carry the `x-context-maps: 1` header (other web pages cannot send
it to your local server) and the `Host` must be local. There is no access to files outside the app folder and
the registered libraries, only http/https links are accepted, and Mermaid runs with `securityLevel: strict`.

## Tests

`npm test` runs the model tests (Node, no setup). The browser tests use Playwright and an installed Chrome:

```bash
npm install --no-save playwright-core   # once; or set PLAYWRIGHT_MODULE to an existing playwright-core
npm run test:e2e                        # edit, skill, browser, cards and motion, with an isolated temporary server
node tests/edit.mjs                     # or run a single suite
```

| Suite | Covers |
| --- | --- |
| `edit` EDIT-01..30 | editing, diagrams, media, links, folders, language, export, import |
| `skill` SKILL-01..08 | skill CLI |
| `browser` MAP-01..11 | navigation, zoom, text mode, mobile, full screen |
| `cards` CARD-01..06 | titles, root, keyboard, images |
| `motion` MOT-01..05 | animations and reduced motion |

`BROWSER_EXECUTABLE` selects a specific Chrome/Chromium binary. The same checks run on Linux, macOS and Windows
for every pull request ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)). To run `browser`, `cards` or
`motion` on their own, point `PREVIEW_URL` (default `http://127.0.0.1:4173`) at a server with an empty or temporary `PRESENTATIONS_DIR`.

### Regenerating the screenshots

The images in `docs/images/` come from the example presentation and are reproducible. The script copies
`presentations/` to a temporary folder, so your files are not touched:

```bash
PLAYWRIGHT_MODULE=file:///path/to/playwright-core/index.mjs node docs/screenshots.mjs
```

## Known limitations

- **No cross-links** between ideas (the structure is a tree). Cycles become text or a diagram.
- **CLI diagrams** need `mmdc` (mermaid-cli); in the app editor Mermaid is already bundled.
- Remote image URLs are **not downloaded** by the skill (use local files).
- Mobile: one-finger pan and zoom buttons; pinch is not implemented.
- Removing a media item does not delete its file from `assets/`.
- Designed for a **local machine, single user**: there is no authentication or simultaneous editing.

## License

[MIT](LICENSE) © 2026 Paulo Oliveira.

## Third-party

`vendor/mermaid.min.js` — [Mermaid](https://github.com/mermaid-js/mermaid) 12.2.0, MIT licence
(`vendor/mermaid.LICENSE`). Loaded on demand by the diagram editor only.

## Origin

The viewer's behaviour was inspired by observing a public mind-map viewer. The content, illustrations,
code and texts in this repository are original; nothing from the reference was copied.
