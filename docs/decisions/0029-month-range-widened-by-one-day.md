# 0029 — The month subscription loads one extra day before and after the month; overlap checks and markers run against that widened set

- **Status:** accepted
- **Date:** 2026-09-18
- **Decided by:** architect
- **Slice:** slice 2 (calendar + editing)

## Context
`subscribeEntriesInRange` filters on `start` only. Because an entry may cross midnight ([0009](0009-midnight-crossing-entries-belong-to-start-day.md)), a *closed* block that started on the last day of the previous month and ended after midnight is outside a plain month query. On the 1st of a month, the overlap validation of [0021](0021-free-form-day-editing-no-overlaps.md) and the overlap marker of [0026](0026-month-cell-content-and-live-month-total.md) would therefore be blind: a manual entry overlapping that night shift would be accepted and written. The mirror case exists at the end of a month, where a 22:00–02:00 block can overlap an entry starting on the 1st of the next month.

## Options
| Option | Pros | Cons |
|---|---|---|
| Widen the queried range by one day at each end, filter for display | still a single range query; both boundary cases covered; the overlap check always sees its neighbours | the loaded set is not identical to the displayed set, so display must filter explicitly |
| A second, separate query for the boundary days | display set stays clean | two subscriptions per month, more lifecycle and more places to get wrong |
| Accept the blindness | no work | validation silently fails exactly at month boundaries, while unit tests on a mid-month day pass |

## Decision
The month view subscribes to `[startOfDay(firstOfMonth − 1 day), startOfDay(lastOfMonth + 2 days))`, i.e. the month plus one day on each side. Grid cells, per-day totals and the month total are computed from entries whose `start` falls inside the month itself; the overlap check and the overlap marker for a given day run against the widened set (the day itself plus its immediate neighbours). Because the neighbouring days of the grid belong to the adjacent months, they are displayed without a time, unchanged.

## Consequences
Overlap detection and marking behave identically on the 1st, on the last day and in the middle of a month. It remains one range query per visible month — the non-functional wording is "one query per visible month, range widened by one day at each end", not "exactly the month". Two derived sets now exist (loaded vs. displayed) and must not be confused; that distinction belongs in the pure `monthView` module, where it is unit-testable, and specifically needs a test at both month boundaries.
