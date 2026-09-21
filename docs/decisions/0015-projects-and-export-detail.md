# 0015 — Projects are a user-managed list (name + colour) attached optionally per work block; export is per calendar month as CSV plus a PDF report

- **Status:** accepted
- **Date:** 2026-09-16
- **Decided by:** user
- **Slice:** slice 1 (foundation, auth, timer)

## Context
"Projects/notes" and "export" needed concrete shapes before the entry schema was frozen, because both influence what an entry must carry.

## Options
| Option | Pros | Cons |
|---|---|---|
| Own project list (name + colour), optional project + note per work block; monthly CSV + PDF | consistent naming, colour coding, per-project totals, both a machine-readable and a printable output | needs a project CRUD view and a PDF library |
| Free-text project per entry | no management UI | typos fragment the totals |
| One project per day | fewer fields | cannot represent switching projects during a day |
| CSV only / free date range | less work | no printable report; a range picker adds UI without a stated need |

## Decision
`users/{uid}/projects/{projectId}` with `{ name, color, archived, createdAt }`. A work block may reference one project and carry a free-text note; breaks carry neither. Export works on a selected calendar month and produces a CSV of all entries (date, type, start, end, duration, project, note) and a PDF monthly report (per day work time, break time, projects; plus the month total).

## Consequences
Fixes `projectId` and `note` as optional entry fields from slice 1 (0007), so slices 3 and 4 need no migration. Per-project totals are derived. Archiving instead of deleting projects keeps historical entries readable. Export is entirely client-side, so no backend function is needed.
