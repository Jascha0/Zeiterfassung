# 0017 — One account per email, clear conflict message, in-app linking of the other method

- **Status:** accepted
- **Date:** 2026-09-16
- **Decided by:** architect
- **Slice:** 1 (migrated from brief D17)

## Context
With both sign-in methods (0005), the same email could otherwise lead to two separate data sets.

## Options
| Option | Pros | Cons |
|---|---|---|
| Firebase "one account per email" + conflict message + linking | One data set | Linking edge cases |
| Separate accounts per method | Simple | Split data |
| Silent auto-linking | Seamless | Security-sensitive, opaque |

## Decision
Keep Firebase's one-account-per-email; on conflict show a German message naming the method to use; signed-in users can link Google or set a password in the account section.

## Consequences
Firebase may replace an unverified password account when signing in with Google using the same Gmail address — accepted and documented.
