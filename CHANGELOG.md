# Changelog

All notable changes to Context Maps are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/) (while below 1.0.0, minor versions may include breaking changes).
How to cut a release: [`docs/releasing.md`](docs/releasing.md).

## [Unreleased]

### Added
- **A better response body in the API client**: JSON is shown as a collapsible tree with colours (click a key to copy its path, such as `res.body.items[0].id`, ready for asserts and variables); XML, HTML and SVG get syntax colours; **Ctrl+F** searches inside the body (counter, next/previous, collapsed branches open by themselves); a **path filter** (`items[0].id`, or `res.status`) shows just that value; and **Preview** renders images, SVG and HTML (HTML in an isolated frame with no scripts and no network). Big arrays load 200 items at a time and *Copy* still copies everything.
- **Request tabs in the API client**: every request you open gets a tab (method badge and name), so you can switch between requests without losing anything: each tab keeps its own response, its inner tab (Params, Headers, Body…) and what you typed, and a send that is still running finishes in the tab it started from. Close tabs with the ×, a middle click or Delete; Left/Right/Home/End move between tabs. The open tabs come back when you reopen the panel. The run report is a tab too.
- **Editor and response, your way**: show the response below the editor or beside it, drag the divider (or use the arrow keys on it) to resize, and focus on the response with one click. The layout and the divider position are remembered.
- **Quick open**: Ctrl+K inside the API panel opens a request by typing part of its name, URL, method or folder; Ctrl+S saves right away.

### Added
- **Run a folder (and its subfolders) with an interactive report**: every folder and the collection get **▶** (run this folder) and **▶▶** (run it with all subfolders) buttons. Requests run one after another in tree order and session variables (a token saved by a login request, for example) flow into the next ones. The report shows a progress bar with one segment per request, passed/failed/error counts, assertions and tests, total time, filters, search and, for each request, the sent URL, checks, body, headers and script console. You can stop the run, stop at the first failure, add a delay between requests, run only the failed ones or a single request again, open a request from the report, copy a summary and export a JSON report (no bodies or headers).
- **Import Bruno folders**: *Import Bruno folder…* (or dropping a folder on the API panel) reads a folder in the Bruno format. With a `bruno.json` it becomes a new collection, environments included; a plain folder of `.bru` files goes into the open collection (or becomes a new one). Dot-folders, `node_modules` and non-Bruno files are skipped. New endpoint `POST /api/collections/import-folder`.

### Fixed
- **Script time limit on slow machines**: the 5 s limit now starts when the script starts running, not when the sandbox is created, so a busy machine no longer reports a timeout for a trivial script. A script cannot extend its own deadline.
### Changed
- **Keyboard navigation glides the view to the focused card**: with the arrow keys (or Tab) the map now slides smoothly, keeping the zoom, so the card you are on stays centred. Mouse clicks, text editing, dragging and zooming do not recentre.
- **Clean full screen**: in the browser's full-screen mode the presentation name, the button bar and the zoom controls disappear and only show when the mouse gets close to the top (name and menu) or the bottom (buttons and zoom) of the screen, or while a control has keyboard focus, the presentation menu is open or a save error is showing.

## [0.4.0] - 2026-10-17

The API client release: a Postman/Bruno-style client in a split view, with collections in the Bruno format,
environments and secrets, sandboxed scripts and tests, coloured variables, and APIs attachable to cards.
The documentation now shows the English interface.

### Added
- **API client (Postman/Bruno style)** in a split view: the **API** button divides the screen (map on the left, client on the right, resizable). Collections are plain folders in the **Bruno format** (`collections/<name>/` with `bruno.json`, `.bru` requests, folders and `environments/*.bru`), so they can be versioned with Git and opened in Bruno. Create, rename, delete and drag-reorder folders and requests; edit method, URL (query and path params stay in sync), headers, JSON/text/XML/form bodies, bearer/basic auth, request variables and docs; use `{{variables}}` with environments (and `{{$timestamp}}`, `{{$guid}}`…), see the resolved request, and send it through the local server (no CORS), with status, time, size, headers and a formatted body. **Secret** environment values are stored only on the machine (`collections/.secrets/`, git-ignored) and never in the files, ZIP exports or the repository. Scripts, tests and assertions are preserved but not executed yet. Import and export collections as ZIP. A bundled example collection documents the app's own API.
- **Isolated script execution**: scripts run in a sandboxed iframe (opaque origin, CSP `default-src 'none'`) inside a Worker that is terminated after 5 s. They have no network, storage or access to the app, so imported collections cannot read your data or send it anywhere. Available globals: `bru`, `req`, `res`, `test`, `expect`, `console`, `require("chai")`. A "Scripts" switch next to Send turns script execution off.
- **Scripts, tests and assertions in the API client**: pre-request and post-response scripts, `tests` (with `test()` and a Chai-style `expect`), the declarative `assert` block (`res.status: eq 200`, 30 operators), post-response variables (`token: res.body.token`) and runtime variables (`bru.setVar`). A request can create a variable in its pre-request script and use it in the same request. New **Assert** tab, editable **Scripts** tab, response tabs **Tests** (with pass/fail summary) and **Console**.
- **`{{variables}}` are highlighted in the API client**: **red** when the variable has no value yet, **green** when it has one (blue for built-ins such as `{{$timestamp}}`), in the URL, header/param/form values, JSON/text/XML bodies and auth fields. Hover a variable (or press **Ctrl+.** with the cursor inside it) to see its value, where it comes from (session, request, environment, collection) and edit it; choose where to save a new value (environment, this request or this session only). Secret values are masked with a Show button. The colours follow the selected environment.
- **Attach APIs to cards**: drag a collection or folder from the API panel onto a card (edit mode) or use the card's wheel (**API** then ⤓). The card shows a tile, like an image, with the first requests; clicking it opens the client at that folder. A saved snapshot keeps the tile readable offline and in exported HTML; text mode lists the attached APIs.
- **Attach a single request** to a card (⤓ on a request row, or drag it onto the card), besides collections and folders.
- New endpoints: `/api/collections/…` (collections, items, requests, environments, ZIP import/export) and `POST /api/send` (http/https only, 30 s timeout, 10 MB response limit).
- **English example presentation** (`presentations/cities-for-people.json`, generated from the Portuguese one by `docs/build-example-en.mjs`, with its diagrams re-rendered in English) that also shows related ideas and an attached API.

### Changed
- **Documentation images and the demo GIF now use the English interface** and the English example. New screenshots: search, related ideas, coloured API variables, script tests and the export menu; the demo GIF also shows the API client. The banner is in English.
- **Opening the API client from a card no longer zooms the map out**: the zoom and the focus stay where they were (the clicked card moves only if the panel would cover it) and the map glides to its new width; opening it with the API button keeps the centre of the map. Resizing the panel also keeps the zoom.
- **The tree shows only what the card points to**: attaching a folder opens just that folder; attaching a request opens just its folder and selects the request; a whole collection opens its top-level folders. The target row flashes briefly.

## [0.3.0] - 2026-10-17

A release about working faster and sharing: undo/redo, search, copy and paste, related ideas, export and
import, `update` for the skill, keyboard and touch support, and CI on three operating systems.

### Added
- **Pinch to zoom** (and two-finger pan) on touch screens.
- **Keyboard navigation of the map**: Tab reaches every card (leaves included); in view mode the arrow keys walk the tree (→ opens or enters, ← collapses or goes to the parent, ↑ ↓ move between siblings). The action wheel takes focus when it opens and responds to the arrow keys, Home and End.
- **Screen reader support**: the map is exposed as a tree (`tree` / `treeitem` with level and expanded state), search results and navigation are announced through a live region, focus stays inside the Save as and diagram dialogs, and a test checks that every control has an accessible name. Larger touch targets on touch devices.
- **Related ideas (cross-links)**: the action wheel has **Relate**; click another idea to link the two (click again to remove). A dotted line joins related ideas when both are visible, a badge with the count lists them and jumps to each one even inside collapsed branches, and text mode lists them too. Stored as `related` (ids) on a node; references to deleted ideas are cleaned up. The skill outline accepts `[rel:Other idea title]`, in `create` and `update`.
- **Search**: a toolbar button, **Ctrl/Cmd+K** or **/** opens a search over titles and subtitles (accent- and case-insensitive); choosing a result opens the branches that hide it and centres the map on it.
- **Duplicate, Copy and Paste** in the action wheel: duplicate an idea with everything below it, or copy it and paste it as a child of another idea, including into another presentation (its images are copied too).
- **Agent integration checks** in `npm test`: `SKILL.md` front matter, `AGENTS.md` and the Cursor rule point to files that exist, and every CLI command is documented and implemented. The skill guides now include a 5-minute manual checklist to verify an agent (Codex, Cursor) end to end.
- **`update` command in the skill CLI** (`rm.mjs update --id <slug> --outline f.md [--prune] [--dry-run]`): merges an updated outline into an existing presentation, matching ideas by title and keeping ids, colours, positions and manual edits; adds new ideas, follows the outline order and is idempotent.
- **Undo and redo for every edit** (up to 100 steps per presentation): buttons in the toolbar and Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z or Ctrl/Cmd+Y. Typing in the same field counts as one step; inside a text field the shortcut keeps its native text undo. The "Undo" notice after moving a card now uses this history.
- **Export and import** from the presentation menu: **Export as HTML…** downloads one self-contained file (the viewer, the data and every image inlined) that opens offline in any browser, read-only; **Export as ZIP…** downloads the presentation files (`<name>.json` + `<name>/assets/`), the same portable layout used by extra folders. **Import…** reads either a ZIP package or an exported HTML file and opens the result as a new presentation (names stay unique; images missing from the package are dropped). API: `GET /api/presentations/:id/export?format=html|zip` and `POST /api/import?name=file.zip|file.html`.
- **Continuous integration** (GitHub Actions) running the model, browser and skill tests on Linux, macOS and Windows for every push to `main` and every pull request.
- `npm run test:e2e` runs all browser and skill tests in one go, using an isolated temporary server.

### Fixed
- Saving presentations and the folder list no longer fails on Windows when another process is reading the file at that moment (the atomic rename is retried).

### Changed
- Browser tests now use the installed Chrome by default (`channel: chrome`) instead of a Windows-only path; `BROWSER_EXECUTABLE` still overrides it.

## [0.2.0] - 2026-10-17

First release with editing, the agent skill and a localized interface. It covers everything merged
after 0.1.0 (pull requests #1–#10).

### Added
- **Edit mode** with autosave to local JSON files, served by a dependency-free Node server (`server.mjs`); presentations live in `presentations/<id>.json` with their images in `presentations/<id>/assets/`.
- **Action wheel** (✎) on every card: add child, sibling, before, parent; add images, diagrams and links; delete; make root; line colours.
- **Mermaid diagrams**: bundled editor with live preview; the rendered SVG is saved as a card image.
- **Several images, diagrams and links per card**, with a full-screen lightbox, drag-and-drop of image files and media reordering (↑ ↓ or drag).
- **Subtitles** shown inside the card on hover, and **title-less cards** (media only or secondary text only).
- **Line colours** for the lines leaving a card, applied to direct children or to the whole branch.
- **Move cards by dragging**: the card and its subtree follow the cursor; drop to become a child or sibling, or on empty space to become a new root; collapsed branches open while hovered; middle-mouse pan, Esc to cancel, undo.
- **Multiple root cards** with free positions, a presentation name separate from the root text, unique names, and overlap avoidance that keeps the original order of the roots.
- **Save as / Save a copy** dialog with name, folder and what to do next; presentations can be saved to **any folder of the machine** (registered in `.context-maps.json`) and edited in place.
- **Agent skill** (`skills/context-maps/`) and CLI `rm.mjs` (`serve`, `validate`, `create`, `upload`) that turns markdown outlines into presentations; compatible with Claude Code, plus prepared instructions for Codex (`AGENTS.md`) and Cursor (`.cursor/rules`).
- **Localized interface**: English and Portuguese (BR), chosen from the browser language, with `?lang=pt|en` to force one; server error messages and CLI messages (`RM_LANG`) follow the language too.
- Browser **full-screen** button, middle-mouse panning in every mode and a hover highlight with a frosted-glass look.
- A showcase example presentation covering every feature, a redesigned bilingual README with screenshots (reproducible with `docs/screenshots.mjs`), a detailed skill guide and the MIT license.

### Changed
- The project was renamed from "response maps" to **Context Maps**.
- The data format moved from `{id, tree}` to `{id, title, roots[]}`; the old format is still read and migrated on save.

### Security
- Requests that change data must carry the `x-context-maps` header and a local `Host`; file access is limited to the app folder and registered libraries; only http/https links are accepted; Mermaid runs with `securityLevel: strict`.

## [0.1.0] - 2026-10-14

### Added
- Interactive mind map: pan, zoom, fit, expand and collapse branches.
- Linear reading (text) mode of the whole map.
- Original sample map data and navigation state model.

[Unreleased]: https://github.com/p-oliveira7/context-maps/compare/v0.4.0...HEAD
[0.4.0]: https://github.com/p-oliveira7/context-maps/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/p-oliveira7/context-maps/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/p-oliveira7/context-maps/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/p-oliveira7/context-maps/releases/tag/v0.1.0
