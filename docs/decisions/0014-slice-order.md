# 0014 — Slice order: foundation/auth/sync/timer → calendar + editing → projects/notes → export

- **Status:** accepted
- **Date:** 2026-09-16
- **Decided by:** user
- **Slice:** slice 1 (foundation, auth, timer)

## Context
v1 (0012) is far too large for one pipeline run. The order determines when the app first becomes genuinely usable.

## Options
| Option | Pros | Cons |
|---|---|---|
| Foundation + timer first, then calendar, projects, export | live tracking works on day one; later slices only add views on a stable data layer | no way to correct mistakes until slice 2 |
| Calendar/manual entry first, timer later | retroactive entry possible immediately | the main daily interaction is missing longest |

## Decision
1. Foundation, auth (Google + email/password), sync/offline, timer, dark mode. 2. Calendar with month totals plus day-detail editing. 3. Projects and notes. 4. Monthly CSV and PDF export.

## Consequences
Each slice ships something usable on its own. The entry schema (0007) must be right in slice 1, because slices 2–4 build on it without migrations. Mistakes made with the timer can only be corrected from slice 2 onwards.
