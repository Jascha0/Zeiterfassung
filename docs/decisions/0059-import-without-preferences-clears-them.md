# 0059 — A backup without preferences clears the stored preferences; `replaceAll` does not inherit `StoreChanges`' null convention

- **Status:** accepted
- **Date:** 2026-09-25
- **Decided by:** architect
- **Slice:** slice 2E (backup)

## Context
[0056](0056-strict-all-or-nothing-import-validation.md) accepts a backup whose `preferences` are absent or
`null` — a legitimate file, written by an app in which no theme was ever saved. What that means when it is
imported was left implicit, and the implicit answer is wrong:

`StoreChanges.preferences` means "**null** = leave the stored preferences untouched" (`persistence.ts:18-19`),
and `IndexedDbAdapter.apply()` only writes them when they are non-null (`indexedDbAdapter.ts:79-81`). A
`replaceAll` written by analogy to `apply()` would therefore set the in-memory preferences to `null` while
storage keeps the old theme record. The divergence survives the import and is resurrected by the next load —
precisely the failure [0053](0053-backup-snapshot-and-atomic-replace-all.md) claims the import path can no
longer produce. The brief audit found it; no criterion would have caught it.

## Options
| Option | Pros | Cons |
|---|---|---|
| A file without preferences **clears** them: the stored record is deleted and memory is `null` | "replace all" means what it says; memory and storage cannot diverge; one rule, provable by reloading a store over the same adapter | the visible theme does not change until the next load, because `ThemeContext.tsx:66` ignores a `null` preference |
| A file without preferences leaves the current preferences alone | the user keeps their theme; nothing looks odd | the import becomes a partial replace, and the `StoreChanges` convention is copied into the one place it must not be — the trap stays, one refactor away from becoming the divergence again |
| A file without preferences resets to the default (`system`) and stores that | no null state to reason about | invents data the file does not contain, and silently overwrites a theme with a default the user never chose |

## Decision
`replaceAll` takes the preferences **explicitly and by value**, with `null` meaning *delete*: the transaction
removes the stored preferences record (`meta.delete(PREFERENCES_KEY)`) when the imported data carries none, sets
the in-memory preferences to `null`, and notifies preference subscribers with `null`.

`replaceAll` therefore does **not** reuse `StoreChanges` and does not inherit its null convention. The
convention itself stays exactly as it is for the four existing write paths — `savePreferences` keeps writing,
`createEntry` and friends keep passing `null` for "don't touch".

The export writes the `preferences` key always, with `null` when there is none, so a file produced by this app
is explicit; on the reading side absent and `null` mean the same thing
([0056](0056-strict-all-or-nothing-import-validation.md)).

## Consequences
- The one thing a reviewer must check is reload-proof: import a file without preferences, then build a fresh
  store over the same adapter — the old theme must not come back. That assertion is the whole point of this
  decision and is a named criterion in the brief.
- Immediately after such an import the app still *shows* the previous theme, because
  `ThemeContext.tsx:63-74` returns early on `null` and nothing re-applies a default. That is accepted, stated
  in the run report, and not a bug: the stored state is correct, only the pixels lag by one load. Anyone who
  dislikes it should change the theme provider, not the import.
- Two write vocabularies now exist in the store — `StoreChanges` for incremental writes and an explicit
  whole-state argument for `replaceAll`. That is intentional: the incremental convention is a patch language,
  and a patch language cannot express "nothing".
- `InMemoryAdapter` must mirror the delete, or the in-memory tests would pass while the IndexedDB path
  diverges.
