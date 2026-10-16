# 0003 — Frontend stack: React + TypeScript (strict) + Vite, date-fns, Vitest, vite-plugin-pwa

- **Status:** accepted
- **Date:** 2026-09-16
- **Decided by:** architect
- **Slice:** 1 (migrated from brief D3)

## Context
Greenfield PWA, no server-side rendering needed.

## Options
| Option | Pros | Cons |
|---|---|---|
| React + TS + Vite | Mainstream, large ecosystem, good PWA plugin | — |
| Vue / Svelte | Smaller bundles | Smaller ecosystem for the agents/user |
| Next.js | Routing, SSR | SSR not needed, heavier |

## Decision
React + TypeScript strict + Vite; date-fns for date math; Vitest + Testing Library (jsdom) for tests; vite-plugin-pwa for manifest and service worker.

## Consequences
New dependencies should fit this stack. Date math goes through date-fns (DST-safe local-day handling).
