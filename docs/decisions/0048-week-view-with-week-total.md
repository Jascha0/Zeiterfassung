# 0048 — The app gains a week view with a week total

- **Status:** accepted
- **Date:** 2026-09-25
- **Decided by:** user
- **Slice:** raised after slice 2R-B, built after slice 2E

## Context
Same research round as [0047](0047-target-hours-and-overtime-balance.md). Clockodo, Toggl Track, Clockify and
Kimai all default to a **week**, not a month: a week is the unit a person plans in, and it is the unit in
which "I still owe two hours" is actionable. This app currently offers a timer for today
([0008](0008-timer-persists-start-timestamps.md)) and a month grid
([0026](0026-month-cell-content-and-live-month-total.md)) — nothing in between, so seeing one week's seven
days at once means counting cells in the month grid.

The user picked this as the second of the three features to add.

## Options
| Option | Pros | Cons |
|---|---|---|
| A week view of its own: Monday–Sunday with each day's work and break time, plus a week total | the seven relevant numbers on one screen; the natural place for the week balance of [0047](0047-target-hours-and-overtime-balance.md); reuses the existing day totals | one more route and one more navigation target ([0043](0043-route-set-of-the-local-app.md) has to be extended) |
| A week total as an extra line inside the month grid | no new view, no new route | the month grid is already dense; per-week lines in a Monday-first grid are cramped and answer less |
| Replace the month view with a week view | one primary view instead of two | the month total ([0026](0026-month-cell-content-and-live-month-total.md)) is what the user wants for documentation; removing it is a regression |

## Decision
A week view is in scope: Monday to Sunday of one week, each day with its work time (and break time), plus a
**week total**. Once [0047](0047-target-hours-and-overtime-balance.md) exists it also shows the week's
target and balance.

Its route, its place in the navigation and whether it becomes the app's default view are settled in that
slice's own architect round; [0043](0043-route-set-of-the-local-app.md) will be extended, not contradicted.

## Consequences
- The month grid, the day detail and the timer stay as they are. The week view is an additional read-only
  overview that navigates into the existing day detail for editing — no second editing surface.
- Week boundaries follow the existing convention: Monday first, local timezone, a midnight-crossing block
  counted on its start day ([0009](0009-midnight-crossing-entries-belong-to-start-day.md)).
- `src/domain/monthView.ts` has a sibling for weeks; the day totals it needs already exist
  ([0007](0007-entry-records-for-work-and-break.md)), so this slice is mostly view work.
- Built after [0047](0047-target-hours-and-overtime-balance.md), so the week balance is added once instead of
  the view being touched twice ([0052](0052-slice-order-after-the-local-rebuild.md)).
