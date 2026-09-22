# 0040 — No dedicated resolution view: several open entries are cleaned up in the day detail, the timer only warns

- **Status:** accepted
- **Date:** 2026-09-22
- **Decided by:** user
- **Slice:** slice 2R (local rebuild)

## Context
[0022](0022-manual-resolution-of-multiple-open-entries.md) specified a separate view listing every open entry with a per-entry "set an end" or "delete" choice, submitted as one atomic batch. Its justification was explicit: offline use on two devices with last-write-wins ([0006](0006-offline-firestore-cache-last-write-wins.md)) could produce more than one entry with `end == null`.

That cause is gone. With a single local data source ([0030](0030-local-only-single-device-no-sync.md), [0033](0033-indexeddb-with-in-memory-mirror.md)) there is no concurrent device and no conflicting write, so the app can no longer create a second open entry. It can still *encounter* one — from slice-1 era data or from a restored backup ([0037](0037-json-backup-with-replace-all-import.md)) — so the situation must remain repairable, just not with its own screen.

## Options
| Option | Pros | Cons |
|---|---|---|
| Drop the view; keep the warning and repair in the day detail | saves a view, a route and a domain module; the day detail can already close, edit or delete an open entry ([0023](0023-running-entry-editable-start-and-end.md)) | repairing two open entries takes two visits if they fall on different days |
| Build the resolution view anyway (it is already specified as task 14) | one screen for a rare mess; batch semantics | a whole view for a state the app can no longer produce |
| Resolve automatically (close or delete the older ones) | no UI at all | invents or destroys recorded time without the user deciding — rejected already in 0022 and still wrong |

## Decision
There is no `OpenEntriesResolutionView`, no `#/offene-eintraege` route and no `openEntryResolution` domain module. The timer keeps its warning that more than one entry is open, as a safety net, and links to the **day detail** of the affected day instead of a resolution view. There the user closes, corrects or deletes the entry with the existing per-entry actions and the existing delete confirmation. Nothing is ever closed or deleted automatically.

## Consequences
- Supersedes [0022](0022-manual-resolution-of-multiple-open-entries.md), and with it the slice-2 acceptance criteria and UI strings about the resolution view (`Offene Einträge bereinigen`, the per-entry `Ende setzen` / `Löschen` list, and the failed-batch criterion that used it).
- The atomic batch of [0028](0028-entry-write-api-with-atomic-delete-channel.md) stays: "end the break and start work" is still one change that must apply completely or not at all. Only the resolution view's use of it disappears.
- The user-decides principle is preserved: no automatic cleanup of recorded time.
- If a restored backup ever produces several open entries, the repair path is a warning plus the day detail; if that ever proves too clumsy in practice, a resolution screen can be added back as a new decision.
