# 0038 — The app stays an installable PWA, and exactly one browser profile is its home

- **Status:** accepted
- **Date:** 2026-09-22
- **Decided by:** user
- **Slice:** slice 2R (local rebuild)

## Context
[0001](0001-web-app-pwa.md) chose a PWA mainly for cross-device use, which [0030](0030-local-only-single-device-no-sync.md) has cancelled. So the question had to be asked again: does the service worker and the installability still earn their keep for a local app, and must the app work in more than one browser profile?

## Options
| Option | Pros | Cons |
|---|---|---|
| Keep it installable, one profile is home, backup file bridges anything else | own window and icon, starts like an app, works with no network at all, and being installed makes Chrome more likely to grant persistent storage — so it directly improves data durability | still a browser-hosted app; the data lives in that profile's storage |
| Drop the service worker and PWA manifest | slightly less machinery | no app window, no icon, worse odds of persistent storage |
| Wrap it as a desktop app (Tauri/Electron) later | data in a normal file, fully browser-independent | a new stack, new build and distribution; not justified now |

## Decision
The app remains a PWA (`vite-plugin-pwa`), installable on the machine it is used on. Exactly one browser profile is the supported home for the data; running it in a second profile or browser would be a second, separate data set, and the app does not pretend otherwise. Moving to another profile or machine happens through export and import ([0037](0037-json-backup-with-replace-all-import.md)). Firebase Hosting is gone ([0031](0031-no-backend-firebase-dropped.md)); the app is served locally.

## Consequences
- The offline capability of the app shell keeps its meaning (the app works with no network), while the *data* offline problem disappears entirely.
- Installability is now a durability argument, not just comfort: it feeds the persistence heuristic behind [0033](0033-indexeddb-with-in-memory-mirror.md).
- Multi-profile or multi-machine use is explicitly unsupported; nothing in the UI suggests sync, and the README states where the data lives.
- A Tauri/Electron wrapper stays a clean future option because nothing in the app depends on a browser feature beyond IndexedDB and file download/upload.
- A service worker still means an update can be served from cache; the app must not accumulate update-notification complexity beyond what slice 1 already has.
