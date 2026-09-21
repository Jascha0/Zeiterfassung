# 0024 — Manual entries may not lie in the future; they may cross midnight up to a total of 24 h; blocks over 12 h are only warned about

- **Status:** accepted
- **Date:** 2026-09-18
- **Decided by:** user
- **Slice:** slice 2 (calendar + editing)

## Context
Manual entry needs hard limits so that totals stay honest and obviously wrong input is caught. Night work must remain recordable, and [0009](0009-midnight-crossing-entries-belong-to-start-day.md) already fixes which day a crossing block counts on.

## Options
| Option | Pros | Cons |
|---|---|---|
| No future times; crossing midnight allowed up to 24 h; > 12 h warned | totals only ever describe time actually worked; night shifts are one entry | a future calendar day can be opened but not filled |
| Allow future times (planning) | shifts can be planned in the app | planned and worked time become indistinguishable in day and month totals |
| Forbid crossing midnight (end ≤ 23:59 of the start day) | each total belongs to exactly one calendar day | night shifts must be split by hand into two entries |

## Decision
Neither start nor end may lie in the future, with a small tolerance for clock skew between devices ([0010](0010-client-clock-absolute-timestamps.md)). The end must be after the start. An entry may end after midnight; its total duration may not exceed 24 h, and the whole duration counts on the start day ([0009](0009-midnight-crossing-entries-belong-to-start-day.md)). A single block longer than 12 h is accepted but flagged with the existing warning (`LONG_RUNNING_THRESHOLD_MS`), not rejected. Future calendar days can be viewed but offer no "add entry" action.

## Consequences
Month totals always mean "worked", never "planned", which keeps slice 4's export trustworthy. Night shifts stay one entry. A day total can exceed 12 h and, with a crossing block, reach up to 24 h. The skew tolerance means a slightly fast device clock cannot block a legitimate save; the exact tolerance is an implementation detail, not a decision. Planning features, if ever wanted, would need a separate entity rather than a relaxation of this rule.
