# 0052 — New slice order: 2E backup → target hours → week view → reminder & rounding → projects → CSV/PDF

- **Status:** accepted
- **Date:** 2026-09-25
- **Decided by:** user
- **Slice:** raised after slice 2R-B (the shell)

## Context
[0039](0039-slice-order-local-rebuild-then-backup.md) ordered the remaining work as 2R → 2E → 3 (projects) →
4 (CSV/PDF). 2R is finished: 2R-A built the local store, 2R-B made the app startable (`448387c`, APPROVED,
291 tests). The competitor research then added three features to the roadmap
([0047](0047-target-hours-and-overtime-balance.md), [0048](0048-week-view-with-week-total.md),
[0049](0049-reminder-while-a-timer-is-running.md), [0050](0050-rounding-rules-are-display-only.md)), so the
order has to be written down again — with the new features placed, not appended vaguely.

The user was asked where the new features go and answered without hesitation: **2E stays next**, because the
data lives in exactly one browser profile and nothing else matters until it can be secured. That is the same
reasoning that brought 2E forward in [0039](0039-slice-order-local-rebuild-then-backup.md), and it is now the
last remaining single point of failure in the product.

## Options
| Option | Pros | Cons |
|---|---|---|
| 2E first, then the three new features, then projects, then CSV/PDF | closes the data-loss gap before anything else is built on top of it; every later slice can be tested by exporting, breaking things and restoring | the visible features the user is excited about wait one slice |
| New features first, 2E later | more visible progress sooner | every slice built in the meantime is built over an unprotected data set, and 2E keeps slipping — which is exactly how a local-only app loses a year of entries |
| Projects (slice 3) before the new features | follows the original plan of [0014](0014-slice-order.md)/[0012](0012-v1-extras-export-projects-dark-mode.md) | projects change the entry schema, which the new features do not; doing it later keeps the schema stable while three derived features are added |

## Decision
1. **2E — backup:** versioned JSON export + replace-all import
   ([0037](0037-json-backup-with-replace-all-import.md)). **Next.**
2. **Target hours per weekday + overtime balance** ([0047](0047-target-hours-and-overtime-balance.md)).
3. **Week view with a week total** ([0048](0048-week-view-with-week-total.md)).
4. **Reminder for a running timer + rounding rules** ([0049](0049-reminder-while-a-timer-is-running.md),
   [0050](0050-rounding-rules-are-display-only.md)) — one slice, as the user chose them together.
5. **Projects and notes** ([0015](0015-projects-and-export-detail.md)).
6. **Monthly CSV and PDF report.**

The whole sequence is the user's. The architect had proposed the order *among* steps 2–4 (targets first because
they define the new settings and the balance arithmetic, then the week view so it is built once with the week
balance already in it, then reminder and rounding, which depend on neither); the user was asked about it after
the brief audit and confirmed exactly that order. It is therefore settled and is not to be reopened by the
slices that implement it.

Each of steps 2–6 is its own slice with its own architect round; none of them may be merged into another.

## Consequences
- Supersedes [0039](0039-slice-order-local-rebuild-then-backup.md). 2R is done; the rest of that decision's
  ordering is replaced by the list above.
- Extends the v1 feature list of [0012](0012-v1-extras-export-projects-dark-mode.md) by three features.
  [0012](0012-v1-extras-export-projects-dark-mode.md) itself stays in force: its projects, CSV/PDF, dark-mode
  and "no legal break hints" clauses are all unchanged
  ([0051](0051-holidays-absences-and-break-hints-stay-out.md)).
- Steps 2, 4 and 5 each add fields (`Preferences` twice, the entry schema once), so the backup format version
  of [0037](0037-json-backup-with-replace-all-import.md) is exercised repeatedly. It must be in place before
  any of them — which this order guarantees, and which is the second reason 2E goes first.
- The CSV/PDF report stays last on purpose: it should report targets, balances and rounding
  ([0050](0050-rounding-rules-are-display-only.md)), so building it earlier means building it twice.
- Until 2E ships, one browser profile still holds the only copy of the data. After 2E the user has to actually
  export — the app will not do it for them in this version
  ([0037](0037-json-backup-with-replace-all-import.md)); a "your last backup is old" hint remains a later
  candidate.
