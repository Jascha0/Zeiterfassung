# 0044 — The app boots unconditionally into the timer; the local store is its only service, and an unusable IndexedDB surfaces as the normal load error

- **Status:** accepted
- **Date:** 2026-09-24
- **Decided by:** architect
- **Slice:** slice 2R-B (the shell)

## Context
`src/main.tsx:13-21` still calls `readFirebaseConfig(import.meta.env)` and renders `ConfigMissing` when it
returns `null`. No Firebase project was ever created and no `.env` ever existed, so **every** hand start of
the app lands on the config-missing view. Together with the auth gate in `src/App.tsx` this is the whole
reason the user cannot run the app, and removing it is the point of this slice.

Once the gate is gone, `Services` (`src/app/ServicesContext.tsx:5-9`) carries an `auth` member with no
implementation, and the question becomes what the app should do when the one remaining service cannot
start — `IndexedDbAdapter.loadAll()` rejects with `IndexedDB ist in dieser Umgebung nicht verfügbar.` if the
browser has no `indexedDB` (private mode in some browsers, storage disabled by policy).

## Options
| Option | Pros | Cons |
|---|---|---|
| Boot unconditionally; `Services = { entries, settings }`; a storage failure travels the existing subscription-error path and the views show `Daten konnten nicht geladen werden.` | nothing stands between page load and the timer; exactly one failure path, already built and tested (A7); no new view, no new string | the message does not distinguish "storage broken" from "load failed", so a rare user learns little |
| Keep a blocking pre-boot screen, `ConfigMissing` repurposed as "IndexedDB unavailable" | a precise explanation for that one case | reintroduces the pattern that just cost the user a runnable app; needs a probe before render, a new view and a new string, for a case nobody in this project will hit |
| Fall back to an in-memory store when IndexedDB is unavailable | the app always "works" | it silently loses every entry at reload — the worst possible outcome for a time tracker, and it contradicts [0033](0033-indexeddb-with-in-memory-mirror.md) |

## Decision
Boot unconditionally. `src/main.tsx` creates the store (`createLocalStore({ adapter: new IndexedDbAdapter() })`),
builds `Services = { entries: store, settings: store }` and renders `<App>` — no config read, no probe, no
branch. `Services` loses its `auth` member; `ConfigMissing`, `readFirebaseConfig` and the `VITE_FIREBASE_*`
declarations in `src/vite-env.d.ts` are deleted ([0035](0035-firebase-code-removed-outright.md)).

A failing `loadAll()` is **not** a special case: the hooks map it to `Daten konnten nicht geladen werden.`
and the views show that instead of data, exactly as criterion A7 already proves. There is no in-memory
fallback, ever.

## Consequences
- `npm run dev` and `npm run preview` show the timer with no configuration of any kind. No `.env`, no
  account, no network.
- One error path instead of two; `src/main.tsx` becomes ~8 lines and stays the untested bootstrap it is
  (the persistence request lives in the store factory, per [0041](0041-fake-indexeddb-and-injectable-browser-seams.md)).
- A browser with IndexedDB switched off shows a generic German error and no data. Accepted: it is the same
  single-profile assumption as [0038](0038-installable-pwa-single-profile.md), and a wrong-but-cheerful
  in-memory app would destroy data instead.
- Any future service (a backup/export service in 2E) is added to `Services` the same way, constructed in
  `main.tsx` and injected — the views never construct anything.
