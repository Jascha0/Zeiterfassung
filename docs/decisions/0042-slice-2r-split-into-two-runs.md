# 0042 — Slice 2R is executed as two pipeline runs: 2R-A (store) then 2R-B (shell)

- **Status:** accepted
- **Date:** 2026-09-23
- **Decided by:** architect
- **Slice:** slice 2R (local rebuild)

## Context
[0039](0039-slice-order-local-rebuild-then-backup.md) fixed the order 2R → 2E → 3 → 4 and named an A/B seam inside 2R, but only as a fallback "if it does not fit one run". The Brief Audit showed that leaves the Planner to make the call mid-planning, against evidence that it will not fit: the previous slice-2 run broke at a session limit after 12 of 16 tasks with strictly less to do, while 2R adds the store core, the IndexedDB adapter and its `fake-indexeddb` tests ([0041](0041-fake-indexeddb-and-injectable-browser-seams.md)), the uid-free contract ([0034](0034-no-uid-parameter-anywhere.md)), a harness rewrite touching essentially every view and hook test, deletion of 18 paths plus three dependencies and two scripts, the shell and routing rewire, the settings view, finishing the unreviewed WIP day detail, and the README.

## Options
| Option | Pros | Cons |
|---|---|---|
| Commit to two runs with a fixed cut | each run has its own definition of done and its own review; a session limit costs at most one half; the data layer is proven before the UI is rewired on top of it | an intermediate state exists in which the old auth gate still fronts the new local store |
| One run, split only if needed | no intermediate state | the decision lands mid-planning under time pressure — exactly how the last run failed |
| Three or more runs | even smaller steps | the contract change and the harness cannot be separated meaningfully; more overhead than content |

## Decision
Two runs with a fixed cut.

**2R-A — the store.** The uid-free, metadata-free contract; the store core with its in-memory adapter; the IndexedDB adapter with `fake-indexeddb` tests; `Unsubscribe` moved out of `src/auth/`; deletion of `src/data/firestoreRepository.ts` and its test (it implements the contract being replaced); `src/main.tsx` wired to the local store; the whole test harness adapted and the suite green. The existing auth gate stays in place untouched, so the app still builds and the diff stays inside the data layer, the hooks and the views' props.

**2R-B — the shell.** Delete the auth stack and the rest of Firebase ([0035](0035-firebase-code-removed-outright.md)); rewire `App.tsx` without a gate; wire hash routing and the `Kalender` nav item; the settings view; remove the `openEntries` route; finish, test and review the WIP day detail; execute the manual browser checklist ([0041](0041-fake-indexeddb-and-injectable-browser-seams.md)); rewrite the README.

## Consequences
- Refines [0039](0039-slice-order-local-rebuild-then-backup.md) without changing the slice order: 2R-A, 2R-B, then 2E.
- Every acceptance criterion must be assigned to A or B, so neither run's review can pass on the other's work.
- **The intermediate state after 2R-A is not runnable by hand**: the auth gate still requires a Firebase config that has never existed, so `npm run dev` lands on the config-missing view. All of 2R-A's verification is therefore automated, and every manual browser check (reload, browser restart, reboot, quota) belongs to 2R-B.
- A small amount of throwaway editing is accepted in 2R-A: `src/firebase/app.ts` is trimmed to wire the auth service plus the local repositories, and is deleted in 2R-B.
- The durability gap of [0030](0030-local-only-single-device-no-sync.md) stays open one run longer, which is acceptable because no real data exists yet and [0037](0037-json-backup-with-replace-all-import.md) follows directly after 2R-B.
