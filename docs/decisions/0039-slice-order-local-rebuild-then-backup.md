# 0039 — New slice order: local rebuild (2R) → backup (2E) → projects (3) → CSV/PDF report (4)

- **Status:** accepted
- **Date:** 2026-09-22
- **Decided by:** user
- **Slice:** slice 2R (local rebuild)

## Context
[0014](0014-slice-order.md) ordered the work as foundation → calendar → projects → export, on the assumption of a cloud backend. The local-only change ([0030](0030-local-only-single-device-no-sync.md)) arrived mid-slice-2: tasks 1–12 are committed (`69b3a2f`), the day detail exists as an unreviewed WIP commit (`dd09a9a`), and the open-entry resolution view and the routing wiring were never built. The user chose to rebuild now rather than finish slice 2 first, and to bring the backup forward, because local data with no backup is the new main risk.

## Options
| Option | Pros | Cons |
|---|---|---|
| 2R local rebuild (data layer + Firebase/auth removal + routing so the calendar is reachable), then 2E backup, then 3, then 4 | after 2R the app is completely usable locally; the backup follows immediately, closing the durability gap; each remaining feature is then built once, against the final contract | the rebuild slice carries a large, mostly mechanical diff |
| Finish slice 2 on the Firebase base first, then rebuild | slice 2 gets closed formally | the same files are touched twice, and the new view would be written against a contract that is about to vanish |
| One big slice: rebuild + backup together | one run, one review | exactly the size at which the previous run broke at a session limit |

## Decision
1. **2R — local rebuild:** the IndexedDB store behind the existing contracts ([0033](0033-indexeddb-with-in-memory-mirror.md)), removal of Firebase and auth ([0035](0035-firebase-code-removed-outright.md)), the uid-free contract ([0034](0034-no-uid-parameter-anywhere.md)), no cache metadata ([0036](0036-subscriptions-without-cache-metadata.md)), the app shell without a gate, and the routing wiring so timer, calendar and day detail are all reachable. The existing test suite is adapted.
2. **2E — backup:** JSON export and replace-all import ([0037](0037-json-backup-with-replace-all-import.md)).
3. **3 — projects and notes** ([0015](0015-projects-and-export-detail.md)).
4. **4 — monthly CSV and PDF report.**

If 2R still does not fit one run, the seam inside it is: (A) store + contract, suite green with the existing shell; (B) remove Firebase/auth and rewire the shell.

## Consequences
- Supersedes [0014](0014-slice-order.md). The old slice 2 is not "finished" but dissolved: its built calendar code is kept and adapted, its open-entry resolution view is dropped ([0040](0040-open-entries-resolved-in-the-day-detail.md)), its routing wiring moves into 2R.
- After 2R the app is usable end to end with no sign-in; after 2E the data is protectable. Between those two slices the only copy of the data is in one browser profile, which must be stated in the README.
- The unreviewed day-detail WIP commit is inside 2R's scope: it must be adapted to the uid-free contract **and** reviewed, not assumed correct.
- Projects (slice 3) will change the entry schema, so the backup format version of [0037](0037-json-backup-with-replace-all-import.md) has to be in place before it — which this order guarantees.
