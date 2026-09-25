# 0054 — The `src/data/` freeze ends with 2R-B; slice 2E fixes inherited finding 3 and re-defers 4, 5, 6 and 7

- **Status:** accepted
- **Date:** 2026-09-25
- **Decided by:** architect
- **Slice:** slice 2E (backup)

## Context
[0045](0045-slice-2rb-freezes-src-data.md) froze `src/data/` **for the duration of slice 2R-B** and deferred
five weaknesses inherited from 2R-A's review, each with a named trigger. 2R-B is finished and APPROVED
(`448387c`, `git diff 1eb55ab -- src/data/` empty), so the freeze has served its purpose and lapses with the
slice that imposed it. It is stated here explicitly because a frozen directory is the kind of rule that
outlives its reason if nobody writes down when it ended.

[0045](0045-slice-2rb-freezes-src-data.md) also predicted that 2E "must revisit 3, 4 and 7". This is that
revisit. With the data-layer shape of [0053](0053-backup-snapshot-and-atomic-replace-all.md) — a dedicated
`replaceAll` rather than a `TransitionPlan` or a `clear` flag — the picture is:

- **3 — `channel.post` on the success path of `persist()` (`localStore.ts:246`) can reject a write that landed.**
  Now genuinely dangerous: `replaceAll` posts on the same channel, so a throwing `post` would report "the import
  failed" *after* the entire data set was already replaced. The user would then believe their old data is intact
  when it is gone. The worst possible message in the app.
- **4 — a background reload in the `failed` state swaps memory without notifying (`:294-298`).** Its trigger was
  "anything outside tests reads `getEntries()`". The export must read everything, so the trigger would come
  true — unless the read path refuses in any state other than `ready`, which is exactly what
  [0053](0053-backup-snapshot-and-atomic-replace-all.md) requires. The trigger is therefore closed rather than
  tripped.
- **5 — concurrent writes to the same record diverge memory from storage.** Trigger: a view stops disabling its
  action while a write is pending. 2E must keep that discipline for the import (and it wants to anyway: a second
  click on `Ersetzen` must be impossible).
- **6 — `deliver()` hands out the authoritative `Entry` objects (`:342-345`).** Trigger: a consumer mutates a
  delivered entry. The export serialises copies and mutates nothing.
- **7 — `applyTransition` with one id in both `close` and `delete` (`:144-176`).** The import does not use
  `applyTransition` at all, so no caller emits such a plan; `planTransition` still emits `delete: []`.

## Options
| Option | Pros | Cons |
|---|---|---|
| Fix 3 now; close 4's trigger by guarding the read; keep 5, 6, 7 deferred unchanged | the only finding that the import can actually make harmful is removed; the slice's diff stays centred on the backup; each remaining deferral keeps a named trigger | four known-imperfect paths survive another slice |
| Fix all five in 2E | the notes are gone | 4 and 7 need changes to load semantics and the timer batch path — neither is reachable from this slice's feature, and both would enlarge a review that already covers the first destructive user action |
| Fix none, as in 2R-B | smallest diff | leaves a path where a completed replace-all reports failure. Unacceptable: the message would be a lie about the user's data |

## Decision
`src/data/` is open again for slice 2E, limited to what the backup needs
([0053](0053-backup-snapshot-and-atomic-replace-all.md)) plus the following:

- **Finding 3 is fixed:** a failure of the cross-tab notification may never turn a persisted write into a
  rejected one. The notification is best-effort; the write's promise reflects persistence only. It needs a
  falsifiable test (a channel double whose `post` throws: the write resolves and the data is in the adapter).
- **Finding 4 stays deferred**, with its trigger *narrowed*: the only production reader of the full state is
  the export, and it refuses unless the store is `ready`. Whoever adds another full-state reader, or a retry
  after a failed load, owns the fix.
- **Findings 5, 6 and 7 stay deferred** with their [0045](0045-slice-2rb-freezes-src-data.md) triggers
  unchanged. 2E must not create any of them: the import action is disabled while the import runs (5), the
  export copies rather than mutates (6), and the import does not go through `applyTransition` (7).
- The stale comment in `src/data/repository.ts:5-6`, which still points at the deleted `src/auth/authTypes.ts`,
  is corrected — it was left only because of the freeze (2R-B review, finding 7).

Everything else under `src/data/` stays as reviewed: no refactor, no renaming, no "while we are here".

## Consequences
- 2R-B's reviewer-recommended carry-over item ("when 0045's freeze lifts: `repository.ts:5-6`") is discharged in
  this slice.
- The four surviving findings now have narrower triggers than before, and the one that the import could have
  made dangerous is gone. Nothing is inherited silently.
- A reviewer of 2E judges `src/data/` changes against this decision and
  [0053](0053-backup-snapshot-and-atomic-replace-all.md): anything else in that directory is out of scope and
  can be rejected on sight.
- `console.warn` in `ThemeContext.tsx:72` (the other carry-over question) is **kept**: the durable rule says no
  logging *infrastructure* is added, and a single warning on a swallowed error is not infrastructure. No change,
  no decision file of its own.
