# 0023 — The running entry can be corrected in the day detail: its start is editable, and giving it an end closes it

- **Status:** accepted
- **Date:** 2026-09-18
- **Decided by:** user
- **Slice:** slice 2 (calendar + editing)

## Context
The most frequent real-world mistakes are "I actually started at 9:15, not 9:00" and "I forgot to end the day and only notice at 23:00". Slice 1 can do neither: the timer only opens and closes at the current instant ([0008](0008-timer-persists-start-timestamps.md)).

## Options
| Option | Pros | Cons |
|---|---|---|
| Start editable and an end may be set, which closes the entry | every correction is possible in one place | the day detail can change the timer's state, so both must be tested together |
| Only the start is editable; closing stays a timer action | clean separation of concerns | the forgotten-end case needs an awkward two-step workaround |
| Running entry not editable at all | least code | the most common correction is impossible |

## Decision
In the day detail the open entry's start can be changed, and an end can be entered, which closes the entry. Both values must satisfy the normal limits ([0024](0024-no-future-times-midnight-allowed.md)): not in the future, end after start. After closing, the timer shows "nicht gestartet"; the user can start again the same day as before.

## Consequences
All corrections live in one view, and the timer keeps its simple current-instant-only behaviour. The day detail now influences `deriveTimerStatus`, so the slice-1 timer tests must be re-run and the interaction covered: editing the running entry's start changes the live elapsed time, and closing it must leave the timer idle rather than in a stale running state.
