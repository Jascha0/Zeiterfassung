# 0010 — Times are absolute instants taken from the client clock and displayed in the device's local timezone

- **Status:** accepted
- **Date:** 2026-09-16
- **Decided by:** architect
- **Slice:** slice 1 (foundation, auth, timer)

## Context
Timer actions must work offline, so no server round-trip can be required to obtain a time. DST changes must not corrupt durations.

## Options
| Option | Pros | Cons |
|---|---|---|
| Client clock, stored as absolute instants (UTC-based `Timestamp`) | works offline, durations are DST-safe, display adapts to the device timezone | wrong device clocks produce wrong data |
| `serverTimestamp()` | authoritative, immune to clock skew | resolves only when online — unusable offline, and the value is null until acknowledged |
| Local wall-clock strings | reads naturally | ambiguous on DST changes, arithmetic error-prone |

## Decision
The client supplies all instants as epoch milliseconds, stored as Firestore `Timestamp`. The domain works in epoch milliseconds; the UI formats into local time, 24 h, Monday as first weekday, German locale.

## Consequences
Offline correctness and DST-safe durations. Skew between devices is accepted and unmitigated: a phone with a wrong clock writes wrong times. Travelling across timezones re-labels historic entries in the new local time (their instants are unchanged).
