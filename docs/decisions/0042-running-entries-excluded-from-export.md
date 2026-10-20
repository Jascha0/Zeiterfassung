# 0042 — Running (open) entries are excluded from both exports, with a visible hint

- **Status:** accepted
- **Date:** 2026-10-17
- **Decided by:** user (slice-4 question F4, option A)
- **Slice:** 4

## Context
The current month may contain an open entry (`end: null`) at export time. The calendar counts it live up to `now`.

## Options
| Option | Pros | Cons |
|---|---|---|
| Exclude open entries and show a hint | The export contains only final, stored times | Totals may briefly differ from the calendar |
| Include them with the export time as the end, marked "läuft" | Totals match the calendar | The file shows an end time that is not stored |

## Decision
Entries with `end === null` are left out of the CSV and the PDF, and so are not counted in any export total. If the displayed month contains at least one, the export area shows a status text: `1 laufender Eintrag ist nicht enthalten.` (plural: `N laufende Einträge sind nicht enthalten.`). The PDF itself carries no such note.

## Consequences
- Export totals equal `monthWorkTotals` computed over the **closed** entries only. Tests compare against that, not against the live calendar value.
- To have today's open block in the file, the user ends it first.
