# 0033 — "Weiter" carries over the project of the block before the break; "Start" uses the project chosen while idle

- **Status:** accepted
- **Date:** 2026-10-16
- **Decided by:** user (slice-3 question F3, option A)
- **Slice:** 3

## Context
The timer creates a new work entry on Start and on Weiter. Which project should it get without asking each time?

## Options
| Option | Pros | Cons |
|---|---|---|
| Weiter carries over the previous work block's project (no note); Start uses the idle selection, else none | A break doesn't lose the project, a new day starts neutral | Needs the previous work block when planning |
| Always no project | Simplest | Re-pick after every break |
| Always the last used project | Fewest clicks | Wrong project on a new day is easy to miss |

## Decision
- **Weiter:** the new work block gets the `projectId` of the most recent work entry that ended where the break began. In practice this is the latest work entry with `start <` the break's start. If there is none, or it had no project, there is no project. The note is never carried over. If the carried-over project is archived by then, it is still carried over (no surprise loss).
- **Start (idle):** the new block gets the project selected in the timer's idle picker, if any. The idle selection is local UI state; it is not persisted and is reset to "Kein Projekt" after Start.
- `planTransition` stays pure and receives the needed data (the previous work block's project, the chosen project) as input.

## Consequences
The timer needs today's entries (it already subscribes them) or an explicit lookup to find the work block before the break. A break that started on the previous day (midnight crossing) still carries over, provided the data source covers it — the Planner must make sure it does.
