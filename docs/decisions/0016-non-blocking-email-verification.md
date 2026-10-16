# 0016 — Email verification mail on registration with a non-blocking banner

- **Status:** accepted
- **Date:** 2026-09-16
- **Decided by:** architect
- **Slice:** 1 (migrated from brief D16)

## Context
Email/password registration (0005) raises whether unverified users may use the app.

## Options
| Option | Pros | Cons |
|---|---|---|
| Send mail, non-blocking banner | No friction; still secures reset/linking | Unverified accounts usable |
| Block until verified | Stronger | Friction without protecting anyone else's data |
| No verification | Simplest | Weak reset/linking |

## Decision
Send a verification email after registration; unverified users can use the app and see a dismissible banner with "erneut senden".

## Consequences
Rules are per uid, so unverified accounts can only see their own data.
