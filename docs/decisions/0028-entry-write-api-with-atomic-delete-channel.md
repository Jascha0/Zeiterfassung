# 0028 — Entry write API: `createEntry` / `updateEntry` / `deleteEntry` for single edits, plus a `TransitionPlan` that also carries deletions and is written as one atomic batch

- **Status:** accepted
- **Date:** 2026-09-18
- **Decided by:** architect
- **Slice:** slice 2 (calendar + editing)

## Context
This supersedes [0020](0020-entry-crud-repository-methods.md), which decided the three CRUD methods but also claimed `applyTransition` could stay unchanged and still carry the "resolve open entries" batch. That is not true: `TransitionPlan` is `{ close: EntryClose[]; create: NewEntry | null }` (`src/domain/timer.ts`) and has no delete channel, and `FirestoreRepository.applyTransition` only batches `update` + `set`. A resolution in which one open entry is closed and another deleted ([0022](0022-manual-resolution-of-multiple-open-entries.md)) would therefore become two independent writes, so a failure could leave the state half-resolved — exactly what 0022 forbids.

Two further gaps in 0020 surfaced: `NewEntry` is typed `end: null`, so a manually created *closed* entry ("Arbeit 09:00–12:00") cannot be expressed, and the patch shape of `updateEntry` was never defined.

## Options
| Option | Pros | Cons |
|---|---|---|
| Add a `delete: string[]` channel to `TransitionPlan`; both repositories batch close + create + delete atomically | one write path for every multi-document change; keeps 0022's guarantee; the timer's existing plans are unaffected (`delete` simply empty) | `applyTransition` and both implementations change, plus the fake's rollback |
| Close via `applyTransition`, delete via `deleteEntry` | no interface change | not atomic; a half-resolved state is reachable; the fake's `failNextWrite` arms only one write, so a test would pass while the guarantee is broken |
| Drop the atomicity claim from 0022 | honest about a simpler implementation | the one place where the app's own sync model can corrupt data would get the weakest write semantics |

## Decision
`EntryRepository` gains:
- `createEntry(uid, entry)` — a single new entry, where the input type allows `end: number | null`, so both a running and an already-closed entry can be created. `NewEntry` is widened (or a sibling type introduced) accordingly; the Firestore document shape stays exactly as in [0007](0007-entry-records-for-work-and-break.md).
- `updateEntry(uid, id, patch)` with `patch: { type?, start?, end?, updatedAt }` — only these fields, `updatedAt` always set by the caller.
- `deleteEntry(uid, id)` — a single hard delete.

`TransitionPlan` gains `delete: string[]`. `applyTransition` writes close + create + delete as one batch in `FirestoreRepository` (`writeBatch`) and applies the same all-or-nothing semantics with rollback in `InMemoryRepository`, so `failNextWrite` leaves no partial change. Timer transitions keep building plans with an empty `delete` list and behave exactly as before.

Validation stays out of the repository: it lives in the pure domain layer, and the repository remains a dumb transport.

## Consequences
Multi-document changes — today only the open-entry resolution — have exactly one atomic path, and criterion "a failed write leaves neither change applied" becomes genuinely testable. Single edits stay one readable call each, and write-error mapping (`src/data/writeErrors.ts`) applies unchanged. The Firestore schema, security rules and indexes are untouched; the *TypeScript* types are not, and every `TransitionPlan` construction site must supply `delete`. Existing timer tests must stay green as the proof that the widened plan did not change timer behaviour.
