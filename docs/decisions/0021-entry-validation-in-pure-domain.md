# 0021 — Entry edit validation lives in the pure domain module and is enforced client-side only

- **Status:** accepted
- **Date:** 2026-10-16
- **Decided by:** architect; accepted by user with brief, 2026-10-16
- **Slice:** 2

## Context
Day detail validation: end after start, no overlaps (0020), no future entries, for the active open entry only the start is editable. Firestore rules cannot query other documents cheaply, so overlap cannot be enforced server-side.

## Options
| Option | Pros | Cons |
|---|---|---|
| Pure domain validator (`src/domain/`), rules keep shape checks | Unit-testable, no Firebase in domain, works offline | Concurrent offline edits on two devices can still create overlaps |
| Cloud Function validation | Authoritative | Needs Blaze plan (violates 0 € cost), breaks offline |
| Rules-only | Server-enforced | Cannot check overlap or "future" reliably with client clocks |

## Decision
A pure function in `src/domain/` takes the candidate entry (new or edited), the surrounding entries and `now`, and returns either OK or a list of German-mappable error reasons (e.g. end-before-start, overlap with entry X, in the future, field not editable). The view calls it before every write and shows the errors inline; the repository writes without re-validating. `firestore.rules` keep the existing shape validation (`end >= start`) unchanged.

## Consequences
Overlaps produced by concurrent offline edits are possible (accepted, see 0006); the calendar and day detail must still render them sanely (totals are plain sums). Validation is fully unit-testable without the emulator.
