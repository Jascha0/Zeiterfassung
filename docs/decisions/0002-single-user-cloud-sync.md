# 0002 — Single user per account, data synced across devices via the cloud

- **Status:** accepted
- **Date:** 2026-09-16
- **Decided by:** user (architect had recommended local-only)
- **Slice:** 1 (migrated from brief D2, round 1 question F2)

## Context
The user wants the same data on PC and phone.

## Options
| Option | Pros | Cons |
|---|---|---|
| Local-only | No backend, no cost, maximum privacy | No sync between devices |
| Single user with cloud sync | Same data everywhere | Needs a backend and auth |
| Multi-user / team | Shared use | Far more complexity, not needed |

## Decision
Each account is one person; their data syncs between their devices through a cloud backend. No sharing, no teams.

## Consequences
Auth and a backend are required (see 0004, 0005). All data is scoped per uid. Multi-user features are out of scope.
