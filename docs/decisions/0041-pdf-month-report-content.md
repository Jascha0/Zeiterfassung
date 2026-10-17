# 0041 — PDF monthly report: header with month, e-mail and creation date; one row per day; month totals incl. per project; no notes; A4 portrait

- **Status:** accepted
- **Date:** 2026-10-17
- **Decided by:** user (slice-4 question F3, option A)
- **Slice:** 4

## Context
[0015](0015-projects-and-export-scope.md) asks for a PDF monthly report with per-day work, break and projects plus a month total. The open points were the header, the level of detail and whether notes go in.

## Options
| Option | Pros | Cons |
|---|---|---|
| Header (month, e-mail, created) + one row per day + month totals incl. per project; no notes | Compact, usually one page | No per-entry detail |
| Same plus every single entry with notes | Complete | Multi-page |
| Same as the first, without the e-mail | More private when passed on | Doesn't say whose report it is |

## Decision
- **Page:** A4 portrait.
- **Header:**
  - title `Arbeitszeitbericht <Monat Jahr>` (German month name);
  - the account e-mail (omitted if the account has none);
  - `Erstellt am dd.MM.yyyy HH:mm`.
- **Day table:** one row per day that has exported entries, in date order. Columns:
  - Datum (`EE dd.MM.yyyy`, e.g. "Mo 06.10.2026");
  - Arbeit (`H:MM`);
  - Pause (`H:MM`);
  - Projekte: work per project group as `Name H:MM`, comma-separated, ordered like `projectDayTotals`. The groups are "Ohne Projekt", "Unbekanntes Projekt" and archived projects marked "(archiviert)".
- **Month totals:** Arbeit gesamt, Pause gesamt, and Arbeit je Projekt (same grouping and order).
- Days without entries are omitted. Notes are never included.
- Durations follow [0038](0038-export-duration-rounding.md).

## Consequences
- Usually one page; the table must page-break cleanly if it is longer.
- The e-mail appears in the file, so whoever receives the PDF sees it.
- Per-entry detail stays in the CSV.
