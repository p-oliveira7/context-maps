# Cards validation

**Verdict: PASS** for independent automated and source verification. Desktop/mobile visual inspection belongs to the main agent and is not claimed here.

- Date: 2026-10-14.
- Verifier: independent verifier, not implementation author.
- Spec: `.specs/features/cards/spec.md`.
- Commit range: `v0.1.0..daa380aa867753f836aa6b04b65e2a83a28d2c52`, base `5b9d2ad119f301352e4cedcc80c62f6cc29d26d1`.
- Latest implementation commit: `daa380a feat(cards): toggle titles and support images on every node`.
- Tasks: one atomic implementation delivery; formal tasks intentionally omitted by spec. No code or test edits, commits, or pushes performed by verifier.

## Spec-anchored evidence

| Requirement | Expected outcome and exact assertion evidence | Result |
| --- | --- | --- |
| CARD-01 | `tests/cards.mjs:11` asserts eight nodes after mobility opens; `tests/cards.mjs:12` asserts exact IDs equal prior set plus nature-1/2/3; `tests/cards.mjs:13` asserts exact prior set on close. Leaf edge: `tests/cards.mjs:21` asserts mobility-1 title-button count equals zero. `app.js:29` and `app.js:33` restrict interactive titles to nodes with children. | PASS |
| CARD-02 | `tests/cards.mjs:14` asserts IDs equal ['root']; `tests/cards.mjs:15` asserts the same after reading-mode round trip; `tests/cards.mjs:16` asserts restored IDs equal the previously visible eight. `tests/cards.mjs:36` asserts page errors equal []. | PASS |
| CARD-03 | `tests/cards.mjs:16` presses Enter and asserts restored eight IDs; `tests/cards.mjs:17` asserts title is document.activeElement. `tests/cards.mjs:18` presses Space and asserts five visible nodes; `tests/cards.mjs:19` asserts focus on recreated title. Native buttons share the handler at `app.js:31`; focus restoration is at `app.js:30`. | PASS |
| CARD-04 | `tests/cards.mjs:23` asserts media examples exist at root, branch, and leaf. For every node, `tests/cards.mjs:26` asserts exact image count; `tests/cards.mjs:28` asserts src and alt equal the node's image fields; `tests/cards.mjs:29` asserts complete and naturalWidth > 0. Reading: `tests/cards.mjs:34` asserts media count and `tests/cards.mjs:35` deep-compares all src/alt pairs with media.map(n=>n.image). Data-field equality matches the spec's optional image contract rather than a fixed asset requirement. | PASS |
| CARD-05 | For each map image, `tests/cards.mjs:31` asserts dialog visible, exact clicked-node src/alt, and unchanged visible IDs. `tests/cards.mjs:32` asserts Escape closes dialog and restores focus to the same image button. Scope is card/map enlargement, consistent with README.md:11; reading images are displayed per CARD-04. | PASS |
| CARD-06 | `tests/cards.mjs:26` asserts zero map images for every node without image metadata. `tests/cards.mjs:34` and `tests/cards.mjs:35` establish the exact reading image list, excluding placeholders. Text remains rendered by `app.js:31`, `app.js:33`, and `app.js:52`; legacy heading equality is asserted at `tests/browser.mjs:33`. | PASS |

All six acceptance criteria and both listed edge cases have matching evidence. No blocking spec-precision gap found. Existing coverage.md citations are offset by one line; the exact citations above supersede them without editing that file.

## Gates and integrity

Environment: Node v24.20.0, Chrome headless, `PLAYWRIGHT_MODULE=file:///C:/Users/paulo/AppData/Roaming/npm/node_modules/rea-agents/node_modules/playwright-core/index.mjs`. Base preview: `http://127.0.0.1:4173`.

| Command | Observed result |
| --- | --- |
| `npm test` | 4 tests passed, 0 failed, 0 skipped |
| `node tests/browser.mjs` | Exit 0; PASS MAP-01..08 browser scenarios, desktop + mobile |
| `node tests/cards.mjs` | Exit 0; PASS CARD-01..06 |

Before: four model tests plus one browser scenario script. After: same four model tests and browser script, plus one cards scenario script covering six requirements. Git diff confirms no changes to tests/model.test.js or tests/browser.mjs; no removed, skipped, or weakened prior assertions. Browser scripts are scenario runners, not separately counted unit tests.

## Discrimination sensor

Depth: bounded lightweight sensor, exactly two behavior mutations, separately applied to tracked-file copies under `C:/Users/paulo/Documents/Codex/2026-10-14/visual-response-maps-rebuild/cards-verifier-scratch`. Scratch served on 127.0.0.1:4174; unchanged scratch tests ran with PREVIEW_URL targeting that server.

| Mutation | Evidence | Result |
| --- | --- | --- |
| At app.js:31, ignore title click when node.id is root | cards runner exit 1 at `tests/cards.mjs:14:37`; actual eight IDs versus expected ['root'] | KILLED |
| Restore first mutation; at app.js:10 use tree.image.src instead of node.image.src for dialog | cards runner exit 1 at `tests/cards.mjs:31:70`; actual city.svg versus expected park.svg | KILLED |

Sensor: 2 injected, 2 killed, 0 survived. Real-tree porcelain was empty before and after sensor; `git diff --exit-code` passed and HEAD remained the reviewed commit. Scratch server stopped. Automatic approval review rejected the one recursive cleanup command as "blocked by policy". No deletion retry was made, per user instruction; disposable scratch copies remain at the path above. Real source and tests were never mutated.

## Quality and limitations

Changed implementation files were reviewed against the skill's coding-principles.md. Shared image creation and existing render patterns fit the request; layout guards accommodate collapsed root; optional image metadata and the park illustration supply examples at all three levels. No unrelated refactor, additional dependency, persistence, upload, or publication was introduced. New assertions map to CARD-01..06 or their edge cases, and legacy gates cover pan/zoom and initial desktop/mobile fit. No additional project-specific coding guidelines were found in the inspected project files; strong defaults applied.

Visual judgment remains with the main agent, as assigned. Automated desktop/mobile layout checks passed, but they do not substitute for that inspection. No failure lesson or fix task is warranted. Spec traceability and other artifacts were left unchanged because the verifier was authorized to write only this report.
