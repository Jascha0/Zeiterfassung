# 0050 — Rounding to 5 or 15 minutes is in scope, and it never changes the recorded timestamps

- **Status:** accepted
- **Date:** 2026-09-25
- **Decided by:** user
- **Slice:** raised after slice 2R-B, built after slice 2E

## Context
Same research round as [0047](0047-target-hours-and-overtime-balance.md). Clockodo, Papierkram and Clockify
all offer rounding rules, because hand-written or client-billed time is reported in 5-, 6- or 15-minute
units, not in seconds. This app stores exact absolute instants
([0010](0010-client-clock-absolute-timestamps.md)) and displays seconds, so a day reads `7:53:41` where the
user wants `8:00`.

There is a second consideration the user should know about: the German reform direction (the 2022 BAG ruling
and the 2026 draft) is towards recording **actual** times in a tamper-evident way. Any feature that rewrites
stored start and end times works against that, and it is also irreversible — the exact times cannot be
recovered from rounded ones.

The user chose rounding as part of the third feature bundle. Whether rounding applies to the *display* or to
the *stored entry* was put to them explicitly after the brief audit, and they confirmed the display-only shape
with the reason recorded below. It is therefore the user's decision, not the architect's.

## Options
| Option | Pros | Cons |
|---|---|---|
| Round only in what is *shown* and *exported*; the stored entry keeps its exact instants | reversible: switch the rule off and the exact times are back; no migration; nothing to repair if the rule turns out wrong; the recorded data stays the actual data | the number in the UI no longer matches the raw entry to the second, which must be visible somewhere so the user is not confused |
| Round on save: the timer writes rounded start and end times | what is stored is what is reported, one number everywhere | irreversible loss of the actual times, a rewrite of the timer's write path, and it contradicts the direction of [0010](0010-client-clock-absolute-timestamps.md) and the recording duty |
| Round only in the CSV/PDF export (slice 4) | smallest change, only touches the documentation output | the balance of [0047](0047-target-hours-and-overtime-balance.md) and the day totals would still be unrounded, so the app shows two truths |

## Decision
Rounding is a **presentation rule, not a storage rule**. The user picks a granularity — off (default), 5
minutes or 15 minutes — and it applies to displayed durations, to the totals and balances derived from them
and to the later CSV/PDF export. Entries keep the exact instants they were recorded with, and the day detail
continues to show and edit real times.

The user's stated reason: **the original times must stay recoverable.**

Where the rounding applies (per entry or per day total), how it rounds (nearest, up, down) and where the rule
is surfaced are settled in that slice's own architect round.

## Consequences
- Switching the rule off restores the exact numbers, so the feature is reversible and needs no migration and
  no backup-format change for the entries themselves; only the setting is new in `Preferences`.
- Rounding per entry and rounding a day's total do not give the same result. Whichever is chosen must be
  applied in exactly one place in `src/domain/` and used by every consumer, or the app will show two
  different day totals in two views.
- The unrounded truth stays reachable (the day detail shows real start and end times), which is what keeps
  the app honest about recorded working time.
- Default is **off**, so nobody gets a rounded number they did not ask for.
- A later wish for rounded times *in the stored entry* contradicts the user's stated reason and would need a
  new decision file superseding this one.
