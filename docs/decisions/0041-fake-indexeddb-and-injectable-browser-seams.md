# 0041 — The IndexedDB adapter is tested with `fake-indexeddb` as a devDependency, and BroadcastChannel / persistence requests are injectable seams

- **Status:** accepted
- **Date:** 2026-09-23
- **Decided by:** architect
- **Slice:** slice 2R-A (local store)

## Context
[0033](0033-indexeddb-with-in-memory-mirror.md) makes IndexedDB the only place user data is stored, so the adapter is the most safety-critical new code in the rebuild. But the test environment cannot execute it: verified in this worktree, jsdom 30.0.1 provides **no** `indexedDB`, `BroadcastChannel`, `structuredClone` or `navigator.storage`, and there is no fake-IndexedDB devDependency.

The brief's earlier wording left the choice to the Planner while also demanding "no new dependency". The cheapest reading of that combination is "test everything against the in-memory adapter", under which the persistence criteria all pass green while the IndexedDB adapter is never executed once — the worst possible outcome for a local-only app whose data has no second copy.

The "no new dependency" rule was always about the **runtime bundle** ([0031](0031-no-backend-firebase-dropped.md), [0033](0033-indexeddb-with-in-memory-mirror.md)), not about test tooling.

## Options
| Option | Pros | Cons |
|---|---|---|
| `fake-indexeddb` as a devDependency + injectable seams for BroadcastChannel and `navigator.storage` | the real adapter code runs in CI: round-trip, load failure, quota failure, rollback; no runtime cost; the seams also make multi-tab and the persistence request testable | one devDependency more; `structuredClone` must be polyfilled for it; a fake is not a browser |
| Manual browser checklist only | zero tooling; tests the real thing | every regression escapes CI; a checklist run by hand once is not a safety net for the store that holds all the data |
| In-memory adapter only, adapter untested | least work | the only genuinely new production code of the slice is unverified; criteria pass without meaning |

## Decision
`fake-indexeddb` is permitted and required as a **devDependency**. The IndexedDB adapter has its own test file which activates it locally (`import 'fake-indexeddb/auto'` inside that file, not globally), so no other test silently gains an IndexedDB. `src/test/setup.ts` polyfills `structuredClone` when absent, using V8 serialize/deserialize so the clone stays faithful.

Two browser capabilities become injectable seams instead of direct globals:
- the multi-tab channel: the store core takes a channel factory, defaulting to `globalThis.BroadcastChannel` when present and to a no-op when not, so tests inject a paired fake;
- the persistence request: a one-line wrapper takes the `navigator` object, so tests can drive "granted", "denied" and "API absent".

Whatever still cannot be verified automatically — a real page reload, a browser restart, a reboot, real quota behaviour — is covered by a **named manual browser checklist whose results the run report must contain**, and the corresponding acceptance criteria are marked as manual. No criterion may be satisfiable by the in-memory adapter alone.

## Consequences
- The adapter's failure paths (load error, quota error, rollback of a multi-record batch) become regression-tested, which is what the atomicity promise of [0028](0028-entry-write-api-with-atomic-delete-channel.md) rests on in a local app.
- Two test surfaces exist deliberately: the store core against the in-memory adapter (fast, used by all view and hook tests) and the adapter against `fake-indexeddb` (slow, focused). The core logic stays shared, per the durable rule that tests and production run the same store code.
- `fake-indexeddb` is not a browser: version quirks, transaction timing and quota simulation differ. The manual checklist remains the only proof for reload, restart, reboot and real quota — and therefore must be executed, not just written.
- The injectable channel and `navigator` seams are a small amount of indirection, justified by being the only way to test either behaviour at all.
- One more devDependency to keep current; it ships nothing to the user.
