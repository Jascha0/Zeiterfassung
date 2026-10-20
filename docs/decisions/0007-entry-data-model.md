# 0007 — Data model: individual entries `users/{uid}/entries/{entryId}` (work or break, start/end)

- **Status:** accepted
- **Date:** 2026-09-16
- **Decided by:** architect (following user choice F3: unlimited work blocks and breaks per day)
- **Slice:** 1 (migrated from brief D7)

## Context
A day can contain any number of work blocks and breaks; restart after ending the day is allowed.

## Options
| Option | Pros | Cons |
|---|---|---|
| One document per entry (work or break) with start/end | Unlimited blocks, simple edits, totals derived | More documents |
| One document per day with pauseMinutes | Few documents | Cannot represent multiple blocks/breaks |

## Decision
`users/{uid}/entries/{entryId}`: `{ type: "work" | "break", start: Timestamp, end: Timestamp | null, projectId?: string, note?: string, createdAt, updatedAt }`. `end == null` means open. Totals are always derived, never stored. Projects (slice 3) in `users/{uid}/projects/{projectId}`; settings in `users/{uid}/settings/preferences`.

## Consequences
Irreversible in practice (structure of stored data). Day/month queries are range queries on `start`. Open entries are found with `end == null`.
