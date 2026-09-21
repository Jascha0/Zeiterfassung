# 0012 — v1 includes CSV/PDF export, projects with notes and dark mode; no legal break hints

- **Status:** accepted
- **Date:** 2026-09-16
- **Decided by:** user
- **Slice:** slice 1 (foundation, auth, timer)

## Context
Beyond tracking and a calendar, several optional features were on the table. Each one enlarges v1; the architect had recommended shipping none of them at first.

## Options
| Option | Pros | Cons |
|---|---|---|
| Export + projects/notes + dark mode | covers documentation and per-project analysis; the user's actual wish | roughly doubles v1 scope (two extra slices) |
| None of them (tracking + calendar only) | fastest to a usable app | no documentation output, no project split |
| Legal break hints (ArbZG) | compliance nudges | the user does not want them; legal rules are risky to encode |

## Decision
v1 comprises: timer, calendar with editing, projects (name + colour) with notes per work block, monthly CSV and PDF export, and dark mode. No ArbZG or other legal break hints.

## Consequences
Sets the slice plan (0014) and makes `projectId`/`note` part of the entry schema from the start (0007). Export needs a client-side PDF library in the export slice. No legal advice is given anywhere in the UI, which also avoids liability.
