# 0056 — Import validation is strict and all-or-nothing: one unreadable record refuses the whole file

- **Status:** accepted
- **Date:** 2026-09-25
- **Decided by:** architect
- **Slice:** slice 2E (backup)

## Context
[0037](0037-json-backup-with-replace-all-import.md) says a malformed or wrong-version file is rejected with a
German message and changes nothing. It does not say what "malformed" means in the awkward middle cases, and the
codebase already contains a precedent that points the *other* way: `parseStoredEntry`
(`src/data/entryMapping.ts:37`) returns `null` for a bad record and the load path **skips** it
(`indexedDbAdapter.ts:49-53`), deliberately, so one corrupt record cannot cost the user their whole database.

Import is the mirror image of that situation. On load, skipping is strictly better than failing, because the
alternative is an app that will not start. On import, skipping means *replacing* a complete data set with a
knowingly incomplete one — and the user is told "imported" while entries silently vanished.

## Options
| Option | Pros | Cons |
|---|---|---|
| Strict: any structural defect refuses the entire file, nothing is touched | the user's current data survives a bad file; "imported" always means "completely imported"; the error is visible while the file is still available to inspect | a file with one broken record cannot be restored at all, even though 99 % of it is readable |
| Lenient, like the load path: skip bad records, import the rest | a partially damaged backup still gets most of the data back | a silent partial restore over a complete data set, which is the failure mode a backup is supposed to prevent; "how many did we lose?" is unanswerable afterwards |
| Lenient with a count in the confirmation ("3 of 412 records are unreadable and will be lost") | informed consent, best of both | more UI, more strings and a decision the user must make under pressure about data they cannot see; and it only helps in a case that should not occur, since the app wrote the file itself |

## Decision
Strict. A file is accepted only if **all** of the following hold:

- it parses as JSON and is an object;
- it carries the app marker this app writes (so a JSON file from some other tool cannot pass);
- its `formatVersion` is one this version knows how to read — today exactly `1`
  (`STORE_FORMAT_VERSION`, `src/data/persistence.ts:5`);
- its `exportedAt` is a finite number;
- `entries` is an array in which **every** element passes the same structural check the store uses
  (`parseStoredEntry`), and all ids are unique;
- `preferences` is either absent/`null` or a valid preferences object.

Anything else is refused: no entry is written, no current entry is deleted, and the user gets a German message
that distinguishes the two cases they can act on — *wrong version* (naming the file's version and the expected
one) versus *not a valid backup*. An `entries` array that is legitimately **empty** is accepted: a backup of an
empty app is a valid backup, and the confirmation still names what will be deleted.

A **newer** `formatVersion` is refused, never guessed at. Reading older versions is the job of whichever later
slice raises the version (first candidate: [0047](0047-target-hours-and-overtime-balance.md), which extends
`Preferences`), and that slice owns the migration.

## Consequences
- The load path stays lenient and the import path is strict. They look inconsistent and are not: the asymmetry
  is that a skipped record on load costs nothing that is not already lost, while a skipped record on import
  costs data that still exists. This reasoning is recorded here so it is not "harmonised" by a later refactor.
- Both paths share `parseStoredEntry`, so the definition of a valid entry exists once.
- The version check is the mechanism that makes a future schema change safe: after
  [0047](0047-target-hours-and-overtime-balance.md) or [0015](0015-projects-and-export-detail.md) raise the
  version, an old build refuses a new file instead of silently dropping the fields it does not understand.
- Validation is a pure function over a string, so every rejection case is a cheap unit test: not JSON, wrong
  app marker, version 0, version 2, a missing field, a wrong type, a duplicate id, an empty array. No browser
  is needed for any of them.
- A hand-edited backup will usually be refused. That is intended; the file is a machine format
  ([0037](0037-json-backup-with-replace-all-import.md)), and the repair path is the app, not a text editor.
