# 0049 — The app reminds the user when a timer is still running

- **Status:** accepted
- **Date:** 2026-09-25
- **Decided by:** user
- **Slice:** raised after slice 2R-B, built after slice 2E

## Context
Same research round as [0047](0047-target-hours-and-overtime-balance.md). Every competitor examined
(Clockodo, Toggl Track, Clockify, Kimai) has some form of "your timer is still running" reminder, because the
single most common data defect in a start/stop tracker is a forgotten stop — and in this app a forgotten stop
is expensive: the entry stays open, the day total keeps counting
([0026](0026-month-cell-content-and-live-month-total.md)), and the user has to repair it by hand in the day
detail ([0040](0040-open-entries-resolved-in-the-day-detail.md)).

The app already *detects* the situation: it warns after 12 hours
([0024](0024-no-future-times-midnight-allowed.md)) and marks multiple open entries. What it cannot do is tell
the user when they are not looking at it.

## Options
| Option | Pros | Cons |
|---|---|---|
| In-app hint only, sharper than today's 12 h warning (e.g. a threshold the user sets) | no permission, no new platform API, works offline, fully testable | reaches nobody who has closed the tab — which is the actual failure case |
| In-app hint **plus** an optional browser notification via the Notification API when the user grants permission | reaches the user outside the tab; a normal PWA capability, no dependency, no server | needs a permission prompt, only fires while the page or its service worker is alive, and behaves differently per browser and OS; untestable in jsdom, so it needs a seam and a manual check |
| Scheduled notifications from the service worker | would fire with the app closed | Web Periodic Background Sync / Notification Triggers are not reliably available; effectively not implementable without a server, which [0031](0031-no-backend-firebase-dropped.md) rules out |

## Decision
A reminder for a still-running timer is in scope. Its shape: an in-app reminder that the user can configure,
**plus** an optional browser notification where the platform permits it — explicitly opt-in, off until the
user switches it on and grants permission.

The threshold, the exact wording, and how far the notification is pursued are settled in that slice's own
architect round.

## Consequences
- The honest limitation must be stated in the UI where the setting lives: with the browser closed, no
  reminder can be delivered. A promise this app cannot keep is worse than no reminder at all.
- The Notification API is a browser capability the test environment lacks, so it enters through an injectable
  seam and its real delivery becomes a manual check
  ([0041](0041-fake-indexeddb-and-injectable-browser-seams.md)).
- `Preferences` grows again (reminder on/off, threshold), which the backup format has to carry
  ([0037](0037-json-backup-with-replace-all-import.md), [0053](0053-backup-snapshot-and-atomic-replace-all.md)).
- No sound, no email, no push service, no server-side scheduling — those would all need the backend that
  [0031](0031-no-backend-firebase-dropped.md) removed.
- Bundled with [0050](0050-rounding-rules-are-display-only.md) into one slice, as the user chose them
  together ([0052](0052-slice-order-after-the-local-rebuild.md)).
