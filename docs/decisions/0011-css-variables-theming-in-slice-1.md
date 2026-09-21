# 0011 — Theming uses CSS custom properties with light/dark/system, introduced in slice 1

- **Status:** accepted
- **Date:** 2026-09-16
- **Decided by:** architect
- **Slice:** slice 1 (foundation, auth, timer)

## Context
Dark mode is part of v1 (0012). Retrofitting theming into finished stylesheets is far more expensive than starting with it.

## Options
| Option | Pros | Cons |
|---|---|---|
| CSS custom properties, theme attribute on the root, from slice 1 | every later view is themed for free, no library, no flash if applied early | a small convention every view must follow |
| Add theming in a later slice | slightly less work now | every existing stylesheet must be rewritten later |
| CSS-in-JS / UI library theming | powerful | extra dependency and runtime for a small app |

## Decision
All colours come from CSS custom properties defined for a light and a dark palette; the resolved theme is set as an attribute on the document root. The preference (`light` | `dark` | `system`) is stored per user in `users/{uid}/settings/preferences` and mirrored to `localStorage` so the correct theme is applied before the first paint.

## Consequences
All later views (calendar, day detail, projects, export) are themed automatically as long as they use the variables and never hard-code colours. The local mirror avoids a theme flash but means the local and synced value must be reconciled on sign-in, with the remote value winning when present.
