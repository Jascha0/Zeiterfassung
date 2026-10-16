# 0029 — Project names are trimmed, 1–40 characters, unique (case-insensitive, incl. archived); lists sort alphabetically

- **Status:** accepted
- **Date:** 2026-10-16
- **Decided by:** architect
- **Slice:** 3

## Context
Projects are picked from a list in the timer and the day detail, and later appear in the export. Duplicate or blank names would make them indistinguishable.

## Options
| Option | Pros | Cons |
|---|---|---|
| Unique among all projects incl. archived, case-insensitive, checked in the pure domain | No ambiguity in old entries or export; testable | Archived names cannot be reused (user can unarchive or rename) |
| Unique among active projects only | Name reuse possible | Two "Kunde A" in history and export |
| No uniqueness | Simplest | Ambiguous lists |

## Decision
- A name is trimmed; it must be 1–40 characters after trimming (rules enforce the size too, 0026).
- Names are unique compared with `toLocaleLowerCase('de')` across all projects, including archived ones. The check is client-side in `src/domain/`, like 0021. Rename excludes the project itself.
- Every project list (management, pickers, per-project totals with equal time) sorts by name with German collation (`localeCompare(…, 'de')`).

## Consequences
Concurrent offline creates on two devices can still produce duplicates (0006); the UI must render them without crashing. The user can rename one.
