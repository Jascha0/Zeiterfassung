# 0035 — Project management is a fourth main-nav item "Projekte" (order: Timer, Kalender, Projekte, Konto)

- **Status:** accepted
- **Date:** 2026-10-16
- **Decided by:** user (slice-3 question F5, option B; architect had recommended a section in "Konto"); order decided by architect
- **Slice:** 3

## Context
Project management needs a place in the UI. The app uses a state-based view switch in `src/App.tsx` with three nav buttons.

## Options
| Option | Pros | Cons |
|---|---|---|
| Section on the "Konto" page | Nav stays at three items | Less discoverable |
| Own main-nav item "Projekte" | Discoverable, own view | Four nav buttons on a phone |

## Decision
A new view `projects` with nav button "Projekte". Nav order: Timer, Kalender, Projekte, Konto — daily-use views first, account/settings last. The button gets `aria-current="page"` when the view is active, like the others.

## Consequences
The main nav must fit four buttons at phone width (≥ 320 px) without horizontal scrolling. Slice 4 export is a candidate for its own placement decision later.
