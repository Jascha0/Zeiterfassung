# 0030 — Project/note edits skip time validation and are allowed on every entry, including the running one

- **Status:** accepted
- **Date:** 2026-10-16
- **Decided by:** architect
- **Slice:** 3

## Context
Slice 2 runs the time validator (0020, 0021, 0024) before every write, and for the active open entry only the start is editable. Slice 3 adds project and note. Two questions follow: must a project-only edit pass the time checks, and may the running block's project/note be changed? The slice-2 review (finding 7) shows the cost of validating untouched fields: an entry from a device with a skewed clock can look "in the future" and becomes uneditable.

## Options
| Option | Pros | Cons |
|---|---|---|
| Time validation only when start, end or type change; project/note always editable, also on the active open entry | Labelling never blocked by unrelated time issues (skew, old overlaps from offline concurrency) | Validator call depends on what changed |
| Validate every edit | One code path | Project change on an overlapping or skewed entry is rejected for reasons unrelated to the change |

## Decision
- An edit that changes only `projectId` and/or `note` is not passed through the time validator. Project and note rules (0027, 0029, existence of the chosen project) still apply.
- On the active open entry, start, project and note are editable (type and end stay locked as in slice 2). On every other work entry, project and note are editable.
- Edits that also change start, end or type are validated exactly as in slice 2.

## Consequences
The `fieldNotEditable` rule from slice 2 widens for the active entry. Its tests must be updated, not dropped.
