# 0039 — Export lives in the calendar and exports the displayed month

- **Status:** accepted
- **Date:** 2026-10-17
- **Decided by:** user (slice-4 question F1, option A)
- **Slice:** 4

## Context
The user needs a month selection and a place to trigger the export. The main nav already has four buttons, which is tight at 320 px ([0035](0035-projects-main-nav-item.md)). The calendar already has month navigation.

## Options
| Option | Pros | Cons |
|---|---|---|
| Export controls in the calendar, for the displayed month | Reuses the existing month navigation and month subscription; nav unchanged | Less prominent than its own nav item |
| Own nav item "Export" with its own month picker | Easy to find | Five nav buttons at 320 px; duplicates the month selection |
| Under "Konto" with its own month picker | Nav unchanged | Hidden; duplicates the month selection |

## Decision
The calendar view gets an export area ("Exportieren") with the actions "CSV exportieren" and "PDF exportieren". Both export the month the calendar is currently showing. Month selection is the existing Vorheriger Monat / Heute / Nächster Monat navigation. The main nav stays Timer · Kalender · Projekte · Konto.

## Consequences
- No new view and no nav change.
- The calendar needs the user's e-mail for the PDF header ([0041](0041-pdf-month-report-content.md)), so it must receive it from `App.tsx`.
- Future months can be selected too; they are usually empty and show the empty-month message.
