# 0051 — Public holidays, absence types (vacation/sick) and the ArbZG break hint stay out of scope

- **Status:** accepted
- **Date:** 2026-09-25
- **Decided by:** user
- **Slice:** raised after slice 2R-B

## Context
The same research round that produced [0047](0047-target-hours-and-overtime-balance.md),
[0048](0048-week-view-with-week-total.md), [0049](0049-reminder-while-a-timer-is-running.md) and
[0050](0050-rounding-rules-are-display-only.md) put seven gaps to the user. Three were chosen. These were
deliberately **not** chosen, and that needs to be written down: all three are features a later slice would
otherwise re-propose as "obviously missing", and the holiday/absence pair is exactly what
[0013](0013-no-target-hours-in-v1.md) used as its reason to reject target hours.

What was offered and declined:
- **Public holidays** per federal state, so a holiday counts as fulfilled target time.
- **Absence types** — vacation, sick leave, time off in lieu — as records beside work and break.
- An **ArbZG break hint** ("more than 6 h worked — 30 minutes of break are required").

## Options
| Option | Pros | Cons |
|---|---|---|
| Leave all three out for now | keeps the balance of [0047](0047-target-hours-and-overtime-balance.md) to pure arithmetic over existing entries; no holiday table to maintain per state and per year; no second record type; no legal statement in the UI | a holiday or a week of vacation shows up as a deficit in the balance, and the user has to know that is expected |
| Holidays only | removes the most frequent false deficit, from a fixed rule set | needs a per-state, per-year source; Easter-based dates are computed, and a wrong holiday silently falsifies the balance |
| All three | the balance would finally be complete | a second record type touches the data model, the calendar, the totals, the backup format and the export — a slice of its own, on top of three the user already wants |
| Break hint only | cheap to implement | [0012](0012-v1-extras-export-projects-dark-mode.md) already rejected legal hints; encoding working-time law in an app invites reliance on advice this app is not in a position to give |

## Decision
None of the three is built for now. Specifically:
- No holiday calendar, no federal-state setting, no holiday marking in the calendar.
- No absence types: `work` and `break` remain the only entry types
  ([0007](0007-entry-records-for-work-and-break.md)).
- No ArbZG or other legal hint anywhere in the UI, reaffirming
  [0012](0012-v1-extras-export-projects-dark-mode.md).

A later slice may not add any of them as a side effect of another feature. Reopening one of these requires a
new decision file superseding this one.

## Consequences
- The overtime balance of [0047](0047-target-hours-and-overtime-balance.md) will read a public holiday, a
  vacation day and a sick day as a target miss. That is a known, accepted inaccuracy; the balance slice must
  therefore offer the user *some* manual way to keep the number meaningful (a start date for the balance, or a
  manual correction), and must not pretend the deficit is wrong data.
- The entry schema stays as it is, so the backup format
  ([0037](0037-json-backup-with-replace-all-import.md)) does not have to anticipate a third entry type.
- No legal-advice surface and no per-year maintenance burden (holiday tables rot annually; an app with a
  stale table is worse than one with none).
- If the balance turns out to be unusable in practice because of absences, the cheapest next step is absence
  types **as target-fulfilling day markers** rather than a holiday table — recorded here so that the option is
  not rediscovered from scratch.
