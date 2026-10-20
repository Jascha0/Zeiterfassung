# 0034 — Projects cannot be deleted, only archived and unarchived

- **Status:** accepted
- **Date:** 2026-10-16
- **Decided by:** user (slice-3 question F4, option A)
- **Slice:** 3

## Context
Entries reference projects by id. Deletion is destructive and would leave entries pointing nowhere or require multi-document cleanup.

## Options
| Option | Pros | Cons |
|---|---|---|
| Archive only (reversible) | No data loss, no multi-document writes, history keeps names | List grows over time |
| Delete only if unused | Clean list | Needs a query over all entries, unsafe offline |
| Delete, entries show "Unbekanntes Projekt" or lose the project | Full control | Destructive, multi-document writes or loss of history |

## Decision
There is no delete for projects in the app. `firestore.rules` deny `delete` on `users/{uid}/projects/{projectId}`. Archived projects are hidden from pickers for new assignments, shown on entries with "(archiviert)", and can be unarchived at any time.

## Consequences
Account deletion (slice 5) will need its own server/admin path or a rules change for projects. "Unbekanntes Projekt" handling stays only for offline/foreign edge cases (0026).
