# LESSONS - auto-maintained by scripts/lessons.py

> Machine-owned. Do NOT hand-edit. Changes are overwritten on the next `lessons.py` write.
> Canonical state lives in `.specs/lessons.json`. Edit lessons only via the script.
> promote_threshold=2 distinct features · window_days=45 · quarantine_threshold=2

## Confirmed (load these at Specify/Design)

Corroborated across multiple features. Safe to apply as guidance.

_none_

## Candidates (under observation - do NOT load as guidance yet)

Seen once or not yet corroborated. Tracked, not trusted.

### L-001 - Compare camera state immediately before and after each zoom action.
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `browser` · harmful: 0
- features: preview
- evidence: validation.md: initial wheel mutant (browser)
- last seen: 2026-10-14T19:32:28Z

### L-002 - Assert the ordered title values in reading mode, not only heading counts.
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `browser` · harmful: 0
- features: preview
- evidence: validation.md: initial wrong-title mutant (browser)
- last seen: 2026-10-14T19:32:29Z

## Quarantined (failed when applied - ignore)

A confirmed lesson that recurred alongside failure. Kept for the maintainer to review.

_none_
