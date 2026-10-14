# Preview validation

**Result**: PASS

**Verdict: PASS** for bounded automated re-verification. Both previously surviving mutants are killed. Human visual UAT remains unreported.

- Date: 2026-10-14. Verifier: independent re-verifier, not implementation author.
- Spec: `.specs/features/preview/spec.md`.
- Recheck diff range: `1863daa946ec2841392ff75c5a0c06d6f146b6c0..b96f4aad65b4744d5a9a221a1f88175bdb7e81ca`. Only 24 browser-test lines added; source unchanged. Original feature starts at `90044bb10dca7a05f004ffcd295422c21f44136c`.
- Scope: baseline gates, precise AC assertions, sibling IDs, disabled-wheel and wrong-title mutants. Prior upper-cap mutant was killed previously and not repeated.

## Gates

No tasks.md or build pipeline exists. Implicit implementation deliveries are committed; README.md:13 defines the gates.

- `npm test`: exit 0, four passed, zero failed/skipped.
- `node tests/browser.mjs`: exit 0, one sequential script; desktop interactions and fitting at both 1280x720 and 390x844.
- `validate_spec.py .specs/features/preview/spec.md`: exit 0, zero errors/warnings.
- Environment: `PLAYWRIGHT_MODULE=file:///C:/Users/paulo/AppData/Roaming/npm/node_modules/rea-agents/node_modules/playwright-core/index.mjs`; baseline `PREVIEW_URL=http://localhost:4173`.
- Counts: zero before original feature; four model tests plus one browser script before and after the fix. No removed/weakened assertions or skipped tests.

## Spec-anchored evidence

| AC | Expected outcome | File:line assertions | Result |
| --- | --- | --- | --- |
| MAP-01 | Root and four branches, five nodes | `tests/browser.mjs:15` count 5; `tests/browser.mjs:16` deepEqual(ids(),initialIds), exact root/mobility/nature/community/future defined at line 13; `tests/model.test.js:4` count 5. | PASS |
| MAP-02 | Expand 17, collapse 5 | `tests/browser.mjs:17` and `tests/browser.mjs:18` exact counts after buttons; `tests/model.test.js:6` and line 7 model counts. | PASS |
| MAP-03 | Toggle only selected three children | `tests/model.test.js:12` exact mobility children and line 13 excludes nature-1. `tests/browser.mjs:19` through line 22 toggle mobility 8/5/8. With mobility open, `tests/browser.mjs:26` deepEqual IDs to beforeIds plus selected branch's three children; line 27 deepEqual IDs to beforeIds after collapse, for nature/community/future. | PASS |
| MAP-04 | All 17 titles; preserve expansion/camera | `tests/browser.mjs:31` heading count 17; line 32 reading visible; `tests/browser.mjs:33` deepEqual full ordered heading texts to original fixed tree titles (`model.js:2`); line 34 map hidden; line 35 camera equality and count 8; line 36 exact visible-ID equality. | PASS |
| MAP-05 | Scale [.15,2.5], fixed anchor | `tests/model.test.js:18` scale 2 and anchor 200/100; line 19 exact bounds. `tests/browser.mjs:45` afterWheel.scale > beforeWheel.scale; lines 46/47 fixed world pointer within .01; lines 48/49 exact 2.5/.15 limits; lines 50/51 zoom buttons increase and return to .15 within .00001. | PASS |
| MAP-06 | Drag moves camera without image | `tests/browser.mjs:40` background drag; `tests/browser.mjs:41` camera inequality and dialog false. | PASS |
| MAP-07 | Escape closes image and restores focus | `tests/browser.mjs:37` dialog true; line 38 false after Escape; `tests/browser.mjs:39` image button equals activeElement. | PASS |
| MAP-08 | Initial nodes fit both viewport sizes | `tests/browser.mjs:53` and line 54 set 1280x720/390x844; line 55 reload; `tests/browser.mjs:58` all initial rectangles inside map with 1px tolerance; line 63 repeats after fit. | PASS |

8/8 ACs have spec-matched evidence; no blocking spec-precision gap identified. Title expectations use the fixed content dataset, not merely heading count. Sibling checks preserve mobility while each other branch opens/closes; exhaustive permutations and mobility toggling with an open sibling are not claimed.

## Discrimination sensor

Two independent scratch mutations, two killed, zero survived.

| Mutation | Source | Executed result | Outcome |
| --- | --- | --- | --- |
| Remove wheel zoom, retain preventDefault | `app.js:49` | Model 4 pass; browser exit 1 at `tests/browser.mjs:45`: assert.ok(afterWheel.scale>beforeWheel.scale) receives false. | KILLED |
| Replace all reading headings with Wrong title after buildReading | `app.js:56` | Model 4 pass; browser exit 1 at `tests/browser.mjs:33`: full title comparison rejects 17 Wrong title strings. Original wheel restored first. | KILLED |

Scratch: `C:/Users/paulo/AppData/Local/Temp/response-maps-reverify-a8e21feb-76b9-4e58-98e7-070d0edae09f`; URL `http://127.0.0.1:4187`. Only copied sources mutated using apply_patch. Server stopped; baseline 4173 untouched. No stash, real source/test edits or commits.

Isolation: real porcelain exactly `?? .specs/features/preview/validation.md` before and after sensor. SHA256 hashes of app.js, model.js, tests/browser.mjs and tests/model.test.js identical. Real source/test `git diff --exit-code` exited 0. Source diff across recheck commits empty.

Cleanup limitation: automatic approval review rejected recursive deletion of the validated scratch path as "blocked by policy", without further reason. Scratch remains with server stopped. No workaround attempted; real-tree isolation verified independently.

## Quality, edges and limitations

Only requirement-linked assertions added, no product changes or dependencies, existing patterns retained. Every new assertion maps to MAP-01/03/04/05. No API routes exist. Guidelines: README.md:13 and spec; otherwise strong defaults applied.

Overflow: `tests/model.test.js:19`, `tests/browser.mjs:48` and line 49. Reload count reset: `tests/browser.mjs:52`. Page errors equal []: `tests/browser.mjs:67`. Redundant old post-pan comparison at line 42 remains, but lines 43-49 independently detect wheel regression.

No new source defect or surviving mutant found in bounded scope. Previous upper-cap kill is historical evidence only. Physical touch/pinch and subjective visual UAT not performed; automated PASS does not imply visual sign-off.

Traceability recommendation: MAP-01..08 verified. Spec/STATE/tests/lessons untouched under report-only authorization. Clean recheck yields no new failure lesson.
