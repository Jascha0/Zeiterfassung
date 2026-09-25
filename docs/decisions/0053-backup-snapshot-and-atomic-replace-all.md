# 0053 — The backup reads through a guarded snapshot and writes through one atomic `replaceAll` that persists before it swaps memory

- **Status:** accepted
- **Date:** 2026-09-25
- **Decided by:** architect
- **Slice:** slice 2E (backup)

## Context
[0037](0037-json-backup-with-replace-all-import.md) requires a complete export and a replace-all import. The
store ([0033](0033-indexeddb-with-in-memory-mirror.md), `src/data/localStore.ts`) offers neither:

- **Reading everything.** `getEntries()` (`localStore.ts:93`) and `getPreferences()` (`:97`) exist but are used
  only by tests, and they answer regardless of the load state. In the `failed` state the store can hold
  entries that no subscriber has been told about (2R-A finding 4, deferred in
  [0045](0045-slice-2rb-freezes-src-data.md)), and after a *failed initial load* it holds nothing at all. An
  export taken in either state writes a file the user believes is a backup and which is empty or stale. That is
  the single worst outcome this slice can produce — worse than no backup, because it is trusted.
- **Writing everything.** Every write path goes through `StoreChanges` (`persistence.ts:13`) with `put` and
  `delete` lists; there is no "clear the store" operation, and `applyTransition` (`:144`) is the timer's
  batch path, shaped around closing and creating entries.

All existing writes are *optimistic*: mutate memory, notify, persist, roll back on failure
(`localStore.ts:236`). For a replace-all that pattern would mean holding the user's entire previous data set in
memory as rollback state and restoring it after a failure — the most dangerous code in the app, exercised
exactly when something is already going wrong.

## Options
| Option | Pros | Cons |
|---|---|---|
| A dedicated pair: a read method guarded by the ready state, and `replaceAll(data)` on both store and adapter, persisted in one transaction **before** memory is swapped | one new path, atomic by the adapter's own transaction; nothing to roll back — a failed import leaves memory and storage untouched and identical; the existing four write paths are not touched at all; no optimistic UI is wanted for an import anyway | `PersistenceAdapter` grows a third method that both adapters must implement; one documented exception to the optimistic-write pattern |
| Extend `StoreChanges` with a `clearEntries` flag and reuse `apply()` | no new adapter method | changes the shape every existing call site passes; "clear plus put 900 records" inside the generic write path makes the most dangerous operation share code with the most frequent one; still needs rollback state |
| Express the import as a `TransitionPlan` through `applyTransition` | reuses an existing batch path | it is the timer's vocabulary (`close`/`create`/`delete`); it would wake 2R-A's deferred finding 7 (one id in both `close` and `delete`) for no gain; and it cannot clear unknown ids |
| Delete each entry and create each imported entry through the existing single-record methods | no data-layer change at all | not atomic: an interruption halfway leaves a mixture of two data sets with no way to tell which is which. Unacceptable for the only copy of the user's data |

## Decision
Two additions to the data layer, and nothing else:

1. **A guarded full read** for the export. It returns the format version, a copy of every entry and a copy of
   the preferences, and it **refuses** unless the initial load has succeeded (`state === 'ready'`). A refusal
   is reported to the user in German and no file is written. The copies are deep enough that the caller cannot
   reach the store's own objects (2R-A finding 6).
2. **`replaceAll`** on `PersistenceAdapter` and on the store. The adapter implementation is a single
   transaction — clear the entries store, write every imported entry, write the preferences, write the format
   version — so it is all-or-nothing by construction (`IndexedDbAdapter`) and mirrored in `InMemoryAdapter`,
   which also needs a test seam to make it fail. The store method goes through the existing `write()` gate
   (so it waits for the initial load and rejects in the `failed` state) and the existing `persistChain` (so it
   cannot interleave with another write), **persists first, and only then** replaces the in-memory map and the
   preferences and notifies both kinds of subscriber.

The four existing write paths (`createEntry`, `updateEntry`, `deleteEntry`, `applyTransition`) are not
modified.

## Consequences
- A failed import changes nothing anywhere: no rollback code exists because none is needed. The user's message
  ("nothing was changed") is true by construction rather than by care.
- An export can only be produced from a successfully loaded store. An empty file is therefore only possible if
  the data really is empty.
- Both new methods are covered against the `fake-indexeddb` adapter as well as the in-memory one
  ([0041](0041-fake-indexeddb-and-injectable-browser-seams.md)): atomicity is only real in the IndexedDB
  implementation, so a green in-memory test is not evidence for it.
- The in-memory mirror and storage can no longer diverge through the import path, because memory is derived
  from what storage accepted.
- Notifying preference subscribers after a replace-all means the theme follows the imported file
  (`ThemeContext.tsx:63-74`). If the file carries no preferences, the store's preferences become `null` and the
  currently applied theme stays until the next load — known, accepted, stated in the brief.
- `replaceAll` posts on the cross-tab channel like every other write, which is why
  [0054](0054-src-data-freeze-ends-and-finding-3-is-fixed.md) fixes 2R-A finding 3 in the same slice: a channel
  failure must not make a completed import look failed.
