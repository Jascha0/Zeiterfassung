# 0037 — Backup is a versioned JSON export of everything, restored by a replace-all import

- **Status:** accepted
- **Date:** 2026-09-22
- **Decided by:** user
- **Slice:** slice 2E (export/import backup)

## Context
Local-only storage ([0030](0030-local-only-single-device-no-sync.md), [0033](0033-indexeddb-with-in-memory-mirror.md)) makes one browser profile a single point of failure: clearing site data, deleting the profile or reinstalling the browser destroys everything, and persistent storage does not protect against a user-initiated wipe. This is why the user asked for the export to be brought forward, ahead of projects and the reporting export.

An export alone is not a backup — without a restore path the file only helps someone willing to retype the data. The planned monthly CSV and PDF ([0015](0015-projects-and-export-detail.md)) are a *documentation* output and lossy by design, so they cannot serve as the backup either.

## Options
| Option | Pros | Cons |
|---|---|---|
| Versioned JSON of all data + replace-all import | a genuine backup: complete, machine-readable, restorable; one file; feasible in one slice | the file is not meant for human reading; restore overwrites |
| Export only, no import | least work | not a backup; fails exactly the scenario that motivated it |
| Import with merge | could combine two machines' data | needs a conflict and duplicate-detection rule — the complexity local-only just removed |
| CSV as the backup format | readable in Excel | lossy (ids, timestamps, preferences), so a faithful restore is impossible |

## Decision
Export writes one JSON file containing a format version, an export timestamp, all entries with their full fields and ids, and the preferences — named e.g. `zeiterfassung-backup-2026-09-22.json`, downloaded by a single action.

Import reads such a file, validates it against the format version and the expected shape, shows a preview (backup date and entry count) and, only after an explicit confirmation naming what is lost, **replaces** the entire local data set. There is no merge. A malformed or wrong-version file is rejected with a German message and changes nothing.

CSV and the PDF month report stay in slice 4 as documentation output. There is no automatic backup reminder in the first version.

## Consequences
- The user's data becomes durable in a way the browser cannot take away, at the price of remembering to export — an accepted trade-off for the first version, with a "last backup was long ago" hint possible later.
- The format version is introduced now, so future schema changes (`projectId`, `note` from slice 3) can be read or explicitly refused rather than silently misinterpreted.
- Replace-all import is destructive and irreversible: it is the single most dangerous action in the app and needs the strongest confirmation in the UI, with the entry count of both the current data and the file shown.
- An import can in principle introduce data the app's own validation would reject (overlaps, several open entries). The app must stay usable in that case — the existing markers and the day detail are the repair path ([0040](0040-open-entries-resolved-in-the-day-detail.md)).
- Because the file contains everything unencrypted, it is as sensitive as the data itself; where the user stores it is their decision, and the README must say so.
