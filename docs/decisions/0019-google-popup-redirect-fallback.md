# 0019 — Google sign-in via popup with redirect fallback

- **Status:** accepted
- **Date:** 2026-09-16
- **Decided by:** architect
- **Slice:** 1 (migrated from brief D19)

## Context
Popups are blocked or broken on some mobile browsers and installed PWAs.

## Options
| Option | Pros | Cons |
|---|---|---|
| Popup, fallback to redirect | Best desktop UX, works on mobile | Two code paths |
| Redirect only | One path | Worse desktop UX |

## Decision
Try popup; on popup-blocked/unsupported errors fall back to redirect; redirect results (incl. link errors) are surfaced in the UI.

## Consequences
Manual test on a phone required.
