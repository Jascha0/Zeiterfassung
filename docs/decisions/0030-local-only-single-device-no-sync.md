# 0030 — All data lives only on the device the app runs on; there is no sync and no conflict resolution

- **Status:** accepted
- **Date:** 2026-09-22
- **Decided by:** user
- **Slice:** slice 2R (local rebuild)

## Context
After slice 1 shipped and most of slice 2 was built, the user realised the app only ever needs to run **locally**: "es würde reichen wenn die app nur lokal läuft". Cross-device use (start on the phone, continue on the PC) — the sole reason for [0002](0002-single-user-cloud-sync.md) — is not wanted.

This is checked against reality: no Firebase project was ever created, so **no real user data exists anywhere**. Migration is therefore a non-issue; the change costs code, not data.

The user also chose to rebuild **now**, before finishing slice 2, rather than finishing slice 2 against a backend that is about to be removed.

## Options
| Option | Pros | Cons |
|---|---|---|
| Local-only on one device, no sync | no backend, no accounts, no privacy exposure, no conflict handling, no running cost, much less code | data lives in one browser profile; loss of that profile loses everything unless exported; no phone use |
| Keep cloud sync (status quo, [0002](0002-single-user-cloud-sync.md)) | phone + PC, off-device durability | needs auth, backend, rules, offline cache, conflict rules — all of which the user does not want |
| Local-first with optional later sync | keeps the door open | pays the full abstraction cost now for a capability the user has ruled out |

## Decision
The app is a local single-device application. All entries and preferences live in local storage on the machine the app runs in; nothing is sent anywhere. There is no sync, no "other device", no last-write-wins conflict resolution, and no offline/online distinction — the app is always "offline" in the old sense and always fully functional.

Durability is provided by an explicit user-triggered backup (export/import), not by a server.

## Consequences
- Supersedes [0002](0002-single-user-cloud-sync.md) (cloud sync) and [0006](0006-offline-firestore-cache-last-write-wins.md) (Firestore offline cache, last-write-wins): there is only one copy of the data, so conflicts cannot arise and no cache metadata exists.
- Forces a backup mechanism into the near term (see the export/import decision), because one browser profile is a single point of failure: clearing site data, deleting the profile or reinstalling the browser destroys the data.
- Removes the need for a backend ([0031](0031-no-backend-firebase-dropped.md)) and for authentication ([0032](0032-no-authentication-no-accounts.md)).
- Anyone with access to the unlocked machine and that browser profile can read the data; protection is the operating-system account, not the app.
- Phone use is gone. Reintroducing multi-device later means a new sync design, not a migration — and would be a new decision.
- The online indicator, the "possibly incomplete month" notice and the multi-device duplicate-open-entry scenario all lose their reason to exist.
