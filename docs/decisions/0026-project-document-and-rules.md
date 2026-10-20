# 0026 — Projects are documents `users/{uid}/projects/{projectId}`, guarded by an extended `firestore.rules`

- **Status:** accepted
- **Date:** 2026-10-16
- **Decided by:** architect
- **Slice:** 3

## Context
0007 reserved `users/{uid}/projects/{projectId}` and 0015 fixed the feature set (create, rename, color, archive). The current `firestore.rules` have no match for `projects`, so every read and write there is denied by default. Slice 3 therefore needs a rules change, the first since slice 1.

## Options
| Option | Pros | Cons |
|---|---|---|
| One document per project in `users/{uid}/projects`, owner-only rules with shape validation | Matches 0007, per-document last-write-wins (0006), small subscribable collection | Rules change + emulator tests (still manual, no Java) |
| Projects as an array in `settings/preferences` | No new collection | Whole-list last-write-wins loses concurrent edits, breaks the preferences `hasOnly(['theme'])` rule |
| Rules also check that an entry's `projectId` exists (`exists()`) | Referential integrity | One extra read per entry write, fails for a project created offline whose write has not landed yet, complicates the timer batch |

## Decision
- Document `users/{uid}/projects/{projectId}` with exactly: `name: string`, `color: string`, `archived: bool`, `createdAt: timestamp`, `updatedAt: timestamp`. Ids are Firestore-generated.
- New rules block: owner may `read`; `create`/`update` only if the document has exactly these keys and the types are right, `name.size()` is 1–40, and `color` passes the check set by the color decision of this slice. `delete` follows the delete decision of this slice (denied if projects cannot be deleted).
- Entry rules stay as they are (they already allow an optional `projectId: string` and `note: string` of at most 2000 chars). There is no referential check: the client tolerates a `projectId` that has no matching project.
- The client subscribes to the whole collection (it is small: tens of documents). No index is needed.

## Consequences
- `firestore.rules` changes, and the change must be covered by rules tests. They still cannot run here (no Java), so they remain a manual step before deploy, as in slices 1–2.
- Entries that point at an unknown project must render (as "Unbekanntes Projekt") and be counted separately, not crash.
- Name uniqueness cannot be enforced by rules; it is a client-side check (0029).
