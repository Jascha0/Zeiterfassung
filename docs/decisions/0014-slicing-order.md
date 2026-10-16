# 0014 — Slice order: foundation+timer → calendar+editing → projects/notes → export

- **Status:** accepted
- **Date:** 2026-09-16
- **Decided by:** user (round 2 question G6; slices 2–4 run one at a time, confirmed 2026-10-16)
- **Slice:** 1 (migrated from brief D14)

## Context
The v1 scope is too big for one pipeline run.

## Options
| Option | Pros | Cons |
|---|---|---|
| Auth+sync+timer+dark mode → calendar+editing → projects/notes → export | Usable timer early | Calendar later |
| Calendar first | Visual overview early | No live tracking first |

## Decision
1. Foundation, auth, sync, timer, dark mode. 2. Calendar + day detail editing. 3. Projects & notes. 4. Export. Each slice is its own pipeline run.

## Consequences
Each slice must leave the app working and deployable.
