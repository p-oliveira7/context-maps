# Motion validation

## Validation: PASS

**Verdict: PASS.** All three prior assertion gaps are closed. The motion gate passes; both requested timing mutations are killed.

Date: 2026-10-14. Verifier: independent of implementation author, bounded re-verification using tlc-spec-driven.
Spec: `.specs/features/motion/spec.md`.
Feature commit range: `7a4b1ad..02d90e6d58fc7fc3596e3d7786c407695d2bc397`.
Re-verification delta: `77b0824..02d90e6d58fc7fc3596e3d7786c407695d2bc397`: exactly 14 added test lines, implementation unchanged. No formal tasks file per spec.

## Spec-anchored evidence

| Criterion | Outcome assertion evidence | Result |
| --- | --- | --- |
| MOT-01: 420 ms card/connection interpolation | `tests/motion.mjs:19` asserts intermediate node/path differ from start; line 20 asserts intermediate node differs from end. Lines 38–39 obtain expected endpoint through non-animated expand-all, independently of animateLayout. `tests/motion.mjs:41` asserts node not at endpoint at 416 ms; line 42 asserts node and path equal the independent endpoint at 436 ms, after the first rAF opportunity beyond 420. Source duration: `motion.js:22`. | PASS |
| MOT-02: only first-child highlight, progressive draw, 1000 ms lifetime | `tests/motion.mjs:15` asserts exact presenting IDs; lines 17–18 assert positive dash offset and width >3; line 22 asserts decreased offset. `tests/motion.mjs:43` asserts IDs equal ['mobility-1'] at accumulated 999 ms; line 44 asserts zero at 1000 ms. Line 31 checks root reopening presents mobility. | PASS |
| MOT-03: incoming-only hover width/glow, restoration, root exception | `tests/motion.mjs:27` asserts hovered IDs equal ['nature']; line 28 asserts increased width and changed filter; line 29 asserts zero hovered paths and restored width; line 30 asserts no root hover edge. | PASS |
| MOT-04: immediate final geometry, static highlight, no progressive drawing, hover retained | `tests/motion.mjs:46` asserts immediate node/path equality with independent expand-all endpoint; line 50 repeats equality after 600 ms controlled clock advancement. Lines 47–49 assert exact presenting identity, width >3 and filter not none. Lines 35–36 assert animationName and strokeDasharray both none and retained hover. | PASS |
| MOT-05: concurrent toggles cancel old effects and settle within 1200 ms | `tests/motion.mjs:32` toggles three times and advances 1200 ms; line 33 asserts child, associated edge and presenting counts all zero. Cancellation: `motion.js:3`, called by `app.js:14`. | PASS |

Five of five criteria evidenced. No remaining ranked gaps or spec-precision gaps in this bounded review. Both root edge cases are covered. MOT-01 timing is verified at animation-frame resolution, not sub-frame precision. Geometry checks sample mobility-1 and its connection rather than exhaustively checking every node.

The previous MOT-01 gap is closed by boundary samples plus independent final node/path equality. MOT-02 now proves persistence at 999 ms and expiry at 1000 ms. MOT-04 now rejects stalled animation and absent static highlight through immediate independent endpoint comparison, clock advancement and computed styling.

## Gates and test integrity

Fresh gate: `node tests/motion.mjs`, exit 0, output `PASS MOT-01..05`. One assertion-sequence script passed, no skips. `tests/motion.mjs:51` asserts no page runtime errors.
Environment: PLAYWRIGHT_MODULE=file:///C:/Users/paulo/AppData/Roaming/npm/node_modules/rea-agents/node_modules/playwright-core/index.mjs; default preview http://127.0.0.1:4173; headless installed Chrome; Node v24.20.0.

Prior report recorded npm test (4 passed), browser.mjs and cards.mjs passing. These are historical results carried forward, not fresh runs: implementation is unchanged and this request limits the rerun to the motion gate. No formal tasks/build command exists beyond the spec success criteria.

Reviewed delta only adds 14 lines. No removed or weakened assertions. Existing model test count remains four and motion remains one script. New assertions map to MOT-01, MOT-02 and MOT-04.

## Bounded discrimination sensor

Two isolated scratch copies under work, served on separate loopback ports. Scratch tests were byte-identical to the real test: SHA256 5E244C44CB2E72E85125BA65F03D7AAB6B6CA1D9B9592AD00CF39678F8841155. Each source copy changed only its requested timing constant.

| Mutation | Location | Observed failure | Result |
| --- | --- | --- | --- |
| Duration 420 → 300 ms | `motion.js:22` | Port 4184, exit 1 at `tests/motion.mjs:41:38`; at 416 ms actual and expected both {x:1000,y:0}, violating notDeepEqual. | KILLED |
| Highlight timer 1000 → 800 ms | `motion.js:26` | Port 4185, exit 1 at `tests/motion.mjs:43:38`; at 999 ms actual [], expected ['mobility-1']. | KILLED |

Sensor: 2 distinct mutations, 2 killed, 0 survived. Initial copy referenced a nonexistent assets directory and omitted root SVGs. Each mutant was run once, then rerun once after city.svg and park.svg were copied; complete-asset reruns failed at the same intended assertions. No other mutations were introduced. Prior hover/no-interpolation kills remain historical evidence from the preceding report, not rerun here.

Both scratch servers were stopped. Automatic approval review rejected cleanup with “blocked by policy”; no deletion retry occurred. Retained paths:

- C:/Users/paulo/Documents/Codex/2026-10-14/visual-response-maps-rebuild/work/motion-reverify-duration
- C:/Users/paulo/Documents/Codex/2026-10-14/visual-response-maps-rebuild/work/motion-reverify-highlight

Real-tree porcelain before and after sensor work matched exactly: ?? .specs/features/motion/validation.md. Tracked diff remained empty; HEAD remained 02d90e6d58fc7fc3596e3d7786c407695d2bc397. No source/test edits or commits occurred.

## Quality and handoff

The additive tests remain within the feature, preserve native JS conventions, introduce no dependencies or abstractions, and assert outcomes using a separate non-animated action. Prior source quality review carries forward because implementation is unchanged. Prior report cites project guidance .specs/STATE.md AD-001; skill coding principles applied.

Main agent already inspected screenshots, per user handoff; this verifier claims no additional visual inspection or interactive UAT. All five requirements are recommended verified; spec traceability remains untouched under the report-only write restriction. No new failure signal requires a lesson. Only this report was written in the repository.
