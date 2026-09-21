# 0007 — Time is stored as individual `Entry` documents of type `work` or `break` with start and end

- **Status:** accepted
- **Date:** 2026-09-16
- **Decided by:** architect
- **Slice:** slice 1 (foundation, auth, timer)

## Context
A work day can contain any number of work blocks and breaks, and past days must be editable. The storage shape determines how totals, editing and later reports work.

## Options
| Option | Pros | Cons |
|---|---|---|
| One document per interval (`work` or `break`) with `start`/`end` | unlimited blocks and breaks, natural editing granularity, range queries by `start`, totals derived | more documents; day totals require a query, not a single read |
| One document per day with `pauseMinutes` | single read per day, cheap totals | cannot represent several blocks/breaks with real times; editing is lossy |
| Event log (start/stop events) | full history | every read must fold the log; ambiguous states hard to repair |

## Decision
`users/{uid}/entries/{entryId}` with `{ type: 'work' | 'break', start: Timestamp, end: Timestamp | null, projectId?: string, note?: string, createdAt, updatedAt }`. An entry with `end == null` is open (running). Daily, monthly and per-project totals are always derived, never stored.

## Consequences
Makes arbitrary day structures and later per-project reporting possible, and allows range queries on `start`. Requires validation logic (overlaps, ordering) in the domain layer instead of the schema. `projectId` and `note` are allowed from slice 1 onwards, so slice 3 needs no migration. Derived totals mean a month view must read that month's entries.
