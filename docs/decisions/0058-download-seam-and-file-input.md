# 0058 — Writing the backup file goes through an injectable seam in `Services`; reading one goes through a real file input

- **Status:** accepted
- **Date:** 2026-09-25
- **Decided by:** architect
- **Slice:** slice 2E (backup)

## Context
The backup needs two browser capabilities the test environment does not have. jsdom provides no
`URL.createObjectURL`, and an anchor with a `download` attribute does nothing when clicked — so "the file
reaches the user's disk" cannot be asserted in a test, and code that calls those APIs directly cannot even be
executed. The project has already met this situation twice and answered it the same way both times: the
cross-tab channel and the persistence request became injectable seams, and whatever remained was named in a
manual checklist ([0041](0041-fake-indexeddb-and-injectable-browser-seams.md)). That answer is now a durable
rule of the project.

The two sides are not symmetrical. Reading is an `<input type="file">` whose `change` event carries a `File`;
jsdom can construct a `File`, Testing Library can fire the event, and the app only needs the text inside it. The
file *picker* is the untestable part — the app never sees it.

The seam also has a second job in this slice: [0055](0055-replace-all-import-safety.md) aborts the import when
the pre-import safety backup cannot be written, and that promise is only credible if a test can make writing
fail.

## Options
| Option | Pros | Cons |
|---|---|---|
| A one-method file-writing seam as a new member of `Services`, injected in `main.tsx`; import reads through a real `<input type="file">` and the `File`'s own text | consistent with how `Services` already delivers the store; every test that builds services can inject a recording or failing double; the whole export path including serialisation runs in tests; the import path runs end to end from a fabricated `File` | `Services` gains a third member, so every existing `const services: Services = { … }` literal in the test suite needs one line added |
| Call `URL.createObjectURL` + anchor directly in the view and stub the globals per test (`vi.stubGlobal`) | no production indirection | jsdom has nothing to stub in a faithful way, the failure path is hard to provoke, and global stubbing leaks between cases — the project already rejected this shape for the channel |
| Prop-drill a download callback from `main.tsx` through `App` into the settings view | no change to `Services` | plumbing through two components that have no interest in it, and `App`'s props stop being just `services` |
| The File System Access API (`showSaveFilePicker`) so the user chooses the location | the user knows where the file is; overwriting the same file is possible | Chromium-only, and it puts a second untestable API behind the same seam. A later implementation *of the same seam* can add it without touching any caller |

## Decision
**Writing** a file is an injectable seam: a single asynchronous operation that takes a filename and the text to
write, resolves when the file has been handed to the browser and rejects when it could not be. It is a member of
`Services`, created in `src/main.tsx` next to the store, and its default implementation is the Blob + object-URL
+ temporary-anchor dance with the URL revoked afterwards. No view constructs it and no view touches
`URL`/`document.createElement` for this purpose.

**Reading** a file is a plain `<input type="file" accept="application/json">` inside the settings view; the app
takes the selected `File` and reads its text. No seam, because the part that is testable is the part the app
actually owns. *Assumption to verify in the spec phase:* reading the text of a `File` works in this project's
jsdom version. If it does not, the reading step gets the same treatment as writing — a seam with a default that
does it and a double that returns a string — and nothing else about this decision changes.

What remains unverifiable automatically is named as manual checks: a real file genuinely appearing in the
download folder, a real file picker selecting it, and a round trip between two browser profiles.

## Consequences
- The serialisation, the filename, the validation, the confirmation, the abort-on-failure rule and the replace
  itself are all under test; only the last inch to the disk is manual.
- `Services` now means "everything from outside the app that a view may need", which is a slightly wider
  definition than "the repositories". Stated here so the next slice does not have to guess whether the
  Notification API of [0049](0049-reminder-while-a-timer-is-running.md) belongs there too — it does.
- The mechanical cost is one added property in each `Services` literal in the test suite (the same kind of edit
  as 2R-B's group (d)). A test helper that builds services may be introduced to stop this recurring; that is the
  Planner's call.
- A future "choose where to save" implementation, or a desktop wrapper writing straight to the filesystem, is a
  change behind the seam with no caller affected.
- Two `accept="application/json"` caveats to live with: the attribute is a hint, not a guarantee, and some
  platforms will still offer any file — which is why validation
  ([0056](0056-strict-all-or-nothing-import-validation.md)) and not the picker is what protects the data.
