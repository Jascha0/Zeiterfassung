# 0025 — Time input on DST days: non-existent local times are rejected, ambiguous times mean the first occurrence

- **Status:** accepted
- **Date:** 2026-10-16
- **Decided by:** architect (brief audit non-blocking finding 4)
- **Slice:** 2

## Context
The day detail form takes a date plus "HH:MM" in local time (0010). On the spring-forward day (e.g. 2026-03-29 in Europe/Berlin), 02:00–02:59 does not exist. JavaScript/date-fns silently shift such a time to 03:xx. On the fall-back day (2026-10-25), 02:00–02:59 occurs twice.

## Options
| Option | Pros | Cons |
|---|---|---|
| Reject non-existent times with a German message; ambiguous times = first occurrence (summer time) | Conservative, never stores a time the user did not type | The second 02:xx on fall-back day cannot be typed in by hand |
| Silently map to the shifted time (03:30) | No error | Stores a different time than typed, hidden surprise |
| Offer a choice for ambiguous times | Complete | Extra UI for one hour per year |

## Decision
- Converting date + "HH:MM" into an instant: if the resulting local time does not equal the typed time, reject the input with "Diese Uhrzeit gibt es am <TT.MM.JJJJ> wegen der Zeitumstellung nicht." Example: 02:30 on 2026-03-29.
- Ambiguous times (02:00–02:59 on the fall-back day) resolve to the first occurrence (CEST, UTC+2). That is the JS `Date` local-constructor default.
- Stored instants are never re-interpreted. An entry the timer recorded in the second 02:xx hour displays correctly, and keeps its value as long as the user does not change that field (brief Req 9).

## Consequences
The conversion lives in the pure domain module and is unit-tested with `TZ=Europe/Berlin` on 2026-03-29 and 2026-10-25.
