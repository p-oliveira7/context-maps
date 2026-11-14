# Format and best practices

> Português: [`schema.pt-BR.md`](schema.pt-BR.md).

## Presentation JSON (`presentations/<id>.json`)
```json
{
  "id": "my-flow",
  "title": "Presentation name",
  "roots": [{
    "id": "root",
    "title": "Title",
    "x": 0, "y": 0,
    "children": [
      {
        "id": "n-1a2b3c4d",
        "title": "Idea",
        "color": "#c76a61",
        "images": [
          {"src": "presentations/my-flow/assets/photo.png", "alt": "Description"},
          {"src": "presentations/my-flow/assets/d.svg", "alt": "Diagram", "kind": "diagram", "source": "flowchart TD…"}
        ],
        "links": [{"url": "https://example.com/docs", "label": "Docs"}],
        "children": []
      }
    ]
  }]
}
```
- `title` may be an empty string when the node has `images` or a `subtitle` (the card shows only that content); the root always needs a title.
- `title` (top level) is the presentation name; each entry of `roots` is an independent starting card (an old file with a single `tree` is still read). `x`,`y` (roots only, optional) place a root freely; roots without them are stacked automatically.
- `id` of each node: a unique string (the skill generates `n-<hex>`; the root is `root`).
- `color`: optional, only on direct children of the root (the others inherit).
- `linksColor`: optional colour of the lines that leave this node towards its children (any node with children, including the root); it does not affect the node, its children or the line that arrives at it.
- `related`: optional array of node ids (same presentation) linked to this node as cross-links; the relation works in both directions and ids of deleted nodes are dropped on save. In outlines use `[rel:Title]`.
- `apis`: optional array of API references attached to the card, `{collection, path, name, snapshot?}` (`collection` = folder name in `collections/`, `path` = folder inside it, empty for the whole collection). Created by the app (Attach to card); the skill does not write it.
- `images`: optional list (images and/or diagrams, in display order). The legacy single `image` field is still read and migrated on save.
- `subtitle`: optional supporting text (up to 2000 characters), shown only while hovering the card.
- `links`: optional list of `{url, label?}` (http/https only), shown as an "N link(s)" badge below the card.
- `kind: "diagram"` and `source` (mermaid) are optional; diagrams are shown uncropped on the card.
- `kind: "drawing"`: an Excalidraw drawing (`scene: {elements, files}`; `src` is its SVG thumbnail; `source` keeps the `.flow` text when it came from the skill). Opens beside the card, editable, with path highlighting. Create it with `[flow:file.flow]` (below), not by hand.
- `kind: "session"`: a Claude Code session (`src` is an SVG thumbnail that carries the compact transcript inside; `anchor` is the item the card opens on). Create it with `[session:file.jsonl|text]` (below) or in the app.
- Prefer creating through the outline (`rm.mjs create`); the server validates the structure (unique ids, depth ≤ 40).

## How to structure
**Flow** — read left to right:
- First-level branches = steps in order (prefix a number if order matters: "1. Authenticate").
- Children = what happens, decisions ("If token expired → …") and failures.
- Cycles ("back to step 2") become text on the node or an attached mermaid diagram.

**Architecture**:
- Branches = layers or modules (API, Domain, Data, Integrations).
- Children = responsibility, inputs/outputs, critical dependencies.
- For request/decision flows that end in outcomes (status codes, errors), attach a `[flow:…]` flowchart (clickable path highlighting); for topologies or sequences, mermaid (`sequenceDiagram`, `erDiagram`).

## Quality
- Short, informative titles (noun phrases). At most ~90 characters.
- 3 to 7 children per node; more than 8 → group them.
- Depth up to 5 levels; beyond that → split into another presentation.
- Do not repeat the same idea in different branches; link by reference in the text.
- Do not invent: where the context does not answer, write "To be defined".

## Flowcharts (`.flow`)
`[flow:file.flow]` turns a small text file into an **editable drawing** (Excalidraw) on the card: boxes and arrows laid out automatically, a thumbnail on the card, and in the app the user can open it beside the card, zoom, move around, edit it freely and **click a final box (e.g. a `412`) to light up every path that leads to it**. Prefer it over mermaid for API/request flows, decisions and error outcomes. No extra tools needed.
```text
# Create order                       (optional title of the drawing)
direction: right                     (or down; default right)
client: Client app                   (id: label)
auth: Valid token? [diamond]         (shape: box (default), diamond, ellipse)
e412: 412 Precondition\nFailed [ellipse] {color=#f08c00} {end} {highlight=#ffa94d}
ok: 201 Created [ellipse] {color=#2f9e44} {end} {highlight=#69db7c}
client -> auth: POST /orders         (arrow with an optional label)
auth -> e412: no
auth -> ok: yes
// comment
```
- `\n` breaks the line inside a label; `{color=#hex}` tints the box.
- **Path highlighting:** `{end}` marks a box as a clickable end — once any box is marked, only marked boxes light up their path (otherwise every box does); `{highlight=#hex}` is the highlight colour for the path to that end (e.g. green for success, orange for errors).
- Highlight settings of the whole drawing (optional lines): `highlight: off` turns it off, `speed: instant|fast|normal` (default normal), `highlight-color: #hex` (default yellow). The user can change all of this in the app (◎ Highlight; in ✎ Edit, select a box to mark it as an end).
- Ids: letters, digits, `_ . -`. An arrow to an undeclared id creates a box labelled with the id.
- One flow per file; keep it to ~3–15 boxes. Decisions as `[diamond]` with `yes`/`no` labels on the arrows; outcomes (status codes, errors) as `[ellipse]` ends, coloured (green success, red/orange errors) and marked `{end}`.
- Loops ("try again") are fine: the arrow goes back and the layout ignores it.
- `validate` reports flow warnings (unknown lines, shapes); `create`/`update` store it as `images[]` with `kind: "drawing"`, the Excalidraw `scene` and the text in `source` (`update` only adds it when the text changed).

## Claude sessions (`.jsonl`)
`[session:file.jsonl|text of the opening point]` puts a **Claude Code session** on the card — useful to present how a skill is used. The card shows a static thumbnail of the conversation at the opening point; clicking it opens the whole session beside the card, already scrolled there, and the user can move up and down through everything: messages, tool calls (collapsed; click to see input and result), skill calls (highlighted), task lists and the **questions Claude asked the user** (AskUserQuestion) with the options and the chosen answers.
- Sessions live in `~/.claude/projects/<project>/<session-id>.jsonl` (one folder per working directory). Copy the file next to the outline or reference it by path.
- The text after `|` is optional: the card opens on the first user message containing it (any item if no user message matches); without it, on the first message. An unknown text is reported in `skipped` and the card opens on the first message.
- The transcript is stored compact inside the thumbnail SVG (`images[]` with `kind: "session"`, `anchor` = index of the opening item, `source` = `file|text`): long tool inputs/results are cut (start and end kept), app-internal records are dropped, and anything that looks like a secret (tokens, keys, passwords) is replaced by `•••`. Still, **read the session before publishing it** — it may contain paths, code and data the audience should not see; when in doubt, ask the user which part to show and use the app (**Session** in the card menu), which lets them keep only an excerpt.
- Several cards can point at different moments of the same session: repeat the marker with another text.

## Mermaid
Requires `mmdc` (`npm i -g @mermaid-js/mermaid-cli`) on PATH or `MMDC=path`; use `MMDC_BROWSER=path/to/chrome` to reuse an installed Chrome (install with `PUPPETEER_SKIP_DOWNLOAD=1`). The diagram is rendered to SVG
with a dark theme and transparent background and uploaded as the node's image; the source stays in `images[].source`.
Without `mmdc`, the node is created without an image and the item appears in `skipped` in the report.
