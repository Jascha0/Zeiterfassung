# 0027 — Project and note exist only on work entries; a note is trimmed, at most 500 characters, absent when empty

- **Status:** accepted
- **Date:** 2026-10-16
- **Decided by:** architect (follows 0015 "optional project and note per work block")
- **Slice:** 3

## Context
0015 assigns project and note per work block. Two details remain: what happens when an entry's type changes from work to break, and how long a note may be. The entry rules already allow `note` up to 2000 characters.

## Options
| Option | Pros | Cons |
|---|---|---|
| Only work entries carry project/note; switching to break removes both | Consistent with 0015, per-project totals never touch breaks | A note typed on a block is lost if the block is turned into a break (the form warns) |
| Breaks may also carry a note | Flexible | Contradicts 0015, extra UI on break rows, export columns mostly empty |
| Note limit 2000 (rules bound) vs. 500 (UI/domain) | 2000: no second number | 500 fits a list row and a PDF cell; 2000 is overkill for a block note |

## Decision
- `projectId` and `note` are only set on `type: "work"`. When an edit changes the type to break, both fields are removed in the same single-document write (0023 still holds: one entry, one write).
- A note is trimmed. Empty after trimming means the field is absent. The domain limit is 500 characters; longer input is rejected inline. The rules bound stays 2000 (no rules change for entries).
- Multi-line notes are allowed; the list shows them truncated, the edit form shows them fully.

## Consequences
- The domain owns the limit constant. Rules and domain intentionally differ (500 < 2000), so a later increase needs no rules change.
- Export (slice 4) gets empty project/note cells for breaks.
