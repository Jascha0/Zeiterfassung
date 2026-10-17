# 0040 — CSV is formatted for German Excel: `;`, UTF-8 with BOM, German dates, H:MM plus decimal hours with a comma

- **Status:** accepted
- **Date:** 2026-10-17
- **Decided by:** user (slice-4 question F2, option A)
- **Slice:** 4

## Context
The CSV should open correctly in the user's spreadsheet with a double-click. German Excel expects `;` as the separator and a decimal comma. It also only detects UTF-8 when a BOM is present.

## Options
| Option | Pros | Cons |
|---|---|---|
| German Excel: `;`, BOM, `TT.MM.JJJJ`, `HH:MM`, Dauer `H:MM` + Stunden `7,50` | Opens cleanly in German Excel; both readable and calculable durations | Less convenient for scripts and English tools |
| Same with only one duration column | Leaner | Either not calculable or less readable |
| International: `,`, ISO dates, decimal point | Script-friendly | German Excel shows everything in one column |

## Decision
- **Encoding and layout:**
  - UTF-8 with BOM (`﻿`);
  - separator `;`, line ending CRLF;
  - fields quoted per RFC 4180 when they contain `;`, `"`, CR or LF (`"` doubled).
- **Header row (German), exactly in this order:** `Datum;Typ;Beginn;Ende;Dauer;Stunden;Projekt;Notiz`.
- **Datum:** `dd.MM.yyyy` of the start.
- **Typ:** `Arbeit` / `Pause`.
- **Beginn:** `HH:mm`.
- **Ende:** `HH:mm`; if the end is on a later day than the start, `dd.MM.yyyy HH:mm`.
- **Dauer:** `H:MM`, floored ([0038](0038-export-duration-rounding.md)).
- **Stunden:** decimal hours, 2 places, decimal comma (`7,50`), rounded half-up ([0038](0038-export-duration-rounding.md)).
- **Projekt:** the project name; empty if there is none; `Unbekanntes Projekt` for a dangling id.
- **Notiz:** the note, empty if absent.

## Consequences
- Scripts must parse with `;` and a decimal comma.
- No formula neutralisation (the data is the user's own; see the slice-4 brief's risks).
- Changing the column set later is a new decision, because the user may build sheets on it.
