# 0015 — Projects are a user list (name + color) assigned per work block; export is monthly CSV + PDF

- **Status:** accepted
- **Date:** 2026-09-16
- **Decided by:** user (round 2 questions G4, G5)
- **Slice:** 1 (migrated from brief D15)

## Context
Detail of the extras chosen in 0012.

## Options
| Option | Pros | Cons |
|---|---|---|
| Project list (name+color), optional project+note per work block; monthly CSV + PDF | Matches need | Two export formats |
| Notes only; per-day project; free date range; CSV only | Simpler | Less useful |

## Decision
Projects: create, rename, color, archive; optional project and note per work block; per-project totals in day detail. Export: per month, CSV of all entries and a PDF monthly report.

## Consequences
Slice 3 adds `users/{uid}/projects`; slice 4 is client-side export.
