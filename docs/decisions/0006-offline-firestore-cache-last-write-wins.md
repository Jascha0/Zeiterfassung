# 0006 — Full offline use via the Firestore persistent cache, conflicts resolved last-write-wins per document

- **Status:** accepted
- **Date:** 2026-09-16
- **Decided by:** user
- **Slice:** slice 1 (foundation, auth, timer)

## Context
Working time is often tracked where there is no network. The app must stay usable offline, and two devices used offline may produce conflicting writes.

## Options
| Option | Pros | Cons |
|---|---|---|
| Full offline with the Firestore persistent cache, last-write-wins | all actions work offline and sync automatically; no custom sync code | conflicts can silently overwrite; concurrency anomalies (two open entries) possible |
| Online-only | no conflicts at all | unusable without network — fails the core use case |
| Custom merge/CRDT layer | conflicts resolvable field-by-field | large amount of bespoke, hard-to-test code for a single-user app |

## Decision
Enable Firestore's persistent (multi-tab) local cache; all reads and writes go through it. Conflicting concurrent writes resolve last-write-wins per document. Anomalies that matter to the user — notably more than one open entry — are detected and surfaced, never silently merged.

## Consequences
Writes appear instantly and succeed offline; the UI must show an online/offline indicator and treat pending writes as normal. Because entries are separate documents, a conflict rarely destroys data, but duplicated open entries can appear and need an explicit resolution path (slice 2).
