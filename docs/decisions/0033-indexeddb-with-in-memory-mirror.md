# 0033 — Data is stored in IndexedDB, mirrored completely in memory, with a one-off persistent-storage request

- **Status:** accepted
- **Date:** 2026-09-22
- **Decided by:** user
- **Slice:** slice 2R (local rebuild)

## Context
With [0030](0030-local-only-single-device-no-sync.md) (local-only) and [0031](0031-no-backend-firebase-dropped.md) (no backend) the app needs a local store that can serve the existing repository contract: live subscriptions, instant month switching, and multi-record writes that apply atomically ([0028](0028-entry-write-api-with-atomic-delete-channel.md)). The data volume is small — a single person, roughly 500 entries per month worst case, so a decade is a few MB.

## Options
| Option | Pros | Cons |
|---|---|---|
| IndexedDB + full in-memory mirror | quota in the GB range; reads served from memory, so subscriptions and month switching stay instant and synchronous; batches are trivial to apply atomically in memory; no new dependency | asynchronous load at startup; ~150 lines of adapter; a second tab needs a notification channel |
| localStorage, one JSON blob | simplest, synchronous | ~5 MB per origin; the whole data set is re-serialised on every write; more fragile if a write is interrupted |
| A real file on disk (File System Access API) | survives clearing browser site data; the user owns the file | Chromium only; write permission must be re-confirmed per session; every write becomes a fallible file operation |

## Decision
Entries and preferences live in IndexedDB. At startup the app loads everything once into an in-memory state which is the authoritative source for all reads and subscriptions; every write mutates memory, notifies subscribers, and is persisted. If persistence fails, the in-memory change is rolled back and the write rejects.

The app additionally requests `navigator.storage.persist()` once, and works unchanged whether the request is granted or denied. One tab per profile is the supported case; a second tab is kept consistent by a change notification (BroadcastChannel) rather than by locking.

## Consequences
- The "live read" behaviour of slice 1 survives without a server: a write in the day detail updates the month view because both read the same in-memory state.
- Atomic multi-record writes ([0028](0028-entry-write-api-with-atomic-delete-channel.md)) become easy rather than a database feature.
- Startup pays one asynchronous load; the existing loading state covers it. The whole data set in memory is acceptable at this volume and would need revisiting only at a scale this app will not reach.
- Granted persistence exempts the data from automatic eviction under storage pressure, but **never** from the user clearing site data or deleting the browser profile. That residual risk is what the backup ([0037](0037-json-backup-with-replace-all-import.md)) exists for.
- Installing the app as a PWA ([0038](0038-installable-pwa-single-profile.md)) raises the chance that Chrome grants persistence.
- No new runtime dependency.

Sources: https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria , https://web.dev/articles/persistent-storage
