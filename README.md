DEMO: https://umzug.enkination.de/ Â· Login: demo@demo.com Â· PW: Demo123

# Umzugsplaner & Home Organizer PWA

Eine Progressive Web Application mit zwei Modi:

- **Umzugsmodus** â€” Planung, Organisation und DurchfÃ¼hrung eines Umzugs
- **Home Organizer** â€” dauerhafter Haushaltsmanager nach dem Umzug

---

## Inhaltsverzeichnis

1. [Funktionen](#funktionen)
2. [Technologie-Stack](#technologie-stack)
3. [Voraussetzungen](#voraussetzungen)
4. [Installation](#installation)
   - [Schnellinstallation mit install.sh](#schnellinstallation-mit-installsh)
   - [Manuelle Installation](#manuelle-installation)
   - [Lokale Entwicklung](#lokale-entwicklung)
5. [Datenbank einrichten](#datenbank-einrichten)
6. [Push-Benachrichtigungen](#push-benachrichtigungen)
7. [KI-Einstellungen (OpenAI / Ollama)](#ki-einstellungen-openai--ollama)
8. [SMTP konfigurieren](#smtp-konfigurieren)
9. [Nginx Reverse Proxy](#nginx-reverse-proxy)
10. [Aktualisierungen](#aktualisierungen)
11. [Projektstruktur](#projektstruktur)
12. [Troubleshooting](#troubleshooting)

---

## Funktionen

### Umzugsmodus
- Dashboard mit Aufgaben- und TerminÃ¼bersicht
- Packliste mit QR-Codes, Fotos und KI-Assistent
- Budget Tracker (Ausgaben, Kategorien, Teilzahlungen)
- To-Do Listen mit PrioritÃ¤ten, FÃ¤lligkeitsdaten und KI-Assistent
- Bedarfsrechner: Farbe, Tapete, Bodenbelag, DÃ¤mmstoff, Kartons, Volumen, Transport
- Renovierungsplaner
- Dokumente-Manager

### Home Organizer
- Dashboard mit SchnellÃ¼bersicht aller Module
- Inventar mit QR-Codes und Standortverwaltung
- Vorratsverwaltung mit Mindestmengen-Warnungen
- GerÃ¤teverwaltung mit Wartungsplanung
- Bewohnerverwaltung
- Einkaufsliste
- Haushaltsaufgaben mit Kategorien und Wiederholung
- Projekte mit Deadlines und Statusverfolgung
- Finanzmanager (Budget, Ausgaben, Kategorien)
- Globale Suche Ã¼ber alle Module
- Interaktive Schritt-fÃ¼r-Schritt Anleitungen (Tour) fÃ¼r jedes Modul

### Ãœbergreifend
- Push-Benachrichtigungen (Web Push) fÃ¼r Erinnerungen, Vorrats-Warnungen, Wartungen, Deadlines
- Dark/Light Mode
- PWA â€” installierbar auf iOS, Android und Desktop
- VollstÃ¤ndige Mobiloptimierung

---

## Technologie-Stack

| Bereich | Technologie |
|---|---|
| Frontend | React 18 (Create React App), JavaScript |
| Styling | Tailwind CSS (Dark Mode via `class`-Strategie) |
| Backend & Datenbank | Supabase (PostgreSQL, Auth, Storage, Edge Functions) |
| Push Notifications | Web Push API, VAPID, Deno Edge Functions |
| Cron Jobs | pg_cron (Supabase Extension) |
| KI | OpenAI API (optional: Ollama â€” lokaler LLM-Server) |
| Deployment | Docker, Docker Compose, Nginx |

---

## Voraussetzungen

### Server-Anforderungen

| Komponente | Minimum |
|---|---|
| CPU | 2 Kerne |
| RAM | 4 GB (8 GB bei Ollama-Mitinstallation) |
| Disk | 20 GB |
| OS | Ubuntu 22.04 / Debian 12 oder neuer |

### Software

```bash
# Docker installieren (Ubuntu/Debian)
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
newgrp docker

# Node.js installieren (fÃ¼r SchlÃ¼sselgenerierung via install.sh)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# openssl prÃ¼fen (meist vorinstalliert)
openssl version
```

Versionen prÃ¼fen:
```bash
docker --version          # >= 24.0
docker compose version    # >= 2.20
node --version            # >= 16
```

### Repository klonen

```bash
git clone https://github.com/iEnki/umzughelfer.git
cd umzughelfer
```

---

## Installation

### Schnellinstallation mit install.sh

Der Installer richtet alles automatisch ein und unterstÃ¼tzt zwei Modi:

```bash
chmod +x scripts/install.sh
./scripts/install.sh
```

---

#### Modus 1 â€” Vollstack (Supabase + App)

Installiert Supabase und die React-App gemeinsam via Docker. Empfohlen fÃ¼r neue Server.

Der Installer:
- Generiert alle kryptografischen SchlÃ¼ssel automatisch
- LÃ¤dt Supabase-Initialisierungsdateien von GitHub herunter
- Erstellt `.env` und startet alle Container via `docker-compose.full.yml`
- Erstellt `CREDENTIALS.txt` mit allen Zugangsdaten

**Abgefragte Eingaben:**

| Eingabe | Beispiel | Beschreibung |
|---|---|---|
| App-URL | `https://umzug.meine-domain.de` | Ã–ffentliche URL der React-App |
| E-Mail | `admin@meine-domain.de` | FÃ¼r VAPID-Signatur (Push-Notifications) |
| App-Port | `3000` | Externer Port der React-App |
| Supabase-URL | `https://supa.meine-domain.de` | URL des Supabase-Gateways |
| Studio-Passwort | *(min. 8 Zeichen)* | Passwort fÃ¼r Supabase Admin-UI |
| Ollama | `1` / `2` / `3` | KI-Assistent-Option (siehe [KI-Einstellungen](#ki-einstellungen-openai--ollama)) |

**Ausgabe:**
```
  App:             https://umzug.meine-domain.de  (Port: 3000)
  Supabase Studio: http://localhost:8000
  Zugangsdaten:    CREDENTIALS.txt
```

**Nächste Schritte nach Vollstack-Installation:**
1. `install.sh` fragt nach DB-Readiness optional: `Schema jetzt anwenden? [J/n]` (empfohlen: `J`)
2. Bei manueller Ausführung im SQL Editor zuerst `database_setup_complete.sql`, danach `umzugshelfer-pwa/haushalt_multiuser_setup.sql`
3. App aufrufen und ersten Account registrieren
4. Nach Erstlogin: Haushalt erstellen oder per Invite-Link beitreten

---

#### Modus 2 â€” App only (bestehende Supabase)

Installiert nur die React-App. Supabase lÃ¤uft bereits woanders (Supabase Cloud, eigener Server).

Der Installer:
- Generiert nur VAPID-Keys (fÃ¼r Push-Notifications)
- Erstellt eine minimale `.env` mit deinen Supabase-Zugangsdaten
- Baut und startet nur den App-Container via `docker-compose.yml`

**Abgefragte Eingaben:**

| Eingabe | Beispiel | Beschreibung |
|---|---|---|
| App-URL | `https://umzug.meine-domain.de` | Ã–ffentliche URL der React-App |
| E-Mail | `admin@meine-domain.de` | FÃ¼r VAPID-Signatur |
| App-Port | `3000` | Externer Port der React-App |
| Supabase URL | `https://supa.enkination.de` | URL deiner bestehenden Supabase-Instanz |
| Anon Key | `eyJhbGci...` | Aus Project Settings â†’ API |
| Service Role Key | `eyJhbGci...` | Aus Project Settings â†’ API (geheim!) |
| Ollama | `1` / `2` / `3` | KI-Assistent-Option |

**Ausgabe:**
```
  App:      https://umzug.meine-domain.de  (Port: 3000)
  Supabase: https://supa.enkination.de  (extern)
  Zugangsdaten: CREDENTIALS.txt
```

**Nächste Schritte nach App-only-Installation:**
1. In deiner Supabase-Instanz im SQL Editor zuerst `database_setup_complete.sql`, danach `umzugshelfer-pwa/haushalt_multiuser_setup.sql` ausführen
2. App aufrufen und ersten Account registrieren
3. Nach Erstlogin: Haushalt erstellen oder per Invite-Link beitreten

> `CREDENTIALS.txt` enthÃ¤lt alle generierten Keys und VAPID-Secrets. Sicher verwahren, niemals ins Git-Repository committen.

---

### Manuelle Installation

Falls `install.sh` nicht verwendet werden soll.

#### Schritt 1 â€” SchlÃ¼ssel generieren

```bash
node scripts/generate-keys.js
```

Ausgabe ist JSON mit allen benÃ¶tigten Werten. In `.env` Ã¼bertragen.

#### Schritt 2 â€” Konfigurationsdatei erstellen

```bash
# Vollstack:
cp .env.full.example .env

# App only:
cp env.example .env

nano .env
```

Mindestens diese Werte ausfÃ¼llen (Vollstack):

```env
SITE_URL=https://umzug.meine-domain.de
API_EXTERNAL_URL=https://supa.meine-domain.de
SUPABASE_PUBLIC_URL=https://supa.meine-domain.de
APP_PORT=3000

REACT_APP_SUPABASE_URL=https://supa.meine-domain.de
REACT_APP_SUPABASE_ANON_KEY=<anon-key>
REACT_APP_PASSWORD_RESET_REDIRECT_URL=https://umzug.meine-domain.de/update-password
REACT_APP_VAPID_PUBLIC_KEY=<vapid-public-key>

ANON_KEY=<anon-key>
SERVICE_ROLE_KEY=<service-role-key>
POSTGRES_PASSWORD=<starkes-passwort>
JWT_SECRET=<min-32-zeichen>
SECRET_KEY_BASE=<64-byte-hex>
VAULT_ENC_KEY=<32-zeichen-hex>
PG_META_CRYPTO_KEY=<32-zeichen-hex>
DASHBOARD_PASSWORD=<sicheres-passwort>

VAPID_SUBJECT=mailto:admin@meine-domain.de
VAPID_PUBLIC_KEY=<vapid-public-key>
VAPID_PRIVATE_KEY=<vapid-private-key>
```

#### Schritt 3 â€” Supabase-Initialisierungsdateien herunterladen (nur Vollstack)

```bash
mkdir -p volumes/db volumes/logs volumes/pooler volumes/storage volumes/functions volumes/snippets volumes/db/data

SUPABASE_RAW="https://raw.githubusercontent.com/supabase/supabase/master/docker"
curl -fsSL ${SUPABASE_RAW}/volumes/db/realtime.sql   -o volumes/db/realtime.sql
curl -fsSL ${SUPABASE_RAW}/volumes/db/webhooks.sql   -o volumes/db/webhooks.sql
curl -fsSL ${SUPABASE_RAW}/volumes/db/roles.sql      -o volumes/db/roles.sql
curl -fsSL ${SUPABASE_RAW}/volumes/db/jwt.sql        -o volumes/db/jwt.sql
curl -fsSL ${SUPABASE_RAW}/volumes/db/_supabase.sql  -o volumes/db/_supabase.sql
curl -fsSL ${SUPABASE_RAW}/volumes/db/logs.sql       -o volumes/db/logs.sql
curl -fsSL ${SUPABASE_RAW}/volumes/db/pooler.sql     -o volumes/db/pooler.sql
curl -fsSL ${SUPABASE_RAW}/volumes/logs/vector.yml   -o volumes/logs/vector.yml
curl -fsSL ${SUPABASE_RAW}/volumes/pooler/pooler.exs -o volumes/pooler/pooler.exs

# JWT-Secret einsetzen
sed -i "s/your-super-secret-jwt-token-with-at-least-32-characters-long/DEIN_JWT_SECRET/g" volumes/db/jwt.sql
```

#### Schritt 4 — Edge Functions kopieren (nur Vollstack, dynamisch)

```bash
find supabase/functions -mindepth 2 -maxdepth 2 -type f -name 'index.ts' | while read -r fn; do
  name="$(basename "$(dirname "$fn")")"
  mkdir -p "volumes/functions/${name}"
  cp "$fn" "volumes/functions/${name}/index.ts"
done
```

#### Schritt 5 â€” Starten

```bash
# Vollstack:
docker compose -f docker-compose.full.yml build umzugsplaner-app
docker compose -f docker-compose.full.yml up -d

# App only:
docker compose build umzugsplaner-app
docker compose up -d
```

---

### Lokale Entwicklung

```bash
cp env.example umzugshelfer-pwa/.env
# umzugshelfer-pwa/.env mit Supabase-URL und Keys befÃ¼llen
cd umzugshelfer-pwa
npm install
npm start
# â†’ http://localhost:3000
```

---

## Datenbank einrichten

Nach dem ersten Start muss das Datenbankschema eingerichtet werden.

### Ãœber Supabase Studio

1. Studio Ã¶ffnen: `http://localhost:8000` (Vollstack) oder deine Supabase-URL
2. Anmelden: Benutzername `supabase`, Passwort aus `CREDENTIALS.txt` / `.env`
3. **SQL Editor** â†’ **New query**
4. Inhalt von `database_setup_complete.sql` einfügen → **Run**
5. Danach `umzugshelfer-pwa/haushalt_multiuser_setup.sql` einfügen → **Run**

### Per Kommandozeile (nur Vollstack)

```bash
docker exec -i supabase-db psql -U postgres -d postgres < database_setup_complete.sql
docker exec -i supabase-db psql -U postgres -d postgres < umzugshelfer-pwa/haushalt_multiuser_setup.sql
```

### pg_cron fÃ¼r Push-Notifications einrichten

Im SQL Editor nach dem Datenbanksetup:

```sql
SELECT cron.schedule(
  'check-reminders',
  '*/30 * * * *',
  $$
    SELECT net.http_post(
      url     := 'https://supa.meine-domain.de/functions/v1/check-reminders',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer DEIN_SERVICE_ROLE_KEY'
      ),
      body    := '{}'::jsonb
    )
  $$
);
```

Den **Service Role Key** findest du in `CREDENTIALS.txt` oder `.env` unter `SERVICE_ROLE_KEY`.

---

## Push-Benachrichtigungen

Bei Verwendung von `install.sh` werden VAPID-Keys automatisch generiert und konfiguriert. Bei manueller Installation sind folgende Schritte nÃ¶tig:

### Schritt 1 â€” VAPID-Keys generieren

```bash
npx web-push generate-vapid-keys
# oder via generate-keys.js:
node scripts/generate-keys.js
```

### Schritt 2 â€” Edge Functions deployen

**Self-hosted Supabase:**

```bash
# Auf dem Supabase-Server:
mkdir -p ~/supabase-project/volumes/functions/send-push
mkdir -p ~/supabase-project/volumes/functions/check-reminders

# Funktionsdateien kopieren:
cp supabase/functions/send-push/index.ts ~/supabase-project/volumes/functions/send-push/index.ts
cp supabase/functions/check-reminders/index.ts ~/supabase-project/volumes/functions/check-reminders/index.ts
```

**Supabase Cloud:**
```bash
supabase login
supabase link --project-ref DEIN-PROJECT-REF
supabase functions deploy send-push
supabase functions deploy check-reminders
```

### Schritt 3 â€” VAPID-Secrets in Supabase eintragen

> **Wichtig (self-hosted):** Die `.env`-Datei in `volumes/functions/` wird vom Edge-Runtime-Container **nicht** geladen. Secrets mÃ¼ssen direkt als Umgebungsvariablen im Container gesetzt werden.

In `~/supabase-project/docker-compose.yml` den Service `supabase-edge-functions` suchen und ergÃ¤nzen:

```yaml
  supabase-edge-functions:
    environment:
      # ... bestehende Variablen ...
      VAPID_SUBJECT: "mailto:deine@email.de"
      VAPID_PUBLIC_KEY: "<dein-public-key>"
      VAPID_PRIVATE_KEY: "<dein-private-key>"
```

Container neu starten:
```bash
docker restart supabase-edge-functions
```

**Supabase Cloud:**
```bash
supabase secrets set VAPID_SUBJECT=mailto:deine@email.de
supabase secrets set VAPID_PUBLIC_KEY=<key>
supabase secrets set VAPID_PRIVATE_KEY=<key>
```

### Schritt 4 â€” VAPID Public Key in der App

In `.env` (Root-Verzeichnis fÃ¼r Docker):
```env
REACT_APP_VAPID_PUBLIC_KEY=<dein-public-key>
```

App neu bauen: `docker compose build --no-cache umzugsplaner-app`

### Aktivierung in der App

1. App im Browser Ã¶ffnen (HTTPS erforderlich)
2. **Profil â†’ Push-Benachrichtigungen â†’ Aktivieren**
3. Browser-Berechtigungsdialog bestÃ¤tigen

### Push-Delivery testen

```bash
curl -s -X POST https://supa.meine-domain.de/functions/v1/send-push \
  -H "Authorization: Bearer DEIN_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"user_id":"DEINE-USER-ID","title":"Test","body":"Push funktioniert!","url":"/"}'
# Erwartete Antwort: {"sent":1,"removed":0}
```

### Bekannte EinschrÃ¤nkungen

- Push auf **iOS** erfordert die App als PWA (zum Home-Bildschirm hinzugefÃ¼gt), ab iOS 16.4
- Push funktioniert **nicht** Ã¼ber HTTP (nur HTTPS oder localhost)
- Desktop-Browser: Falls "permission denied" â†’ Browser-Einstellungen â†’ Benachrichtigungen fÃ¼r Domain zurÃ¼cksetzen

---

## KI-Einstellungen (OpenAI / Ollama)

### OpenAI (Standard)
Profil â†’ KI-Einstellungen â†’ **OpenAI** â†’ API-Key eingeben. Der Key wird pro Benutzer in der Datenbank gespeichert.

### Ollama (lokaler LLM-Server)

Wer einen eigenen Ollama-Server betreibt, kann diesen als Alternative zu OpenAI nutzen â€” ohne API-Kosten.

#### Option A â€” Bestehenden Ollama-Server nutzen

Keine Installation nÃ¶tig. URL direkt in der App eintragen:

1. Profil â†’ **KI-Einstellungen** â†’ Provider: **Ollama**
2. **Server-URL** eintragen: `http://DEINE-SERVER-IP:11434`
3. **Modell** wÃ¤hlen: z.B. `llama3.2`, `mistral`, `qwen2.5`
4. **Verbindung testen** â†’ **Speichern**

#### Option B â€” Ollama mit Docker mitinstallieren

Bei `install.sh` Wahl `1` auswÃ¤hlen, oder manuell:

```bash
# Starten (Docker Compose Profil)
docker compose -f docker-compose.full.yml --profile ollama up -d

# Modell laden (~2 GB)
docker exec ollama ollama pull llama3.2

# Weitere Modelle:
# docker exec ollama ollama pull mistral
# docker exec ollama ollama pull qwen2.5
# docker exec ollama ollama pull gemma3
```

Danach in der App: Ollama-URL â†’ `http://localhost:11434`

#### Nvidia GPU aktivieren

In `docker-compose.full.yml` beim `ollama`-Service den GPU-Block auskommentieren:

```yaml
deploy:
  resources:
    reservations:
      devices:
        - driver: nvidia
          count: all
          capabilities: [gpu]
```

Voraussetzung: [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/install-guide.html) installiert.

> **Hinweis:** Im Ollama-Modus wird Spracheingabe Ã¼ber die Browser Web Speech API verarbeitet (kein Whisper). Chrome/Edge erforderlich.

---

## SMTP konfigurieren

Ohne SMTP kÃ¶nnen Nutzer ihre E-Mail nicht bestÃ¤tigen und kein Passwort zurÃ¼cksetzen.

In `.env` anpassen:

```env
SMTP_ADMIN_EMAIL=no-reply@meine-domain.de
SMTP_HOST=smtp.mailgun.org
SMTP_PORT=587
SMTP_USER=postmaster@meine-domain.de
SMTP_PASS=dein-smtp-passwort
SMTP_SENDER_NAME=Umzughelfer
```

Auth-Container neu starten:
```bash
docker compose -f docker-compose.full.yml restart supabase-auth
```

**Empfohlene SMTP-Anbieter:** Mailgun (kostenlos bis 100/Tag), SendGrid, Amazon SES, eigener Postfix

---

## Nginx Reverse Proxy

FÃ¼r Produktionsbetrieb mit HTTPS.

**App** (`/etc/nginx/sites-available/umzug`):
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

**Supabase API** (`/etc/nginx/sites-available/supa`):
```nginx
server {
    listen 443 ssl;
    server_name supa.meine-domain.de;

    ssl_certificate     /etc/letsencrypt/live/supa.meine-domain.de/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/supa.meine-domain.de/privkey.pem;

    location / {
        proxy_pass http://localhost:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

**SSL-Zertifikate mit Let's Encrypt:**
```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d umzug.meine-domain.de -d supa.meine-domain.de
```

---

## Aktualisierungen

### App aktualisieren

```bash
git pull
docker compose -f docker-compose.full.yml build --no-cache umzugsplaner-app
docker compose -f docker-compose.full.yml up -d --force-recreate umzugsplaner-app
```

### Supabase-Services aktualisieren

Image-Versionen in `docker-compose.full.yml` anpassen, dann:

```bash
docker compose -f docker-compose.full.yml pull
docker compose -f docker-compose.full.yml up -d
```

### Ollama-Modell aktualisieren

```bash
docker exec ollama ollama pull llama3.2
```

---

## Projektstruktur

```
umzughelfer/
â”œâ”€â”€ scripts/
â”‚   â”œâ”€â”€ install.sh              # Auto-Installer (Vollstack oder App only)
â”‚   â””â”€â”€ generate-keys.js        # Kryptografische SchlÃ¼ssel generieren
â”œâ”€â”€ supabase/
â”‚   â””â”€â”€ functions/
â”‚       â”œâ”€â”€ send-push/          # Edge Function: Push-Nachricht senden
â”‚       â””â”€â”€ check-reminders/    # Edge Function: FÃ¤llige Erinnerungen prÃ¼fen
â”œâ”€â”€ umzugshelfer-pwa/           # React-Frontend
â”‚   â”œâ”€â”€ public/                 # manifest.json, service-worker.js
â”‚   â””â”€â”€ src/
â”‚       â”œâ”€â”€ components/
â”‚       â”‚   â”œâ”€â”€ home/           # Home-Organizer-Komponenten
â”‚       â”‚   â”‚   â””â”€â”€ tour/       # Tour-System (TourOverlay, useTour, tourSteps)
â”‚       â”‚   â”œâ”€â”€ featurepages/   # Ã–ffentliche Feature-Landingpages
â”‚       â”‚   â”œâ”€â”€ layout/         # Sidebar, Topbar, Mobile-Navigation
â”‚       â”‚   â””â”€â”€ ...             # Umzugs-Module
â”‚       â”œâ”€â”€ contexts/
â”‚       â”‚   â”œâ”€â”€ AppModeContext.js   # Umzug/Home-Modus-Verwaltung
â”‚       â”‚   â””â”€â”€ ThemeContext.js     # Dark/Light Mode
â”‚       â”œâ”€â”€ hooks/
â”‚       â”‚   â”œâ”€â”€ usePushSubscription.js  # Web Push Subscription
â”‚       â”‚   â””â”€â”€ useViewport.js          # Responsive-Breakpoints
â”‚       â”œâ”€â”€ utils/
â”‚       â”‚   â””â”€â”€ kiClient.js     # KI-Client (OpenAI + Ollama)
â”‚       â”œâ”€â”€ App.js              # Routing & Auth
â”‚       â”œâ”€â”€ supabaseClient.js   # Supabase-Client
â”‚       â””â”€â”€ index.js            # Einstiegspunkt
â”œâ”€â”€ database_setup_complete.sql # Komplettes Datenbank-Setup (alle Tabellen + Seed)
â”œâ”€â”€ docker-compose.yml          # App only (externer Supabase)
â”œâ”€â”€ docker-compose.full.yml     # Vollstack (Supabase + App + optionaler Ollama)
â”œâ”€â”€ .env.full.example           # Alle Variablen dokumentiert (Vollstack)
â”œâ”€â”€ env.example                 # Minimale Variablen (App only)
â””â”€â”€ INSTALL.md                  # Detaillierte Installationsanleitung
```

---

## Troubleshooting

### Container-Logs anzeigen

```bash
docker compose -f docker-compose.full.yml logs -f
docker compose -f docker-compose.full.yml logs -f supabase-db
docker compose -f docker-compose.full.yml logs -f supabase-auth
docker compose -f docker-compose.full.yml logs -f supabase-edge-functions
docker compose -f docker-compose.full.yml logs -f umzugsplaner-pwa-container
```

### HÃ¤ufige Probleme

**App zeigt "VAPID Public Key fehlt"**
â†’ `REACT_APP_VAPID_PUBLIC_KEY` fehlt in `.env` oder die App wurde ohne diesen Wert gebaut.
â†’ `.env` prÃ¼fen, dann: `docker compose -f docker-compose.full.yml build --no-cache umzugsplaner-app`

**Push-Notifications: "No subject set in vapidDetails.subject."**
â†’ VAPID-Secrets sind nicht als Umgebungsvariablen im Edge-Functions-Container gesetzt.
â†’ In `docker-compose.full.yml` (oder der Supabase-eigenen `docker-compose.yml`) beim Service `supabase-edge-functions` unter `environment` die drei VAPID-Variablen eintragen. Container neu starten: `docker restart supabase-edge-functions`

**Push-Notifications: "Registration failed - permission denied" im Browser**
â†’ Browser-Einstellungen â†’ Benachrichtigungen â†’ Domain zurÃ¼cksetzen â†’ Seite neu laden.

**Supabase Studio nicht erreichbar**
â†’ `docker compose -f docker-compose.full.yml ps` â€” ist `supabase-analytics` healthy?
â†’ `docker compose -f docker-compose.full.yml logs supabase-analytics`

**Datenbank startet nicht**
â†’ `cat volumes/db/jwt.sql | grep "your-super-secret"` â€” falls gefunden, JWT-Secret noch nicht ersetzt.
â†’ `docker compose -f docker-compose.full.yml down && docker compose -f docker-compose.full.yml up -d`

**E-Mails werden nicht versendet**
â†’ SMTP-Konfiguration in `.env` prÃ¼fen.
â†’ `docker compose -f docker-compose.full.yml logs supabase-auth | grep -i smtp`

**Ollama antwortet nicht**
â†’ `docker ps | grep ollama` â€” lÃ¤uft der Container?
â†’ `curl http://localhost:11434/api/tags` â€” API erreichbar?
â†’ CORS-Problem im Browser: `OLLAMA_ORIGINS=*` muss in `docker-compose.full.yml` gesetzt sein (bereits vorkonfiguriert).

### Neustart / Reset

```bash
# Alle Container neu starten (Daten bleiben erhalten)
docker compose -f docker-compose.full.yml down
docker compose -f docker-compose.full.yml up -d

# Neuinstallation (ACHTUNG: lÃ¶scht alle Daten)
docker compose -f docker-compose.full.yml down -v
rm -rf volumes/db/data volumes/storage
./scripts/install.sh
```

---

## Mitwirken

1. Fork erstellen
2. Feature-Branch anlegen: `git checkout -b feature/mein-feature`
3. Ã„nderungen committen
4. Pull Request erstellen

---

## Lizenz

MIT â€” siehe `LICENSE`-Datei.

