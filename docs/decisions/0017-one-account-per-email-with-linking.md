# 0017 — One account per email address; the second sign-in method is linked in-app, never auto-linked silently

- **Status:** superseded by [0032](0032-no-authentication-no-accounts.md)
- **Date:** 2026-09-16
- **Decided by:** architect
- **Slice:** slice 1 (foundation, auth, timer)

## Context
With both Google and email/password enabled (0005), the same person can try both methods with the same address. Firebase's default is one account per email, which surfaces as `auth/account-exists-with-different-credential` and similar errors.

## Options
| Option | Pros | Cons |
|---|---|---|
| One account per email + explicit error message + in-app linking | one data set, the user stays in control, errors are explainable | needs a linking UI and careful error mapping |
| Allow several accounts per email (multiple accounts per email setting) | no conflict errors | the user's data silently splits across two accounts |
| Silent auto-linking on sign-in | seamless | links credentials without consent; surprising security behaviour |

## Decision
Keep Firebase's "one account per email". If sign-in fails because the address exists with the other method, show a German message naming the method to use. In the account section, a signed-in user can link the missing method ("Google verknüpfen" / "Passwort festlegen"), after which both methods reach the same uid and data.

## Consequences
The user always has exactly one data set. Requires mapping of `auth/account-exists-with-different-credential`, `auth/email-already-in-use` and `auth/credential-already-in-use` to helpful messages. Known accepted Firebase behaviour: signing in with Google can replace an *unverified* password account that has the same Gmail address; this is documented rather than worked around.
