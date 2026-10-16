# 0010 — Timestamps are absolute instants from the client clock, displayed in device local time

- **Status:** accepted
- **Date:** 2026-09-16
- **Decided by:** architect
- **Slice:** 1 (migrated from brief D10)

## Context
Writes must work offline; days and DST must be handled correctly.

## Options
| Option | Pros | Cons |
|---|---|---|
| Client-clock instants | Works offline, DST-safe | Clock skew between devices |
| Server timestamps | Authoritative time | Unknown until synced; breaks offline UX |

## Decision
Store absolute instants (Firestore Timestamp, ms in the domain) taken from the client clock; display and day boundaries in the device's local timezone (24 h format).

## Consequences
Clock skew between devices accepted; domain clamps negative durations to 0.
