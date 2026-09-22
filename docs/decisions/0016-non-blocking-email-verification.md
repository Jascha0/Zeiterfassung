# 0016 — Email verification is requested but does not block app use

- **Status:** superseded by [0032](0032-no-authentication-no-accounts.md)
- **Date:** 2026-09-16
- **Decided by:** architect
- **Slice:** slice 1 (foundation, auth, timer)

## Context
Registration with email/password (0005) sends a verification mail. The question was whether an unverified user may use the app.

## Options
| Option | Pros | Cons |
|---|---|---|
| Send the mail, show a dismissible banner, allow full use | no friction; the user can start tracking immediately | an unverified address may be someone else's; the account is reachable by the real owner via reset |
| Block the app until verified | address is guaranteed | a lost or delayed mail locks the user out of their own data |
| No verification at all | simplest | password reset and account linking become unreliable |

## Decision
On registration a verification mail is sent. Unverified users can use the app fully, but see a dismissible banner with a "erneut senden" action until the address is verified.

## Consequences
No lock-out risk and no friction. Security is unaffected for other users, because the rules scope data per uid (0002/0018); verification still matters for password reset and provider linking (0017). The banner state and resend throttling (`auth/too-many-requests`) need handling in the UI.
