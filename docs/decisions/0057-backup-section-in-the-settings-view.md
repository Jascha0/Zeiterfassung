# 0057 — Export and import live as a `Sicherung` section in the settings view, and the local-data notice is rewritten

- **Status:** accepted
- **Date:** 2026-09-25
- **Decided by:** architect
- **Slice:** slice 2E (backup)

## Context
[0043](0043-route-set-of-the-local-app.md) fixed the route set at `#/timer`, `#/kalender/YYYY-MM`,
`#/tag/YYYY-MM-DD`, `#/einstellungen`, with everything else falling back to the timer. The backup needs a home,
and [0046](0046-settings-view-states-where-the-data-lives.md) — which currently tells the user that a file
backup "folgt im nächsten Schritt" — becomes wrong the moment this slice ships. Its own Consequences section
requires a superseding decision for the new wording rather than a quiet edit.

The settings view (`src/views/SettingsView.tsx`) today holds a theme radio group and that notice. It is where a
user looks for app-level facts, and it is already the place that talks about where the data lives.

## Options
| Option | Pros | Cons |
|---|---|---|
| A `Sicherung` section inside the existing settings view | no new route, no navigation change, no fallback rules to extend; the warning about the single copy and the remedy sit in the same place; the view is still small | the settings view grows from two things to three |
| A new route `#/sicherung` with its own nav item | the backup is prominent, and a dedicated view has room to grow (backup age, automatic export) | extends [0043](0043-route-set-of-the-local-app.md) and the nav for two buttons; a fourth nav item for something used a few times a month |
| A link on the timer view | maximum visibility | clutters the screen used every day with an action used monthly |

## Decision
Export and import are a section in the settings view, headed `Sicherung`, below the theme block. No new route,
no new nav item; [0043](0043-route-set-of-the-local-app.md) stands unchanged.

The section contains a short explanation of what the file is and that it is unencrypted, the export action, and
the import action — the import being a real file input, not a second route
([0058](0058-download-seam-and-file-input.md)).

The local-data notice of [0046](0046-settings-view-states-where-the-data-lives.md) is replaced, verbatim, by:

> `Alle Daten liegen nur in diesem Browser auf diesem Gerät. Wenn du die Browserdaten löschst, sind sie weg. Lade dir deshalb regelmäßig eine Sicherung herunter.`

The other two sentences are kept unchanged on purpose: the risk did not change, only the remedy did.

## Consequences
- Supersedes [0046](0046-settings-view-states-where-the-data-lives.md). The old sentence must not survive
  anywhere — it is asserted verbatim in `src/views/SettingsView.test.tsx`, so both the string and its test
  change in this slice.
- `SettingsView` gains its first dependency on the data layer (`useServices()`), having been propless and
  store-free since 2R-B. Its test file grows accordingly.
- The settings view stays the one place that states how fragile local-only storage is and offers the way out,
  which keeps the README (`README.md:53-63`) and the UI telling the same story; the README's "slice 2E is the
  remedy" wording has to be updated to "export it from the settings" in this slice.
- No routing, navigation or `aria-current` behaviour changes, so every 2R-B routing criterion stays valid
  untouched.
- If a later slice adds a backup-age hint or an automatic export, a dedicated route becomes worth reconsidering;
  at that point this decision is superseded, not stretched.
