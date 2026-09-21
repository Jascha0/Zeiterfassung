# 0013 — No target hours or overtime balance in v1

- **Status:** accepted
- **Date:** 2026-09-16
- **Decided by:** user
- **Slice:** slice 1 (foundation, auth, timer)

## Context
Many time trackers compare actual time against a target per day or week and carry an overtime balance. That requires target configuration, holiday and absence handling, and a carry-over rule.

## Options
| Option | Pros | Cons |
|---|---|---|
| Actual time only | simple data model, no calendars of holidays or absences | no "am I ahead or behind?" answer |
| Targets + overtime balance in v1 | the number the user really cares about long-term | needs targets, absence types, holidays, carry-over — a slice of its own |

## Decision
v1 records and reports actual time only. Target hours, overtime balance, absences and holidays are out of scope.

## Consequences
Keeps the data model to entries plus settings. Adding targets later is additive (a settings document and derived comparisons) and needs no migration of existing entries.
