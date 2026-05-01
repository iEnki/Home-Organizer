# Umzugsplaner & Home Organizer PWA

Eine self-hosted Progressive Web App für Umzug, Haushalt, Dokumente, Finanzen und gemeinsame Organisation.

Demo: https://umzug.enkination.de/  
Demo-Login: `demo@demo.com` / `Demo1234`

## Inhalt

- [Überblick](#überblick)
- [Neue Features](#neue-features)
- [Funktionen](#funktionen)
- [Technologie-Stack](#technologie-stack)
- [Voraussetzungen](#voraussetzungen)
- [Installation](#installation)
- [Datenbank einrichten](#datenbank-einrichten)
- [Konfiguration](#konfiguration)
- [Updates und Wartung](#updates-und-wartung)
- [Projektstruktur](#projektstruktur)
- [Troubleshooting](#troubleshooting)

## Überblick

Die App vereint zwei Arbeitsbereiche:

- **Umzugsmodus** für die Planung, Organisation und Durchführung eines Umzugs.
- **Home Organizer** für den dauerhaften Haushaltsbetrieb nach dem Umzug.

Sie ist als PWA installierbar, läuft auf Desktop und Mobilgeräten und kann vollständig selbst gehostet werden. Supabase stellt Auth, Datenbank, Storage, Realtime und Edge Functions bereit. KI-Funktionen laufen wahlweise über OpenAI oder einen lokalen Ollama-Server.

## Neue Features

- Deutsche und englische Oberfläche mit Sprachwahl im Profil
- Lokalisierte PWA-Manifeste für Deutsch und Englisch (UK)
- Benutzerbezogene Locale-Einstellung und formatierte Datums-/Zahlenwerte
- Globaler KI-Assistent mit Haushaltskontext
- Verbesserte Push-Erinnerungen mit stabilerer Zustandsverwaltung
- Home-Budget mit Kategorien, Limits, Sparzielen, wiederkehrenden Buchungen und Ausgleich
- Rechnungsanalyse mit Positionen, Datumssynchronisation und Budgetzuordnung
- Dokumentenarchiv mit KI-Analyse, Wissenseinträgen, Verträgen und Versicherungen
- Bücherverwaltung mit ISBN-/Cover-Suche und Duplikaterkennung
- Geführte Touren und Onboarding für Home-Organizer-Module
- Haushaltsweite Einstellungen, Einladungen und Multi-Haushalt-Unterstützung

## Funktionen

### Umzugsmodus

- Dashboard mit Aufgaben, Terminen und Fortschritt
- Packliste mit QR-Codes, Fotos, Räumen, Kategorien und KI-Unterstützung
- To-do-Listen mit Prioritäten, Fälligkeiten, Phasen und KI-Erfassung
- Budget Tracker für Ausgaben, Kategorien und Teilzahlungen
- Kalender, Kontakte, Dokumente und Zeitstrahl
- Renovierungs- und Materialplanung
- Bedarfsrechner für Farbe, Tapete, Boden, Dämmstoff, Kartons, Volumen und Transportkosten
- Kostenvergleich, Szenarien und PDF-/Exportfunktionen

### Home Organizer

- Dashboard mit Schnellzugriff und Haushaltsübersicht
- Inventar mit Standorten, QR-Codes, Fotos und Suche
- Vorräte mit Mindestmengen, Kategorien und Einkaufslisten-Anbindung
- Geräteverwaltung mit Wartungsplanung
- Bewohner, Haushaltsaufgaben, Projekte und Verlauf
- Finanzmanager mit Konten, Budgets, Limits, Zielen, Splits und Statistiken
- Rechnungen, Dokumente, Verträge und Versicherungen
- Wissensdatenbank mit manuellen und dokumentbasierten Einträgen
- Bücherregal mit Suche, Import, Covern und Duplikatprüfung
- Globale Suche über Module hinweg
- Schritt-für-Schritt-Touren pro Modul

### Übergreifend

- Multi-Haushalt mit Einladungen und getrennten Datenbereichen
- Supabase Auth mit Passwort-Reset und optionaler E-Mail-Bestätigung
- Push-Benachrichtigungen für Erinnerungen, Fristen, Vorräte und Wartung
- Dark/Light Mode
- Installierbare PWA für iOS, Android und Desktop
- OpenAI oder Ollama als KI-Provider
- Docker-Deployment als App-only oder Fullstack

## Technologie-Stack

| Bereich | Technologie |
| --- | --- |
| Frontend | React 18, Create React App, JavaScript |
| Styling | Tailwind CSS |
| Backend | Supabase, PostgreSQL, Auth, Storage, Edge Functions |
| Internationalisierung | i18next, react-i18next |
| Push | Web Push API, VAPID, Supabase Edge Functions |
| KI | OpenAI API, optional Ollama |
| Deployment | Docker, Docker Compose, Nginx |

## Voraussetzungen

| Komponente | Minimum |
| --- | --- |
| CPU | 2 Kerne |
| RAM | 4 GB, mit Ollama empfohlen 8 GB |
| Speicher | 20 GB |
| OS | Ubuntu 22.04, Debian 12 oder neuer |

Benötigte Software:

```bash
docker --version
docker compose version
node --version
openssl version
```

Empfohlene Versionen: Docker 24+, Docker Compose 2.20+, Node.js 20.

## Installation

### Empfohlen: Verwaltungsskript

```bash
git clone https://github.com/iEnki/Home-Organizer.git
cd Home-Organizer
chmod +x scripts/manage.sh
./scripts/manage.sh
```

Wähle im Menü **[1] Installation**. Das Verwaltungsskript ist die empfohlene Installationsvariante, weil es Installation, Updates, Backups, SMTP, Ollama, Konfiguration und Logs in einem Werkzeug bündelt.

Die Installation unterstützt zwei Modi:

| Modus | Beschreibung |
| --- | --- |
| Fullstack | Installiert Supabase, Datenbank, Edge Functions und App gemeinsam per Docker |
| App-only | Installiert nur die React-App und verbindet sie mit einer vorhandenen Supabase-Instanz |

Das Skript generiert Keys, erstellt `.env`, richtet VAPID-Konfiguration ein und schreibt wichtige Zugangsdaten in `CREDENTIALS.txt`.

### Direkter Installer

Alternativ kann die Installation direkt gestartet werden:

```bash
chmod +x scripts/install.sh
./scripts/install.sh
```

Für spätere Verwaltung trotzdem `manage.sh` verwenden.

Wichtige Aufgaben im Menü:

- Installation und Update
- Deinstallation
- Backup und Wiederherstellung
- SMTP-Konfiguration
- Ollama-Konfiguration
- App-URL, Port und Einladungslinks anpassen
- Status und Logs anzeigen
- Docker bereinigen

### Lokale Entwicklung

```bash
cp env.example umzugshelfer-pwa/.env
cd umzugshelfer-pwa
npm install
npm start
```

Die App läuft danach unter `http://localhost:3000`.

## Datenbank einrichten

Nach dem ersten Start muss das Schema in Supabase eingespielt werden.

### Supabase Studio

1. Studio öffnen, z. B. `http://localhost:8000`
2. Mit den Daten aus `.env` oder `CREDENTIALS.txt` anmelden
3. SQL Editor öffnen
4. Inhalt von `database_setup_complete.sql` ausführen

### Kommandozeile

```bash
docker exec -i supabase-db psql -U postgres -d postgres < database_setup_complete.sql
```

## Konfiguration

### Push-Benachrichtigungen

Für Push werden VAPID-Schlüssel benötigt. `install.sh` und `manage.sh` erzeugen diese automatisch.

Aktivierung in der App:

1. App per HTTPS öffnen
2. Profil öffnen
3. Push-Benachrichtigungen aktivieren
4. Browser-Berechtigung bestätigen

iOS benötigt die installierte PWA auf dem Home-Bildschirm und mindestens iOS 16.4.

### KI-Provider

OpenAI:

- API-Key im Profil unter KI-Einstellungen hinterlegen
- Anfragen laufen serverseitig über Supabase Edge Functions

Ollama:

```bash
docker compose -f docker-compose.full.yml --profile ollama up -d
docker exec ollama ollama pull llama3.2
```

Danach in der App die Ollama-URL und das Modell auswählen.

### SMTP

Für E-Mail-Bestätigung, Einladungen und Passwort-Reset:

```env
SMTP_ADMIN_EMAIL=no-reply@meine-domain.de
SMTP_HOST=smtp.mailgun.org
SMTP_PORT=587
SMTP_USER=postmaster@meine-domain.de
SMTP_PASS=dein-smtp-passwort
SMTP_SENDER_NAME=Umzughelfer
```

Danach den Auth-Container neu starten:

```bash
docker compose -f docker-compose.full.yml restart supabase-auth
```

### Nginx Reverse Proxy

Für Produktion wird HTTPS empfohlen:

```nginx
server {
    listen 443 ssl;
    server_name umzug.meine-domain.de;

    ssl_certificate     /etc/letsencrypt/live/umzug.meine-domain.de/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/umzug.meine-domain.de/privkey.pem;

    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## Updates und Wartung

Empfohlen:

```bash
./scripts/manage.sh
```

Manuell:

```bash
git pull
docker compose -f docker-compose.full.yml build --no-cache umzugsplaner-app
docker compose -f docker-compose.full.yml up -d --force-recreate umzugsplaner-app
```

Browserslist gezielt aktualisieren:

```bash
./scripts/manage.sh maintenance browserslist
```

Dieser Befehl aktualisiert `caniuse-lite` und führt anschließend einen Frontend-Build aus.

## Projektstruktur

```text
umzughelfer/
├── scripts/                    # Installation, Update, Backup, Wartung
├── supabase/functions/          # Edge Functions
├── umzugshelfer-pwa/            # React-PWA
│   ├── public/                  # Manifest, Service Worker, Assets
│   └── src/
│       ├── components/          # App-Module
│       ├── contexts/            # App-, Theme-, Locale- und Haushaltskontext
│       ├── i18n/                # Deutsche und englische Übersetzungen
│       ├── hooks/               # Wiederverwendbare React Hooks
│       └── utils/               # Budget, KI, Dokumente, Push, Formatierung
├── database_setup_complete.sql  # Komplettes Datenbankschema
├── docker-compose.yml           # App-only Setup
├── docker-compose.full.yml      # Fullstack Setup
├── env.example                  # App-only Beispielkonfiguration
└── .env.full.example            # Fullstack Beispielkonfiguration
```

## Troubleshooting

Logs anzeigen:

```bash
docker compose -f docker-compose.full.yml logs -f
docker compose -f docker-compose.full.yml logs -f supabase-db
docker compose -f docker-compose.full.yml logs -f supabase-auth
docker compose -f docker-compose.full.yml logs -f supabase-edge-functions
docker compose -f docker-compose.full.yml logs -f umzugsplaner-pwa-container
```

Häufige Probleme:

- **Push funktioniert nicht:** HTTPS, Browser-Berechtigung, VAPID-Keys und Edge-Function-Umgebung prüfen.
- **E-Mails kommen nicht an:** SMTP-Werte in `.env` prüfen und `supabase-auth` neu starten.
- **Supabase Studio nicht erreichbar:** Containerstatus und Logs von `supabase-analytics` prüfen.
- **Ollama antwortet nicht:** `docker exec ollama ollama list` und `curl http://localhost:11434/api/tags` testen.
- **App zeigt alte Inhalte:** App-Container neu bauen und Browser/PWA-Cache leeren.

## Lizenz

MIT. Siehe `umzugshelfer-pwa/LICENSE`.
