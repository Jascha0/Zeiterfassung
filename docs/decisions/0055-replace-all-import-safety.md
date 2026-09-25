# 0055 — The import's confirmation dialog *is* the preview, and an automatic pre-import backup must succeed before anything is replaced

- **Status:** accepted
- **Date:** 2026-09-25
- **Decided by:** architect
- **Slice:** slice 2E (backup)

## Context
The replace-all import is the first genuinely destructive action in this app, and the most destructive one it
will ever have: it deletes every entry the user has. There is no undo, no trash, no second copy — that is the
whole reason the backup exists ([0030](0030-local-only-single-device-no-sync.md),
[0037](0037-json-backup-with-replace-all-import.md)). The realistic accident is not a malicious file; it is a
user with two backup files who picks the older one, or who wanted to *export* and clicked the other button.

[0037](0037-json-backup-with-replace-all-import.md) already requires a preview (backup date, entry count) and
an explicit confirmation naming what is lost. What it left open is *how strong* that is, and whether the app
should protect the user against their own confirmation.

The project already has the right component: `ConfirmDialog` (`src/components/ConfirmDialog.tsx`) takes a
title, a list of lines, a confirm label and a cancel label, traps focus, focuses the confirm button and closes
on Escape. Its `lines` prop can carry the whole preview, so preview and confirmation need not be two screens.

## Options
| Option | Pros | Cons |
|---|---|---|
| Preview rendered as the dialog's lines + an automatic export of the current data that **must succeed** before the replace begins (skipped only when there is nothing to lose) | one screen, one decision point; the numbers the user needs are in the sentence they are confirming; a recovery file exists even after a wrong confirmation; reuses the export path, so it costs almost nothing | a file lands in the download folder without being asked for — it must be announced in the dialog; the import can fail for a reason that is not the import's fault (a blocked download) |
| Preview + confirmation only, no automatic backup | simplest; nothing unexpected happens | a single wrong click destroys everything irreversibly, and the app knew how to prevent it |
| Keep a pre-import copy inside IndexedDB with a restore action | no file in the download folder; an in-app undo | doubles the stored data, needs a schema change, a second UI and undo semantics — a slice of its own, and it still dies with the browser profile, which is the risk the backup exists for |
| Require a manual export first (disable the import until the user has exported in this session) | forces the habit | false safety: the export may be of the wrong data, and it blocks the legitimate "fresh profile, restore my file" case |
| Two-step typed confirmation (type `ERSETZEN`) | very hard to do by accident | ceremony the user would resent, and it protects against misclicks, not against the realistic error of choosing the wrong file — which the preview numbers do protect against |

## Decision
The import runs as: **pick a file → validate it ([0056](0056-strict-all-or-nothing-import-validation.md)) →
confirmation dialog whose lines are the preview → automatic pre-import backup → replace.**

The dialog's lines must state, in German and from the actual data:
- the name of the chosen file,
- the date and time the file was created (from its `exportedAt`),
- how many entries the file contains,
- how many entries are in the app **now** and will be deleted,
- that this cannot be undone,
- that a backup of the current data is downloaded automatically first.

The confirm button is labelled with the destructive verb (`Ersetzen`), not `OK`; cancel is `Abbrechen` and
changes nothing. Escape cancels.

On confirmation, the app first writes a pre-import backup file of the current data through the same export
path, with a filename that distinguishes it from a manual backup. **If that file cannot be produced, the import
is aborted and nothing is replaced**, with a German message saying so. The step is skipped only when the store
currently holds no entries and no preferences — there is nothing to lose and nothing to write.

While the replace is running, the confirm action is disabled (which also keeps 2R-A finding 5 out of reach,
[0054](0054-src-data-freeze-ends-and-finding-3-is-fixed.md)).

## Consequences
- After a wrong confirmation the user still has a file with their previous data, and the dialog told them it
  exists. Recovery is importing that file.
- Aborting the import when the safety backup fails is the deliberate choice of "refuse rather than proceed
  unprotected". It is also what makes the promise testable: the download seam
  ([0058](0058-download-seam-and-file-input.md)) can be made to fail, and the test asserts the adapter's data is
  untouched.
- Two files can appear in the download folder for one import (the safety file, then nothing else) — the reason
  is stated in the dialog, and the filename says what it is.
- The preview cannot warn about *content* problems beyond counts and dates; an imported data set may contain
  overlaps or several open entries. That stays acceptable because the markers and the day detail are the repair
  path ([0037](0037-json-backup-with-replace-all-import.md),
  [0040](0040-open-entries-resolved-in-the-day-detail.md)).
- `ConfirmDialog` is reused unchanged, so focus trapping, Escape and the button order come for free and the
  slice adds no dialog code. Its `lines` are keyed by their text, so the preview lines must be distinct
  strings.
- The user may drop the automatic pre-import backup with one sentence if it annoys them; it is the architect's
  judgement, not their instruction.
