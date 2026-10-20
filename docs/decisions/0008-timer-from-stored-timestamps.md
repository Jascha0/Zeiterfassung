# 0008 — Timer state is derived from stored start timestamps; elapsed time computed at render

- **Status:** accepted
- **Date:** 2026-09-16
- **Decided by:** architect
- **Slice:** 1 (migrated from brief D8)

## Context
The running timer must survive reloads and be visible on other devices.

## Options
| Option | Pros | Cons |
|---|---|---|
| Store start, compute elapsed from `now` | Survives reload, consistent across devices | Needs a ticking `now` in the UI |
| Persist a ticking counter | — | Constant writes, drifts, breaks offline |

## Decision
Only start/end instants are stored. Running durations = `now - start`, computed at render time.

## Consequences
Any view showing a running entry (timer, calendar, day detail) needs a ticking clock (`src/hooks/useNow.ts`).
