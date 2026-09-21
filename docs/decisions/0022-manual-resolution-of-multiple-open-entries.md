# 0022 — Several open entries are resolved manually, one by one; the app never closes or deletes them automatically

- **Status:** accepted
- **Date:** 2026-09-18
- **Decided by:** user
- **Slice:** slice 2 (calendar + editing)

## Context
Offline use on two devices with last-write-wins ([0006](0006-offline-firestore-cache-last-write-wins.md)) can leave more than one entry with `end == null`. Slice 1 only detects and warns (`hasMultipleOpenEntries`); the timer then acts on the most recently started one. Slice 2 must let the user clean this up.

## Options
| Option | Pros | Cons |
|---|---|---|
| Manual list: per open entry "Ende setzen" or "Löschen" | nothing is changed without the user's decision; recorded time is never invented or discarded behind their back | two or three interactions in a rare situation |
| One click "keep the newest": older open entries closed with zero duration or deleted | fastest | destroys whatever time those blocks represented |
| One click "chain them": older entries closed at the newer one's start | no time lost | the end times are invented and can inflate a day unnoticed |

## Decision
A resolution view lists every open entry with its type and start time. For each one the user can set an end time or delete it. The warning stays visible until at most one entry is open. No automatic shortcut is offered. The chosen actions are submitted as one atomic batch (a `TransitionPlan`, see [0020](0020-entry-crud-repository-methods.md)), so the state cannot end up half-resolved.

## Consequences
Time data is only ever changed by an explicit user decision, which matters because these entries are the only place where the app's own sync behaviour can corrupt records. The view is reachable from the timer warning and from the day detail. Deletion here is irreversible, so it needs the same confirmation as any other delete. Because it is a batch, a rejected write leaves nothing applied.
