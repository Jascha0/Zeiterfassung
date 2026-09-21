# 0001 — The Zeiterfassung app is a web app / PWA, not a desktop or native app

- **Status:** accepted
- **Date:** 2026-09-16
- **Decided by:** user
- **Slice:** slice 1 (foundation, auth, timer)

## Context
The user wants to track working time on a PC and on a phone. The delivery platform had to be fixed before any stack choice, because it determines packaging, distribution and offline strategy.

## Options
| Option | Pros | Cons |
|---|---|---|
| Web app / PWA | one codebase, installable on phone and desktop, no store review, instant updates | no deep OS integration, offline needs explicit work |
| Desktop app (Tauri/Electron) | good OS integration, native window | no phone support, separate distribution/updates |
| Native mobile app | best phone UX, notifications | store accounts and review, no PC use, most work |

## Decision
Build a Progressive Web App: a static single-page app, installable on both PC and phone, served over HTTPS.

## Consequences
Makes cross-device use and updates trivial; the same UI must work at phone and desktop widths. Offline capability has to be designed explicitly (service worker for the app shell, see 0006 for data). Rules out OS-level features such as native notifications or tray integration without extra work.
