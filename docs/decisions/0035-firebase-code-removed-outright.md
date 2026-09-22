# 0035 — The Firebase and authentication code is deleted outright, not kept dormant

- **Status:** accepted
- **Date:** 2026-09-22
- **Decided by:** user
- **Slice:** slice 2R (local rebuild)

## Context
[0031](0031-no-backend-firebase-dropped.md) and [0032](0032-no-authentication-no-accounts.md) remove the backend and the accounts from the *product*. The working tree still contains the *code*: `src/firebase/`, `src/auth/`, `src/data/firestoreRepository.ts`, `src/views/LoginView.tsx`, the account part of `src/views/AccountView.tsx`, `src/components/VerificationBanner.tsx`, `src/test/fakeAuthService.ts`, `firestore.rules`, `firestore.indexes.json`, `firebase.json`, `tests/rules/`, the `firebase` runtime dependency plus `firebase-tools` and `@firebase/rules-unit-testing`, the `test:rules` and `deploy` scripts, the README setup guide, and the `Gate` in `src/App.tsx`.

## Options
| Option | Pros | Cons |
|---|---|---|
| Delete it all | no dead code to read, compile, review or accidentally import; the bundle loses its largest dependency; the test harness loses the auth fake everywhere | the work of slice 1 is visibly discarded (though it stays in git) |
| Keep it dormant behind a flag or unreferenced | could be revived quickly | must keep compiling and gets re-read at every review; rots silently; only excluded from the bundle as long as nobody imports it, which is hard to guarantee |
| Delete only the configuration | least effort | leaves code that cannot run and is not documented as dead — the worst of both |

## Decision
Delete all of it, including the dependencies, the scripts, the security rules and their test suite, and the README's Firebase section. `src/App.tsx` loses `Gate`, `AuthProvider`, the login view, the verification banner and the redirect-error banner. The recovery path is git: slice 1 is commit `a71b003` on `master`.

## Consequences
- The bundle loses `firebase`, by far the heaviest dependency; `npm run build` gets faster and smaller.
- The test suite loses the auth view tests and `tests/rules/` (which needed Java and was never executed on this machine), and every remaining view test loses the `FakeAuthService` construction — a net simplification of the harness.
- `src/data/writeErrors.ts` shrinks from Firebase error codes to local failure causes (storage unavailable, quota exceeded) with German messages.
- `src/views/AccountView.tsx` keeps only the theme setting and is therefore renamed/repurposed as the settings view.
- No `.env`, no `VITE_FIREBASE_*`, no `ConfigMissing` view: the app has no runtime configuration at all.
- Reintroducing a backend later means writing it again against the surviving repository contract, not un-commenting this code.
- The deletion itself is the destructive act of slice 2R and must not spread: the pure domain, the calendar, the day detail, the theme and the toast infrastructure all stay.
