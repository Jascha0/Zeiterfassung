# 0009 — Entries crossing midnight are attributed entirely to their start day

- **Status:** accepted
- **Date:** 2026-09-16
- **Decided by:** architect
- **Slice:** 1 (migrated from brief D9)

## Context
A work block may start before and end after midnight.

## Options
| Option | Pros | Cons |
|---|---|---|
| Attribute to start day | Simple queries and totals | Day totals slightly off for night shifts |
| Split at midnight | Exact per-day totals | Complex model and editing |

## Decision
An entry belongs to the local day of its `start`; its full duration counts for that day (and that month).

## Consequences
Day and month ranges query by `start`. Overlap checks for a day must also consider entries that started on the previous day and run into it. Revisit only if the user reports a need.
