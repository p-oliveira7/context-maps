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
| `PRESENTATIONS_DIR` | `./presentations` | Main library folder |
| `CONTEXT_MAPS_CONFIG` | `./.context-maps.json` | Where the extra folders are remembered |

> Without the server (for example `python -m http.server`) the app opens in **view mode only**, with the
> built-in demo map. Do not open `index.html` through `file://` (it uses ES modules).

---

## Example presentation

`presentations/cidades-para-pessoas.json` ships with the repository and shows **every feature** in one place: a city map, a **"Guia de recursos"** root with one branch per feature (hover subtitles, single/multiple images, Mermaid diagrams, image + diagram together, one or several links, title-less cards, line colours for direct children or a whole branch) and a third, independent **root card** with a free position. Open it, expand everything and try *Edit* mode.

## Using the app

### View mode
- **Drag** the background (or hold the **middle mouse button** anywhere, even over cards) to pan; **scroll** to zoom; the − / + and ⌗ (fit) buttons sit in the corner.
- **Click a title** (or Enter/Space) to expand or collapse a branch; the fan-style button beside the card works too.
  Opening a branch animates the cards for 420 ms and highlights the connection to the first child for 1 s
  (honours `prefers-reduced-motion`).
- **Several root cards** never overlap: when an open tree would cover another, the one that was **below (or to the right)** moves aside (with the usual opening animation), so the original order is kept, and it returns to its saved position when collapsed.
- **Hovering** a card highlights the line that leads to it, and the card **grows slightly** (its image zooms too); disabled in edit mode and with reduced motion.
- **Expand all / Collapse all**, **Full screen** (the browser's full-screen mode; the map keeps working exactly the same) and **Text mode** (linear reading of the whole map) live in the bottom bar.
- **Images and diagrams** open full screen; with several items there are ‹ › arrows (or ← →) and a counter.
- **Subtitles** (supporting text) appear in a small panel under the card **only while hovering it**.
- **Links** show as a "🔗 N link(s)" badge below the card: one link opens directly, several open a list.

### Edit mode
Turn on the **Edit** switch in the bottom bar.

| Action | How |
| --- | --- |
| Edit text | Click the text; Enter confirms |
| Root cards | **Root card** (bottom bar, edit mode) adds another starting point anywhere on the map; a presentation can have several. Drag a root by its **⋮⋮** handle to place it freely, or onto another card to connect it as a child. Dropping any card on **empty space** turns it (with everything below) into a new root (**Make root** in the wheel does the same); **Delete** works on roots while at least one remains |
| Presentation name | **Double-click** the name in the top-left menu to rename it (separate from the text of the root cards). Names are unique: a name already in use is refused with a message (and *new/copy* add " (2)", " (3)"…) |
| Edit menu | Hover a card and click the **✎ button** at its top-centre: a **wheel of actions** opens around it (it closes with **Esc**, ×, or by clicking outside) |
| Add an idea | **+ Child**, **+ Sibling** (after), **+ Before** (sibling before) or **+ Parent** (wraps the idea in a new parent card); unlimited depth |
| Images | **+ Image** (accepts several files) or **drag image files onto a card**; each file is **copied** into `presentations/<id>/assets/` and the original is left untouched; **×** removes one |
| Diagrams | **+ Diagram** opens the Mermaid editor with live preview; **Edit** reopens it |
| Title-less cards | Clear the title of a card that has an image/diagram or a subtitle: it then shows only that content (a subtitle-only card shows the subtitle permanently) |
| Subtitle | Type in the "Subtitle" field under the title (clear it to remove); shown on hover in view mode |
| Links | **+ Link** (http/https); chips with **×** to remove |
| Line colour | **Colour lines** in the wheel (any idea with children, including the root): pick a colour (palette, custom or default), then choose **Only direct children** (the lines leaving that card) or **The whole branch below** (that card and every card under it). The card itself, its children and the line arriving at it never change |
| Move | Drag the **⋮⋮ handle** on the left of a card. The card and **everything below it** leave the map and follow the cursor as a small tree. Drop on another card (becomes its child; a leaf pulses and a dashed line shows the connection) or on its top/bottom edge (becomes a sibling). Hovering a **collapsed branch opens it by itself**, so you can walk through its sub-branches (it closes again when you leave). Hold the **middle mouse button** to pan the map while dragging, wheel to zoom, **Esc** to cancel; an **Undo** toast follows every move |
| Delete | **Delete** (asks for confirmation when there are ideas below) |

**Save as…** and **Save a copy…** (in the presentation menu, or **Ctrl+Shift+S**) open a window where you choose the **name**, the **folder** and what happens next:

- **Folder:** the app library (`presentations/`), any folder you registered before, or **Other folder…** — type a full path or press **Choose…** (a native folder window opens on your machine). The folder is created if needed, remembered in `.context-maps.json` (not versioned) and listed in the menu under its own heading, so you can **open and edit presentations in place**, e.g. inside another project's repository. **Add folder…** in the menu registers a folder that already has presentations; the **×** beside a folder only removes it from the list (no file is deleted).
- **After saving:** *Open the new presentation* (default for *Save as*) or *Keep working on this one* (default for *Save a copy*). The file and its images are copied together; names stay unique (a repeated name gets " (2)").
- In extra folders, image paths are stored **relative to the file** (`<name>/assets/…`), so the whole folder is portable.

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

## Server API

Listens on `127.0.0.1` only. Every route answers JSON with `Cache-Control: no-store`.

| Method and route | Purpose |
| --- | --- |
| `GET /api/presentations` | List (`id`, `title`, `updatedAt`) |
| `POST /api/presentations` | Create (`{title, id?, dir?}`; `dir` = any absolute folder) |
| `GET /api/presentations/:id` | Read |
| `PUT /api/presentations/:id` | Save `{title, roots}` (the old `{tree}` is still accepted; validates validates unique ids, depth ≤ 40, ≤ 50 media/links per node) |
| `POST /api/presentations/:id/copy` | Copy a presentation under a new name (`{title, dir?}`), including its images, into the library or another folder |
| `GET/POST /api/libraries`, `DELETE /api/libraries/:key` | List, add or forget extra folders |
| `POST /api/pick-folder` | Opens the system folder picker and returns the chosen path |
| `DELETE /api/presentations/:id` | Remove the file and its images |
| `POST /api/presentations/:id/assets?name=…` | Upload an image (png, jpg, webp, gif, svg; up to 15 MB) |

Basic safety: every request that changes something must carry the `x-context-maps: 1` header (other web pages cannot send it to your local server), the `Host` must be local, no access to files outside the app folder / `presentations/`, only http/https links, and
Mermaid runs with `securityLevel: strict`.

---

## Tests

`npm test` runs the model tests (Node). The rest use Playwright and an installed Chrome:

```bash
export PLAYWRIGHT_MODULE=file:///path/to/playwright-core/index.mjs   # absolute path
node tests/edit.mjs      # EDIT-01..19  editing, diagrams, media, links (starts a temp server)
node tests/skill.mjs     # SKILL-01..06 skill CLI (starts a temp server)
node tests/browser.mjs   # MAP-01..11   navigation, zoom, text mode, mobile, full screen
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
