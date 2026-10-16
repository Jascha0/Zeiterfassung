# 0024 — Overlap validation sees a 7-day lookback window plus all open entries; one entry may last at most 7 days

- **Status:** accepted
- **Date:** 2026-10-16
- **Decided by:** architect (fix for brief audit blocking finding 1; implements 0020, does not change it)
- **Slice:** 2

## Context
0020 forbids overlaps, and 0021 validates on the client. The validator can only find overlaps with entries it is given. A window limited to the shown day ± 1 day misses three things: open entries from earlier days (they extend to `now`), closed entries longer than a day that started earlier, and later entries when an older open entry is ended days later (0022). The data loaded into the client must also stay bounded, since a day may be weeks or months in the past.

## Options
| Option | Pros | Cons |
|---|---|---|
| Lookback L = 7 days, all open entries, max entry duration = L | Bounded window (≤ 14 days of entries); every entry the app validates fits inside the lookback | Closed entries longer than 7 days that the timer created are not seen (rare, accepted) |
| Lookback 1 day, longer entries accepted as a gap | Small window | Gap is realistic: a timer left running over a weekend gives an entry longer than 24 h |
| Load all entries (no lookback) | No gap | Unbounded reads/cache size, slow for old days |
| Firestore multi-field range query (`start < X and end > Y`) | Exact | Composite index, `end == null` handling, extra complexity; offline cache behavior less predictable |

## Decision
- Constant `L = 7 days` in the domain.
- **Validator input:** the candidate; every entry whose `start` lies in `[candidate.start − L, candidate.effectiveEnd)`, where `effectiveEnd = candidate.end ?? now`; **all** open entries of the user (each treated as ending at `now`), whatever their start; `now`; the id of the active open entry. The candidate itself is excluded by id.
- **New validation reason `tooLong`:** a candidate whose `end − start > L` is rejected ("Ein Eintrag darf höchstens 7 Tage dauern."). So every closed entry written through day detail or resolution fits inside the lookback.
- **Accepted gap:** a closed entry longer than L can still exist if the timer ended a block that ran more than 7 days ("Arbeitstag beenden" is not validated), or as the result of concurrent offline edits (0006). Such an entry is invisible to validations whose candidate starts more than L after it. This is documented, not handled.
- **Resolution default end (0022):** `min(start of the earliest entry that starts after the open entry (searched up to now, not limited to any window), now)`. If the prefilled value exceeds L, the validator rejects it with `tooLong`, and the user picks an earlier end or deletes the entry.

## Consequences
- Day detail loads entries starting in `[dayStart − L, dayStart + 2 days)`. A candidate starts on the shown day and ends at the latest at the end of the next day ("endet am Folgetag"). It also uses the open-entries subscription.
- Ending an older open entry needs entries starting in `[entry.start − L, chosenEnd)` and a lookup of "earliest entry starting after t". Both are range/ordered queries on `start`; a single-field index is enough.
- While an old open entry is unresolved, every later candidate overlaps it and is rejected. The message must point to resolving open entries.
- Changing L later only changes a constant; it never touches stored data.
