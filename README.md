DEMO: https://umzug.enkination.de/ · Login: demo@demo.com · PW: Demo123

# Umzugsplaner & Home Organizer PWA

Eine Progressive Web Application mit zwei Modi:

- **Umzugsmodus** – Planung, Organisation und Durchführung eines Umzugs
- **Home Organizer** – dauerhafter Haushaltsmanager nach dem Umzug

---

## Inhaltsverzeichnis

1. [Funktionen](#funktionen)
2. [Technologie-Stack](#technologie-stack)
3. [Voraussetzungen](#voraussetzungen)
4. [Installation](#installation)
   - [manage.sh – Zentrales Verwaltungsskript](#managesh--zentrales-verwaltungsskript)
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

- Dashboard mit Aufgaben- und Terminübersicht
- Packliste mit QR-Codes, Fotos und KI-Assistent
- Budget Tracker (Ausgaben, Kategorien, Teilzahlungen)
- To-Do-Listen mit Prioritäten, Fälligkeitsdaten und KI-Assistent
- Bedarfsrechner: Farbe, Tapete, Bodenbelag, Dämmstoff, Kartons, Volumen, Transportkosten
- Renovierungsplaner
- Dokumente-Manager

### Home Organizer

- Dashboard mit Schnellübersicht aller Module
- Inventar mit QR-Codes und Standortverwaltung
- Vorratsverwaltung mit Mindestmengen-Warnungen
- Geräteverwaltung mit Wartungsplanung
- Bewohnerverwaltung
- Einkaufsliste
- Haushaltsaufgaben mit Kategorien und Wiederholungen
- Projekte mit Deadlines und Statusverfolgung
- Finanzmanager (Budget, Ausgaben, Kategorien, Sparziele, Statistiken)
- Dokumentenarchiv (Kategorien, Upload, Download, Verknüpfung mit Wissensdatenbank)
- Wissensdatenbank
- Globale Suche über alle Module
- KI-Assistent (Chat, Vorschläge, Spracheingabe)
- Interaktive Schritt-für-Schritt-Anleitungen (Tour) für jedes Modul

### Übergreifend

- Multi-Haushalt-Unterstützung (Mitglieder einladen, geteilte Daten in Echtzeit)
- Push-Benachrichtigungen (Web Push) für Erinnerungen, Vorrats-Warnungen, Wartungen und Deadlines
- Dark/Light Mode
- PWA – installierbar auf iOS, Android und Desktop
- Vollständige Mobiloptimierung

---

## Technologie-Stack

| Bereich | Technologie |
|---|---|
| Frontend | React 18 (Create React App), JavaScript |
| Styling | Tailwind CSS (Dark Mode via `class`-Strategie) |
| Backend & Datenbank | Supabase (PostgreSQL, Auth, Storage, Edge Functions) |
| Push Notifications | Web Push API, VAPID, Deno Edge Functions |
| Cron Jobs | pg_cron (Supabase Extension) |
| KI | OpenAI API (optional: Ollama – lokaler LLM-Server) |
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

# Node.js installieren (für Schlüsselgenerierung via install.sh)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# openssl prüfen (meist vorinstalliert)
openssl version
```

Versionen prüfen:
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

### manage.sh – Zentrales Verwaltungsskript

`manage.sh` ist das zentrale Tool für alle Verwaltungsaufgaben – von der Erstinstallation bis zu Backups und Updates:

```bash
chmod +x scripts/manage.sh
./scripts/manage.sh
```

**Menü:**

| Option | Funktion |
|---|---|
| `[1]` Installation | Vollstack oder App-only einrichten |
| `[2]` Update | Updates einspielen, Container neu starten |
| `[3]` Deinstallation | Container, Volumes oder alles entfernen |
| `[4]` Backup | Datenbank + Konfiguration sichern |
| `[5]` Wiederherstellung | Backup importieren / Daten wiederherstellen |
| `[6]` SMTP | E-Mail-Einstellungen konfigurieren |
| `[7]` Ollama | KI-Assistent konfigurieren |
| `[8]` Konfiguration | App-URL / Port / Admin-E-Mail anpassen |
| `[9]` Status | Laufende Container und Logs anzeigen |

> **Empfehlung:** Für regelmäßige Updates und Wartungsaufgaben immer `manage.sh` verwenden, statt Docker-Befehle direkt einzugeben.

---

### Schnellinstallation mit install.sh

Der Installer richtet alles automatisch ein und unterstützt zwei Modi:

```bash
chmod +x scripts/install.sh
./scripts/install.sh
```

---

#### Modus 1 – Vollstack (Supabase + App)

Installiert Supabase und die React-App gemeinsam via Docker. Empfohlen für neue Server ohne bestehende Supabase-Instanz.

Der Installer:
- Generiert alle kryptografischen Schlüssel automatisch
- Lädt Supabase-Initialisierungsdateien von GitHub herunter
- Erstellt `.env` und startet alle Container via `docker-compose.full.yml`
- Erstellt `CREDENTIALS.txt` mit allen Zugangsdaten

**Abgefragte Eingaben:**

| Eingabe | Beispiel | Beschreibung |
|---|---|---|
| App-URL | `https://umzug.meine-domain.de` | Öffentliche URL der React-App |
| E-Mail | `admin@meine-domain.de` | Für VAPID-Signatur (Push-Notifications) |
| App-Port | `3000` | Externer Port der React-App |
| Supabase-URL | `https://supa.meine-domain.de` | URL des Supabase-Gateways |
| Studio-Passwort | *(min. 8 Zeichen)* | Passwort für Supabase Admin-UI |
| Ollama | `1` / `2` / `3` | KI-Assistent-Option (siehe [KI-Einstellungen](#ki-einstellungen-openai--ollama)) |

**Ausgabe:**
```
  App:             https://umzug.meine-domain.de  (Port: 3000)
  Supabase Studio: http://localhost:8000
  Zugangsdaten:    CREDENTIALS.txt
```

**Nächste Schritte nach Vollstack-Installation:**
1. `install.sh` fragt optional: `Schema jetzt anwenden? [J/n]` (empfohlen: `J`)
2. Bei manueller Ausführung im SQL Editor zuerst `database_setup_complete.sql`, danach `umzugshelfer-pwa/haushalt_multiuser_setup.sql`
3. App aufrufen und ersten Account registrieren
4. Nach Erstlogin: Haushalt erstellen oder per Invite-Link beitreten

---

#### Modus 2 – App only (bestehende Supabase)

Installiert nur die React-App. Supabase läuft bereits woanders (Supabase Cloud oder eigener Server).

Der Installer:
- Generiert nur VAPID-Keys (für Push-Notifications)
- Erstellt eine minimale `.env` mit deinen Supabase-Zugangsdaten
- Baut und startet nur den App-Container via `docker-compose.yml`

**Abgefragte Eingaben:**

| Eingabe | Beispiel | Beschreibung |
|---|---|---|
| App-URL | `https://umzug.meine-domain.de` | Öffentliche URL der React-App |
| E-Mail | `admin@meine-domain.de` | Für VAPID-Signatur |
| App-Port | `3000` | Externer Port der React-App |
| Supabase URL | `https://supa.enkination.de` | URL deiner bestehenden Supabase-Instanz |
| Anon Key | `eyJhbGci...` | Aus Project Settings → API |
| Service Role Key | `eyJhbGci...` | Aus Project Settings → API (geheim!) |
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

> `CREDENTIALS.txt` enthält alle generierten Keys und VAPID-Secrets. Sicher verwahren, niemals ins Git-Repository committen.

---

### Manuelle Installation

Falls `install.sh` nicht verwendet werden soll.

#### Schritt 1 – Schlüssel generieren

```bash
node scripts/generate-keys.js
```

Ausgabe ist JSON mit allen benötigten Werten. In `.env` übertragen.

#### Schritt 2 – Konfigurationsdatei erstellen

```bash
# Vollstack:
cp .env.full.example .env

# App only:
cp env.example .env

nano .env
```

Mindestens diese Werte ausfüllen (Vollstack):

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

#### Schritt 3 – Supabase-Initialisierungsdateien herunterladen (nur Vollstack)

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

#### Schritt 4 – Edge Functions kopieren (nur Vollstack)

```bash
find supabase/functions -mindepth 2 -maxdepth 2 -type f -name 'index.ts' | while read -r fn; do
  name="$(basename "$(dirname "$fn")")"
  mkdir -p "volumes/functions/${name}"
  cp "$fn" "volumes/functions/${name}/index.ts"
done
```

#### Schritt 5 – Starten

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
# umzugshelfer-pwa/.env mit Supabase-URL und Keys befüllen
cd umzugshelfer-pwa
npm install
npm start
# → http://localhost:3000
```

---

## Datenbank einrichten

Nach dem ersten Start muss das Datenbankschema eingerichtet werden.

### Über Supabase Studio

1. Studio öffnen: `http://localhost:8000` (Vollstack) oder deine Supabase-URL
2. Anmelden: Benutzername `supabase`, Passwort aus `CREDENTIALS.txt` / `.env`
3. **SQL Editor** → **New query**
4. Inhalt von `database_setup_complete.sql` einfügen → **Run**
5. Danach `umzugshelfer-pwa/haushalt_multiuser_setup.sql` einfügen → **Run**

### Per Kommandozeile (nur Vollstack)

```bash
docker exec -i supabase-db psql -U postgres -d postgres < database_setup_complete.sql
docker exec -i supabase-db psql -U postgres -d postgres < umzugshelfer-pwa/haushalt_multiuser_setup.sql
```

### pg_cron für Push-Notifications einrichten

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

Bei Verwendung von `install.sh` oder `manage.sh` werden VAPID-Keys automatisch generiert und konfiguriert. Bei manueller Installation sind folgende Schritte nötig:

### Schritt 1 – VAPID-Keys generieren

```bash
npx web-push generate-vapid-keys
# oder via generate-keys.js:
node scripts/generate-keys.js
```

### Schritt 2 – Edge Functions deployen

**Self-hosted Supabase:**

```bash
# Auf dem Supabase-Server:
mkdir -p ~/supabase-project/volumes/functions/send-push
mkdir -p ~/supabase-project/volumes/functions/check-reminders

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

### Schritt 3 – VAPID-Secrets in Supabase eintragen

> **Wichtig (self-hosted):** Die `.env`-Datei in `volumes/functions/` wird vom Edge-Runtime-Container **nicht** geladen. Secrets müssen direkt als Umgebungsvariablen im Container gesetzt werden.

In `~/supabase-project/docker-compose.yml` den Service `supabase-edge-functions` suchen und ergänzen:

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

### Schritt 4 – VAPID Public Key in der App

In `.env` (Root-Verzeichnis für Docker):
```env
REACT_APP_VAPID_PUBLIC_KEY=<dein-public-key>
```

App neu bauen: `docker compose build --no-cache umzugsplaner-app`

### Aktivierung in der App

1. App im Browser öffnen (HTTPS erforderlich)
2. **Profil → Push-Benachrichtigungen → Aktivieren**
3. Browser-Berechtigungsdialog bestätigen

### Push-Delivery testen

```bash
curl -s -X POST https://supa.meine-domain.de/functions/v1/send-push \
  -H "Authorization: Bearer DEIN_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"user_id":"DEINE-USER-ID","title":"Test","body":"Push funktioniert!","url":"/"}'
# Erwartete Antwort: {"sent":1,"removed":0}
```

### Bekannte Einschränkungen

- Push auf **iOS** erfordert die App als PWA (zum Home-Bildschirm hinzugefügt), ab iOS 16.4
- Push funktioniert **nicht** über HTTP (nur HTTPS oder localhost)
- Desktop-Browser: Falls "permission denied" → Browser-Einstellungen → Benachrichtigungen für Domain zurücksetzen

---

## KI-Einstellungen (OpenAI / Ollama)

### OpenAI (Standard)

Profil → KI-Einstellungen → **OpenAI** → API-Key eingeben. Der Key wird pro Haushalt in der Datenbank gespeichert und nie im Browser zwischengespeichert – alle Anfragen laufen über eine serverseitige Supabase Edge Function.

### Ollama (lokaler LLM-Server)

Wer einen eigenen Ollama-Server betreibt, kann diesen als Alternative zu OpenAI nutzen – ohne API-Kosten.

#### Option A – Bestehenden Ollama-Server nutzen

Keine Installation nötig. URL direkt in der App eintragen:

1. Profil → **KI-Einstellungen** → Provider: **Ollama**
2. **Server-URL** eintragen: `http://DEINE-SERVER-IP:11434`
3. **Modell** wählen: z.B. `llama3.2`, `mistral`, `qwen2.5`
4. **Verbindung testen** → **Speichern**

#### Option B – Ollama mit Docker mitinstallieren

Bei `install.sh` Wahl `1` auswählen, oder manuell:

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

Danach in der App: Ollama-URL → `http://localhost:11434`

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

> **Hinweis:** Im Ollama-Modus wird Spracheingabe über die Browser Web Speech API verarbeitet (kein Whisper). Chrome/Edge erforderlich.

---

## SMTP konfigurieren

Ohne SMTP können Nutzer ihre E-Mail nicht bestätigen und kein Passwort zurücksetzen.

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

SMTP kann auch interaktiv über `manage.sh` → `[6] SMTP` konfiguriert werden.

**Empfohlene SMTP-Anbieter:** Mailgun (kostenlos bis 100/Tag), SendGrid, Amazon SES, eigener Postfix

---

## Invite-Link über App-Domain

Wenn Einladungs-Mails den Host `umzug.meine-domain.de` statt `supa.meine-domain.de` zeigen sollen, stelle nur den Auth-External-Link um (ohne kompletten API-Umbau):

```env
# nur fuer Mail-/Verify-Links
API_EXTERNAL_URL=https://umzug.meine-domain.de

# unveraendert lassen (weiter Supabase-Domain fuer App/API)
SUPABASE_PUBLIC_URL=https://supa.meine-domain.de
REACT_APP_SUPABASE_URL=https://supa.meine-domain.de
MAILER_URLPATHS_INVITE=/auth/v1/verify
```

Im Nginx-Serverblock der **App-Domain** (`umzug.meine-domain.de`) zusaetzlich:

```nginx
location ^~ /auth/v1/ {
    proxy_pass http://localhost:8000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
}
```

Danach:

```bash
sudo nginx -t && sudo systemctl reload nginx
./scripts/manage.sh   # [8] Konfiguration -> Invite-Link auf App-Domain umstellen
```

Wenn du zusaetzlich neue Templates/Functions auf den Server kopiert hast:

```bash
./scripts/manage.sh   # [2] Update -> [5] Server-Sync komplett
```

---

## Nginx Reverse Proxy

Für Produktionsbetrieb mit HTTPS.

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

### Empfohlen: manage.sh

```bash
./scripts/manage.sh
# → [2] Update
```

Das Update-Menü zieht aktuelle Git-Änderungen und baut die App-Container neu.

### Manuell

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
├── scripts/
│   ├── manage.sh               # Zentrales Verwaltungsskript (Update, Backup, Status …)
│   ├── install.sh              # Auto-Installer (Vollstack oder App only)
│   └── generate-keys.js        # Kryptografische Schlüssel generieren
├── supabase/
│   └── functions/
│       ├── ki-chat/            # Edge Function: KI-Chat-Proxy (OpenAI/Ollama)
│       ├── send-push/          # Edge Function: Push-Nachricht senden
│       ├── check-reminders/    # Edge Function: Fällige Erinnerungen prüfen
│       ├── send-invite/        # Edge Function: Einladungs-E-Mail versenden
│       └── send-household-invite/  # Edge Function: Haushalt-Einladung
├── umzugshelfer-pwa/           # React-Frontend
│   ├── public/                 # manifest.json, service-worker.js
│   └── src/
│       ├── components/
│       │   ├── home/           # Home-Organizer-Komponenten
│       │   │   └── tour/       # Tour-System (TourOverlay, useTour, tourSteps)
│       │   ├── haushalt/       # Multi-Haushalt-Verwaltung
│       │   ├── featurepages/   # Öffentliche Feature-Landingpages
│       │   ├── layout/         # Sidebar, Topbar, Mobile-Navigation
│       │   └── ...             # Umzugs-Module
│       ├── contexts/
│       │   ├── AppModeContext.js    # Umzug/Home-Modus-Verwaltung
│       │   ├── HaushaltsContext.js  # Multi-Haushalt-State
│       │   └── ThemeContext.js      # Dark/Light Mode
│       ├── hooks/
│       │   ├── usePushSubscription.js  # Web Push Subscription
│       │   └── useViewport.js          # Responsive-Breakpoints
│       ├── utils/
│       │   └── kiClient.js     # KI-Client (OpenAI + Ollama)
│       ├── App.js              # Routing & Auth
│       ├── supabaseClient.js   # Supabase-Client (mit Haushalt-Proxy)
│       └── index.js            # Einstiegspunkt
├── database_setup_complete.sql             # Komplettes Datenbank-Setup
├── umzugshelfer-pwa/haushalt_multiuser_setup.sql  # Multi-Haushalt-Schema
├── docker-compose.yml                      # App only (externer Supabase)
├── docker-compose.full.yml                 # Vollstack (Supabase + App + optionaler Ollama)
├── .env.full.example                       # Alle Variablen dokumentiert (Vollstack)
└── env.example                             # Minimale Variablen (App only)
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

Oder interaktiv über `manage.sh` → `[9] Status`.

### Häufige Probleme

**App zeigt "VAPID Public Key fehlt"**
→ `REACT_APP_VAPID_PUBLIC_KEY` fehlt in `.env` oder die App wurde ohne diesen Wert gebaut.
→ `.env` prüfen, dann: `docker compose -f docker-compose.full.yml build --no-cache umzugsplaner-app`

**Push-Notifications: "No subject set in vapidDetails.subject."**
→ VAPID-Secrets sind nicht als Umgebungsvariablen im Edge-Functions-Container gesetzt.
→ In `docker-compose.full.yml` beim Service `supabase-edge-functions` unter `environment` die drei VAPID-Variablen eintragen. Container neu starten: `docker restart supabase-edge-functions`

**Push-Notifications: "Registration failed - permission denied" im Browser**
→ Browser-Einstellungen → Benachrichtigungen → Domain zurücksetzen → Seite neu laden.

**Supabase Studio nicht erreichbar**
→ `docker compose -f docker-compose.full.yml ps` – ist `supabase-analytics` healthy?
→ `docker compose -f docker-compose.full.yml logs supabase-analytics`

**Datenbank startet nicht**
→ `cat volumes/db/jwt.sql | grep "your-super-secret"` – falls gefunden, JWT-Secret noch nicht ersetzt.
→ `docker compose -f docker-compose.full.yml down && docker compose -f docker-compose.full.yml up -d`

**E-Mails werden nicht versendet**
→ SMTP-Konfiguration in `.env` prüfen.
→ `docker compose -f docker-compose.full.yml logs supabase-auth | grep -i smtp`

**Ollama antwortet nicht**
→ `docker ps | grep ollama` – läuft der Container?
→ `curl http://localhost:11434/api/tags` – API erreichbar?
→ CORS-Problem im Browser: `OLLAMA_ORIGINS=*` muss in `docker-compose.full.yml` gesetzt sein (bereits vorkonfiguriert).

### Neustart / Reset

```bash
# Alle Container neu starten (Daten bleiben erhalten)
docker compose -f docker-compose.full.yml down
docker compose -f docker-compose.full.yml up -d

# Neuinstallation (ACHTUNG: löscht alle Daten)
docker compose -f docker-compose.full.yml down -v
rm -rf volumes/db/data volumes/storage
./scripts/install.sh
```

---

## Mitwirken

1. Fork erstellen
2. Feature-Branch anlegen: `git checkout -b feature/mein-feature`
3. Änderungen committen
4. Pull Request erstellen

---

## Lizenz

MIT – siehe `LICENSE`-Datei.
