# 0018 — Open registration; each account sees only its own data

- **Status:** accepted
- **Date:** 2026-09-16
- **Decided by:** architect
- **Slice:** 1 (migrated from brief D18)

## Context
The app is personal, but the URL is public.

## Options
| Option | Pros | Cons |
|---|---|---|
| Open sign-up, per-uid rules | Simplest, no data exposure | Strangers can create (empty) accounts |
| Allowlist of the user's email in rules | Only the user | Extra config; can be added later |

## Decision
Anyone may register; security rules restrict every account to `users/{own uid}/**`.

## Consequences
An email allowlist can be added later without data migration.
