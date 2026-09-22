# 0032 — There is no sign-in and no account system

- **Status:** accepted
- **Date:** 2026-09-22
- **Decided by:** user
- **Slice:** slice 2R (local rebuild)

## Context
Authentication existed for one reason: to bind data to a person so that a backend could serve the same data to that person's devices ([0002](0002-single-user-cloud-sync.md), [0005](0005-google-and-email-password-auth.md)). With [0030](0030-local-only-single-device-no-sync.md) (local-only) and [0031](0031-no-backend-firebase-dropped.md) (no backend) there is no remote data to bind and no remote party to prove anything to. Sign-in would only be a gate in front of data that is already sitting in the same browser profile.

Slice 1 built the full auth surface: `src/auth/` (AuthContext, firebaseAuthService, authErrors, passwordValidation), `src/views/LoginView.tsx`, `src/views/AccountView.tsx`, `src/components/VerificationBanner.tsx`, the `Gate` in `src/App.tsx`, and a fake auth service used by every view test.

## Options
| Option | Pros | Cons |
|---|---|---|
| No authentication at all; the app opens straight into the timer | simplest, honest about what it protects; removes the whole auth surface and its tests | anyone using the machine and profile sees the data (the OS account is the boundary) |
| Keep a local passcode/PIN gate | feels protected | a PIN in front of unencrypted local data is decoration, not security — real protection needs encryption at rest and key handling |
| Keep Firebase Auth as a login even without sync | "accounts" remain | needs a live Firebase project for a login that guards nothing — the worst of both worlds |

## Decision
No authentication, no registration, no accounts, no email verification, no password handling. The app opens directly into its main view. Data protection is delegated to the operating-system account and, if wanted, to the OS disk encryption.

## Consequences
- Supersedes [0005](0005-google-and-email-password-auth.md) (Google + email/password) and, with it, its detail decisions [0016](0016-non-blocking-email-verification.md) (email verification), [0017](0017-one-account-per-email-with-linking.md) (account linking), [0018](0018-open-registration.md) (open registration) and [0019](0019-google-popup-with-redirect-fallback.md) (popup/redirect).
- `src/auth/`, `LoginView`, `AccountView`'s account section, `VerificationBanner` and the `Gate` in `App.tsx` lose their subject; `FakeAuthService` disappears from every test's setup, which simplifies the whole view-test harness.
- No auth error mapping, no password-reset flow, no email allowlist (which was on the "later" list and is now dropped).
- The app is usable the moment it is opened — no loading gate, no first-run setup.
- A future need to protect the data on a shared machine would be a new decision and would have to mean encryption at rest, not a PIN screen.
- The theme preference and the entries can no longer be scoped by a user identity; how the code expresses that (see the `uid` question in the current brief) is a separate decision.
