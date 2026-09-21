# 0005 — Sign-in offers both Google and email/password

- **Status:** accepted
- **Date:** 2026-09-16
- **Decided by:** user
- **Slice:** slice 1 (foundation, auth, timer)

## Context
A single-user app needs exactly enough authentication to bind data to a person across devices. Each additional provider adds UI, error paths and edge cases.

## Options
| Option | Pros | Cons |
|---|---|---|
| Google sign-in only | one button, no passwords, no reset flow | dependent on a Google account |
| Email/password only | provider-independent | needs registration, reset and verification flows |
| Both | free choice per device, fallback if one fails | most surface: linking, conflicting accounts, more error mapping |

## Decision
Support both Google sign-in and email/password registration/sign-in, including password reset and email verification.

## Consequences
Requires German mapping of all relevant Firebase auth error codes, a password-reset flow, and handling of the "same email, two methods" case (0017). More tests and more UI, but no data-model impact.
