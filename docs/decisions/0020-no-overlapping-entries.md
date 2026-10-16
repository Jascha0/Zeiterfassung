# 0020 — No two entries of a user may overlap in time, regardless of type

- **Status:** accepted
- **Date:** 2026-10-16
- **Decided by:** architect; accepted by user with brief, 2026-10-16
- **Slice:** 2

## Context
The brief requires "no overlaps" when adding/editing entries in the day detail. It did not say whether a break may lie inside a work block. The timer (slice 1) already produces a strictly sequential chain: pause closes the work block and opens a break at the same instant.

## Options
| Option | Pros | Cons |
|---|---|---|
| Work and break entries form one sequential timeline; no entry overlaps any other | Matches the timer model; net time = sum of work entries stays correct | A break "inside" a block must be entered by splitting the block |
| Breaks may lie inside work blocks and are subtracted | Natural for retro entry | Changes the totals formula (net = work − contained breaks), contradicts slice-1 totals |
| Only same-type entries must not overlap | Lenient | Same double-counting problem |

## Decision
Every pair of entries (work or break) must be disjoint. Intervals are half-open `[start, end)`: touching boundaries (`a.end == b.start`) are allowed. An open entry counts as extending to `now`. The check covers entries that started on the previous day and run into the edited day (0009), and entries on the following day the edited entry runs into.

## Consequences
Net work time stays "sum of work entries" (slice-1 `dailyTotals` unchanged). Users who want to add a break into an existing block shorten the block, add the break, and add a second block. No auto-adjustment of neighbours (0023).
