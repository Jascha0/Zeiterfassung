# 0022 — Multiple open entries: newest stays active, the user ends or deletes each older one

- **Status:** accepted
- **Date:** 2026-10-16
- **Decided by:** architect; accepted by user with brief, 2026-10-16
- **Slice:** 2

## Context
Offline use on two devices can produce more than one entry with `end == null`. Slice 1 detects this, warns on the timer screen, and applies timer actions to the most recently started open entry (`findOpenEntries` sorts start desc, id desc). Slice 2 must let the user resolve it.

## Options
| Option | Pros | Cons |
|---|---|---|
| User resolves each older open entry: "Beenden um …" (end time prefilled) or "Löschen" | Explicit, no silent data change, fits 0006 "never silently merged" | One extra step for the user |
| Automatic: close every older open entry at the start of the next newer entry | Zero effort | Silent data change; can be wrong (device left running) |
| Delete all older open entries automatically | Simple | Data loss |

## Decision
The most recently started open entry remains the active one (slice-1 behavior, unchanged). Every other open entry is listed in a resolution panel reachable from the timer warning and also marked in the day detail of its day. Per entry the user can: set an end (prefilled with the earliest of: the start of the next later entry, or `now`; validated like any edit, 0020/0021) or delete it (with confirmation). Once only one open entry remains, the warning disappears.

## Consequences
The validator must treat "older open entry gets an end" as a normal edit. The active open entry itself is never ended from the resolution panel (that is what "Arbeitstag beenden" is for).
