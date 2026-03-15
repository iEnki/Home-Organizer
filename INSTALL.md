# Umzughelfer — Installationsanleitung

Vollständige Anleitung zur Installation des Self-Hosted Stacks.

---

## Inhaltsverzeichnis

1. [Voraussetzungen](#1-voraussetzungen)
2. [Schnellinstallation mit install.sh](#2-schnellinstallation-mit-installsh)
3. [Manuelle Installation](#3-manuelle-installation)
4. [Datenbank einrichten](#4-datenbank-einrichten)
5. [Ollama (optionaler KI-Assistent)](#5-ollama-optionaler-ki-assistent)
6. [Push-Benachrichtigungen aktivieren](#6-push-benachrichtigungen-aktivieren)
7. [SMTP konfigurieren](#7-smtp-konfigurieren)
8. [Nginx Reverse Proxy](#8-nginx-reverse-proxy)
9. [Aktualisierungen](#9-aktualisierungen)
10. [Troubleshooting](#10-troubleshooting)

---

## 1. Voraussetzungen

### Server-Anforderungen

| Komponente | Minimum |
|---|---|
| CPU | 2 Kerne |
| RAM | 4 GB (8 GB mit Ollama) |
| Disk | 20 GB |
| OS | Ubuntu 22.04 / Debian 12 oder neuer |

### Software

```bash
# Docker installieren (Ubuntu/Debian)
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
newgrp docker

# Node.js installieren (benötigt für Schlüsselgenerierung)
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
git clone https://github.com/dein-user/umzughelfer.git
cd umzughelfer
```

---

## 2. Schnellinstallation mit install.sh

Der Installer unterstützt zwei Modi und richtet die Umgebung automatisch ein:

### Ausführen

```bash
chmod +x scripts/install.sh
./scripts/install.sh
```

---

### Modus A — Vollstack (Supabase + App)

Installiert Supabase und die App gemeinsam via Docker auf demselben Server. Empfohlen für neue Installationen ohne bestehende Supabase.

Der Installer:
- Generiert alle kryptografischen Schlüssel automatisch
- Lädt Supabase-Initialisierungsdateien von GitHub herunter
- Erstellt die `.env` und startet alle Container
- Erstellt `CREDENTIALS.txt` mit allen Zugangsdaten

**Abgefragte Eingaben:**

| Eingabe | Beispiel | Beschreibung |
|---|---|---|
| App-URL | `https://umzug.meine-domain.de` | Öffentliche URL der React-App |
| E-Mail | `admin@meine-domain.de` | Für Push-Notification VAPID-Signatur |
| App-Port | `3000` | Externer Port der React-App |
| Supabase-URL | `https://supa.meine-domain.de` | URL des Supabase-Gateways (kann gleich wie App-URL sein) |
| Studio-Passwort | *(min. 8 Zeichen)* | Passwort für Supabase Admin-UI |
| Ollama | `1` / `2` / `3` | Optionaler KI-Assistent |

**Ausgabe nach der Installation:**
```
  App:             https://umzug.meine-domain.de  (Port: 3000)
  Supabase Studio: http://localhost:8000
  Zugangsdaten:    CREDENTIALS.txt

  Nächster Schritt:
    1. Studio öffnen: http://localhost:8000
    2. SQL Editor → database_setup_complete.sql ausführen
    3. App aufrufen und ersten Account registrieren
```

---

### Modus B — App only (bestehende Supabase)

Installiert nur die React-App. Supabase läuft bereits woanders (Supabase Cloud, eigener Server, etc.).

Der Installer:
- Generiert nur VAPID-Keys (für Push-Notifications)
- Erstellt eine minimale `.env` mit deinen Supabase-Zugangsdaten
- Baut und startet nur den React-App-Container (`docker-compose.yml`)

**Abgefragte Eingaben:**

| Eingabe | Beispiel | Beschreibung |
|---|---|---|
| App-URL | `https://umzug.meine-domain.de` | Öffentliche URL der React-App |
| E-Mail | `admin@meine-domain.de` | Für Push-Notification VAPID-Signatur |
| App-Port | `3000` | Externer Port der React-App |
| Supabase URL | `https://supa.enkination.de` | URL deiner bestehenden Supabase-Instanz |
| Anon Key | `eyJhbGci...` | Aus Project Settings → API |
| Service Role Key | `eyJhbGci...` | Aus Project Settings → API (geheim!) |
| Ollama | `1` / `2` / `3` | Optionaler KI-Assistent |

**Ausgabe nach der Installation:**
```
  App:       https://umzug.meine-domain.de  (Port: 3000)
  Supabase:  https://supa.enkination.de  (extern)
  Zugangsdaten: CREDENTIALS.txt

  Nächster Schritt:
    1. In Supabase SQL Editor: database_setup_complete.sql ausführen
    2. App aufrufen und ersten Account registrieren
```

> `CREDENTIALS.txt` enthält alle generierten Keys und VAPID-Secrets. Sicher verwahren, niemals ins Git-Repository committen.

---

## 3. Manuelle Installation

Falls `install.sh` nicht verwendet werden soll.

### Schritt 1 — Schlüssel generieren

```bash
node scripts/generate-keys.js
```

Ausgabe ist JSON mit allen benötigten Werten. Diese in die `.env` übertragen.

### Schritt 2 — Konfigurationsdatei erstellen

```bash
cp .env.full.example .env
nano .env
```

Mindestens diese Werte ausfüllen:

```env
# App
SITE_URL=https://umzug.meine-domain.de
API_EXTERNAL_URL=https://supa.meine-domain.de
SUPABASE_PUBLIC_URL=https://supa.meine-domain.de
APP_PORT=3000

# React Build
REACT_APP_SUPABASE_URL=https://supa.meine-domain.de
REACT_APP_SUPABASE_ANON_KEY=<anon-key>
REACT_APP_PASSWORD_RESET_REDIRECT_URL=https://umzug.meine-domain.de/update-password
REACT_APP_VAPID_PUBLIC_KEY=<vapid-public-key>

# Supabase Keys
ANON_KEY=<anon-key>
SERVICE_ROLE_KEY=<service-role-key>

# Datenbank
POSTGRES_PASSWORD=<starkes-passwort>

# JWT
JWT_SECRET=<min-32-zeichen>

# Sicherheitsschlüssel
SECRET_KEY_BASE=<64-byte-hex>
VAULT_ENC_KEY=<32-zeichen-hex>
PG_META_CRYPTO_KEY=<32-zeichen-hex>

# Studio
DASHBOARD_PASSWORD=<sicheres-passwort>

# VAPID
VAPID_SUBJECT=mailto:admin@meine-domain.de
VAPID_PUBLIC_KEY=<vapid-public-key>
VAPID_PRIVATE_KEY=<vapid-private-key>
```

### Schritt 3 — Supabase-Initialisierungsdateien herunterladen

```bash
mkdir -p volumes/db volumes/logs volumes/pooler volumes/storage volumes/functions volumes/snippets volumes/db/data

SUPABASE_RAW="https://raw.githubusercontent.com/supabase/supabase/master/docker"

curl -fsSL ${SUPABASE_RAW}/volumes/db/realtime.sql  -o volumes/db/realtime.sql
curl -fsSL ${SUPABASE_RAW}/volumes/db/webhooks.sql  -o volumes/db/webhooks.sql
curl -fsSL ${SUPABASE_RAW}/volumes/db/roles.sql     -o volumes/db/roles.sql
curl -fsSL ${SUPABASE_RAW}/volumes/db/jwt.sql       -o volumes/db/jwt.sql
curl -fsSL ${SUPABASE_RAW}/volumes/db/_supabase.sql -o volumes/db/_supabase.sql
curl -fsSL ${SUPABASE_RAW}/volumes/db/logs.sql      -o volumes/db/logs.sql
curl -fsSL ${SUPABASE_RAW}/volumes/db/pooler.sql    -o volumes/db/pooler.sql
curl -fsSL ${SUPABASE_RAW}/volumes/logs/vector.yml  -o volumes/logs/vector.yml
curl -fsSL ${SUPABASE_RAW}/volumes/pooler/pooler.exs -o volumes/pooler/pooler.exs
```

JWT-Secret in `jwt.sql` einsetzen:
```bash
sed -i "s/your-super-secret-jwt-token-with-at-least-32-characters-long/DEIN_JWT_SECRET/g" volumes/db/jwt.sql
```

### Schritt 4 — Edge Functions kopieren

```bash
mkdir -p volumes/functions/send-push volumes/functions/check-reminders
cp supabase/functions/send-push/index.ts volumes/functions/send-push/index.ts
cp supabase/functions/check-reminders/index.ts volumes/functions/check-reminders/index.ts
```

### Schritt 5 — Starten

```bash
# App bauen
docker compose -f docker-compose.full.yml build umzugsplaner-app

# Alle Container starten
docker compose -f docker-compose.full.yml up -d

# Status prüfen
docker compose -f docker-compose.full.yml ps
```

---

## 4. Datenbank einrichten

Nach dem ersten Start muss das Datenbankschema eingerichtet werden.

### Über Supabase Studio

1. Studio öffnen: `http://localhost:8000` (oder `http://dein-server:8000`)
2. Anmelden: Benutzername `supabase`, Passwort aus `.env` / `CREDENTIALS.txt`
3. Linke Sidebar: **SQL Editor** → **New query**
4. Inhalt von `database_setup_complete.sql` einfügen
5. **Run** klicken

### Per Kommandozeile

```bash
docker exec -i supabase-db psql -U postgres -d postgres < database_setup_complete.sql
```

### pg_cron für Push-Notifications einrichten

Im SQL Editor (nach Datenbanksetup):

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

Den Service Role Key findest du in `CREDENTIALS.txt` oder `.env` unter `SERVICE_ROLE_KEY`.

---

## 5. Ollama (optionaler KI-Assistent)

Ollama ermöglicht die Nutzung von lokalen LLMs (z.B. Llama 3.2, Mistral) als Alternative zu OpenAI. Es gibt zwei Varianten:

---

### Option A — Bestehenden Ollama-Server nutzen (empfohlen)

Wenn du bereits einen Ollama-Server betreibst (auf demselben oder einem anderen Rechner), musst du nichts installieren. Die URL wird direkt in der App eingetragen:

1. App öffnen → **Profil** (oben rechts)
2. **KI-Einstellungen** → Provider: **Ollama**
3. **Ollama-URL** eintragen: `http://DEINE-SERVER-IP:11434`
4. **Modell** wählen: z.B. `llama3.2`
5. Speichern

> Die URL und das Modell werden pro Benutzer in der Datenbank gespeichert.

---

### Option B — Ollama mit Docker mitinstallieren

#### Mit install.sh

Bei der Installation Wahl `1` wählen ("Ollama wird mit Docker mitinstalliert").

#### Manuell

```bash
# Ollama-Container starten (Docker Compose Profil)
docker compose -f docker-compose.full.yml --profile ollama up -d

# Modell herunterladen (Beispiel: Llama 3.2, ~2 GB)
docker exec ollama ollama pull llama3.2

# Weitere Modelle:
# docker exec ollama ollama pull mistral
# docker exec ollama ollama pull qwen2.5
# docker exec ollama ollama pull gemma3
```

Danach in der App eintragen (wie Option A):
- Ollama-URL: `http://localhost:11434` (oder `http://DEINE-SERVER-IP:11434`)

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

#### Ollama-Status prüfen

```bash
# Geladene Modelle anzeigen
docker exec ollama ollama list

# API direkt testen
curl http://localhost:11434/api/tags
```

---

## 6. Push-Benachrichtigungen aktivieren

Push-Notifications sind bereits in der Installation enthalten. Nach dem Start:

1. App im Browser öffnen (HTTPS erforderlich — kein localhost)
2. **Profil** → **Push-Benachrichtigungen** → **Aktivieren**
3. Browser-Berechtigungsdialog bestätigen
4. Test: In der Datenbank unter `push_subscriptions` sollte ein Eintrag erscheinen

### Push-Delivery testen

```bash
# User-ID aus push_subscriptions-Tabelle entnehmen
curl -s -X POST https://supa.meine-domain.de/functions/v1/send-push \
  -H "Authorization: Bearer DEIN_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"user_id":"DEINE-USER-ID","title":"Test","body":"Push funktioniert!","url":"/"}'

# Erwartete Antwort: {"sent":1,"removed":0}
```

### Bekannte Einschränkungen

- Push auf **iOS** erfordert die App als PWA (zum Home-Bildschirm hinzugefügt), ab iOS 16.4
- Push funktioniert **nicht** über HTTP (nur HTTPS oder localhost)
- Desktop-Browser: Falls "permission denied" erscheint → Browser-Einstellungen → Benachrichtigungen für die Domain zurücksetzen

---

## 7. SMTP konfigurieren

Ohne SMTP können Nutzer ihre E-Mail-Adresse nicht bestätigen und kein Passwort zurücksetzen.

In `.env` anpassen:

```env
SMTP_ADMIN_EMAIL=no-reply@meine-domain.de
SMTP_HOST=smtp.mailgun.org       # oder smtp.sendgrid.net / mail.meine-domain.de
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

## 8. Nginx Reverse Proxy

Für den Produktionsbetrieb sollte ein Reverse Proxy vor dem Stack laufen, der HTTPS terminiert.

### Beispiel-Konfiguration (Nginx)

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
        # WebSocket-Unterstützung (für Realtime)
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

### SSL-Zertifikate mit Let's Encrypt

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d umzug.meine-domain.de -d supa.meine-domain.de
```

---

## 9. Aktualisierungen

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

## 10. Troubleshooting

### Container-Logs anzeigen

```bash
# Alle Container
docker compose -f docker-compose.full.yml logs -f

# Einzelner Container
docker compose -f docker-compose.full.yml logs -f supabase-db
docker compose -f docker-compose.full.yml logs -f supabase-auth
docker compose -f docker-compose.full.yml logs -f supabase-edge-functions
docker compose -f docker-compose.full.yml logs -f umzugsplaner-pwa-container
```

### Häufige Probleme

**App zeigt "VAPID Public Key fehlt"**
→ `REACT_APP_VAPID_PUBLIC_KEY` ist nicht in der `.env` gesetzt oder die App wurde ohne diesen Wert gebaut.
→ Lösung: `.env` prüfen, dann `docker compose -f docker-compose.full.yml build --no-cache umzugsplaner-app`

**Push-Notifications: "No subject set in vapidDetails.subject."**
→ Die VAPID-Secrets kommen nicht beim Edge-Functions-Container an.
→ Lösung: In `docker-compose.full.yml` prüfen, ob `VAPID_SUBJECT`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` unter `supabase-edge-functions` → `environment` eingetragen sind. Container neu starten: `docker restart supabase-edge-functions`

**Supabase Studio nicht erreichbar**
→ `docker compose -f docker-compose.full.yml ps` — prüfen ob `supabase-analytics` healthy ist (Studio hängt davon ab).
→ Analytics-Logs prüfen: `docker compose -f docker-compose.full.yml logs supabase-analytics`

**Datenbank startet nicht**
→ Häufige Ursache: `volumes/db/jwt.sql` enthält noch den Platzhalter statt dem echten JWT-Secret.
→ Lösung: `cat volumes/db/jwt.sql | grep "your-super-secret"` — falls gefunden, JWT-Secret ersetzen und Container neu erstellen: `docker compose -f docker-compose.full.yml down && docker compose -f docker-compose.full.yml up -d`

**E-Mails werden nicht versendet**
→ SMTP-Konfiguration in `.env` prüfen.
→ Auth-Logs: `docker compose -f docker-compose.full.yml logs supabase-auth | grep -i smtp`

**Ollama antwortet nicht**
→ `docker ps | grep ollama` — Container läuft?
→ `curl http://localhost:11434/api/tags` — API erreichbar?
→ CORS-Fehler im Browser: Ollama benötigt `OLLAMA_ORIGINS=*` (bereits in `docker-compose.full.yml` gesetzt)

### Alle Container neu starten

```bash
docker compose -f docker-compose.full.yml restart
```

### Kompletter Neustart (Daten bleiben erhalten)

```bash
docker compose -f docker-compose.full.yml down
docker compose -f docker-compose.full.yml up -d
```

### Neuinstallation (ACHTUNG: löscht alle Daten)

```bash
docker compose -f docker-compose.full.yml down -v
rm -rf volumes/db/data volumes/storage
./scripts/install.sh
```
