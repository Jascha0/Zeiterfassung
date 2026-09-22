# 0018 — Registration is open to anyone; isolation comes from per-uid security rules

- **Status:** superseded by [0032](0032-no-authentication-no-accounts.md)
- **Date:** 2026-09-16
- **Decided by:** architect
- **Slice:** slice 1 (foundation, auth, timer)

## Context
The app is for one person, but it is deployed on a public URL. Sign-up could be restricted to the owner's address.

## Options
| Option | Pros | Cons |
|---|---|---|
| Open sign-up, data scoped per uid | simplest; nothing to maintain; no risk of locking the owner out | strangers who find the URL can create empty accounts and consume free-tier quota |
| Email allowlist in the security rules | only the owner can store data | a rule list to maintain; a typo locks the owner out; the mechanism can be added later |
| Disable sign-up after the first account | no strangers at all | needs a backend function or manual provider toggling |

## Decision
Leave registration open. Security rules allow read and write only under `users/{uid}/**` for that same uid, so no account can see another's data.

## Consequences
No data exposure, no maintenance. An unknown third party could create an account and use a share of the free quota — accepted for a personal app on an unadvertised URL. An allowlist can be added later purely in the rules, with no data migration.
