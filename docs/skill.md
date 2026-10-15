# `context-maps` skill guide

[Português (BR)](skill.pt-BR.md) · **English**

This guide explains **what the skill does, why it exists, how to install it and how to get the most out
of it**. The operating procedure the agent follows is in
[`skills/context-maps/SKILL.md`](../skills/context-maps/SKILL.md); the data format and modelling best
practices are in [`skills/context-maps/schema.md`](../skills/context-maps/schema.md) (Portuguese copies:
`SKILL.pt-BR.md` and `schema.pt-BR.md`).

## 1. Purpose

> Turn the context of an application (code, specs, flows, decisions) into a navigable, editable mind-map
> presentation, without building anything by hand.

The skill solves a recurring problem: documenting or presenting a system means gathering text, diagrams
and evidence. Instead of writing slides you ask the agent, which:

1. **reads** the project material;
2. **structures** the knowledge as a tree (flow, architecture or both);
3. **attaches** images, Mermaid diagrams and links;
4. **publishes** to the local app's API and returns the URL.

The resulting map is a JSON file in the repository: reviewable in a PR, adjustable in **Edit** mode and
regenerable when the system changes.

## 2. When to use it (and when not to)

| Use it when… | Avoid it when… |
| --- | --- |
| You need to explain a system/process to other people | The goal is long-form written documentation (use docs) |
| You want a navigable overview, from macro to detail | You need complex cross-relations (graphs) |
| You have diagrams and screenshots scattered around and want them together | The content is confidential and the agent runs in the cloud without a data policy |
| You want a starting point to edit by hand | You need simultaneous editing by several people |

## 3. How it works

```
user request
      │
      ▼
 1 serve  ──────────  make sure the server is on 127.0.0.1:4173
 2 gather context ──  code, README, specs, existing diagrams
 3 model ───────────  choose flow / architecture / both
 4 outline (.md) ───  tree + markers [img] [mermaid] [link] {color}
 5 validate ────────  warnings: long titles, depth, wide nodes
 6 create ──────────  POST/PUT to the API, upload media, render mermaid
 7 deliver ─────────  URL, file, node count, skipped items
```

### Why a markdown *outline* and not JSON directly?
Indented lists are the most natural and least error-prone format for a language model: no ids to invent,
no commas to forget, no braces to balance. The CLI converts the outline into JSON, generates unique ids,
validates and sends it.

### Why go through the server API?
The API is the single point that validates structure, protects against invalid paths and writes
atomically. Writing the file directly would bypass those rules and duplicate logic. If the server is down,
the skill starts it (`serve`) or reports the manual command — it never writes to `presentations/` on its own.

## 4. Installation

### Claude (Claude Code)
The skill already lives in the repository at `skills/context-maps/`. To use it in **any** project, copy
the folder to the user skills directory:

```bash
# macOS / Linux
cp -r skills/context-maps ~/.claude/skills/context-maps
# Windows (PowerShell)
Copy-Item -Recurse skills\context-maps $env:USERPROFILE\.claude\skills\context-maps
```

When the skill is used **outside** the app repository:

- call the CLI by the absolute path of `rm.mjs`;
- start the server manually (`node /path/context-maps/server.mjs`) or set `RM_URL` to a server that is
  already running — the `serve` command only finds `server.mjs` when the skill sits inside the app folder.

### Codex and Cursor
The repository ships `AGENTS.md` (Codex; also recognised by Cursor) and
`.cursor/rules/context-maps.mdc`. Both point to the same `SKILL.md`, the single source of instructions.
They are **prepared but were not tested** on those tools.

## 5. Requirements and configuration

| Item | Required | Detail |
| --- | --- | --- |
| Node 18+ | Yes | Uses native `fetch`; no packages |
| App server | Yes | `node server.mjs` (default `http://127.0.0.1:4173`) |
| `mmdc` (mermaid-cli) | Only for `[mermaid:…]` via CLI | `npm i -g @mermaid-js/mermaid-cli` |

| Variable | Purpose |
| --- | --- |
| `RM_URL` | Server address (default `http://127.0.0.1:4173`) |
| `RM_LANG` | CLI message language: `en` or `pt` (default: system locale) |
| `MMDC` | Path to the `mmdc` executable if it is not on PATH |
| `MMDC_BROWSER` | An already-installed Chrome/Chromium, to avoid downloading Puppeteer's |

> Tip: install mermaid-cli with `PUPPETEER_SKIP_DOWNLOAD=1` and point `MMDC_BROWSER` at the Chrome you
> already have.

## 6. CLI reference (`rm.mjs`)

```bash
node skills/context-maps/scripts/rm.mjs <command> [options]
```

| Command | Options | Result |
| --- | --- | --- |
| `serve` | — | Starts the server if it is not running |
| `status` | — | JSON with the existing presentations |
| `validate` | `--outline f.md` | Stats and warnings; **exits with code 3** if there are warnings |
| `create` | `--outline f.md` `[--id slug]` `[--title "…"]` `[--replace]` | Creates/overwrites, uploads media, prints a JSON report |
| `upload` | `<id> <file>` | Uploads an image and prints its `src` |

Exit codes: `0` ok · `1` error · `2` server unavailable · `3` validation warnings · `64` wrong usage.

Sample `create` report:

```json
{
  "id": "login-flow",
  "url": "http://127.0.0.1:4173/?p=login-flow",
  "file": "presentations/login-flow.json",
  "nodes": 12, "depth": 3,
  "images": 2, "diagrams": 1, "links": 3,
  "warnings": [],
  "skipped": []
}
```

## 7. Outline format

```markdown
# Presentation title [img:docs/cover.png|Cover]
- Step 1 {color=#c76a61}
  - Action or decision [link:https://example.com/rule|Business rule]
  - Detailed flow [mermaid:docs/login.mmd]
- Step 2
  - Login screen [img:docs/screen.png|Screenshot] [img:docs/error.png|Error state]
```

| Element | Rule |
| --- | --- |
| `# Title` | First line; becomes the root and the presentation name |
| `- item` | One idea; **indentation** (2 spaces or a tab) defines the hierarchy |
| `{color=#rrggbb}` | Branch colour; only effective at the first level |
| `[img:path\|alt]` | Local image (png, jpg, webp, gif, svg); `alt` optional |
| `[mermaid:file.mmd]` | Diagram; rendered with a dark theme and transparent background |
| `[link:https://…\|label]` | http/https link; label optional (default: the domain) |
| Several markers | Repeat freely; they appear in the order written |
| Paths | Relative to the outline file; remote image URLs are **not** downloaded |

## 8. Modelling a good map

**Flow / journey** — read left to right:
- root = the flow; branches = steps **in order** (prefix numbers if order matters);
- children = actions, decisions ("If token expired → …") and failures.

**Architecture**:
- root = the system; branches = layers or modules;
- children = responsibilities, interfaces and critical dependencies;
- attach `flowchart`, `sequenceDiagram` or `erDiagram` for topologies and sequences.

**Both** — root = the system, with an "Architecture" branch and a "Flows" branch.

Quality (`validate` warns when you go past the limits):

- short titles, noun phrases, up to ~90 characters;
- 3 to 7 children per node (more than 8 → group them);
- depth up to 5 levels (beyond that, split into another presentation);
- do not repeat the same idea in different branches;
- do not invent: where the context does not answer, write **"To be defined"**.

## 9. Full example

Request: *"build a map of the Context Maps system overview, with diagrams and links for the technologies."*

1. The agent reads `README.md`, `server.mjs`, `app.js` and `tests/`.
2. It writes `system.md`:

   ```markdown
   # Context Maps — system overview
   - Architecture {color=#6fa3d6}
     - System diagrams [mermaid:architecture.mmd] [mermaid:edit-flow.mmd] [link:https://mermaid.js.org/|Mermaid]
     - Browser app (HTML, CSS and ES modules, no dependencies)
     - Local server (server.mjs, plain Node) [link:https://nodejs.org/api/http.html]
   - Flows {color=#d4a458}
     - Edit a presentation
       - Autosave sends the whole tree to the API
   ```
3. `validate` → no warnings; `create --id system-overview` → URL + report.

A real example generated this way ships in `presentations/` ("visão do sistema").

## 10. Safety rules and agent etiquette

- **Do not overwrite** presentations unless the user asks (`--replace`); the CLI refuses if the `id` exists.
- **Never delete** presentations through the skill.
- **Do not copy** protected content; summarise in your own words.
- **Transparency:** report `warnings` and `skipped`.
- The server listens on `127.0.0.1` only and the CLI sends no data off the machine.

## 11. Troubleshooting

| Symptom | Likely cause | What to do |
| --- | --- | --- |
| `Server unavailable` / `Servidor indisponível` (code 2) | Server stopped or different port | `rm.mjs serve` or `node server.mjs`; adjust `RM_URL` |
| `Presentation "x" already exists` / `Já existe a apresentação "x"` | Repeated `--id` | Pick another `--id` or, if the user asked, `--replace` |
| Diagram in `skipped` ("mmdc not found") | mermaid-cli missing | Install it or set `MMDC`/`MMDC_BROWSER` |
| Diagram in `skipped` ("failed to render diagram") | Mermaid syntax error | Fix the `.mmd` (try it in the app editor) |
| Image in `skipped` | Wrong path or remote URL | Use a local path relative to the outline |
| "title has N characters" warning | Long text | Shorten it; use children for detail |
| Blank page after updating | Browser cached old modules | Hard-reload with `Ctrl+Shift+R` |

> Messages follow `RM_LANG`; the table shows both languages where they differ.

## 12. Limitations

- **Tree** structure; no cross-links between ideas.
- No drag reordering; to change order, edit the outline and use `--replace`.
- Remote-URL media is not downloaded.
- CLI Mermaid rendering depends on the external `mmdc` (the app editor already bundles it).
- Outside Claude, Codex and Cursor were prepared but **not tested**.
