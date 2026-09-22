# 0031 — The app has no backend; Firebase/Firestore is dropped as the persistence platform

- **Status:** accepted
- **Date:** 2026-09-22
- **Decided by:** user
- **Slice:** slice 2R (local rebuild)

## Context
[0004](0004-firebase-firestore-eu-backend.md) chose Firebase (Firestore EU + Auth + Hosting) purely to serve cloud sync. With [0030](0030-local-only-single-device-no-sync.md) the app is local-only, so the backend has no purpose left. No Firebase project was ever created and no data exists in one.

Slice 1 nevertheless built the whole Firebase stack: `src/firebase/`, `src/data/firestoreRepository.ts`, `firestore.rules`, `firestore.indexes.json`, `firebase.json`, `tests/rules/`, the `firebase` runtime dependency, `firebase-tools` and `@firebase/rules-unit-testing` dev dependencies, the `test:rules` and `deploy` scripts, and a README setup guide.

## Options
| Option | Pros | Cons |
|---|---|---|
| No backend at all; data persisted locally | nothing to operate, nothing to pay, no rules, no EU-location question, no GDPR processing by a third party | durability is the user's own responsibility (export/import) |
| Keep Firestore as an optional sync target behind a flag | door open to sync later | every feature must keep working in two modes; doubles the test matrix for a capability that was just cancelled |
| Replace it with another backend (Supabase, self-hosted) | sync possible | reintroduces exactly the cost the user removed |

## Decision
The product has no backend service. Persistence is local only. Firebase is no longer part of the architecture: neither Firestore as a database, nor Firebase Auth, nor Firebase Hosting.

## Consequences
- Supersedes [0004](0004-firebase-firestore-eu-backend.md). The EU-location and Spark-tier considerations become irrelevant, as do Firestore's query and document limits — the data model is no longer constrained by NoSQL query rules.
- Security rules cease to be a protection boundary, because there is nothing remote to protect. `firestore.rules` and the `tests/rules/` suite (which needed Java and was never run on this machine) lose their subject.
- The `firebase` runtime dependency (the largest single item in the bundle) and its tooling lose their justification; `npm run test:rules` and `npm run deploy` lose their meaning.
- The repository abstraction (`EntryRepository` / `SettingsRepository` in `src/data/repository.ts`) survives and pays off exactly as intended: the concrete implementation is swapped, the domain and the views are not.
- Hosting becomes a non-question for a local app; how the app is started locally is a separate, smaller decision.
- Whether the Firebase files are deleted or kept dormant in the working tree is a separate decision; git history keeps them recoverable either way (slice 1 is commit `a71b003`).
