# 0044 — All PDF text is reduced to the WinAnsi (Windows-1252) character set before rendering; unsupported characters become "?"

- **Status:** accepted
- **Date:** 2026-10-17
- **Decided by:** architect
- **Slice:** 4

## Context
[0043](0043-pdf-via-jspdf-autotable-lazy-loaded.md) uses jsPDF's built-in Helvetica. That font only covers WinAnsi (Windows-1252), which includes äöüß, €, – and „“. Project names may contain emoji or non-Latin text. jsPDF then renders garbage or behaves unpredictably. The brief requires that such names "must not throw", and that has to be testable.

## Options
| Option | Pros | Cons |
|---|---|---|
| Sanitise every PDF string in the pure content model: characters outside Windows-1252 → `?` | Deterministic, unit-testable, the renderer never sees unsupported glyphs | Emoji/non-Latin names show as `?` |
| Embed a Unicode TTF font | Correct glyphs | +100 KB to several MB, more precache, out of scope (0043) |
| Pass the strings through unchanged | No code | Garbled output, behaviour untestable |

## Decision
The pure PDF content model replaces every code point that Windows-1252 cannot encode with `?`. This applies to all strings it produces, including the e-mail and project names. A surrogate pair (e.g. one emoji) becomes a single `?`. The renderer receives only sanitised strings.

## Consequences
- An emoji in a project name renders as `?` in the PDF, while the CSV (UTF-8) keeps it intact.
- The behaviour is covered by exact unit tests on the content model.
- Embedding a Unicode font later would supersede this decision.
