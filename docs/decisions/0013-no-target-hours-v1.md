# 0013 — No target hours / overtime balance in v1

- **Status:** accepted
- **Date:** 2026-09-16
- **Decided by:** user (round 1 question F4)
- **Slice:** 1 (migrated from brief D13)

## Context
Whether to track against daily/weekly target hours.

## Options
| Option | Pros | Cons |
|---|---|---|
| Actual time only | Simple | No overtime view |
| Target hours + overtime | Balance visible | Settings, holidays, more logic |

## Decision
v1 shows actual worked time only. Target hours/overtime are a later slice.

## Consequences
Calendar shows net work time per day and month total, no target comparison.
