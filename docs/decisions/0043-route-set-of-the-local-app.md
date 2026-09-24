# 0043 — Route set of the local app: `#/timer`, `#/kalender/YYYY-MM`, `#/tag/YYYY-MM-DD`, `#/einstellungen`; everything else falls back to the timer

- **Status:** accepted
- **Date:** 2026-09-24
- **Decided by:** architect
- **Slice:** slice 2R-B (the shell)

## Context
[0025](0025-hand-rolled-hash-routing.md) fixed hand-rolled hash routing, and `src/domain/routing.ts` plus
`src/hooks/useRoute.ts` already implement it — but `src/App.tsx` never used them: its `Shell` still holds
`useState<'timer' | 'account'>`. That is why the calendar, the day detail and the entry form built in slice 2
exist but cannot be reached by a user, which is half of the "I cannot start the app" problem this slice
solves.

Two of the five routes that `routing.ts` declares no longer have a view behind them: `account` (`#/konto`)
lost its subject with [0032](0032-no-authentication-no-accounts.md), and `openEntries`
(`#/offene-eintraege`) with [0040](0040-open-entries-resolved-in-the-day-detail.md). Whatever the shell
renders, the route union has to be brought in line with the views that will actually exist.

## Options
| Option | Pros | Cons |
|---|---|---|
| Remove both dead routes; `account` becomes `settings` at `#/einstellungen`; every unknown or malformed hash (including `#/konto` and `#/offene-eintraege`) falls back to `#/timer` | the union describes exactly the views that exist; one fallback rule, already implemented; nothing to test twice | a bookmark to `#/konto` silently lands on the timer instead of explaining itself |
| Keep `#/konto` as an alias that redirects to `#/einstellungen` | old bookmarks keep working | there are no old bookmarks — the app was never startable; an alias is a permanent special case for a user who does not exist |
| Keep `openEntries` in the union as an unrouted placeholder for a later resolution view | no churn in `routing.ts` | 0040 cancelled that view outright; a union member with no renderer is exactly the dead code this slice removes |

## Decision
The route union is `timer | calendar | day | settings`. Hashes: `#/timer`, `#/kalender/YYYY-MM`,
`#/tag/YYYY-MM-DD`, `#/einstellungen`. `FALLBACK_ROUTE` stays `{ kind: 'timer' }` and catches everything
else, including the two legacy hashes — no alias, no redirect.

The hash is the **single source of the current view**: the shell derives what it renders from `useRoute()`
and navigates by `navigate(route)`; no component keeps view state of its own, and every view receives
navigation as a callback prop (`onSelectMonth`, `onOpenDay`, `onBack`) rather than reaching for the router.

## Consequences
- `src/domain/routing.ts` loses the `openEntries` union member, its `offene-eintraege` parse branch and its
  hash case; `account`/`#/konto` become `settings`/`#/einstellungen`. `routing.test.ts` follows.
- Reload, back and forward keep the view; deep links (`#/tag/2026-09-18`) work, which is what makes the
  manual browser checklist executable at all.
- The nav's `aria-current="page"` marks `Kalender` for both the `calendar` and the `day` route, because the
  day detail is entered from the calendar.
- `TimerStatus.openEntries` in `src/domain/timer.ts` is unrelated domain vocabulary and stays.
- A future week view or report view adds a union member plus a case in three places and nothing else.
