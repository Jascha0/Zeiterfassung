# 0011 — Theming via CSS variables with light/dark/system, persisted per user

- **Status:** accepted
- **Date:** 2026-09-16
- **Decided by:** architect
- **Slice:** 1 (migrated from brief D11)

## Context
Dark mode was requested (0012); retrofitting theming is costly.

## Options
| Option | Pros | Cons |
|---|---|---|
| CSS variables from slice 1 | Cheap, every new view inherits it | — |
| Add theming later | — | Every view must be reworked |

## Decision
All colors via CSS variables (`src/styles.css`); preference light/dark/system synced in `users/{uid}/settings/preferences` with a localStorage fallback and an inline no-flash script.

## Consequences
New views must use the existing CSS variables, never hard-coded colors, and keep contrast in both themes.
