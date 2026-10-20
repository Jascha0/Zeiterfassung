# 0031 — Project colors come from a fixed palette of 8 named keys; only the key is stored

- **Status:** accepted
- **Date:** 2026-10-16
- **Decided by:** user (slice-3 question F1, option A)
- **Slice:** 3

## Context
0015 gives every project a color. Colors must stay readable in light and dark theme (0011), and the rules must be able to validate the stored value (0026).

## Options
| Option | Pros | Cons |
|---|---|---|
| Fixed palette, store the key, CSS maps each key to a light and a dark tone | Contrast guaranteed in both themes, rules check `in [list]`, themable | Only 8 choices |
| Free hex picker | Any color | Unreadable colors in one theme, regex rule, no theme adaptation |

## Decision
`color` is one of exactly these keys: `blue`, `green`, `orange`, `red`, `purple`, `teal`, `yellow`, `gray`. German labels: Blau, Grün, Orange, Rot, Lila, Türkis, Gelb, Grau. The key list lives in `src/domain/`. Each key gets a light-theme and a dark-theme CSS variable in `src/styles.css`, with ≥ 3:1 contrast against the card background. `firestore.rules` require `color in [these keys]`. A new project defaults to the first key not used by an active project, else `blue`.

## Consequences
Adding a color later needs a domain, CSS and rules change (rules first). An unknown key read from storage (e.g. a newer client) is displayed as `gray`, not rejected.
