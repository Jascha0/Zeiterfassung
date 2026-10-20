# 0006 — Full offline support via Firestore persistent cache, last-write-wins per document

- **Status:** accepted
- **Date:** 2026-09-16
- **Decided by:** user (round 2 question G3)
- **Slice:** 1 (migrated from brief D6)

## Context
The app must work without a connection (e.g. on the phone) and sync later.

## Options
| Option | Pros | Cons |
|---|---|---|
| Full offline, last-write-wins | Always usable, built into Firestore | Concurrent edits on two offline devices: last one wins; possible multiple open entries |
| Online-only | No conflicts | Unusable without network |

## Decision
Firestore persistent local cache (multi-tab). All writes are optimistic and sync when online. Conflicts resolve last-write-wins per document; multiple open entries are detected and shown, never silently merged.

## Consequences
Write promises may stay pending offline, so the UI must not block on them. Client-side validation (e.g. overlaps) can be defeated by concurrent offline edits on two devices; this is accepted.
