# 0021 — A day is edited as free-standing blocks: overlaps are forbidden, gaps are allowed, breaks stay real entries

- **Status:** accepted
- **Date:** 2026-09-18
- **Decided by:** user
- **Slice:** slice 2 (calendar + editing)

## Context
Manual editing needs one rule for how a day may be structured. Slice 1's timer produces a gap-free chain of `work` and `break` entries ([0007](0007-entry-records-for-work-and-break.md)), but a hand-edited day can have holes (arrived, left, came back) and a user may want to shorten one block without silently moving its neighbours.

## Options
| Option | Pros | Cons |
|---|---|---|
| Free blocks, only overlaps forbidden, gaps allowed | simple and predictable; one edit changes exactly one entry; matches existing data with no migration | a day can contain time that is neither work nor break |
| Gap-free chain with automatic neighbour adjustment | "break = everything that is not work" always holds | one click silently rewrites several entries; hard to undo; surprising |
| Only work blocks stored, breaks derived from the gaps | fewer entries to edit | contradicts 0007, needs migration of existing break entries, loses the distinction between "break" and "not at work" |

## Decision
Work and break entries are created, edited and deleted individually. The only structural rule is that no two entries of the same day may overlap in time. Gaps between entries are legal and count as nothing. Break entries remain stored documents, not derived intervals.

## Consequences
[0007](0007-entry-records-for-work-and-break.md) stands unchanged; no migration, no new field. Validation reduces to per-entry checks plus one overlap check against the day's other entries (including an entry that started the previous day and reaches into this one). Day and month totals keep summing `work` durations only, so a day's work + break time need not add up to the span from first start to last end. Editing never mutates an entry the user did not select.
