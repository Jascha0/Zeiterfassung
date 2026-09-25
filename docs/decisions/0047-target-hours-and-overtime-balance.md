# 0047 — Target hours per weekday and a running overtime balance are part of the product after all

- **Status:** accepted
- **Date:** 2026-09-25
- **Decided by:** user
- **Slice:** raised after slice 2R-B, built after slice 2E

## Context
The user asked which features comparable apps have that would be essential here. The research looked at
Clockodo, Toggl Track, Clockify, Kimai and Papierkram, plus the German legal position (`ArbZG` §16(2), the
BAG ruling of 13 September 2022 on the duty to record working time, and the 2026 reform draft that would
require tamper-evident electronic recording, with a transition period until 2027 for very small employers).

Every one of those products answers one question this app cannot: *am I ahead or behind?* Recorded actual
time alone does not tell the user whether a month is complete. Seven gaps were put to the user; they chose
this one first.

[0013](0013-no-target-hours-in-v1.md) rejected targets for v1, and its reason was precise: targets drag in
holidays, absence types and a carry-over rule. That reason no longer holds, because the user has
simultaneously ruled holidays and absences **out**
([0051](0051-holidays-absences-and-break-hints-stay-out.md)). What is left is arithmetic over existing
entries plus a handful of settings.

## Options
| Option | Pros | Cons |
|---|---|---|
| Target hours per weekday + a running balance over day, week and month | the number the user actually wants; pure derivation from entries already stored; no holiday or absence model needed | a workday with no entries shows a deficit that is only correct if the user really was absent — without absence types the balance needs a manual correction path |
| One weekly target only (e.g. 40 h/week) | a single field to configure | says nothing about a single day; part-time patterns (e.g. free Fridays) cannot be expressed |
| Keep [0013](0013-no-target-hours-in-v1.md): actual time only | nothing to build | leaves the app behind every competitor on the one question the user named as essential |

## Decision
The app gains a **target working time per weekday** (Monday to Sunday, each a duration, default 8 h Monday
to Friday and 0 h at the weekend) and a **running overtime balance** — actual minus target — shown for the
day, the week and the month. Balances are derived from the entries that already exist; no entry field and no
new record type is introduced for them.

It is its own slice, after slice 2E ([0052](0052-slice-order-after-the-local-rebuild.md)).

## Consequences
- The settings view gains a target block; `Preferences` grows beyond `theme`, which is the first change to
  that record since it was created — the backup format ([0037](0037-json-backup-with-replace-all-import.md))
  already carries preferences, so a backup written before this slice must remain readable after it. That is
  the first real test of the format version, and it is why 2E has to ship first.
- Target arithmetic belongs in `src/domain/` as pure functions over entries plus targets, so it is unit
  tested without a store.
- Days without entries push the balance negative. Without absence types
  ([0051](0051-holidays-absences-and-break-hints-stay-out.md)) that is the honest result, and the slice must
  give the user *some* way not to be permanently in deficit after a holiday. Its own architect round has to
  settle, at minimum: from which date the balance starts counting, whether future days are excluded (they
  must be), how a target-0 day behaves when work happens on it, and whether breaks are deducted (they are —
  [0007](0007-entry-records-for-work-and-break.md) already separates work from break).
- The app moves closer to the direction the 2026 reform draft points in (a recorded, checkable working time),
  without making any legal claim: the app gives no compliance advice
  ([0012](0012-v1-extras-export-projects-dark-mode.md), [0051](0051-holidays-absences-and-break-hints-stay-out.md)).
- Supersedes [0013](0013-no-target-hours-in-v1.md).
