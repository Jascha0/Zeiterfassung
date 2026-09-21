# 0009 — An entry that crosses midnight is attributed entirely to the day it started

- **Status:** accepted
- **Date:** 2026-09-16
- **Decided by:** architect
- **Slice:** slice 1 (foundation, auth, timer)

## Context
A work block from 22:00 to 02:00 belongs to two calendar days. Day and month totals need one unambiguous rule.

## Options
| Option | Pros | Cons |
|---|---|---|
| Attribute the whole entry to its start day | one document, simple queries (`start` within the day), matches "my shift" intuition | a day total can exceed 24 h; month boundaries can pull hours from the neighbouring month |
| Split at midnight into two entries | totals per calendar day are exact | writes two documents, editing one half is confusing, splitting must be redone when times change |
| Store both and compute overlap per day | exact without splitting | every total needs interval clipping; more complex queries |

## Decision
An entry belongs to the day of its `start`. Day and month queries filter on `start` only; the full duration counts on that day.

## Consequences
Keeps queries to a single range filter on `start` and keeps editing intuitive. Night shifts show their whole duration on the start day, and the last day of a month may include hours worked after midnight. Revisit only if real night work makes the totals misleading.
