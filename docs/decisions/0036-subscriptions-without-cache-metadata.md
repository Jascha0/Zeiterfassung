# 0036 — Subscriptions deliver entries only; there is no cache metadata and no "possibly incomplete" state

- **Status:** accepted
- **Date:** 2026-09-22
- **Decided by:** user
- **Slice:** slice 2R (local rebuild)

## Context
[0027](0027-subscriptions-carry-cache-metadata.md) added `meta: { fromCache, hasPendingWrites }` to both entry subscriptions and the user-facing notice "Offline – Daten möglicherweise unvollständig". Its whole purpose was a Firestore-specific failure mode: a month that had never been loaded online was simply absent from the offline cache and came back as an empty result.

With [0033](0033-indexeddb-with-in-memory-mirror.md) the entire data set is loaded from the local store at startup. Either the load succeeded — and then every month is complete — or it failed, which is an error, not an ambiguous emptiness. There is no server, so a write is never "pending" either.

## Options
| Option | Pros | Cons |
|---|---|---|
| Remove the metadata argument and the notice | the contract states exactly what exists: entries, loading, error; one fewer concept in every hook, view and test | the interface changes again, and `useMonthEntries` plus its tests must be adjusted |
| Keep the metadata as always-`false` values | no signature churn | a permanently meaningless field that invites wrong conclusions and needs explaining forever |
| Keep the notice for the load-error case | reuses an existing string | mislabels a hard error as "possibly incomplete"; the error state already has its own message |

## Decision
`subscribeEntriesInRange` and `subscribeOpenEntries` deliver `onChange(entries: Entry[])` with no second argument. `SubscriptionMeta` is deleted. The string "Offline – Daten möglicherweise unvollständig" and the `incomplete` flag in `useMonthEntries` are removed. The remaining states are `loading` (until the initial local load resolves) and `error` (`Daten konnten nicht geladen werden.`). The online/offline indicator and `useOnlineStatus` go with them: there is no online state in a local app.

## Consequences
- Supersedes [0027](0027-subscriptions-carry-cache-metadata.md). The slice-2 acceptance criterion about a cache-only month disappears along with its tests; the load-error criterion stays.
- `useMonthEntries`, `useTimerData`, `CalendarView` and `DayDetailView` all lose a branch — the sticky-`loading` ruling of the previous run (loading stays true until a non-cache delivery arrives) becomes moot.
- A future pending-write or sync indicator would have to be designed from scratch; that is correct, because it would belong to a sync design that does not exist.
- The store's own loading state remains the one place where "we do not know the data yet" is expressed.
