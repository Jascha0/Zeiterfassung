# 0034 — The `uid` parameter is removed from the repository contract, the hooks and the views

- **Status:** accepted
- **Date:** 2026-09-22
- **Decided by:** user
- **Slice:** slice 2R (local rebuild)

## Context
Slice 1 keyed everything by user: `EntryRepository`/`SettingsRepository` take a `uid`, `useTimerData(uid)` and `useMonthEntries(uid, …)` take it, and every view receives it as a prop. With [0032](0032-no-authentication-no-accounts.md) there is no user identity left to key by. No real data exists (no Firebase project was ever created), so this is purely a code question.

## Options
| Option | Pros | Cons |
|---|---|---|
| Remove `uid` everywhere | no concept in the code that means nothing; signatures read as what they do | a mechanical change across ~25 files including tests |
| Keep a constant `LOCAL_UID = 'local'` | tiny diff now | a permanently unexplainable parameter in every signature and test line, inherited by every future slice |
| Local profiles (several people on one machine) | multi-person use | speculative complexity for a need the user does not have |

## Decision
`uid` disappears from the data contract, the hooks and the view props: `subscribeEntriesInRange(range, onChange, onError)`, `subscribeOpenEntries(onChange, onError)`, `applyTransition(plan)`, `createEntry(entry)`, `updateEntry(id, patch)`, `deleteEntry(id)`, `subscribePreferences(...)`, `savePreferences(prefs)`, `useTimerData()`, `useMonthEntries(monthStart)`. Stored records carry no owner field. There is no local profile concept and no local PIN.

## Consequences
- A wide but mechanical diff in slice 2R, touching the data layer, both hooks, every view that passes the prop (including the already-built `CalendarView` and `DayDetailView`) and every test that constructs them. This is expected churn, not a warning sign.
- `ThemeProvider` is no longer keyed by user, so its `key={user.uid}` remount trick disappears.
- Persisted records become simpler and the backup format ([0037](0037-json-backup-with-replace-all-import.md)) carries no identity either.
- Reintroducing multi-user or multi-profile use later would mean adding a scoping concept back — a new decision, and by then a data migration, since real data will exist.
