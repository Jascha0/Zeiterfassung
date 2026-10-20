# 0032 — In the running timer the project picker relabels the current block; "Projekt wechseln" splits it

- **Status:** accepted
- **Date:** 2026-10-16
- **Decided by:** user (slice-3 question F2, option C)
- **Slice:** 3

## Context
While a work block runs, the user may have forgotten to pick a project (fix the current block) or may start working on another project (count from now). Both are common.

## Options
| Option | Pros | Cons |
|---|---|---|
| Relabel only | Simplest | Switching from now needs pause/resume or a manual edit |
| Split only | Matches "from now on" | Forgotten project only fixable in the day detail |
| Both: picker relabels, separate "Projekt wechseln" splits | Covers both cases | Two controls, one new timer transition |

## Decision
- Changing the project in the timer while working updates the running work block's `projectId` (single-document update; 0030 allows it on the active entry). The block keeps its start.
- A separate "Projekt wechseln" action (working state only) takes a target project, possibly "Kein Projekt". It closes the active work block at `now` and creates a new open work block starting at the same instant, with the target project and no note. It is a timer transition with the same batch shape as pause/resume (one close + one create), planned by the pure `planTransition`. Switching to the block's current project is not offered.

## Consequences
`TimerAction` gains a switch action that carries a project parameter. A switch creates a new block that starts exactly where the old one ends (touching intervals, valid per 0020). Calling switch while idle or on break is invalid, like the other actions.
