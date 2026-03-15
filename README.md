DEMO: https://umzug.enkination.de/ · Login: demo@demo.com · PW: Demo123

# Umzugsplaner & Home Organizer PWA

Eine Progressive Web Application mit zwei Modi:

- **Umzugsmodus** — Planung, Organisation und Durchführung eines Umzugs
- **Home Organizer** — dauerhafter Haushaltmanager nach dem Umzug

---

## Funktionen

### Umzugsmodus
- Dashboard mit Aufgaben- und Terminübersicht
- Packliste mit QR-Codes, Fotos und KI-Assistent
- Budget Tracker (Einnahmen, Ausgaben, Kategorien, Teilzahlungen)
- Kontaktmanager (Handwerker, Helfer, Makler)
- To-Do Listen mit Prioritäten, Fälligkeitsdaten und KI-Assistent
- Bedarfsrechner: Farbe, Tapete, Bodenbelag, Dämmstoff, Kartons, Volumen, Transport
- Renovierungsplaner

### Home Organizer
- Dashboard mit Schnellübersicht aller Module
- Inventar mit QR-Codes und Standortverwaltung
- Vorratsverwaltung mit Mindestmengen-Warnungen
- Geräteverwaltung mit Wartungsplanung
- Bewohnerverwaltung
- Einkaufsliste
- Haushaltsaufgaben mit Kategorien und Wiederholung
- Projekte mit Deadlines und Statusverfolgung
- Finanzmanager (Budget, Ausgaben, Kategorien)
- Globale Suche über alle Module
- Interaktive Schritt-für-Schritt Anleitungen (Tour) für jedes Modul

### Übergreifend
- Push-Benachrichtigungen (Web Push) für Erinnerungen, Vorrats-Warnungen, Wartungen, Deadlines
- Dark/Light Mode
- PWA — installierbar auf iOS, Android und Desktop
- Vollständige Mobiloptimierung

---

## Technologie-Stack

| Bereich | Technologie |
|---|---|
| Frontend | React 18 (Create React App), JavaScript |
| Styling | Tailwind CSS (Dark Mode via `class`-Strategie) |
| Backend & Datenbank | Supabase (PostgreSQL, Auth, Storage, Edge Functions) |
| Push Notifications | Web Push API, VAPID, `web-push` npm-Paket |
| Cron Jobs | pg_cron (Supabase Extension) |
| KI | OpenAI API |
| Deployment | Docker, Docker Compose, Nginx |

---

## Voraussetzungen

- Node.js 18+
- Docker & Docker Compose
- Supabase (self-hosted oder Cloud)
- OpenAI API Key (optional, für KI-Funktionen)

---

## Installation

### 1. Repository klonen

```bash
git clone https://github.com/iEnki/umzughelfer.git
cd umzughelfer
```

### 2. Datenbank einrichten

Im Supabase SQL Editor die folgenden Dateien der Reihe nach ausführen:

1. `supabase_setup.md` — Basistabellen (Packliste, Budget, Kontakte, To-Dos)
2. `Supabase_Tabellen_Setup.md` — Home-Organizer-Tabellen

Für Push-Benachrichtigungen zusätzlich:

```sql
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id         uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    uuid        REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  endpoint   text        NOT NULL,
  p256dh     text        NOT NULL,
  auth       text        NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, endpoint)
);
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Eigene Subscriptions verwalten"
  ON push_subscriptions FOR ALL USING (auth.uid() = user_id);
```

### 3. Umgebungsvariablen

**Root-Verzeichnis** (für Docker) — `.env`:
```env
# Supabase
REACT_APP_SUPABASE_URL=https://deine-supabase-url
REACT_APP_SUPABASE_ANON_KEY=dein-anon-key

# OpenAI (optional)
REACT_APP_OPENAI_API_KEY=dein-openai-key

# Docker Port
APP_PORT=3000
```

**Frontend-Verzeichnis** (für lokale Entwicklung) — `umzugshelfer-pwa/.env`:
```env
REACT_APP_SUPABASE_URL=https://deine-supabase-url
REACT_APP_SUPABASE_ANON_KEY=dein-anon-key
REACT_APP_OPENAI_API_KEY=dein-openai-key
```

Die Werte findest du im Supabase Dashboard unter **Project Settings → API**.

### 4. Lokale Entwicklung

```bash
cd umzugshelfer-pwa
npm install
npm start
# → http://localhost:3000
```

### 5. Docker-Deployment

```bash
docker compose build
docker compose up -d
```

Neu bauen ohne Cache:
```bash
docker compose build --no-cache umzugsplaner-app
docker compose up -d --force-recreate
```

---

## Push-Benachrichtigungen einrichten

Push-Benachrichtigungen benötigen drei zusätzliche Schritte: VAPID-Keys generieren, Edge Functions deployen und einen Cron-Job einrichten.

### Schritt 1 — VAPID-Keys generieren

Einmalig auf einem beliebigen Rechner mit Node.js:

```bash
npx web-push generate-vapid-keys
```

Ausgabe notieren:
```
Public Key:  BJWU4i1...
Private Key: lFEbXMQ...
```

### Schritt 2 — Edge Functions deployen (self-hosted Supabase)

Bei self-hosted Supabase werden Edge Functions als Dateien direkt ins Docker-Volume kopiert — kein CLI-Deploy nötig.

```bash
# Auf dem Supabase-Server:
cd ~/supabase-project

# Verzeichnisse anlegen
mkdir -p volumes/functions/send-push
mkdir -p volumes/functions/check-reminders
```

Dann die Funktionsdateien aus `supabase/functions/send-push/index.ts` und `supabase/functions/check-reminders/index.ts` in die entsprechenden Verzeichnisse kopieren.

### Schritt 3 — VAPID-Secrets in der Supabase docker-compose.yml eintragen

> **Wichtig:** Die `.env`-Datei in `volumes/functions/` wird vom Edge-Runtime-Container **nicht** automatisch geladen. Die VAPID-Secrets müssen direkt als Umgebungsvariablen im Functions-Container gesetzt werden.

In `~/supabase-project/docker-compose.yml` den Service-Block für `supabase-edge-functions` (Image: `supabase/edge-runtime`) suchen und die drei VAPID-Variablen zur `environment`-Sektion hinzufügen:

```yaml
  supabase-edge-functions:   # exakter Name kann leicht abweichen
    image: supabase/edge-runtime:...
    environment:
      # ... bestehende Variablen ...
      VAPID_SUBJECT: "mailto:deine@email.de"
      VAPID_PUBLIC_KEY: "<dein-public-key>"
      VAPID_PRIVATE_KEY: "<dein-private-key>"
```

Danach den Container neu starten:
```bash
docker restart supabase-edge-functions
```

Deployment testen:
```bash
curl -s -X POST https://deine-supabase-url/functions/v1/send-push \
  -H "Authorization: Bearer DEIN-SERVICE-ROLE-KEY" \
  -H "Content-Type: application/json" \
  -d '{"user_id":"<eine-user-id>","title":"Test","body":"Push funktioniert!","url":"/"}'
# Erwartete Antwort: {"sent":1,"removed":0}
```

Bei **Supabase Cloud** stattdessen Secrets über die CLI setzen und mit der CLI deployen:
```bash
supabase login
supabase link --project-ref DEIN-PROJECT-REF
supabase secrets set VAPID_SUBJECT=mailto:deine@email.de
supabase secrets set VAPID_PUBLIC_KEY=<key>
supabase secrets set VAPID_PRIVATE_KEY=<key>
supabase functions deploy send-push
supabase functions deploy check-reminders
```

### Schritt 4 — VAPID Public Key in der App-Umgebungsvariable eintragen

In `umzugshelfer-pwa/.env` (bzw. im Root-`.env` für Docker) den generierten Public Key eintragen:
```env
REACT_APP_VAPID_PUBLIC_KEY=<dein-public-key>
```

Außerdem muss der Key als Build-Arg in `docker-compose.yml` und `Dockerfile` übergeben werden (bereits vorkonfiguriert in diesem Repo).

### Schritt 5 — pg_cron einrichten

Im Supabase Dashboard unter **Database → Extensions** die Extension `pg_cron` aktivieren (Schema: `pg_catalog`).

Dann im SQL Editor den Cron-Job anlegen:
```sql
SELECT cron.schedule(
  'check-reminders',
  '*/30 * * * *',
  $$
    SELECT net.http_post(
      url     := 'https://deine-supabase-url/functions/v1/check-reminders',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer DEIN-SERVICE-ROLE-KEY'
      ),
      body    := '{}'::jsonb
    )
  $$
);
```

Den **Service Role Key** findest du unter **Project Settings → API → service_role** (nicht den anon key).

Der Cron-Job prüft alle 30 Minuten auf fällige Erinnerungen und sendet Push-Nachrichten für:
- Aufgaben mit Erinnerungsdatum
- Vorräte unter der eingestellten Mindestmenge
- Geräte mit Wartung in den nächsten 7 Tagen
- Projekte mit Deadline morgen

---

## Projektstruktur

```
umzughelfer/
├── umzugshelfer-pwa/           # React-Frontend
│   ├── public/                 # Statische Dateien, manifest.json, service-worker
│   └── src/
│       ├── components/
│       │   ├── home/           # Home-Organizer-Komponenten
│       │   │   └── tour/       # Tour-System (TourOverlay, useTour, tourSteps)
│       │   ├── featurepages/   # Öffentliche Feature-Landingpages
│       │   ├── layout/         # Sidebar, Topbar
│       │   └── ...             # Umzugs-Module
│       ├── contexts/
│       │   ├── AppModeContext.js   # Umzug/Home-Modus-Verwaltung
│       │   └── ThemeContext.js     # Dark/Light Mode
│       ├── App.js              # Routing & Auth
│       ├── supabaseClient.js   # Supabase-Client
│       └── index.js            # Einstiegspunkt
├── supabase/
│   └── functions/
│       ├── send-push/          # Edge Function: Push senden
│       ├── check-reminders/    # Edge Function: Fällige Erinnerungen prüfen
│       └── .env                # VAPID-Keys (nicht ins Git!)
├── supabase_setup.md           # SQL: Umzugs-Tabellen
├── Supabase_Tabellen_Setup.md  # SQL: Home-Organizer-Tabellen
├── docker-compose.yml
└── .env                        # Umgebungsvariablen (nicht ins Git!)
```

---

## Mitwirken

1. Fork erstellen
2. Feature-Branch anlegen (`git checkout -b feature/mein-feature`)
3. Änderungen committen
4. Pull Request erstellen

---

## Lizenz

MIT — siehe `LICENSE`-Datei.
