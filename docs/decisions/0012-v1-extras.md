# 0012 — v1 includes export (CSV/PDF), projects/notes and dark mode; no legal break hints

- **Status:** accepted
- **Date:** 2026-09-16
- **Decided by:** user (round 1 question F7; architect had recommended no extras)
- **Slice:** 1 (migrated from brief D12)

## Context
Optional features beyond timer and calendar.

## Options
| Option | Pros | Cons |
|---|---|---|
| No extras | Smallest v1 | User wants them |
| Export, projects/notes, dark mode | Matches user needs | More slices |
| + ArbZG break hints | Legal awareness | Not wanted |

## Decision
v1 includes CSV/PDF export, projects and notes, and dark mode. ArbZG break hints are out.

## Consequences
Slices 3 and 4 exist. Entry model carries optional `projectId`/`note` from the start (0007).
