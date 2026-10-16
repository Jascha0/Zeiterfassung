# 0001 — The app is a web app / PWA

- **Status:** accepted
- **Date:** 2026-09-16
- **Decided by:** user
- **Slice:** 1 (migrated from brief D1, round 1 question F1)

## Context
The user wants to track work time on PC and phone. A platform had to be chosen before anything else.

## Options
| Option | Pros | Cons |
|---|---|---|
| Web app / PWA | One codebase, installable on phone and desktop, no store | Limited OS integration |
| Desktop app (Tauri/Electron) | Native feel on PC | No phone, separate mobile app needed |
| Native mobile | Best phone UX | No PC, two codebases for both |

## Decision
Build a PWA (installable web app) served over HTTPS.

## Consequences
Single codebase for all devices. Offline capability depends on service worker (app shell) and Firestore cache (data). iOS standalone-PWA quirks (popup sign-in) must be handled.
