# 0028 — Removing a project or note from an entry deletes the field; it is never stored as null or ""

- **Status:** accepted
- **Date:** 2026-10-16
- **Decided by:** architect
- **Slice:** 3

## Context
`EntryChanges` (slice 2) can only set fields. Slice 3 must also unset `projectId` and `note`. The entry rules accept `projectId` only as a string and `note` only as a string, and the slice-1 rule says writes never contain `undefined`.

## Options
| Option | Pros | Cons |
|---|---|---|
| Delete the field (`deleteField()` in Firestore; explicit "remove" marker in the change object) | Matches rules and `parseEntry` (absent = none), one canonical "no project" state | Change type needs a third state besides "unchanged" and "set" |
| Store `null` / `""` | Simple to write | Rules reject `null`; two representations of "none"; parser and export must handle both |

## Decision
An entry has no project / no note exactly when the field is absent. The change object distinguishes three states per optional field: unchanged, set to a value, removed. The Firestore repository maps "removed" to `deleteField()`; the in-memory repository removes the key. Explicit field lists stay the rule; spreads and `undefined` stay forbidden.

## Consequences
- The rules check the merged document, so a removal passes `isValidEntry` unchanged.
- Creating entries (timer transitions and manual adds) writes `projectId`/`note` only when they have a value.
