# Zeiterfassung

Persönliche Arbeitszeiterfassung als Progressive Web App (React, TypeScript, Vite). Die App läuft
vollständig lokal: kein Konto, keine Anmeldung, kein Server, keine Netzwerkverbindung.

## 1. Funktionen

- Timer: Start, Pause, Weiter, Arbeitstag beenden – beliebig viele Pausen, Neustart am selben Tag möglich
- Live-Anzeige der heutigen Netto-Arbeitszeit, der Pausen und der laufenden Pause, Liste der heutigen Einträge
- Warnungen bei mehreren offenen Einträgen und bei einem Arbeitsblock über 12 Stunden
- Monatskalender (Montag zuerst) mit Tagessummen, Monatssumme und Markierungen für laufende, sehr lange
  und sich überschneidende Einträge
- Tagesansicht: Einträge hinzufügen, bearbeiten und löschen, mit Bestätigung und deutschen Fehlermeldungen
- Einstellungen: Design hell/dunkel/System
- Installierbar als PWA, offline nutzbar

## 2. Voraussetzungen

- Node.js ≥ 22.12 und npm
- Ein aktueller Browser mit IndexedDB

Es gibt **keine** Konfiguration: keine `.env`, keine Zugangsdaten, kein Projekt in einer Cloud.

## 3. Lokal starten

```bash
npm install
npm run dev         # Entwicklungsserver unter http://localhost:5173
```

Danach <http://localhost:5173> öffnen. Die App zeigt sofort den Timer.

Weitere Befehle:

```bash
npm test            # Unit- und UI-Tests
npm run typecheck   # TypeScript-Prüfung
npm run build       # Produktions-Build nach dist/
npm run preview     # Produktions-Build lokal ausliefern
```

## 4. Wo die Daten liegen

Alle Einträge und die Design-Einstellung liegen in der **IndexedDB-Datenbank `zeiterfassung` dieses
Browserprofils auf diesem Gerät**. Nichts wird übertragen, nichts liegt auf einem Server.

Die Daten überleben:

- das Neuladen der Seite (F5),
- das Beenden und Neustarten des Browsers,
- einen Neustart des Rechners.

Die Daten sind **weg**, wenn:

- du die Browserdaten bzw. Websitedaten für diese Adresse löschst („Cookies und Websitedaten löschen“,
  „Browserdaten löschen“),
- du das Browserprofil löschst oder in einem anderen Profil, einem anderen Browser oder auf einem
  anderen Gerät arbeitest,
- du die App im privaten/Inkognito-Modus benutzt.

Es gibt derzeit **keine Sicherung**. Der nächste Entwicklungsschritt (Slice 2E) ergänzt einen Export als
JSON-Datei und einen Import, der den Datenbestand vollständig ersetzt. Bis dahin ist dieses
Browserprofil die einzige Kopie deiner Daten.

## 5. Bekanntes Verhalten

- **Einträge über Mitternacht** zählen vollständig zum Tag, an dem sie begonnen haben.
- **Mehrere offene Einträge** werden als Warnung angezeigt; Aktionen betreffen den zuletzt gestarteten
  Eintrag. Über den Link in der Warnung lässt sich der älteste offene Eintrag in der Tagesansicht
  beenden, korrigieren oder löschen.
- **Zeiten in der Zukunft** werden abgelehnt, ein Eintrag darf höchstens 24 Stunden dauern, und
  Einträge dürfen sich nicht überschneiden.
- **Ist IndexedDB nicht verfügbar** (z. B. durch eine Browser-Richtlinie abgeschaltet), zeigt die App
  `Daten konnten nicht geladen werden.` und keine Daten.
