# Changelog

All notable changes to Context Maps are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/) (while below 1.0.0, minor versions may include breaking changes).
How to cut a release: [`docs/releasing.md`](docs/releasing.md).

## [Unreleased]

### Added
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

[Unreleased]: https://github.com/p-oliveira7/context-maps/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/p-oliveira7/context-maps/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/p-oliveira7/context-maps/releases/tag/v0.1.0
