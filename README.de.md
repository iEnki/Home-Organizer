# Umzugsplaner & Home Organizer

Eine selbst gehostete Progressive Web App für Umzugsplanung, Haushaltsorganisation, Finanzen, Dokumente und gemeinsame Verwaltung.

[English version](README.en.md)

Demo: <https://umzug.enkination.de/><br>
Demo-Login: `demo@demo.com` / `Demo1234`

## Überblick

Die Anwendung verbindet zwei Bereiche:

- **Umzugsmodus** für Planung, Durchführung und Abschluss eines Umzugs.
- **Home Organizer** für den dauerhaften Betrieb eines Haushalts.

Die App ist für Desktop und Mobilgeräte optimiert, als PWA installierbar und vollständig selbst hostbar. Supabase stellt Authentifizierung, PostgreSQL, Storage, Realtime und Edge Functions bereit. KI-Funktionen verwenden je nach Haushaltskonfiguration OpenAI oder Ollama.

## Funktionsumfang

### Umzugsmodus

- Dashboard mit Aufgaben, Terminen und Fortschritt
- Packlisten mit Räumen, Kategorien, Fotos, QR-Codes und KI-Unterstützung
- To-do-Listen mit Prioritäten, Fälligkeiten und Umzugsphasen
- Budget, Teilzahlungen und Kostenvergleich
- Kalender, Kontakte, Dokumente und Zeitstrahl
- Renovierungs- und Materialplanung
- Rechner für Farbe, Tapete, Boden, Dämmstoff, Kartons, Volumen und Transport
- PDF- und Kalenderexporte

### Home Organizer

- Haushaltsdashboard mit Schnellzugriffen und globaler Suche
- Mehrere Haushalte, Mitglieder, Einladungen und getrennte Datenbereiche
- Inventar mit Standorten, Fotos, QR-Codes und Suche
- Vorräte, Mindestmengen und Übergabe an die Einkaufsliste
- Einkaufsliste mit Schnellerfassung, KI-Kategorisierung und Rezeptzutaten
- Heimapotheke mit Beständen, Ablaufdaten, Dokumenten und Beipackzetteln
- Geräteverwaltung mit Standort, Inventarbezug, Dokumenten und Wartung
- Haushaltsaufgaben, Projekte, Bewohner und Aktivitätsverlauf

### Budget, Rechnungen und Dokumente

- Haushalts- und Privatkonten
- Budgets, Kategorien, Limits, Sparziele und wiederkehrende Buchungen
- Kostenaufteilung und Haushaltsausgleich
- Rechnungsscanner mit PDF-/Bild-Upload, OCR, Positionsanalyse und Review
- Verknüpfung von Rechnungen, Budgetposten und Originaldokumenten
- Dokumentenarchiv mit KI-Analyse und Wissenseinträgen
- Verträge, Versicherungen, Fristen und Erinnerungen

### KFZ-Modul

- Mehrere Fahrzeuge mit Stammdaten, Kilometerständen und Fotogalerie
- Titelbild, Galerieansicht und zentrale Dokumentverknüpfung
- Tankungen mit den Statuswerten **voll**, **teilweise** und **unbekannt**
- Volltankbasierte Verbrauchsberechnung mit einbezogenen Zwischentankungen
- Automatische Erkennung von Tankbelegen aus dem Budget
- Prüfliste für nicht eindeutig zuordenbare Tankbelege
- Kosten, Services, Reifen, Aufgaben, Teile, Dokumente und Erinnerungen
- KI-Analyse von Service-Rechnungen, Werkstattbelegen und Pickerl-Berichten
- Strukturierte Servicepositionen mit Kategorien, Preisen und Konfidenzen
- TCO, Kosten pro Kilometer, Verbrauch und Fahrzeugvergleich
- Diagramme sowie gefilterter CSV- und PDF-Export

### Kochbuch, Bücher und Wissen

- Manuelle Rezepte sowie Import aus Webseiten und Videoquellen
- Lokaler Parser für Metadaten, Untertitel, Audio und Transkription
- Review, Übersetzung, Qualitätsprüfung, Nährwerte und Kosten
- Wochen-/Essensplanung, Kochmodus und Kochprotokolle
- Übergabe von Zutaten an Einkaufsliste und Vorräte
- Bücherverwaltung mit ISBN-, Cover- und Duplikaterkennung
- Haushaltswissen aus manuellen Einträgen und Dokumentanalysen

### Plattformfunktionen

- Deutsche und englische Oberfläche (UK)
- Dark Mode und Light Mode
- Responsive Desktop- und Mobilnavigation
- Installierbare PWA für iOS, Android und Desktop
- Push-Benachrichtigungen über Web Push und VAPID
- Globaler KI-Assistent mit Haushaltskontext
- OpenAI oder optional lokales Ollama
- Household-RLS für gemeinsam verwaltete Daten

## Technologie

| Bereich | Technologie |
| --- | --- |
| Frontend | React 18, Create React App, React Router |
| Styling und UI | Tailwind CSS, Framer Motion, Lucide |
| Diagramme und PDF | Chart.js, React PDF Renderer |
| Backend | Supabase, PostgreSQL, Auth, Storage, Realtime |
| Serverlogik | Supabase Edge Functions mit Deno |
| Lokale Dienste | FastAPI-basierte Dokument-OCR und Rezeptverarbeitung |
| Internationalisierung | i18next, Deutsch und Englisch (UK) |
| Betrieb | Docker, Docker Compose, Nginx |

## Voraussetzungen

- Linux-Server, empfohlen Ubuntu 22.04 oder Debian 12
- Docker 24 oder neuer
- Docker Compose 2.20 oder neuer
- Mindestens 2 CPU-Kerne, 4 GB RAM und 20 GB Speicher
- Für lokales Ollama werden mindestens 8 GB RAM empfohlen
- Domain und HTTPS für produktiven Betrieb, Push und sichere Anmeldung

Node.js 20 wird nur für lokale Frontend-Entwicklung und Hilfsskripte benötigt.

## Installation

### Verwaltungsskript

```bash
git clone https://github.com/iEnki/Home-Organizer.git
cd Home-Organizer
chmod +x scripts/manage.sh
./scripts/manage.sh
```

Im Menü **Installation** wählen. Verfügbar sind:

| Modus | Inhalt |
| --- | --- |
| Fullstack | App, Supabase, Storage, Edge Functions, OCR- und Rezeptdienst |
| App-only | React-App mit Verbindung zu einer vorhandenen Supabase-Instanz |

Das Skript unterstützt außerdem Updates, Backups, Wiederherstellung, SMTP, Ollama, URL-/Port-Konfiguration, Status und Logs.

Alternativ:

```bash
chmod +x scripts/install.sh
./scripts/install.sh
```

Die erzeugten Dateien `.env` und `CREDENTIALS.txt` enthalten Geheimnisse und dürfen nicht veröffentlicht oder eingecheckt werden.

## Datenbank

Für eine neue Installation den vollständigen Stand ausführen:

```bash
docker exec -i supabase-db psql -U postgres -d postgres < database_setup_complete.sql
```

Alternativ kann die Datei im SQL-Editor von Supabase Studio ausgeführt werden. Das Komplettschema enthält Tabellen, Indizes, Trigger, RPCs, Storage-Konfiguration und RLS-Richtlinien.

Für bestehende Installationen zuerst ein Backup erstellen und anschließend die datierten Migrationen beziehungsweise den Update-Ablauf des Verwaltungsskripts verwenden. Das vollständige Schema ist für Neuinstallationen gedacht.

## Lokale Entwicklung

```bash
cp env.example umzugshelfer-pwa/.env
cd umzugshelfer-pwa
npm install
npm start
```

Die App läuft standardmäßig unter <http://localhost:3000>.

Wichtige Befehle:

```bash
npm test -- --watchAll=false
npm run i18n:check
npm run build
```

## Konfiguration

### Frontend

Mindestens erforderlich:

```env
REACT_APP_SUPABASE_URL=https://supa.meine-domain.de
REACT_APP_SUPABASE_ANON_KEY=<anon-key>
REACT_APP_PASSWORD_RESET_REDIRECT_URL=https://app.meine-domain.de/update-password
REACT_APP_VAPID_PUBLIC_KEY=<vapid-public-key>
```

Ein Service-Role-Key gehört niemals in das Frontend.

### KI und Dokumentanalyse

Die Haushaltskonfiguration entscheidet zwischen OpenAI und Ollama. API-Schlüssel werden über die vorgesehenen Profileinstellungen und serverseitigen Funktionen verwendet.

Der Fullstack-Betrieb konfiguriert zusätzlich:

```env
DOCUMENT_OCR_URL=http://document-ocr-service:8091
DOCUMENT_OCR_INTERNAL_TOKEN=<zufälliges-geheimnis>
RECIPE_PARSER_URL=http://recipe-source-parser:8090
RECIPE_PARSER_INTERNAL_TOKEN=<zufälliges-geheimnis>
```

Diese internen Dienste dürfen nicht ungeschützt öffentlich erreichbar sein.

Ollama kann über das Verwaltungsmenü oder direkt gestartet werden:

```bash
docker compose -f docker-compose.full.yml --profile ollama up -d
docker exec ollama ollama pull llama3.2
```

### Push-Benachrichtigungen

VAPID-Schlüssel werden vom Installer erzeugt. Für Push:

1. App per HTTPS öffnen.
2. Im Profil Push aktivieren.
3. Browser-Berechtigung bestätigen.

Unter iOS ist eine installierte PWA und mindestens iOS 16.4 erforderlich.

### SMTP und Einladungen

Für E-Mail-Bestätigung, Passwort-Reset und Haushaltseinladungen:

```env
SMTP_ADMIN_EMAIL=no-reply@meine-domain.de
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=<benutzer>
SMTP_PASS=<passwort>
SMTP_SENDER_NAME=Home Organizer
RESEND_API_KEY=
```

Die Konfiguration kann über `scripts/manage.sh` gepflegt werden.

## Updates und Backups

Empfohlen:

```bash
./scripts/manage.sh
```

Vor Schema- oder Versionsupdates ein Fullstack-Backup erstellen. Das Verwaltungsskript sichert Datenbank, Storage und Konfiguration unter `backups/`.

Ein manueller App-Neubau:

```bash
git pull
docker compose -f docker-compose.full.yml build --no-cache umzugsplaner-app
docker compose -f docker-compose.full.yml up -d --force-recreate umzugsplaner-app
```

## Projektstruktur

```text
Home-Organizer/
|-- scripts/                     Installation, Updates und SQL-Migrationen
|-- services/
|   |-- document-ocr-service/    Lokale PDF-/Bild-OCR
|   `-- recipe-source-parser/    Web-/Video-Rezeptverarbeitung
|-- supabase/functions/          Edge Functions
|-- umzugshelfer-pwa/            React-PWA
|   |-- public/                  PWA-Dateien und Assets
|   `-- src/                     Komponenten, Hooks, i18n und Utilities
|-- database_setup_complete.sql  Komplettschema für Neuinstallationen
|-- docker-compose.yml           App-only
|-- docker-compose.full.yml      Vollständiger Stack
|-- env.example                  App-only-Beispiel
`-- .env.full.example            Fullstack-Beispiel
```

## Fehlerdiagnose

```bash
docker compose -f docker-compose.full.yml ps
docker compose -f docker-compose.full.yml logs -f umzugsplaner-app
docker compose -f docker-compose.full.yml logs -f functions
docker compose -f docker-compose.full.yml logs -f db
docker compose -f docker-compose.full.yml logs -f document-ocr-service
docker compose -f docker-compose.full.yml logs -f recipe-source-parser
```

Typische Ursachen:

- **Alte Oberfläche:** App neu bauen und Browser-/PWA-Cache löschen.
- **KI- oder OCR-Fehler:** Provider-Konfiguration, Edge-Function-Logs und interne Service-Tokens prüfen.
- **Push funktioniert nicht:** HTTPS, Berechtigung, VAPID-Werte und `send-push` prüfen.
- **E-Mail fehlt:** SMTP-/Resend-Konfiguration und Auth-Logs prüfen.
- **Leere Module oder 401/403:** Haushalt, Mitgliedschaft, RLS und aktuellen Datenbankstand prüfen.
- **502 bei Supabase:** Kong-, REST-, Functions- und Zieldienst-Logs prüfen; die Browser-CORS-Meldung kann nur eine Folge des Gateway-Fehlers sein.

## Sicherheit

- `.env`, `CREDENTIALS.txt`, Datenbank-Dumps und Storage-Backups geheim halten.
- Ausschließlich den öffentlichen Anon-Key im Browser verwenden.
- Service-Role-, SMTP-, VAPID-Private- und interne Service-Schlüssel regelmäßig sichern.
- Produktion nur über HTTPS veröffentlichen.
- Vor Updates getestete Backups erstellen.

## Lizenz

MIT, siehe [`umzugshelfer-pwa/LICENSE`](umzugshelfer-pwa/LICENSE).
