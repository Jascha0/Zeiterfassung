# 0004 — Backend is Firebase (Firestore in the EU + Auth + Hosting) on the free Spark plan

- **Status:** accepted
- **Date:** 2026-09-16
- **Decided by:** user
- **Slice:** slice 1 (foundation, auth, timer)

## Context
Cloud sync (0002) needs a backend with authentication, a database, offline support and no running cost. Personal working-time data should be stored in the EU.

## Options
| Option | Pros | Cons |
|---|---|---|
| Firebase (Firestore, Auth, Hosting) | built-in offline cache and realtime sync, mature Google sign-in, free tier without inactivity pausing, EU location selectable | vendor lock-in, NoSQL query limits, rules are the only data protection |
| Supabase (Postgres) | SQL, open source | free projects pause when inactive, offline sync must be built by hand |
| Self-hosted (PocketBase etc.) | full control | needs a server, backups and maintenance; costs money and time |

## Decision
Firebase on the Spark (free) plan: Cloud Firestore as the database with its location set to an EU region (e.g. `europe-west3`), Firebase Auth for sign-in, Firebase Hosting for the static PWA.

## Consequences
Realtime cross-device sync and offline caching come for free; no server to operate; 0 €/month at this usage. Locks the data model into Firestore's document/query limits and makes security rules the sole protection boundary. The Firestore location is irreversible per database, so it must be chosen correctly at creation time. The Firebase project must be created manually by the user; the pipeline can never verify against the live backend.

Sources: https://firebase.google.com/pricing , https://firebase.google.com/docs/firestore/quotas , https://supabase.com/docs/guides/platform/free-project-pausing
