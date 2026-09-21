# 0026 — A month cell shows net work time plus a marker for problematic days; the month total includes the running entry live

- **Status:** accepted
- **Date:** 2026-09-18
- **Decided by:** user
- **Slice:** slice 2 (calendar + editing)

## Context
The month view is the entry point for reviewing and correcting time. It must stay readable on a phone, yet make days that need attention findable without opening each one — especially days damaged by the anomalies the sync model permits ([0006](0006-offline-firestore-cache-last-write-wins.md)) or by an entry that was never closed.

## Options
| Option | Pros | Cons |
|---|---|---|
| Net work time per day only | cleanest, most compact | a forgotten open entry or an overlap is only found by chance |
| Net work time plus a marker on problematic days | broken days are visible at a glance; still one number per cell | markers must be derived for the whole month |
| Additionally break time per day | most complete | two numbers per cell becomes cramped on a phone |

## Decision
Each cell shows the day's net work time (nothing for days without entries), with today highlighted and neighbouring-month days visually distinct. A small marker flags a day that contains an open entry, a block longer than 12 h, or overlapping entries (data predating [0021](0021-free-form-day-editing-no-overlaps.md)). The month header shows the month's net total, and both the day cell of today and the month total include the currently running entry's elapsed time live, exactly as the timer does.

## Consequences
The user can spot and fix damaged days from the month view; the markers are the only place where pre-existing overlaps become discoverable. Marker derivation is pure and computed from the month's already-loaded entries, so it costs no extra reads. Because totals tick, the month view needs the same "now" source as the timer, which makes it dependent on fake timers in tests. Break time per day is only shown in the day detail.
