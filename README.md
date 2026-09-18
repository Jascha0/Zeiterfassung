# Zeiterfassung

Persönliche Arbeitszeiterfassung als Progressive Web App (React, TypeScript, Vite) mit Firebase (Authentication + Firestore) und Offline-Synchronisation zwischen Geräten.

## 1. Überblick

Funktionen in Version 1 (Slice 1):

- Anmeldung mit Google (Pop-up, auf Mobilgeräten/installierter PWA automatisch per Weiterleitung) oder mit E-Mail und Passwort
- Registrierung mit Bestätigungs-E-Mail und Hinweisbanner („erneut senden“), „Passwort vergessen“
- Verknüpfen der jeweils anderen Anmeldemethode unter „Konto“ (beide Methoden führen zum selben Konto und denselben Daten)
- Timer: Start, Pause, Weiter, Arbeitstag beenden – beliebig viele Pausen, Neustart am selben Tag möglich
- Live-Anzeige der heutigen Netto-Arbeitszeit, der Pausen und der laufenden Pause, Liste der heutigen Einträge
- Warnungen bei mehreren offenen Einträgen und bei einem Arbeitsblock über 12 Stunden
- Offline nutzbar: Aktionen werden lokal gespeichert und synchronisiert, sobald wieder eine Verbindung besteht; Online/Offline-Anzeige
- Design hell/dunkel/System, pro Benutzer synchronisiert
- Firestore-Sicherheitsregeln: Jeder Benutzer kann nur seine eigenen Daten lesen und schreiben

## 2. Voraussetzungen

- Node.js ≥ 22.12 und npm
- Ein Google-Konto für die Firebase-Konsole
- Nur für die Regel-Tests: ein Java Development Kit (JDK) 21 oder neuer

## 3. Firebase-Projekt anlegen

1. Öffne <https://console.firebase.google.com> und klicke auf **Projekt hinzufügen**.
2. Gib einen Projektnamen ein (z. B. `zeiterfassung`). Notiere die angezeigte **Projekt-ID**.
3. Google Analytics wird nicht benötigt und kann deaktiviert werden.
4. Das Projekt bleibt im kostenlosen **Spark-Tarif**. Ein Upgrade ist nicht nötig.

## 4. Firestore anlegen

1. In der Konsole: **Build → Firestore Database → Datenbank erstellen**.
2. Standort: **`europe-west3` (Frankfurt)** wählen.
   > **Achtung:** Der Standort kann später **nicht mehr geändert** werden. Bei einer falschen Wahl muss die Datenbank neu angelegt werden.
3. **Produktionsmodus** wählen. Niemals die Testmodus-Regeln (`allow read, write: if true`) verwenden – die richtigen Regeln aus `firestore.rules` werden beim Deploy (Abschnitt 10) hochgeladen.

## 5. Authentication einrichten

1. **Build → Authentication → Jetzt starten**.
2. Unter **Anmeldemethode** aktivieren:
   - **Google** (Support-E-Mail-Adresse auswählen)
   - **E-Mail/Passwort** (nur die erste Option; „E-Mail-Link“ bleibt aus)
3. Unter **Einstellungen → Nutzerkontoverknüpfung** die Standardeinstellung **„Ein Konto pro E-Mail-Adresse“** beibehalten.
4. Unter **Vorlagen** die Vorlagensprache auf **Deutsch** stellen (für Bestätigungs- und Passwort-E-Mails).

## 6. Autorisierte Domains

Unter **Authentication → Einstellungen → Autorisierte Domains** müssen eingetragen sein:

- `localhost`
- `<projekt-id>.web.app`
- `<projekt-id>.firebaseapp.com`

## 7. Web-App registrieren und `.env` anlegen

1. **Projekteinstellungen (Zahnrad) → Allgemein → Meine Apps → Web-App hinzufügen** (`</>`). Firebase Hosting muss hier nicht angehakt werden.
2. Kopiere `.env.example` nach `.env`:
   ```bash
   cp .env.example .env
   ```
3. Übertrage die Werte aus dem angezeigten `firebaseConfig`-Objekt:

   | `firebaseConfig` | `.env` |
   |---|---|
   | `apiKey` | `VITE_FIREBASE_API_KEY` |
   | `authDomain` | `VITE_FIREBASE_AUTH_DOMAIN` |
   | `projectId` | `VITE_FIREBASE_PROJECT_ID` |
   | `appId` | `VITE_FIREBASE_APP_ID` |
   | `storageBucket` | `VITE_FIREBASE_STORAGE_BUCKET` (optional) |
   | `messagingSenderId` | `VITE_FIREBASE_MESSAGING_SENDER_ID` (optional) |

4. **Wichtig für den Produktions-Build:** Setze `VITE_FIREBASE_AUTH_DOMAIN` auf `<projekt-id>.web.app` (die Hosting-Domain, unter der die App läuft). Moderne Browser blockieren sonst den Speicherzugriff zwischen App-Domain und Anmelde-Domain, und die Google-Anmeldung per Weiterleitung (Mobilgeräte, installierte PWA) schlägt fehl. Für die lokale Entwicklung funktioniert auch `<projekt-id>.firebaseapp.com`.

Fehlt die `.env` oder ein Pflichtwert, zeigt die App den Hinweis „Firebase ist nicht konfiguriert“.

## 8. Lokale Entwicklung

```bash
npm install
npm run dev         # Entwicklungsserver unter http://localhost:5173
npm test            # Unit- und UI-Tests (ohne Firebase-Zugangsdaten)
npm run typecheck   # TypeScript-Prüfung
npm run build       # Produktions-Build nach dist/
```

## 9. Tests der Sicherheitsregeln

Die Regel-Tests laufen gegen den lokalen Firestore-Emulator. Ein echtes Firebase-Projekt ist dafür **nicht** nötig (es wird die Demo-Projekt-ID `demo-zeiterfassung` verwendet).

1. JDK 21 oder neuer installieren (z. B. Eclipse Temurin) und prüfen: `java -version`.
2. Ausführen:
   ```bash
   npm run test:rules
   ```
   Der Befehl startet den Emulator über das lokal installierte `firebase-tools`, führt `tests/rules/` aus und beendet den Emulator wieder.

Die Regel-Tests sind bewusst nicht Teil von `npm test`, weil sie Java benötigen.

## 10. Deploy

```bash
npx firebase login
cp .firebaserc.example .firebaserc   # danach "your-project-id" durch deine Projekt-ID ersetzen
npm run deploy
```

`npm run deploy` baut die App und lädt Hosting, Firestore-Regeln und Indizes hoch. Die App ist danach unter `https://<projekt-id>.web.app` erreichbar.

## 11. Manuelle Testcheckliste

Diese Punkte lassen sich nur gegen ein echtes Firebase-Projekt prüfen:

- [ ] **Google-Anmeldung per Pop-up** am Desktop.
- [ ] **Google-Anmeldung per Weiterleitung** auf dem Smartphone bzw. in der installierten PWA (Pop-up blockiert → Weiterleitung).
- [ ] **Registrierung:** Bestätigungs-E-Mail kommt an, Banner erscheint; nach Klick auf den Link und „Status prüfen“ verschwindet das Banner.
- [ ] **Passwort vergessen:** E-Mail kommt an; bei unbekannter Adresse erscheint dieselbe neutrale Meldung.
- [ ] **Verknüpfen:** Mit E-Mail/Passwort anmelden → unter „Konto“ Google verknüpfen → abmelden → mit Google anmelden: dieselben Einträge sind sichtbar. Umgekehrt ebenso (Google-Konto → „Passwort festlegen“).
- [ ] **Sync zwischen zwei Browsern:** In Browser A Start drücken → Browser B (gleiches Konto) zeigt den laufenden Timer innerhalb weniger Sekunden.
- [ ] **Offline:** In den DevTools unter „Network“ auf „Offline“ stellen → Anzeige „Offline“, Timer-Aktionen funktionieren weiter → wieder online → Daten erscheinen im zweiten Browser.
- [ ] **Neu laden** während der Timer läuft: Die verstrichene Zeit läuft korrekt weiter.
- [ ] **Sicherheitsregeln ohne Emulator:** In der Konsole unter **Firestore → Regeln → Regel-Playground** einen authentifizierten Lesezugriff auf `users/<fremde-uid>/entries/x` simulieren → muss abgelehnt werden; derselbe Zugriff mit der eigenen uid → erlaubt.

## 12. Bekanntes Verhalten

- **Unbestätigte Passwort-Konten:** Meldet sich jemand mit Google an und existiert zu derselben Gmail-Adresse ein **noch nicht bestätigtes** E-Mail/Passwort-Konto, ersetzt Firebase die Passwort-Anmeldung durch Google. Die Daten bleiben erhalten (gleiche uid), das Passwort funktioniert danach aber nicht mehr. Bestätige deine E-Mail-Adresse daher zeitnah.
- **Offene Registrierung:** Jede Person mit der URL kann ein Konto anlegen. Sie sieht ausschließlich ihre eigenen Daten; fremde Daten sind durch die Sicherheitsregeln geschützt.
- **Einträge über Mitternacht** zählen vollständig zum Tag, an dem sie begonnen haben.
- **Mehrere offene Einträge** (z. B. offline auf zwei Geräten gestartet) werden als Warnung angezeigt; Aktionen betreffen den zuletzt gestarteten Eintrag. Eine Bereinigung folgt in einer späteren Version.
