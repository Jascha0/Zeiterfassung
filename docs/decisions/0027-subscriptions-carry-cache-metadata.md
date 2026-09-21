# 0027 — Entry subscriptions carry Firestore cache metadata, and a month is labelled "possibly incomplete" when it is cache-only while offline

- **Status:** accepted
- **Date:** 2026-09-18
- **Decided by:** architect
- **Slice:** slice 2 (calendar + editing)

## Context
A month that has never been loaded while online is simply absent from the Firestore offline cache. Firestore then reports an **empty result, not an error**, so a month with 160 recorded hours looks identical to a month with none. Showing "no entries" there is a lie the user cannot detect.

Slice 1's contract cannot express this: `EntryRepository.subscribeEntriesInRange` delivers `onChange(entries: Entry[])` and nothing more, `FirestoreRepository.subscribeQuery` discards `snapshot.metadata`, and `InMemoryRepository.setOffline()` only defers write settlement while reads keep returning the full seeded data. So the state is neither derivable in the app nor reachable in a test.

## Options
| Option | Pros | Cons |
|---|---|---|
| Carry `fromCache` / `hasPendingWrites` through the subscription callback, and let the fake drive them | the real Firestore signal, no guessing; testable against `InMemoryRepository`; extra parameter is source-compatible with existing callbacks that ignore it | the repository interface changes, so both implementations and the fake must be touched |
| Heuristic in the hook: empty result + `navigator.onLine === false` | no interface change | mislabels a genuinely empty month as "incomplete" and a cached non-empty month as complete; untestable in any meaningful sense |
| Drop the requirement, always show what is cached | least work | silently reports "0 h worked" for real months — the worst outcome of this slice |

## Decision
Both entry subscriptions gain a metadata argument: `onChange(entries: Entry[], meta: { fromCache: boolean; hasPendingWrites: boolean })`. `FirestoreRepository` subscribes with `{ includeMetadataChanges: true }` and forwards `snapshot.metadata`, so the flip from cache to server result reaches the hook. `InMemoryRepository` reports the same shape and gains a way for tests to drive it: `setOffline(true)` makes subsequent read deliveries report `fromCache: true`, and an explicit override lets a test produce "cached while online".

A month is displayed as **"Offline – Daten möglicherweise unvollständig"** exactly when the latest delivery has `fromCache === true` *and* the device reports offline (existing `useOnlineStatus`). While online, `fromCache: true` is a transient first snapshot and is shown as loading, not as incomplete. The number of entries never enters this judgement.

Existing callbacks (`useTimerData`, and preferences, which is untouched) ignore the new parameter and keep working unchanged.

## Consequences
The incomplete-month state becomes both derivable and testable, and criterion 17 of slice 2 is verifiable against the in-memory fake. It also gives the app a correct basis for a pending-write indicator later, at no extra cost. The price is that the data layer changes by more than the CRUD methods of [0028](0028-entry-write-api-with-atomic-delete-channel.md): the interface, both implementations and the fake are all touched, and every future subscription is expected to pass metadata. The wording above is user-facing and fixed; it must be used verbatim.
