# 0005 — Sign-in with Google and with email/password

- **Status:** accepted
- **Date:** 2026-09-16
- **Decided by:** user (round 2 question G2; architect had recommended Google only)
- **Slice:** 1 (migrated from brief D5)

## Context
The user wants to sign in on several devices.

## Options
| Option | Pros | Cons |
|---|---|---|
| Google only | Simplest | Requires a Google account |
| Email/password only | No Google dependency | Password reset, verification needed |
| Both | Flexibility | Account-linking edge cases |

## Decision
Offer both Google sign-in and email/password (with password reset and verification mail).

## Consequences
Linking and conflict handling needed (see 0016, 0017, 0019).
