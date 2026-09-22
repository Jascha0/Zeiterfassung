# 0002 — One personal account per user, with cloud sync between that user's devices

- **Status:** superseded by [0030](0030-local-only-single-device-no-sync.md)
- **Date:** 2026-09-16
- **Decided by:** user
- **Slice:** slice 1 (foundation, auth, timer)

## Context
The app records only the user's own working time. The question was whether data stays on the device, syncs through a backend for one user, or supports several collaborating users.

## Options
| Option | Pros | Cons |
|---|---|---|
| Local-only storage | no backend, no accounts, no privacy questions | no sync between PC and phone, data lost with the browser profile |
| Single user with cloud sync | timer visible on all the user's devices, data safe | needs auth, a backend and security rules |
| Multi-user / team | shareable, team reports | far more scope: roles, permissions, invitations |

## Decision
Single-user accounts with cloud sync. All data lives under the signed-in user's own namespace; no sharing, no roles.

## Consequences
Requires authentication (0005) and a backend (0004), plus security rules that isolate each account. Makes "start on the phone, see it on the PC" possible. Rules out team features; adding them later would mean a new data model, not a migration.
