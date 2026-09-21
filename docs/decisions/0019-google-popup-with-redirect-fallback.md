# 0019 — Google sign-in uses a popup, falling back to redirect

- **Status:** accepted
- **Date:** 2026-09-16
- **Decided by:** architect
- **Slice:** slice 1 (foundation, auth, timer)

## Context
Firebase offers `signInWithPopup` and `signInWithRedirect`. Popups are blocked in some browsers and behave badly in installed PWAs and on iOS standalone; redirect loses the page state and needs result handling on load.

## Options
| Option | Pros | Cons |
|---|---|---|
| Popup first, redirect as fallback | best desktop UX, still works where popups are blocked | two code paths; the redirect result must be picked up and its errors surfaced after reload |
| Redirect only | one path, always works | full page reload on every sign-in; clumsy on desktop |
| Popup only | simplest | dead end in installed PWAs / blocked-popup browsers |

## Decision
Attempt `signInWithPopup`; on popup-blocked/unsupported errors fall back to `signInWithRedirect`. On app start the redirect result is consumed, and any error from it is shown — both on the login screen and, for linking flows, inside the signed-in shell.

## Consequences
Works across desktop and mobile/installed PWA. Costs an extra state path: a redirect error can arrive when the user is already signed in, so the shell must be able to display it. Needs a manual test on a real phone, since neither path can be verified by the pipeline.
