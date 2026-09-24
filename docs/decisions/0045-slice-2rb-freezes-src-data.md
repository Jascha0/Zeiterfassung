# 0045 — Slice 2R-B changes nothing under `src/data/`; the store findings inherited from 2R-A are deferred, each with a named trigger

- **Status:** accepted
- **Date:** 2026-09-24
- **Decided by:** architect
- **Slice:** slice 2R-B (the shell)

## Context
The 2R-A review (`.pipeline/archive/2026-09-24-slice2RA-local-store/review.md`) approved the store and
carried twelve non-blocking findings forward, five of them named as worth inheriting by 2R-B: the
`channel.post` call on the success path of `persist()` (`localStore.ts:246`), a reload while the store is in
the `failed` state (`:294-298`), rollback under concurrent writes to the same record, `deliver()` handing
out non-copies (`:342-345`), and `applyTransition` with one id in both `close` and `delete` (`:144-176`).
Every one of them is currently unreachable in the running app, and all five are assessed as harmless today.

2R-B's purpose is the opposite of subtle: make the app startable. Its diff is already large (delete Firebase
and auth, rewire the shell, finish and test the day detail, rewrite the README), and the previous slice-2 run
died at a session limit with less to do. `src/data/localStore.ts` is reviewed twice over, byte-frozen at
`1eb55ab`, and covered by a suite that a reviewer mutation-tested.

## Options
| Option | Pros | Cons |
|---|---|---|
| Freeze `src/data/`: no change at all in 2R-B, findings deferred with explicit triggers | the run's whole risk stays in the shell and the views; the approved store cannot regress; the review surface shrinks | five known-imperfect code paths stay in the tree one or two slices longer |
| Fix all five now | the notes are gone | every fix needs its own falsifiable test in the hardest file in the repo, on top of a run that is already the biggest of the project — and four of the five cannot be triggered by any user action |
| Fix only finding 7 (`close` + `delete` overlap), since the day detail could make it reachable | removes the one finding with a plausible trigger | the day detail does not need `applyTransition` at all (see below), so the trigger can be closed for free by *not* creating it |

## Decision
No file under `src/data/` is created, modified or deleted in 2R-B — not even a clarifying comment.
`git diff 1eb55ab -- src/data/` must come back empty at the end of the run.

The day detail keeps writing through the single-record methods it already uses (`createEntry`,
`updateEntry`, `deleteEntry`) and never calls `applyTransition`, so finding 7's precondition is never
created. `planTransition` (`src/domain/timer.ts`) continues to emit `delete: []`, and `TimerView` remains
`applyTransition`'s only caller.

The five findings are deferred with these triggers; whoever first makes a trigger true owns the fix:
- **3 — `channel.post` can reject a persisted write:** triggered as soon as anything calls `store.close()`
  in production code, or a write can be in flight while the store shuts down.
- **4 — a reload in the `failed` state swaps memory without notifying:** triggered as soon as something
  outside tests reads `getEntries()`, or the UI offers a retry after a failed load.
- **5 — concurrent writes to the same record diverge memory from storage:** triggered as soon as a view
  stops disabling its action while a write is pending (spec OQ10).
- **6 — `deliver()` hands out the authoritative `Entry` objects:** triggered as soon as any consumer mutates
  a delivered entry instead of copying it.
- **7 — `applyTransition` with one id in both `close` and `delete`:** triggered as soon as any caller emits
  such a plan.
Slice 2E (JSON backup, [0037](0037-json-backup-with-replace-all-import.md)) must revisit 3, 4 and 7, because
replace-all import writes through the same batch path and will legitimately want a "clear then insert" plan.

## Consequences
- 2R-B's diff is confined to `src/App.tsx`, `src/main.tsx`, `src/views/`, `src/components/`, `src/app/`,
  `src/theme/` (harness only), `src/domain/routing.ts`, tests, config and docs. A reviewer can reject any
  `src/data/` change on sight instead of judging it.
- If the run hits a session limit, the data layer is provably untouched, so the worst case is an unfinished
  shell rather than a broken store.
- Five known weaknesses stay in the code. They are recorded here rather than in a run report, so the next
  slice inherits them as decisions and not as rediscoveries.
- The day detail forgoes atomicity across two records. It never needs it: each of its actions changes exactly
  one entry ([0021](0021-free-form-day-editing-no-overlaps.md), [0023](0023-running-entry-editable-start-and-end.md)).
