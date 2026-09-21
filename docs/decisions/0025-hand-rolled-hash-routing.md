# 0025 — Navigation uses hand-rolled hash routing (`#/timer`, `#/kalender/2026-09`, `#/tag/2026-09-18`); no router dependency

- **Status:** accepted
- **Date:** 2026-09-18
- **Decided by:** user
- **Slice:** slice 2 (calendar + editing)

## Context
Slice 1 switches views with React state in `src/App.tsx` (`'timer' | 'account'`), without touching the URL. Slice 2 adds a calendar and, below it, a day detail. In an installed PWA the device's back button then either leaves the app or does nothing useful, and no view survives a reload.

## Options
| Option | Pros | Cons |
|---|---|---|
| Hand-rolled hash routing | back button and reload-in-place work; deep links possible; no dependency; one small pure module plus a hook, easy to unit-test; works on static hosting without rewrite rules | we own a piece of routing code, however small |
| Keep pure state switching | no change at all | back button exits the app from the day detail; no addressable views; state lost on reload |
| `react-router-dom` | the standard, handles every case | an extra runtime dependency and a shell rewrite for four views |

## Decision
The app's location is the URL hash. Routes: `#/timer`, `#/kalender/YYYY-MM`, `#/tag/YYYY-MM-DD`, `#/konto`. A pure parse/serialise module plus a small hook listening to `hashchange` replaces the `View` state in `src/App.tsx`; unknown or malformed hashes fall back to `#/timer`.

## Consequences
The back button behaves as users expect on the phone, and a reload returns to the same month or day. Hash routing needs no server rewrites, so Firebase Hosting stays a plain static deploy. Route parsing is pure and therefore fully unit-testable, including malformed input. `src/App.tsx` changes, so the existing App/shell tests must be adjusted. Slices 3 and 4 add their views as further routes. If routing needs ever grow (nested layouts, guards), switching to a real router is a contained change behind the same hook.
