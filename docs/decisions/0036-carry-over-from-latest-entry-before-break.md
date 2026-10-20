# 0036 — "Weiter" carries over the project of the latest entry before the break, if that entry is a work entry (clarifies 0033)

- **Status:** accepted
- **Date:** 2026-10-17
- **Decided by:** architect (records the reading accepted in slice 3: spec OQ3, ledger NB3, review non-blocking finding 2)
- **Slice:** 4 (record-keeping for slice 3)

## Context
[0033](0033-timer-project-carry-over.md) says "Weiter" carries over the project of "the latest work entry with `start <` the break's start". Slice 3 built something slightly different, documented it, and the review accepted it. The code takes the **latest entry of any type** with `start <` the break's start. If that entry is a break, nothing is carried over. This reading needs no extra Firestore composite index (type + start). The two readings only differ when the user manually puts a break directly before the running break, and normal timer use never does that. This file makes the record match the built behaviour. It does not change 0033's rules for the idle Start or for notes.

## Options
| Option | Pros | Cons |
|---|---|---|
| Keep the 0033 wording and change the code to "latest *work* entry" | Matches the original text | Needs a composite index and a code change for a case the timer never produces |
| Record the built reading: latest entry of any type; carry over only if it is a work entry | Matches the code; no index | Differs from 0033 in a constructed edge case (manual break inserted just before the running break) |

## Decision
On "Weiter", the new work block gets the `projectId` of the **latest entry (any type) with `start <` the running break's start**, but only if that entry is a work entry with a project. In every other case it gets no project: no such entry, the entry is a break, or the entry has no project. Everything else in 0033 still applies: the note is never carried over, an archived project is still carried over, Start uses the idle selection, and `planTransition` stays pure.

## Consequences
- 0033 stays accepted for the idle Start and for notes. For the Weiter source, this file is the binding wording.
- No code change is needed, and slice 3 is already built this way.
- If the edge case ever matters, a later decision can switch to "latest work entry" and add the composite index.
