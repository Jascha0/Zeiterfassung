# 0004 — Backend: Firebase (Firestore in the EU, Auth, Hosting) on the free Spark plan

- **Status:** accepted
- **Date:** 2026-09-16
- **Decided by:** user (round 2 question G1)
- **Slice:** 1 (migrated from brief D4)

## Context
Cloud sync (0002) needs a backend; cost target 0 €/month; data should stay in the EU.

## Options
| Option | Pros | Cons |
|---|---|---|
| Firebase | Built-in offline sync, free tier, no inactivity pausing | Vendor lock-in |
| Supabase | SQL, open source | Free projects pause after inactivity, offline sync not built in |
| Self-hosted PocketBase | Full control | Hosting and ops effort |

## Decision
Firebase: Firestore in an EU location (e.g. `europe-west3`), Firebase Auth, Firebase Hosting, Spark plan. Security rules are the only data protection.

## Consequences
Irreversible per database: Firestore location. Security rules must be tested (emulator needs Java). Sources: https://firebase.google.com/pricing , https://firebase.google.com/docs/firestore/quotas , https://supabase.com/docs/guides/platform/free-project-pausing
