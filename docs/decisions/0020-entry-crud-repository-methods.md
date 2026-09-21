# 0020 — Manual entry editing gets explicit `createEntry` / `updateEntry` / `deleteEntry` repository methods, alongside the existing plan-based `applyTransition`

- **Status:** superseded by [0028](0028-entry-write-api-with-atomic-delete-channel.md)
- **Date:** 2026-09-18
- **Decided by:** architect
- **Slice:** slice 2 (calendar + editing)

## Context
Slice 1's `EntryRepository` (`src/data/repository.ts`) exposes exactly one write: `applyTransition(uid, plan)`, where a `TransitionPlan` closes entries and/or creates one. That shape exists because a timer action is always an atomic batch. Manual editing in slice 2 needs single-document writes — create an entry with both times, change an existing entry's times, delete an entry — and resolving several open entries needs a multi-document batch again.

## Options
| Option | Pros | Cons |
|---|---|---|
| Add `createEntry`, `updateEntry`, `deleteEntry` and keep `applyTransition` for transitions | each call site says what it means; trivial to implement in both repositories; batch semantics stay where they are needed | four write methods on the interface |
| Squeeze everything into a generalised `applyPlan` (close/create/update/delete lists) | one write path, one place for batching | every simple edit builds a plan object; harder to read and to test; error mapping loses specificity |
| Let the views talk to Firestore directly for edits | least indirection | breaks the rule that only the data layer imports Firestore; kills in-memory testing of the editing views |

## Decision
Extend `EntryRepository` with `createEntry(uid, entry)`, `updateEntry(uid, id, patch)` and `deleteEntry(uid, id)`, each writing a single document, and keep `applyTransition` unchanged for timer transitions and for the multi-entry "resolve open entries" batch. `InMemoryRepository` implements all of them, so every editing view stays testable without Firebase.

## Consequences
The timer path is untouched, so slice 1 keeps its tested behaviour. Views can express an edit as one call, and write-error mapping (`src/data/writeErrors.ts`) applies unchanged. Validation is *not* pushed into the repository: it stays in the pure domain layer, and the repository stays a dumb transport. The Firestore security rules already validate entry shape on `create`/`update` and allow `delete`, so no rule change is required for editing.
