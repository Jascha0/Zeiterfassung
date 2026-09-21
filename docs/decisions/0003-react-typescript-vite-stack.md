# 0003 — Frontend stack is React 19 + TypeScript (strict) + Vite, with date-fns, Vitest and vite-plugin-pwa

- **Status:** accepted
- **Date:** 2026-09-16
- **Decided by:** architect
- **Slice:** slice 1 (foundation, auth, timer)

## Context
Greenfield project, single developer plus an agent pipeline. The stack had to support a static PWA build, be well covered by training data and tooling, and need no server-side rendering.

## Options
| Option | Pros | Cons |
|---|---|---|
| React + TS + Vite (SPA) | mainstream, huge ecosystem, fast builds, first-class PWA plugin, agents know it well | more boilerplate than Svelte |
| Vue or Svelte + Vite | less boilerplate, smaller bundles | smaller ecosystem for auth/Firebase examples |
| Next.js | routing and SSR built in | SSR is unnecessary for a personal offline app, heavier hosting |

## Decision
React 19 + TypeScript in strict mode, built by Vite, with `date-fns` for date maths, Vitest + Testing Library for tests and `vite-plugin-pwa` for the manifest and service worker. Plain CSS with custom properties, no UI framework.

## Consequences
Static output deployable to any static host; no SSR complexity. Strict TypeScript makes the domain layer safe to refactor. No component library means UI code is hand-written, which keeps dependencies low but puts accessibility work on us.
