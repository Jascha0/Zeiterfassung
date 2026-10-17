# 0043 — The PDF is generated with jsPDF + jspdf-autotable, loaded lazily and precached for offline use

- **Status:** accepted
- **Date:** 2026-10-17
- **Decided by:** user (slice-4 question F5, option A)
- **Slice:** 4

## Context
[0003](0003-react-ts-vite-stack.md) left the export library to the Planner, client-side. The app is an offline PWA, and the initial bundle should not grow for a rarely used feature.

## Options
| Option | Pros | Cons |
|---|---|---|
| jsPDF + jspdf-autotable, dynamic `import()` | A real PDF file with one click, offline once precached, tables built in | ~350–450 KB extra chunk (estimate); the standard fonts lack emoji and non-Latin scripts |
| Browser print dialog + print CSS | No dependency | A detour via the print dialog; results vary by browser and are awkward on mobile |
| pdfmake | Easy layout, full Unicode font | ~1–2 MB with fonts |

## Decision
- **Dependencies:** `jspdf` and `jspdf-autotable` are added as runtime dependencies.
- **Lazy loading:** both are imported only via dynamic `import()` from the PDF renderer, never statically, so they land in a separate chunk. That chunk is precached by the existing Workbox `globPatterns` and stays under the 2 MiB default limit.
- **Unused jsPDF parts:** the optional `html()` dependencies (html2canvas, dompurify, canvg) are not used and should not be shipped or precached.
- **Font:** the built-in Helvetica (WinAnsi). Characters outside it must not crash rendering.

## Consequences
- Choosing a library sets the PDF layout API; switching later means rewriting only the renderer, because the report model is library-independent ([0037](0037-export-generated-client-side-from-loaded-month.md)).
- Emoji or non-Latin text in project names may render wrongly in the PDF; embedding a Unicode font would be a new decision.
- The build output must be checked: no jsPDF code in the initial chunk.
