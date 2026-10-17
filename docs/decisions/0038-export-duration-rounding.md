# 0038 — Export durations are computed exactly and shown floored to whole minutes; totals add up the exact milliseconds

- **Status:** accepted
- **Date:** 2026-10-17
- **Decided by:** architect
- **Slice:** 4

## Context
Timer entries carry seconds and milliseconds. The app shows durations with `formatHoursMinutes` (floored minutes). The calendar's month total adds up exact milliseconds and floors only at display. An export shows both entry rows and totals, so there has to be a rounding rule.

## Options
| Option | Pros | Cons |
|---|---|---|
| Exact ms everywhere, floor only when displaying; totals = floor(sum of exact ms) | Totals equal the calendar and the day detail exactly | The displayed rows can add up to up to (n−1) minutes less than the displayed total |
| Round every entry to whole minutes first, total = sum of the rounded rows | Rows add up visibly | Totals differ from the calendar; it changes the meaning of the data |
| Show seconds | No mismatch | Noisy, unusual for timesheets |

## Decision
- Durations are `entryDurationMs` ([totals.ts](../../src/domain/totals.ts)).
- Wherever H:MM is shown, it is floored to minutes, exactly like `formatHoursMinutes`.
- Decimal hours, if shown, are the exact ms / 3 600 000, rounded half-up to 2 decimals.
- Every total (per day, per project, per month) is computed from the sum of exact milliseconds, never from rounded rows. So the export's month work total always equals the calendar's "Monat gesamt" for the same data.

## Consequences
- A tester must not expect rows to add up to the total minute for minute. The tests assert equality with `monthWorkTotals` and `dailyTotals` instead.
- If the user wants invoice-style rounding (e.g. to 15 minutes), that is a new decision.
