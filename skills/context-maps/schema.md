# Format and best practices

> Português: [`schema.pt-BR.md`](schema.pt-BR.md).

## Presentation JSON (`presentations/<id>.json`)
```json
{
  "id": "my-flow",
  "tree": {
    "id": "root",
    "title": "Title",
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
  }
}
```
- `title` may be an empty string when the node has `images` or a `subtitle` (the card shows only that content); the root always needs a title.
- `id` of each node: a unique string (the skill generates `n-<hex>`; the root is `root`).
- `color`: optional, only on direct children of the root (the others inherit).
- `linksColor`: optional colour of the lines that leave this node towards its children (any node with children, including the root); it does not affect the node, its children or the line that arrives at it.
- `images`: optional list (images and/or diagrams, in display order). The legacy single `image` field is still read and migrated on save.
- `subtitle`: optional supporting text (up to 2000 characters), shown only while hovering the card.
- `links`: optional list of `{url, label?}` (http/https only), shown as an "N link(s)" badge below the card.
- `kind: "diagram"` and `source` (mermaid) are optional; diagrams are shown uncropped on the card.
- Prefer creating through the outline (`rm.mjs create`); the server validates the structure (unique ids, depth ≤ 40).

## How to structure
**Flow** — read left to right:
- First-level branches = steps in order (prefix a number if order matters: "1. Authenticate").
- Children = what happens, decisions ("If token expired → …") and failures.
- Cycles ("back to step 2") become text on the node or an attached mermaid diagram.

**Architecture**:
- Branches = layers or modules (API, Domain, Data, Integrations).
- Children = responsibility, inputs/outputs, critical dependencies.
- For topologies or sequences, attach mermaid (`flowchart`, `sequenceDiagram`, `erDiagram`).

## Quality
- Short, informative titles (noun phrases). At most ~90 characters.
- 3 to 7 children per node; more than 8 → group them.
- Depth up to 5 levels; beyond that → split into another presentation.
- Do not repeat the same idea in different branches; link by reference in the text.
- Do not invent: where the context does not answer, write "To be defined".

## Mermaid
Requires `mmdc` (`npm i -g @mermaid-js/mermaid-cli`) on PATH or `MMDC=path`; use `MMDC_BROWSER=path/to/chrome` to reuse an installed Chrome (install with `PUPPETEER_SKIP_DOWNLOAD=1`). The diagram is rendered to SVG
with a dark theme and transparent background and uploaded as the node's image; the source stays in `images[].source`.
Without `mmdc`, the node is created without an image and the item appears in `skipped` in the report.
