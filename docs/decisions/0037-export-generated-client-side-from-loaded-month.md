# 0037 — Export files are generated in the browser from the month's entries and projects; no new backend, no new collection

- **Status:** accepted
- **Date:** 2026-10-17
- **Decided by:** architect
- **Slice:** 4

## Context
[0015](0015-projects-and-export-scope.md) asks for a CSV and a PDF per month. [0003](0003-react-ts-vite-stack.md) leaves the export library open but keeps everything client-side. The app runs on the Spark plan and has no Cloud Functions ([0004](0004-firebase-backend.md)). It must work as an offline PWA ([0006](0006-offline-last-write-wins.md)).

## Options
| Option | Pros | Cons |
|---|---|---|
| Generate in the browser from the existing month subscription and the projects subscription, then download a Blob | No backend, works offline, no new rules | Offline, the export only contains what this device has cached |
| Cloud Function renders the files | Always complete server data | Needs the Blaze plan, adds cost and an auth surface, does not work offline |
| Store generated reports in Storage or Firestore | Re-download later | New rules and storage, and nobody asked for it |

## Decision
- An export is built from the entries whose `start` lies in the selected local month ([0009](0009-midnight-entries-on-start-day.md)), plus the user's projects. Both come from the same repository subscriptions the UI already uses (`subscribeEntriesInRange` with `monthRange`, and the projects subscription).
- Pure domain functions in `src/domain/` turn `(entries, projects, month, now)` into a report model and into CSV text. The PDF renderer turns the report model into a PDF. Building the file and triggering the download happen in the view layer, via a Blob and a temporary `<a download>`.
- The file names are `zeiterfassung-YYYY-MM.csv` and `zeiterfassung-YYYY-MM.pdf`.
- Export is only possible once the month data has loaded without error. When the device is offline, the UI shows a hint that the export only contains data stored on this device.
- Nothing is written to Firestore, and `firestore.rules` stay unchanged.

## Consequences
- Times are local device time ([0010](0010-client-clock-instants.md)). An entry that crosses into the next month counts in its start month.
- The report model and the CSV are fully unit-testable without a DOM. The PDF is tested at the level of the report model, plus a smoke test that a PDF is produced.
- If the user later wants reports kept or sent by mail, that needs a new decision. This one rules out no backend change.
