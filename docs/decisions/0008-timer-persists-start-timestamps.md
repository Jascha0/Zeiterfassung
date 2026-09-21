# 0008 — The running timer is persisted as a start timestamp; elapsed time is computed at render

- **Status:** accepted
- **Date:** 2026-09-16
- **Decided by:** architect
- **Slice:** slice 1 (foundation, auth, timer)

## Context
The timer must survive reloads and app closes and show the same running state on another device.

## Options
| Option | Pros | Cons |
|---|---|---|
| Persist the start instant, compute `now - start` when rendering | survives reload and process death, identical on every device, no drift | depends on each device's clock |
| Persist a ticking counter | independent of clock skew | needs constant writes, drifts, breaks when the app is closed |

## Decision
Opening a work block or break writes an entry with `start` and `end: null`. The UI derives elapsed time from `now` on each tick (1 s interval); nothing about the running state is stored locally.

## Consequences
Reload and cross-device display are correct by construction and cost no extra writes. Devices with skewed clocks can produce slightly odd durations (accepted, see 0010). Display components need a "now" source, which makes them straightforward to test with fake timers.
