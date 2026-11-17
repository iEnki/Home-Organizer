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
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs

# openssl prüfen (meist vorinstalliert)
openssl version

# Vollstack: Storage-Backups inklusive erweiterter Dateiattribute
sudo apt-get install -y python3 tar
```

Versionen prüfen:
```bash
docker --version          # >= 24.0
docker compose version    # >= 2.20
node --version            # >= 16
```

### Repository klonen

```bash
git clone https://github.com/iEnki/Home-Organizer.git
cd Home-Organizer
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

Dieser Weg ist für eine **neue Vollstack-Installation** aus einer vollständigen
Releasequelle vorgesehen. Docker mit Compose-Plugin, Node.js 22, Python 3,
Bash und die in Abschnitt 1 genannten Voraussetzungen müssen vorhanden sein.
Alle Befehle im Projektverzeichnis ausführen. Pro Docker-Daemon ist nur eine
Installation unterstützt: Container- und Volume-Namen werden geteilt. Einen
bestehenden Stack weder parallel starten noch mit neu erzeugten Schlüsseln
überschreiben; dafür Verwaltung und den gesonderten Update-/Restore-Weg nutzen.

### Schritt 1 — Schlüssel privat generieren

```bash
umask 077
mkdir -p backups/manual-setup
chmod 700 backups/manual-setup
# noclobber verhindert, dass ein erneuter Aufruf die bisherigen Schlüssel ersetzt.
(set -o noclobber; node scripts/generate-keys.js > backups/manual-setup/keys.json)
chmod 600 backups/manual-setup/keys.json
```

Die JSON-Datei enthält alle zusammengehörigen Schlüssel einschließlich der
internen OCR-/Parser-Tokens. Nur privat öffnen und die Werte im nächsten Schritt
übertragen; nicht in Terminalprotokolle, Chats oder Git kopieren. JWT, Anon Key
und Service Role Key immer aus demselben Generierungslauf verwenden.

### Schritt 2 — Konfigurationsdatei erstellen

```bash
umask 077
(set -o noclobber; cat .env.full.example > .env)
chmod 600 .env
nano .env
```

**Alle** Platzhalter der Vorlage ersetzen. Die mit `generate-keys.js` erzeugten
Werte jeweils unter dem gleichnamigen Schlüssel eintragen. Zusätzlich festlegen:

```env
UMZUG_INSTALL_MODE=vollstack
SITE_URL=https://umzug.meine-domain.de
APP_URL=https://umzug.meine-domain.de
API_EXTERNAL_URL=https://supa.meine-domain.de
SUPABASE_PUBLIC_URL=https://supa.meine-domain.de
APP_PORT=3000
REACT_APP_SUPABASE_URL=https://supa.meine-domain.de
REACT_APP_PASSWORD_RESET_REDIRECT_URL=https://umzug.meine-domain.de/update-password
ADDITIONAL_REDIRECT_URLS=https://umzug.meine-domain.de,https://umzug.meine-domain.de/update-password
VAPID_SUBJECT=mailto:admin@meine-domain.de
OLLAMA_INSTALLED=false
OLLAMA_USE_GPU=false
```

`REACT_APP_SUPABASE_ANON_KEY` erhält denselben Wert wie `ANON_KEY`,
`REACT_APP_VAPID_PUBLIC_KEY` denselben wie `VAPID_PUBLIC_KEY`. Ein eigenes starkes
`DASHBOARD_PASSWORD` setzen. SMTP-Werte mit einem erreichbaren Mailanbieter
konfigurieren, damit Registrierung und Passwort-Reset funktionieren. Optionale
Anbieter-Tokens ohne vorhandenen Zugang leer lassen, statt den Beispielplatzhalter
zu übernehmen. Für Ollama siehe Abschnitt 5. Eine später erstellte
`CREDENTIALS.txt` ebenfalls mit `chmod 600 CREDENTIALS.txt` schützen.

### Schritt 3 — Versionierte Laufzeitdateien vorbereiten

```bash
bash <<'BASH'
set -euo pipefail
source scripts/lib/runtime-context.sh
umzug_prepare_fullstack_files "$PWD"
BASH
```

Damit werden die zur Compose-Datei gehörenden geprüften Supabase-Vorlagen sowie
`volumes/api/kong.yml` und `volumes/api/kong-entrypoint.sh` bereitgestellt.
Es gibt keinen Download von `master`. Bereits vorhandene Laufzeitdateien werden
nicht überschrieben. Fehlende Vorlagen führen zu einem Fehler; dann nicht mit
dem Start fortfahren. `jwt.sql` liest den Schlüssel beim Datenbankstart aus der
Containerumgebung; ein Ersetzen des SQL-Texts ist nicht erforderlich.

### Schritt 4 — Edge Functions kopieren

Für die automatische Suche nach Beipackzetteln muss `BASG_API_TOKEN` in der `.env`
gesetzt und an den Edge-Functions-Container übergeben werden. Bei einer verwalteten
Supabase-Installation wird derselbe Wert als Edge-Function-Secret hinterlegt. Den
Token niemals in den Quellcode oder das Repository eintragen.

```bash
mkdir -p volumes/functions
cp -R supabase/functions/. volumes/functions/
```

### Schritt 5 — Bauen, starten und Schema einrichten

```bash
bash <<'BASH'
set -euo pipefail
source scripts/lib/runtime-context.sh
# Baut auch OCR und Recipe-Parser; der optionale Ollama-Dienst bleibt aus.
umzug_start_stack docker-compose.full.yml false --build --wait --wait-timeout 600
# Storage-Migrationen und Gateway müssen vor dem App-Schema bereit sein.
umzug_wait_fullstack_ready
docker exec -i supabase-db psql -v ON_ERROR_STOP=1 -U postgres -d postgres < database_setup_complete.sql
docker compose -f docker-compose.full.yml ps
BASH
```

Nur bei erfolgreichem Abschluss fortfahren. Bei einem Fehler dessen Ursache
beheben, nicht mit ignorierten SQL-Fehlern erneut importieren. Beim ersten Build
werden Dienstimages und Sprachmodelle heruntergeladen; das kann einige Minuten
dauern. Danach App öffnen und ein Konto registrieren. Schemaimport nicht noch
einmal über Abschnitt 4 wiederholen; dort stehen alternative Importwege sowie
Hinweise für bestehende Datenbanken. Schlüsseldatei privat als Teil der
Installationskonfiguration aufbewahren und zusammen mit Code, Images und einem
vollständigen Datenbank-/Storage-Rückfallstand sichern.

---

## 4. Datenbank einrichten

Der Vollstack-Installer und Schritt 5 der manuellen Anleitung richten das
App-Schema bereits ein. Die folgenden Importwege sind Alternativen für eine
noch nicht eingerichtete Datenbank, etwa bei App-only mit externem Supabase.

### Über Supabase Studio

1. Studio öffnen: `http://localhost:8000` (oder `http://dein-server:8000`)
2. Anmelden: Benutzername `supabase`, Passwort aus `.env` / `CREDENTIALS.txt`
3. Linke Sidebar: **SQL Editor** → **New query**
4. Inhalt von `database_setup_complete.sql` einfügen
5. **Run** klicken

### Per Kommandozeile

```bash
docker exec -i supabase-db psql -v ON_ERROR_STOP=1 -U postgres -d postgres < database_setup_complete.sql
```

### Bestehende Datenbank aktualisieren

Das vollständige Setup ist für Neuinstallationen vorgesehen. Vor einem Update
Quellen, Images, Konfiguration und ein vollständiges Datenbank-/Storage-Backup
sichern. Für ältere App-Schemata ist die vorhandene, versionierte Paritätsmigration
wieder mitgeliefert; sie wird nicht automatisch durch ein App-Image-Update ausgeführt:

```bash
# Nur auf einer gesicherten und zuvor getesteten Datenbank anwenden.
# Lokaler Vollstack: supabase_admin darf auch Studio-eigene Tabellen bearbeiten.
docker exec -i supabase-db psql -X -v ON_ERROR_STOP=1 -U supabase_admin -d postgres < scripts/migration_2026_08_02_schema_parity.sql
```

Tabellen aus dem Studio-SQL-Editor können `supabase_admin` gehören. Ein
Import als `postgres` scheitert dann auch bei `IF NOT EXISTS` an der
Eigentümerschaft. Im lokalen Vollstack deshalb den vorhandenen administrativen
Benutzer wie oben verwenden; keine Rollen hochstufen, Eigentümer wechseln oder
RLS abschalten. Bei externem Supabase den zuständigen administrativen
SQL-Editor/Verbindungsbenutzer verwenden. Ist das Schema bereits vollständig,
ist die Paritätsmigration nicht erforderlich; abweichende Defaults, Typen und
Checks zuerst gegen die konkreten App-Aufrufe auf einer Kopie bewerten.

Die Datei ergänzt fehlende App-Schemabestandteile und enthält einen eigenen
Transaktionsrahmen. Zuerst auf einer Kopie des bisherigen Schemas prüfen. Bei
einem Fehler abbrechen, die Ursache beheben und den dokumentierten Rückfallstand
verwenden; keine Fehler mit weiteren Importen übergehen. Für einen bereits
abgeglichenen Stand ist keine erneute Neuinstallation erforderlich. Anbieterinterne
Supabase-Migrationen sind davon getrennt und benötigen weiterhin einen passenden
ALLDB-Rückfallstand. Bei verwaltetem Supabase die Migration über den SQL-Editor
oder die dafür eingerichtete Datenbankverbindung anwenden.

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

#### GPU- und CPU-Betrieb

Das aktuelle Ollama-Profil enthält `gpus: all` und setzt eine funktionierende NVIDIA-Container-Runtime voraus. Voraussetzung ist das [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/install-guide.html).

Für einen CPU-only-Host muss `gpus: all` im `ollama`-Service entfernt oder ein separates CPU-Profil bereitgestellt werden, bevor das Profil gestartet wird.

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

Wenn nur die Browserslist-/`caniuse-lite`-Daten gepflegt werden sollen:

```bash
./scripts/manage.sh maintenance browserslist
```

Dieser Wartungsbefehl aktualisiert nur die Frontend-Browserdaten, führt danach immer einen Build-Test aus und kann dabei `umzugshelfer-pwa/package-lock.json` ändern. Er ist bewusst kein automatischer Teil von `install.sh` oder dem normalen Update-Menü.

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

        # OpenAI-/Vision-Anfragen können länger als 90 Sekunden dauern.
        # Der Wert muss über dem Edge-Function-Limit von 180 Sekunden liegen.
        proxy_connect_timeout 30s;
        proxy_send_timeout 210s;
        proxy_read_timeout 210s;
        send_timeout 210s;
        client_max_body_size 32m;
    }
}
```

Diese Zeitlimits müssen auf dem äußersten Reverse Proxy gelten, der die
Supabase-/Kong-Domain veröffentlicht. Läuft dort noch ein Standardlimit von
60 oder 90 Sekunden, beendet der Proxy eine weiterhin arbeitende
`ki-vision`-Funktion vorzeitig mit HTTP 499/504.

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
docker compose -f docker-compose.full.yml up -d --no-deps --force-recreate functions
```

Der letzte Befehl ist wichtig, wenn sich Compose-Umgebungsvariablen oder Edge
Functions geändert haben. Alternativ übernimmt `./scripts/manage.sh` den
Abgleich und prüft dabei auch die internen Auth-/REST-Adressen.

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


### Eindeutiger Installationsmodus und bestehende Wartungsbefehle

Der Installer merkt sich die Auswahl in `.env` als `UMZUG_INSTALL_MODE=apponly` oder `UMZUG_INSTALL_MODE=vollstack`. Bestehende Installationen werden anhand dieser Angabe oder der Compose-Zuordnung des App-Containers erkannt. Sind beide Compose-Dateien vorhanden und ist keine Zuordnung möglich, fragt die Verwaltung einmalig nach. Das bloße Vorhandensein von `docker-compose.full.yml` wählt keinen Vollstack mehr aus.

Die vorhandenen Einstiege bleiben erhalten:

```bash
./scripts/manage.sh
./scripts/manage_en.sh
./scripts/install.sh
./scripts/update.sh
./scripts/uninstall.sh
./scripts/manage.sh maintenance browserslist
```

Der letzte Befehl aktualisiert ausschließlich die Browserslist-Daten über npm im Frontend-Verzeichnis. Er benötigt kein Docker, startet keine Container und kann die Paket-Lockdatei ändern. Browserzieländerungen sind vor einem anschließenden Build gesondert zu prüfen. Ein fehlgeschlagener Git- oder Image-Download beendet den jeweiligen Update-Schritt; ein ausdrücklich gewünschter Neubau des lokalen Stands bleibt über Update-Option 2 erreichbar.

Die Skript-Regressionsprüfung arbeitet mit temporären Dateien und gemockten Docker-/npm-Aufrufen:

```bash
python -m unittest discover -s scripts/tests -p 'test_runtime_context.py' -v
```

Sie ersetzt nicht den Installationstest mit einem eigenen Docker-Daemon und Testdaten.


### Backup und Wiederherstellung im Vollstack

Backup und Restore verwenden in beiden Sprachfassungen dieselbe Implementierung. Sie prüfen zusätzlich, ob der Datenbankcontainer zum aktuellen Projektordner gehört. App-only greift nicht auf eine zufällig auf demselben Host laufende Datenbank zu. Pro Docker-Daemon ist weiterhin nur eine Installation vorgesehen; App-only und Vollstack verwenden feste Container-/Image-Namen.

Für ein konsistentes Backup pausieren die laufenden Dienste kurzzeitig; die Datenbank bleibt gestartet. Das Backup enthält Datenbank, Storage-Dateien, vorhandene Konfiguration/Zugangsdaten und SHA-256-Prüfsummen. Backupverzeichnisse sind privat (0700), ihre Dateien 0600. Genügend freien Speicher für Dump und Dateien vorhalten.

Vor einer Wiederherstellung werden Prüfsummen, Datenbankarchiv einschließlich Nutzdaten und das Storage-Archiv geprüft. Ältere Backups ohne Prüfsummen bleiben lesbar, werden jedoch vollständig für den Import aufbereitet. Fehlt ihr Storage-Archiv, darf die gesicherte Objekttabelle keine Dateien enthalten. Der Zielstack muss mit passenden Anwendungsschemata bereits installiert und gestartet sein.

Vor dem Import entsteht ein privates `backups/pre_restore_*` mit dem Vorzustand. Auth-Daten einschließlich Identitäten sowie Anwendungs- und Storage-Metadaten werden gemeinsam importiert; die Migrationstabellen der Zieldienste bleiben erhalten. Storage-Dateien werden ausgetauscht statt mit alten Dateien vermischt. Auf einem frisch installierten Ziel bleibt dessen Datenbank-Rollenpasswort erhalten; die übrige gesicherte Konfiguration wird übernommen.

Bei Import-/Konfigurationsfehlern versucht das Skript den Vorzustand wiederherzustellen und liefert einen Fehlerstatus. Scheitert diese Rückkehr, bleiben die Dienste angehalten; Pfade zu Sicherung und Arbeitsdaten werden angezeigt. Scheitert erst der abschließende Dienststart, bleiben die bereits zusammengehörig wiederhergestellten Daten/Dateien erhalten und der Vorgang meldet ebenfalls einen Fehler. Private Arbeitsdaten und Sicherungen bleiben zur Diagnose erhalten und können nach verifiziertem Erfolg gezielt archiviert oder gelöscht werden.

### Reproduzierbare Initialisierung und Fehlerstatus

Supabase-Startdateien werden aus `scripts/templates/supabase/` übernommen, wenn die jeweilige Laufzeitdatei fehlt. Die Vorlagen stammen aus einem festen, zu den vorhandenen Images passenden Stand; Quellen und Hashes stehen in `SOURCES.json`. Bestehende Dateien werden erhalten. Es gibt keinen automatischen Download von Supabase `master`. Fehlende Vorlagen brechen die Installation ab.

Vor dem automatischen Schema-Import wartet der Installer auf Storage-Migrationen und ein funktionsfähiges Kong. Ein Schemafehler wird nicht mehr mit einem toleranten Import übergangen. Bei einem URL-Wechsel werden im Vollstack auch Auth und Mailvorlagen neu erstellt. Fehlende interne OCR-Schlüssel werden ergänzt; bestehende Schlüssel bleiben erhalten. Jeder Verwaltungsbefehl behält sein eigenes privates Log zusätzlich zu den bisherigen letzten Logdateien. Fehlgeschlagene Updates liefern beim Verlassen des Update-Menüs einen Fehlerstatus.

Lokale Prüfungen ohne laufenden Docker-Daemon:

```bash
python -m unittest discover -s scripts/tests -p 'test_*.py' -v
```

Die praktischen Docker-/Restore-Prüfungen sind separat erforderlich. Der neue Kandidat benötigt die erneute Abnahme mit Testdaten; lokale Simulationen allein belegen keine funktionierende Wiederherstellung.


### Ergänzungen nach der zweiten Betriebsprüfung

Der Vollstack benötigt für zuverlässige Storage-Backups GNU tar mit `--xattrs` sowie Python 3 mit Linux-xattr-Unterstützung (auf Debian/Ubuntu z. B. `apt install python3`). Backup und Restore prüfen diese Voraussetzungen und das Dateisystem vor dem Anhalten der Dienste. Neue Storage-Archive erhalten Attribute aus `user.*`. Bei alten Archiven rekonstruiert der Restore fehlende `user.supabase.content-type` und `user.supabase.cache-control` aus den wiederhergestellten Storage-Metadaten. Vorhandene Attribute werden erhalten. Fehlende Dateien oder nicht rekonstruierbare Pflichtattribute führen zu einem Fehler mit Rückfall statt zu einer erfolgreichen, aber defekten Wiederherstellung.

Der Datenimport läuft ausschließlich im lokalen Datenbankcontainer als `supabase_admin`, damit auch neuere Storage-Tabellen vollständig geleert werden können. Ein von psql bestätigter SQL-Fehler rollt die gemeinsame Transaktion zurück: Tabellen werden dann nicht noch einmal importiert; nur nichttransaktionale Sequenzwerte werden aus dem Vorzustand zurückgesetzt. Die ursprünglichen Dateien werden zurückgestellt und die Dienste wieder gestartet, der Fehlercode bleibt erhalten. Bei einem unklaren Verbindungsabbruch oder einem Fehler nach abgeschlossenem Import bleibt die vollständige Recovery erforderlich. Bei Erfolg werden private Arbeits-/Staging-Verzeichnisse entfernt; die eigentlichen Backups und Vorzustandssicherungen bleiben erhalten.

Auch eine bestehende `CREDENTIALS.txt` wird beim Start der Verwaltung bzw. des Updates auf 0600 gesetzt.

**Ein gemeinsamer Compose-Projektname:** Die Compose-Dateien verwenden `name: umzughelfer`. Neben den festen Container-/Image-Namen werden damit auch Netzwerke (z. B. `umzughelfer_default`) und benannte Volumes über Installationsordner hinweg geteilt. Ein zweiter Ordner oder `-f` allein isoliert eine Installation daher nicht. Weiterhin nur eine Installation pro Docker-Daemon betreiben; für Tests einen getrennten Daemon verwenden.


### Passwort-Reset und optionale Ollama-Nutzung

Vollstack-Neuinstallationen erlauben die App-Basisadresse und exakt `/update-password` als Auth-Weiterleitungsziele. Updates ergänzen den fehlenden Resetpfad, bestehende zusätzliche Ziele bleiben erhalten. URL-Wechsel aktualisieren die beiden App-Adressen und laden Auth/Mailvorlagen neu.

Das optionale Ollama-Profil nutzt die feste offizielle Version `0.40.16` und startet standardmäßig ohne GPU-Anforderung. Mit `OLLAMA_USE_GPU=true` in `.env` lädt die Verwaltung zusätzlich `docker-compose.ollama-gpu.yml`; dafür ist das NVIDIA Container Toolkit erforderlich. Laufende bisherige NVIDIA-Container werden erkannt und diese Wahl gespeichert. Manuelle GPU-Aufrufe müssen beide Dateien verwenden, z. B. `docker compose -f docker-compose.full.yml -f docker-compose.ollama-gpu.yml --profile ollama up -d`. Backups/Restore verwenden denselben Wrapper. Das offizielle Image enthält weiterhin GPU-Bibliotheken und ist groß; eine schlanke CPU-Distribution wird gesondert in HOME-9 bewertet.

Ollama-Startfehler werden nicht mehr als verzögerter Analytics-Start übergangen. Die Verwaltung prüft zusätzlich die API-Erreichbarkeit mit `ollama list` (GET `/api/tags`). Bei Fehlern bleibt der Teilzustand zur Diagnose erhalten, der Installer meldet einen Fehler.

Die App ruft Ollama serverseitig auf: Für den mitinstallierten Dienst ist `http://ollama:11434` die richtige Profiladresse. Für andere Dienste eine vom Server erreichbare LAN-IP/Domäne verwenden. `localhost` bezeichnet dort den aufrufenden Container. Der Menüeintrag speichert `OLLAMA_EXTERNAL_URL` als Vorschlag; wirksam wird die Einstellung wie bisher durch Übernahme im App-Profil.

### Aufbewahrung von Sicherungen

Eine vollständige Deinstallation erhält `backups/` ausdrücklich für Desaster-Recovery. Konfigurationssicherungen liegen unter `backups/config_*` (0700, Dateien 0600), nicht im Projektstamm. Sie enthalten keinen Datenbankdump und erscheinen deshalb nicht im Datenbank-Restore-Menü.

`./scripts/manage.sh maintenance backups` zeigt alte Vorzustands-/Fehlerverzeichnisse zur gezielten Bereinigung an. Es erfolgt keine automatische Löschung: Nur nach Nummernauswahl und ausdrücklicher Bestätigung wird ein Verzeichnis entfernt. Reguläre Backups, die neuesten drei Vorzustandssicherungen, jüngere Daten (unter sieben Tagen) und Restore-Staging bleiben erhalten. Fehlerdiagnose vor einer Löschung prüfen. Im Update-Menü führt Enter jetzt zurück, statt ein Update zu starten.

Bei einer Wiederherstellung bleibt die GPU-Wahl des Zielhosts erhalten; ein GPU-Backup erzwingt dadurch auf einem CPU-Ziel keine NVIDIA-Anforderung.

Bei App-only müssen die App-Basisadresse und `/update-password` zusätzlich in der URL-Konfiguration des externen Supabase-Projekts freigegeben sein; der lokale Installer verwaltet dessen Auth-Dienst nicht.


### Optionales Ollama: Start und Wiederanlauf

Die Vollstack-Installation verwendet im App-Profil `http://ollama:11434`.
`localhost` bezeichnet innerhalb der Edge Functions deren eigenen Container.
`OLLAMA_EXTERNAL_URL` in `.env` bleibt ein Vorschlag: Die Adresse anschließend
im App-Profil unter KI-Einstellungen übernehmen. Bei App-only oder einem anderen
Ollama-Host eine vom Backend erreichbare LAN-Adresse oder Domain verwenden.

Neue Installationen speichern `OLLAMA_INSTALLED=true` beziehungsweise `false`.
Bei älteren Installationen ohne Eintrag erkennen die Verwaltungsskripte einen
vorhandenen Ollama-Container anhand seiner Compose-Zugehörigkeit zum aktuellen
Installationsordner, auch wenn er gestoppt ist oder sein Start fehlgeschlagen ist.
Die Einstellung bleibt über Neustarts und fehlgeschlagene Updates erhalten.
`OLLAMA_USE_GPU=false` erlaubt die erneute Ausführung ohne NVIDIA-GPU.

Das Image-Update startet zuerst die Kerndienste und erneuert anschließend Kong.
Erst danach startet es den optionalen Ollama-Dienst separat. Ein Ollama-Fehler
liefert einen Fehlercode; die bereits gestarteten Kerndienste bleiben bestehen.
Im Installationsordner lässt sich der CPU-Dienst mit der festgelegten Imageversion
und dem richtigen Compose-Netz starten:

```sh
docker compose -f docker-compose.full.yml --profile ollama up -d --no-deps ollama
```

Für eine NVIDIA-Installation zusätzlich `-f docker-compose.ollama-gpu.yml`
vor `--profile` angeben. Kein zusätzlicher `docker run`-Container ist erforderlich.

### Manuelle Rückkehr auf ein gesichertes App-Image

Vor Paketänderungen das bisherige App-Image zusätzlich taggen und Code,
Konfiguration sowie ein vollständiges Daten-Backup zusammen aufbewahren.
Für eine Rückkehr den passenden Code und die Konfiguration wiederherstellen,
das gesicherte Image als App-Image verwenden und ohne Neubau starten.
Nach dem Neuerstellen von `auth` auch Kong erneuern, da andernfalls alte
Upstream-Adressen HTTP 502 verursachen können:

```sh
docker compose -f docker-compose.full.yml up -d --no-deps --force-recreate kong
```

Die Verwaltungsskripte berücksichtigen diese Reihenfolge. Die dokumentierte
Installation unterstützt eine Installation pro Docker-Daemon; getrennte Ordner
isolieren die explizit benannten Volumes nicht.


### Frontend-Build mit Vite

Die offiziellen Compose-Dateien bauen weiterhin `umzugshelfer-pwa/Dockerfile`
mit Node 22 LTS und liefern ausschließlich `build/` über die bisherige
Nginx-Konfiguration aus. App-only und Vollstack verwenden dieselbe Werkzeugkette.
Die Installations-/Update-/Backup-Befehle und Datenformate bleiben erhalten.
Der Node-Prozess auf dem Installationshost dient unter anderem der Schlüssel-
generierung; der Frontend-Build läuft unabhängig davon im Docker-Buildimage.
Für direkte lokale Frontend-Befehle ist Node 22.22+ oder 24.11+ erforderlich.

`npm ci`, `npm start`, `npm test -- --watchAll=false` und `npm run build` werden
im Frontend-Ordner ausgeführt. `.env`-Namen bleiben `REACT_APP_*`.
Öffentlich eingebunden werden ausschließlich Supabase-URL, öffentlicher Anon-Key,
VAPID-Public-Key, Passwort-Reset-Ziel und der bestehende Assistentenschalter.
Serverpasswörter und Service-Role-/KI-Schlüssel gehören nicht in diese Werte.
Beide Compose-Dateien reichen auch das explizite Passwort-Reset-Ziel weiter.

Manifeste, Icons, Push-Service-Worker und SPA-Routen behalten ihre bisherigen
öffentlichen Pfade. Der Service Worker erhält durch diesen Wechsel keine neue
Caching-/Offline-Logik. Installation und Updates bestehender PWAs werden bei
der Geräteabnahme separat geprüft. Vor dem ersten Vite-Update ein bisheriges
App-Image zusätzlich taggen sowie Code, Konfiguration und Daten sichern;
Image-Rollback einschließlich Kong-Neuerstellung wie oben beschrieben abnehmen.


### Browser-Cache bei App-Updates

Nginx liefert die HTML-Einstiegsseite einschließlich SPA-Fallback sowie Dateien
mit festen Namen (PWA-Manifeste, Icons, Hintergründe) mit `Cache-Control: no-cache`.
Der Browser prüft sie vor erneuter Verwendung beim Server; unveränderte Dateien
können mit ETag/Last-Modified und HTTP 304 beantwortet werden.
Gehashte Bundles unter `/static/` behalten 30 Tage Cache-Laufzeit und `immutable`.
Ein fehlender Chunk liefert HTTP 404 mit `no-store`, damit auch eine Rückkehr auf
ein vorheriges Image nicht durch einen zwischengespeicherten Fehler gestört wird.
Der Push-Service-Worker behält seine bisherige `no-store`-Regel.

`/.vite` und `/.vite/` sind öffentlich gesperrt (HTTP 404). Das interne Build-
Manifest bleibt für `npm run verify:build` verfügbar und wird von der App nicht
als öffentliches API benötigt. HTML wird mit LF-Zeilenenden erzeugt.

Nach dem Start eines Testimages lassen sich diese Regeln ohne Datenänderungen
prüfen (Adresse an den Test-Port anpassen, Node 22+):

```sh
node umzugshelfer-pwa/scripts/check-web-cache.mjs http://127.0.0.1:3000
```

Der Test gehört an die Nginx-Adresse des App-Images; Vite-Entwicklungsserver und
Vite-Preview sind dafür nicht geeignet. Bei vorgeschaltetem Proxy dessen eigene
Cache-Regeln ebenfalls berücksichtigen. Die neuen Serverheader können bereits
vor dieser Umstellung gespeicherte HTML-Antworten nicht nachträglich ändern.
Beim ersten Wechsel kann daher einmaliges normales Neuladen erforderlich sein.
Ein schon geöffneter Tab übernimmt die neue App bei einem neuen Dokumentaufruf.


### Supabase- und KI-Clients nach Paketupdates prüfen

Die Frontend-Bibliotheken Supabase JS 2.119.0 und OpenAI 7.57.0 sowie die
Entwicklungs-CLI Supabase 3.1.0 werden mit der Lockdatei installiert. Die bisherigen
Installations-/Update-Skripte verwenden weiterhin ihre Compose-Dateien und den
vorhandenen Edge-Functions-Kopierablauf. Modelle, Speicherziele, Schema und
Service-Images werden durch dieses Client-Update nicht umgestellt.

Im Frontend-Ordner prüft `npm run test:sdk` die echten Client-Bibliotheken gegen
einen temporären lokalen HTTP-Server mit generierten Antworten. Einbezogen sind
Login/Sitzungserneuerung, eine alte gespeicherte Testsitzung, Haushaltszuordnung,
Storage/RPC/Edge sowie Text-/Audio- und Fehlerantworten. Die Fixtures enthalten
keine echten Zugangsdaten; dabei erfolgen keine externen KI- oder Datenbankaufrufe.

Nach dem Neubau im isolierten Teststack zusätzlich echten Login, Erneuerung und
Abmeldung, vorhandene Sitzungen, Haushaltswechsel, Berechtigungen, Realtime,
Datei-Upload/-Abruf und die genutzten Edge Functions prüfen. Für die gemeinsame
Abnahme auch den oben beschriebenen Cache-Prüfer am echten Nginx-Testport nutzen.
Vor dem Update Image, Code, Konfiguration und Testdaten als Rückkehrmarke sichern.


### Übersetzungen und Router (HOME-7)

Die App verwendet weiterhin einen deklarativen BrowserRouter und dieselben URLs. React Router 8 benötigt für direkte lokale Befehle Node 22.22+ oder 24.11+; der Docker-Build verwendet weiterhin die vorhandene Node-22-LTS-Stufe. Kein zusätzlicher Web-/SSR-Dienst ist erforderlich. PWA-Manifeste und Service Worker bleiben unverändert.

Die Sprachwahl verwendet weiterhin `ui_locale` und die bestehenden Profilfelder. Ein PluralRules-Polyfill erhält die bisherigen älteren iOS-Ziele; leere Übersetzungstexte bleiben erhalten. Die zusätzlichen Regressionstests laufen mit dem vorhandenen Testbefehl. Beim Update und beim Image-Rollback zusammengehörige Quell-, Image- und Konfigurationsstände sichern; bei manuellem Auth-Recreate auch Kong neu erstellen.


### Darstellungs- und Exportbibliotheken (HOME-8)

Der aktive Frontend-Build liegt weiterhin unter `umzugshelfer-pwa`; beide Compose-Dateien und die vorhandenen Installations-/Verwaltungsskripte verwenden dessen Dockerfile und Lockfile. Die historischen Paketdateien und das Dockerfile direkt im Hauptverzeichnis gehören nicht zu diesem Ablauf und bleiben unverändert.

Tailwind bleibt zur Erhaltung der bisherigen Browserziele auf der aktuellen 3.x-Reihe. Für den optionalen Leistungsbericht bleibt die bestehende FID-Messung erhalten; deshalb wird die letzte kompatible web-vitals-3.x-Reihe verwendet. Es wird keine neue Telemetrie eingeschaltet.

Die aktualisierte Dateiauswahl erhält den bisherigen Ein-Datei-Ablauf: mehrere Dateien gemeinsam abweisen, keine zusätzliche Datei-Paste-Funktion. Dateiarten, Speicherziele und Zuweisung bleiben erhalten. PDF-, Kalender- und QR-Exporte werden mit generierten Testdaten geprüft. Der zusätzliche Frontend-Befehl `npm run test:ui-exports` benötigt keine echten Dokumente oder KI-Schlüssel.

Vor einem Neubau das akzeptierte Image und den zusammengehörigen Code-/Konfigurationsstand sichern. Docker-/Daten-/Image-Rückfallprüfungen werden für jede Etappe im isolierten Testsystem wiederholt; reale alte Browser und PWA-/Kamera-/Mikrofon-Geräteprüfungen bleiben gesondert erforderlich.


### Lokale Dienstimages bei Updates (HOME-24)

Die Update-Menüs **[1] App-Update**, **[4] Docker-Images** und **[5] Server-Sync** bauen vor dem Ersetzen laufender Container alle benötigten lokalen Images: die App und im Vollstack die in Compose vorhandenen Dienste `recipe-source-parser` und `document-ocr-service`. Änderungen an Dockerfile, requirements oder eingebundenen Quellen werden damit übernommen, auch wenn bereits ein Image vorhanden ist. Unveränderte Build-Schritte nutzen weiterhin den Docker-Cache; es gibt keinen pauschalen `--no-cache`-Build und keine zusätzliche Frage zum Überspringen des Rezeptparser-Builds.

Schlägt Pull, Compose-Prüfung oder Image-Build fehl, bricht der Ablauf mit Fehlercode vor der Container-Aktualisierung ab. Nach erfolgreichem Build werden die lokalen Dienste gezielt aktualisiert und bis zu 180 Sekunden auf laufenden/gesunden Zustand geprüft. Start-/Healthfehler liefern einen Fehlercode statt einer Erfolgsmeldung; bereits vorgenommene Schritte werden dabei nicht automatisch zurückgerollt. Für einen Rückfall vorherige Images und zugehörigen Code/Konfiguration sichern.

**[2] Nur App neu bauen** bleibt auf die App beschränkt. App-only baut keine OCR-/Parserimages; Server-Sync bleibt Vollstack vorbehalten. Die englische Verwaltung und der vorhandene `scripts/update.sh`-Einstieg verwenden denselben gemeinsamen Ablauf. Beim allgemeinen Image-Update werden unveränderte Container nicht mehr pauschal erzwungen neu erstellt; Kong wird weiterhin nach geänderten Upstreams aktualisiert.


Die Vollstack-Compose-Datei definiert für OCR und Rezeptparser echte HTTP-Healthchecks: `/health` muss HTTP200 und `status: ok` liefern. Sie verwenden das im Image vorhandene Python, keine zusätzliche Installation und keine KI-/Modellprüfung. Fehlversuche haben30 Sekunden Anlaufzeit; die Probe läuft alle5 Sekunden mit begrenztem Timeout. Beim erstmaligen Anwenden dieser Healthchecks werden die betroffenen Container wegen der geänderten Konfiguration einmal neu erstellt. Erst danach kann ein unveränderter Cache-Lauf ohne erneute Neuerstellung verglichen werden. Eine Neustartschleife gilt damit nicht mehr allein aufgrund eines kurzzeitig laufenden Prozesses als erfolgreiches Update.


### Server- und Edge-Aktualisierung (HOME-21 bis HOME-23)

Die geprüfte Versionengruppe aktualisiert Rezeptparser/Whisper und die Supabase-Dienste zusammen mit fest versionierten Edge-Imports. Vor dem Austausch **alle bisherigen Dienstimages**, Code, Konfiguration und vollständiges DB-/Storagebackup sichern. Anbieter-Dienste können ihre internen Schemas beim Start migrieren: Ein Rückfall kann daher zusätzlich zum alten Image auch die Wiederherstellung des passenden Datenbackups benötigen. Keine PostgreSQL-Hauptversionsmigration durchführen; die bestehende Supabase-Postgres-15-Basis bleibt erhalten.

Kong bleibt der Gateway-Dienst samt vorhandenen Routen, Hostnamen und Berechtigungen; es wird nicht auf Envoy umgestellt. Verwendet wird der vom aktuellen Supabase-Kong-Override vorgesehene3.9.3-Stand. Die Versionsgruppe der übrigen Dienste stammt aus dem aktuellen Supabase-Docker-Satz; die veröffentlichten PostgreSQL-15- und Logging-Varianten werden berücksichtigt. Vorhandene Zugangsdaten und Konfigurationswerte bleiben erhalten; zusätzliche Dienstfelder verwenden vorhandene Werte.

Für den Austausch der Serverimages das bestehende Update-Menü **[4] Docker-Images** verwenden. App-/lokale Dienstupdates[1]/[5] ersetzen keinen vollständigen Serverimage-Austausch. Menü[4] wartet nun bis zu300 Sekunden auf die konfigurierten Bereitschaftsprüfungen; Kong und Edge-Laufzeit haben dafür ebenfalls Healthchecks. Fehler liefern keinen erfolgreichen Abschluss. Bereits erfolgte Start-/Schemaänderungen werden nicht automatisch zurückgerollt.

Der Parser behält die bisherige CUDA12-Treiberfamilie; Python ist separat auf3.14 aktualisiert, da die native ONNX-Abhängigkeit noch keine3.15-Binärpakete liefert. Details und Offline-Prüfungen in services/recipe-source-parser/README.md. Für die Edge-Prüfungen siehe supabase/functions/DEPENDENCIES.md. Die vorgeschlagene Versionsgruppe darf erst nach isolierter Docker-/Daten-/Funktions-/Rückfallabnahme veröffentlicht werden; Live wird durch diese Quellenänderungen nicht aktualisiert.

GPU-Rechentyp des Rezeptparsers: `WHISPER_GPU_COMPUTE_TYPE=auto` (Standard) wählt beim GPU-Betrieb den ersten von der Karte unterstützten Typ in der Reihenfolge `float16`, `int8_float16`, `int8_float32`, `int8`. Karten der GTX-10xx-Reihe (Pascal) unterstützen kein `float16` und laufen damit automatisch mit `int8_float32` auf der GPU statt auf der CPU. Ein fest eingetragener Typ wird zuerst versucht. Unterstützt die GPU ihn nicht, meldet der Parser das als Warnung mit den unterstützten Typen und versucht danach den passenden GPU-Typ, erst dann die CPU. Bestehende Installationen mit `WHISPER_GPU_COMPUTE_TYPE=float16` in `.env` behalten diesen Wert; für GTX 10xx empfiehlt sich `auto` oder `int8_float32`. `/health?deep=1` zeigt Einstellung, gewählten Typ und die von der GPU unterstützten Typen.

Für den Rückfall der Serverversionsgruppe genügt ein App-Dump allein nicht: Auch interne Anbieter-Datenbanken (z.B. _supabase für Pooler/Analytics) können migriert werden. Vor dieser isolierten Versionsabnahme einen konsistenten Snapshot bzw. eine Kaltkopie des gesamten PostgreSQL-Datenvolumens und des Storage anlegen oder ausdrücklich alle Datenbanken sichern. Alte Images nur zusammen mit deren passenden Daten-/Konfigurationsständen wiederherstellen. Das vorhandene normale App-Backupformat wird nicht stillschweigend umgedeutet.

PyAV bleibt für den Rezeptparser auf18.1.0: Mit19 schlägt der tatsächliche Whisper-Audiodecoder wegen eines entfernten Parameters fehl. Der kompatible Stand ist mit echter CPU-Inferenz und erzeugter Audiodatei geprüft. Die CUDA12-Treiberfamilie und die unterstützte FFmpeg-Distributionsreihe bleiben erhalten; daraus folgt keine Abnahme neuer GPU-Hardware oder einer neueren CUDA-/FFmpeg-Hauptversion.

### Pooler-Zugang nach Wiederherstellung

Ein normales App-Backup stellt die Datenbank `postgres` wieder her, nicht die interne Datenbank `_supabase`. Der Restore behält deshalb den `VAULT_ENC_KEY` der Zielinstallation: Er gehört zu den dort verbleibenden verschlüsselten Pooler-Zugangsdaten. Enthält das Backup einen solchen Schlüssel, aber die Zielinstallation keinen, bricht der Restore vor dem Stoppen der Dienste ab. Zuerst den passenden Schlüssel der Zielinstallation wiederherstellen; nicht versuchsweise einen neuen erzeugen.

Der Vollstack startet vor der vorhandenen Pooler-Konfiguration eine kleine Synchronisierung aus `scripts/lib/pooler-manager.exs`. Für den konfigurierten `POOLER_TENANT_ID` wird ausschließlich das Manager-Passwort des Standardbenutzers `pgbouncer` mit dem vorhandenen `POSTGRES_PASSWORD` abgeglichen. Bei abweichender oder mit dem aktuellen Schlüssel nicht mehr lesbarer Verschlüsselung wird nur dieses Passwort neu verschlüsselt. Bereits passende Zugangsdaten werden nicht geschrieben. Tenant-IDs, andere Benutzer, Aliase, Poolgrößen, Modi und individuelle Bootstrapdateien bleiben erhalten. Ein eigener Manager-Benutzer wird nicht automatisch geändert.

Dadurch kann auch ein bereits durch einen früheren App-Restore betroffener Standard-Pooler nach Anwendung der korrigierten Compose-Datei beim nächsten Start repariert werden. Es gibt keinen Tenant-Reset und keine neue Passwortvergabe. Die neue Bibliotheksdatei muss zusammen mit der Compose-Datei übertragen werden. Start-/Verschlüsselungs-/Schreibfehler melden einen Fehler statt einer erfolgreichen Synchronisierung; parallele Änderungen werden nicht überschrieben.

Vor dieser Reparatur den passenden vollständigen PostgreSQL-/Storage-Kaltstand samt Konfiguration sichern, da sie bei Bedarf eine Zeile in `_supabase` verändert. Beim Rückfall gehören Schlüssel und interne Datenbank wieder zusammen. Für weitere selbst angelegte Tenants oder eigene Manager ist eine gesonderte Prüfung notwendig. Die isolierte Abnahme muss beide Pooler-Ports, wiederholte Starts ohne weitere Änderung sowie Neuinstallation und App-Restore nach Neuinstallation nachweisen. Live wird durch diese Quellenänderungen nicht aktualisiert.

### Optionale Performance-Indizes bei gemischten Tabellen-Eigentümern (HOME-28)

Der Update-Hotfix `scripts/hotfix_2026_07_29_fast_mutations.sql` prüft vorhandene
Indizes vor einer Erstellung. Bereits passende Indizes bleiben unverändert,
auch wenn ihre Tabellen `supabase_admin` gehören und der Update-Schritt als
`postgres` läuft. Fehlt ein optionaler Index und reicht die Berechtigung nicht,
meldet SQL `UMZUG_INDEX_PERMISSION_SKIPPED`; der Sync darf weiterlaufen. Ein
Namenskonflikt oder unbrauchbarer Index ergibt `UMZUG_INDEX_CONFLICT` und wird
nicht automatisch repariert. Die Menümeldung bestätigt die Prüfung, nicht die
Existenz aller Indizes. Andere SQL-/Verbindungsfehler bleiben echte Fehler.

Bei einer solchen Warnung zunächst Besitzer und Indexdefinition prüfen. Der
Hotfix darf nach Backup/Test gezielt als Eigentümer bzw. im lokalen Vollstack
als `supabase_admin` ausgeführt werden; die automatische Update-Ausführung
eskaliert keine Rechte. Keine `ALTER OWNER`-/`GRANT`-/RLS-Änderungen erforderlich.
