# 0046 — The settings view states in plain German that the data lives only in this browser, until the backup exists

- **Status:** superseded by [0057](0057-backup-section-in-the-settings-view.md)
- **Date:** 2026-09-24
- **Decided by:** architect
- **Slice:** slice 2R-B (the shell)

## Context
[0030](0030-local-only-single-device-no-sync.md) and [0038](0038-installable-pwa-single-profile.md) make one
browser profile the only home of the user's time entries, and the backup that would make them portable
([0037](0037-json-backup-with-replace-all-import.md)) is one slice away. The README will say so (criterion
B14), but the user of this app is the person who asked "I don't even know which direction we are moving in" —
orientation belongs where they are, not only in a file they have to open in an editor. The settings view
otherwise contains a single radio group and is the natural home for it.

## Options
| Option | Pros | Cons |
|---|---|---|
| A permanent, static notice in the settings view | visible where the user looks for app facts; no state, no dismissal logic; one fixed string to test | it is one more thing on screen that the backup slice will have to rewrite |
| README only | zero UI surface | the warning reaches nobody who just uses the app, which is precisely the person who can lose the data |
| A dismissible banner on the timer | maximum visibility | it interrupts the main screen every session, needs persisted dismissal state, and nags about something the user cannot yet act on |

## Decision
The settings view shows one static paragraph below the theme block, verbatim:

> `Alle Daten liegen nur in diesem Browser auf diesem Gerät. Wenn du die Browserdaten löschst, sind sie weg. Eine Sicherung als Datei folgt im nächsten Schritt.`

No dismiss button, no link, no stored state. It is a plain paragraph, not an `alert` or `status` role.

## Consequences
- The settings view has exactly two things in it: the theme choice and this notice.
- Slice 2E replaces the last sentence when export and import exist, and that replacement needs a new decision
  file superseding this one (the wording is a commitment, not a placeholder to be edited quietly).
- One more fixed string the Coder must reproduce verbatim and a test can assert.
- It does not remove the underlying risk — the remedy is 2E, which must not slip.
