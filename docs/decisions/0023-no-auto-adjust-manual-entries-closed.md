# 0023 — Edits never auto-shift neighbouring entries; manually added entries are always closed

- **Status:** accepted
- **Date:** 2026-10-16
- **Decided by:** architect; accepted by user with brief, 2026-10-16
- **Slice:** 2

## Context
Timer-created days are contiguous chains (work, break, work …). Editing one entry's time immediately collides with its neighbour. Also: may the day detail create a running (open) entry?

## Options
| Option | Pros | Cons |
|---|---|---|
| Reject conflicting edits with a clear message; user edits neighbours themselves; added entries need start and end | Predictable, simple, one write per action | Moving a boundary in a chain takes two edits (shorten one first) |
| Auto-shift the adjacent entry when a shared boundary moves | Convenient | Hidden multi-document changes, hard to validate and test, surprises |
| Allow adding open entries in day detail | Flexible | Competes with the timer; creates multiple open entries by design |

## Decision
An edit or add changes exactly one entry. If it conflicts, it is rejected with a German message naming the conflicting entry (type + time span). Entries added in the day detail must have both start and end; only the timer creates open entries.

## Consequences
All slice-2 writes are single-document creates, updates or deletes; no batches needed. A "move shared boundary" helper can be added later without changing data.
