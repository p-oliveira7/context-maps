# Context Maps

[Português (BR)](README.pt-BR.md) · **English**

**Mind maps built from context.** A local app to view and edit presentations as mind maps, plus an
agent *skill* (Claude, Codex, Cursor) that reads the context of an application — code, specs, flows,
decisions — and publishes the finished map, with images, diagrams and links.

> No external backend, no CDN, no runtime dependencies. Everything runs on `127.0.0.1`, and every
> presentation is a JSON file you version with Git.

---

## The idea

Explaining a system usually needs three things that live in different places: **text** (README, specs),
**diagrams** (flows, architecture) and **evidence** (screenshots, links). A mind map brings the three onto
one navigable surface: you start from the overview and open branches as the conversation goes.

Context Maps combines two pieces:

1. **A local mind-map viewer/editor**, fast and dependency-free, where presentations are plain files
   inside your repository.
2. **An agent skill** that turns context into a presentation. Instead of building the map by hand you ask —
   *"build a map of this application's checkout flow"* — and the agent reads the project, writes the
   structure, attaches diagrams and links, validates it and hands you a URL to open and tweak in edit mode.

The result is reviewable (it is JSON in Git), editable (edit mode in the app) and reproducible (the skill
can regenerate or extend the map when the system changes).

### Why local JSON files?

- **Versioning for free:** `git diff` shows exactly which idea changed.
- **No account, no cloud:** the content of your architecture never leaves your machine.
- **Agent-friendly:** the format is small and documented ([`schema.md`](skills/context-maps/schema.md)).

---

## Overview

| Piece | What it is | Where |
| --- | --- | --- |
| **App** | Map viewer and editor (HTML/CSS/ES modules) | `index.html`, `app.js`, `motion.js`, `model.js`, `store.js`, `styles.css` |
| **Local server** | Plain Node: serves the app and stores presentations | `server.mjs` |
| **Presentations** | One JSON per map + an images folder | `presentations/<id>.json`, `presentations/<id>/assets/` |
| **Skill** | Procedure + CLI for agents to build maps | `skills/context-maps/` |
| **Skill guide** | Detailed skill documentation | [`docs/skill.md`](docs/skill.md) |
| **Tests** | Model, browser, cards, motion, edit and skill | `tests/` |

```
 context (code, specs, README)           ┌──────────────────────────────┐
        │                                │  app in the browser          │
        ▼                                │  view · edit · diagrams      │
 agent + skill ──outline──▶ rm.mjs ──▶   └──────────────▲───────────────┘
                                │                       │ GET/PUT/upload
                                ▼                       │
                        server.mjs (127.0.0.1) ─────────┘
                                │
                                ▼
                  presentations/<id>.json  ──▶  Git
```

---

## Getting started

Requirements: **Node 18+** (tested on Node 24). No `npm install` is needed to use the app.

```bash
node server.mjs          # or: npm start
```

Open <http://127.0.0.1:4173>. On first run the server creates the demo presentation in
`presentations/`. Optional variables:

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `4173` | Server port |
| `PRESENTATIONS_DIR` | `./presentations` | Folder where maps are stored |

> Without the server (for example `python -m http.server`) the app opens in **view mode only**, with the
> built-in demo map. Do not open `index.html` through `file://` (it uses ES modules).

---

## Using the app

### View mode
- **Drag** the background to pan; **scroll** to zoom; the − / + and ⌗ (fit) buttons sit in the corner.
- **Click a title** (or Enter/Space) to expand or collapse a branch; the fan-style button beside the card works too.
  Opening a branch animates the cards for 420 ms and highlights the connection to the first child for 1 s
  (honours `prefers-reduced-motion`).
- **Hovering** a card highlights the line that leads to it.
- **Expand all / Collapse all** and **Text mode** (linear reading of the whole map) live in the bottom bar.
- **Images and diagrams** open full screen; with several items there are ‹ › arrows (or ← →) and a counter.
- **Links** show as a "🔗 N link(s)" badge below the card: one link opens directly, several open a list.

### Edit mode
Turn on the **Edit** switch in the bottom bar.

| Action | How |
| --- | --- |
| Edit text | Click the text; Enter confirms |
| Add an idea | **+ Child** or **+ Sibling** (unlimited depth) |
| Images | **+ Image** (accepts several files); **×** removes one |
| Diagrams | **+ Diagram** opens the Mermaid editor with live preview; **Edit** reopens it |
| Links | **+ Link** (http/https); chips with **×** to remove |
| Branch colour | Colour picker on first-level branches |
| Delete | **Delete** (asks for confirmation when there are ideas below) |

**Autosave** is on (status next to the name: *Saved / Saving… / Save error*). The menu in the top-left
corner switches, creates or deletes presentations.

---

## Using the skill

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
5. It gets the URL (`http://127.0.0.1:4173/?p=login-flow`), the generated file and a report (nodes, media,
   skipped items).

Example requests: *"map this repository's architecture"*, *"map the payment flows using the diagrams in
`docs/`"*, *"turn this specification into a map for tomorrow's meeting"*.

### Agent compatibility

| Agent | How the skill is found | Status |
| --- | --- | --- |
| **Claude (Claude Code)** | `skills/context-maps/SKILL.md` (copy to `~/.claude/skills/` for global use) | Native format |
| **Codex** | `AGENTS.md` at the root points to `SKILL.md` | Prepared; not tested |
| **Cursor** | `.cursor/rules/context-maps.mdc` and `AGENTS.md` | Prepared; not tested |

The heavy lifting lives in a Node CLI (`rm.mjs`), so any agent with terminal access can use it.

> Agent-facing instructions (`SKILL.md`, `schema.md`, `AGENTS.md`) are in English, with Portuguese copies
> (`SKILL.pt-BR.md`, `schema.pt-BR.md`). CLI messages follow `RM_LANG=en|pt` (default: system locale).

---

## Data format

```json
{
  "id": "my-flow",
  "tree": {
    "id": "root",
    "title": "Presentation title",
    "children": [
      {
        "id": "n-1a2b3c4d",
        "title": "Idea",
        "color": "#c76a61",
        "images": [
          {"src": "presentations/my-flow/assets/screen.png", "alt": "Home screen"},
          {"src": "presentations/my-flow/assets/d.svg", "alt": "Diagram", "kind": "diagram", "source": "flowchart TD…"}
        ],
        "links": [{"url": "https://example.com/docs", "label": "Docs"}],
        "children": []
      }
    ]
  }
}
```

Full reference and modelling best practices: [`skills/context-maps/schema.md`](skills/context-maps/schema.md).

## Server API

Listens on `127.0.0.1` only. Every route answers JSON with `Cache-Control: no-store`.

| Method and route | Purpose |
| --- | --- |
| `GET /api/presentations` | List (`id`, `title`, `updatedAt`) |
| `POST /api/presentations` | Create (`{title, id?}`) |
| `GET /api/presentations/:id` | Read |
| `PUT /api/presentations/:id` | Save the tree (validates unique ids, depth ≤ 40, ≤ 50 media/links per node) |
| `DELETE /api/presentations/:id` | Remove the file and its images |
| `POST /api/presentations/:id/assets?name=…` | Upload an image (png, jpg, webp, gif, svg; up to 15 MB) |

Basic safety: no access to files outside the app folder / `presentations/`, only http/https links, and
Mermaid runs with `securityLevel: strict`.

---

## Tests

`npm test` runs the model tests (Node). The rest use Playwright and an installed Chrome:

```bash
export PLAYWRIGHT_MODULE=file:///path/to/playwright-core/index.mjs   # absolute path
node tests/edit.mjs      # EDIT-01..13  editing, diagrams, media, links (starts a temp server)
node tests/skill.mjs     # SKILL-01..06 skill CLI (starts a temp server)
node tests/browser.mjs   # MAP-01..08   navigation, zoom, text mode, mobile
node tests/cards.mjs     # CARD-01..06  titles, root, keyboard, images
node tests/motion.mjs    # MOT-01..05   animations and reduced motion
```

`browser`, `cards` and `motion` expect a running server (`PREVIEW_URL`, default `http://127.0.0.1:4173`)
**with the demo data**: run them against a server with an empty or temporary `PRESENTATIONS_DIR` so they
do not depend on your own presentations. `BROWSER_EXECUTABLE` selects Chrome/Chromium.

---

## Known limitations

- **No cross-links** between ideas (the structure is a tree). Cycles become text or a diagram.
- **Reordering** ideas or media by dragging does not exist yet.
- **CLI diagrams** need `mmdc` (mermaid-cli); in the app editor Mermaid is already bundled.
- Remote image URLs are **not downloaded** by the skill (use local files).
- Mobile: one-finger pan and zoom buttons; pinch is not implemented.
- Removing a media item does not delete its file from `assets/`.
- Designed for a **local machine, single user**: there is no authentication or simultaneous editing.

## Third-party

`vendor/mermaid.min.js` — [Mermaid](https://github.com/mermaid-js/mermaid) 12.2.0, MIT licence
(`vendor/mermaid.LICENSE`). Loaded on demand by the diagram editor only.

## Origin

The viewer's behaviour was inspired by observing a public mind-map viewer. The content, illustrations,
code and texts in this repository are original; nothing from the reference was copied.
