#!/usr/bin/env bash
# ============================================================
# Umzughelfer — Installer & Wartungsskript
#
# Modi:
#   1) Neuinstallation — Vollstack (Supabase + App via Docker)
#   2) Neuinstallation — App only (bestehende Supabase nutzen)
#   3) App neu bauen   — nach Updates oder .env-Änderungen
#   4) Ollama konfigurieren — CORS, URL, systemd-Einrichtung
#
# Voraussetzungen: docker, docker compose, node (>=16), openssl
# Verwendung: chmod +x scripts/install.sh && ./scripts/install.sh
# ============================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

info()    { echo -e "${CYAN}▶ $1${NC}"; }
warn()    { echo -e "${YELLOW}⚠  $1${NC}"; }
err()     { echo -e "${RED}✗  FEHLER: $1${NC}"; exit 1; }
success() { echo -e "${GREEN}✅ $1${NC}"; }
header()  { echo -e "\n${BOLD}${GREEN}$1${NC}"; echo "$(printf '=%.0s' {1..60})"; }

cd "$PROJECT_DIR"

# ============================================================
# Hauptmenü
# ============================================================
clear
echo ""
echo -e "${BOLD}${GREEN}============================================================${NC}"
echo -e "${BOLD}${GREEN}  Umzughelfer — Installer & Wartung${NC}"
echo -e "${BOLD}${GREEN}============================================================${NC}"
echo ""

# Bestehende Installation erkennen
EXISTING_ENV=false
[[ -f ".env" ]] && EXISTING_ENV=true

if [[ "$EXISTING_ENV" == "true" ]]; then
  echo -e "  ${YELLOW}⚠  Bestehende Installation erkannt (.env vorhanden)${NC}"
  echo ""
fi

echo "  Was möchtest du tun?"
echo ""
echo "  [1] Neuinstallation — Vollstack (Supabase + App via Docker)"
echo "  [2] Neuinstallation — App only (bestehende Supabase nutzen)"
echo "  [3] App neu bauen   (nach Updates oder .env-Änderungen)"
echo "  [4] Ollama konfigurieren / CORS einrichten"
echo "  [5] Deinstallieren  (alle Komponenten entfernen)"
echo "  [6] Beenden"
echo ""
read -p "  → Wahl [1]: " MAIN_CHOICE
[[ -z "$MAIN_CHOICE" ]] && MAIN_CHOICE=1

case "$MAIN_CHOICE" in
  1) MODE="vollstack" ;;
  2) MODE="apponly" ;;
  3) MODE="rebuild" ;;
  4) MODE="ollama" ;;
  5) sed -i 's/\r//' "$SCRIPT_DIR/uninstall.sh" 2>/dev/null || true
     bash "$SCRIPT_DIR/uninstall.sh"; exit 0 ;;
  6) echo "  Auf Wiedersehen."; exit 0 ;;
  *) err "Ungültige Auswahl." ;;
esac

# ============================================================
# MODUS: App neu bauen
# ============================================================
if [[ "$MODE" == "rebuild" ]]; then
  header "App neu bauen"

  [[ ! -f ".env" ]] && err ".env nicht gefunden. Bitte zuerst eine Neuinstallation durchführen."

  COMPOSE_FILE="docker-compose.full.yml"
  [[ ! -f "$COMPOSE_FILE" ]] && COMPOSE_FILE="docker-compose.yml"

  echo ""
  echo "  Compose-Datei: ${COMPOSE_FILE}"
  echo ""
  read -p "  App-Container neu bauen und starten? [j/N]: " CONFIRM
  [[ "${CONFIRM,,}" != "j" && "${CONFIRM,,}" != "y" ]] && { echo "  Abgebrochen."; exit 0; }

  info "Baue App-Container neu..."
  docker compose -f "$COMPOSE_FILE" build umzugsplaner-app

  info "Starte Container neu..."
  docker compose -f "$COMPOSE_FILE" up -d --force-recreate umzugsplaner-app

  success "App erfolgreich neu gebaut und gestartet."
  exit 0
fi

# ============================================================
# MODUS: Ollama konfigurieren
# ============================================================
if [[ "$MODE" == "ollama" ]]; then
  header "Ollama konfigurieren"

  echo ""
  echo "  Wie ist dein Ollama-Server installiert?"
  echo ""
  echo "  [1] Direkt auf Linux (systemd-Dienst)"
  echo "  [2] Als Docker-Container (dieser oder anderer Server)"
  echo "  [3] Externer Server (bereits konfiguriert, nur URL aktualisieren)"
  echo ""
  read -p "  → Wahl [1]: " OLLAMA_SETUP
  [[ -z "$OLLAMA_SETUP" ]] && OLLAMA_SETUP=1

  echo ""

  if [[ "$OLLAMA_SETUP" == "1" ]]; then
    # --- Systemd-Dienst ---
    header "Ollama — Linux systemd"

    read -p "  App-URL (für CORS, z.B. https://umzug.meine-domain.de): " OLLAMA_APP_URL
    [[ -z "$OLLAMA_APP_URL" ]] && OLLAMA_APP_URL="*"

    echo ""
    info "Konfiguriere OLLAMA_ORIGINS im systemd-Dienst..."

    if command -v systemctl >/dev/null 2>&1 && systemctl list-units --type=service 2>/dev/null | grep -q ollama; then
      # Automatisch über systemd konfigurieren
      OVERRIDE_DIR="/etc/systemd/system/ollama.service.d"
      sudo mkdir -p "$OVERRIDE_DIR"
      sudo tee "$OVERRIDE_DIR/cors.conf" > /dev/null << SYSD
[Service]
Environment="OLLAMA_ORIGINS=${OLLAMA_APP_URL}"
SYSD
      sudo systemctl daemon-reload
      sudo systemctl restart ollama
      success "OLLAMA_ORIGINS=${OLLAMA_APP_URL} gesetzt und Dienst neu gestartet."
    else
      warn "Systemd-Dienst 'ollama' nicht gefunden. Manuelle Einrichtung erforderlich:"
      echo ""
      echo "  sudo systemctl edit ollama"
      echo ""
      echo "  Folgenden Inhalt einfügen:"
      echo "  ─────────────────────────────────────"
      echo "  [Service]"
      echo "  Environment=\"OLLAMA_ORIGINS=${OLLAMA_APP_URL}\""
      echo "  ─────────────────────────────────────"
      echo ""
      echo "  Dann:"
      echo "  sudo systemctl daemon-reload"
      echo "  sudo systemctl restart ollama"
    fi

    echo ""
    info "Nginx-Konfiguration für Ollama (CORS-Proxy):"
    echo ""
    OLLAMA_DOMAIN="${OLLAMA_APP_URL#https://}"
    OLLAMA_DOMAIN="${OLLAMA_DOMAIN#http://}"
    echo "  Falls Ollama unter einer eigenen (Sub-)Domain erreichbar sein soll,"
    echo "  füge folgendes in deinen Nginx-Serverblock für diese Domain ein:"
    echo ""
    echo "  ─────────────────────────────────────"
    echo "  location / {"
    echo "      proxy_pass http://127.0.0.1:11434;"
    echo "      proxy_http_version 1.1;"
    echo "      proxy_set_header Host \$host;"
    echo "      proxy_set_header X-Real-IP \$remote_addr;"
    echo "      proxy_read_timeout 300s;"
    echo ""
    echo "      add_header 'Access-Control-Allow-Origin' '${OLLAMA_APP_URL}' always;"
    echo "      add_header 'Access-Control-Allow-Methods' 'GET, POST, OPTIONS' always;"
    echo "      add_header 'Access-Control-Allow-Headers' 'Content-Type, Authorization' always;"
    echo ""
    echo "      if (\$request_method = OPTIONS) {"
    echo "          return 204;"
    echo "      }"
    echo "  }"
    echo "  ─────────────────────────────────────"
    echo ""
    echo "  Nach Änderungen: nginx -t && systemctl reload nginx"

    OLLAMA_EXTERNAL_URL=""
    read -p "  Ollama-URL in .env aktualisieren? (z.B. https://gpt.meine-domain.de) [Enter = überspringen]: " OLLAMA_EXTERNAL_URL

  elif [[ "$OLLAMA_SETUP" == "2" ]]; then
    # --- Docker ---
    header "Ollama — Docker"

    read -p "  App-URL (für CORS, z.B. https://umzug.meine-domain.de): " OLLAMA_APP_URL

    echo ""
    if docker ps --format '{{.Names}}' 2>/dev/null | grep -q "^ollama$"; then
      info "Laufender 'ollama' Container gefunden."
      echo ""
      echo "  OLLAMA_ORIGINS setzen:"
      echo "  In deiner .env: OLLAMA_ORIGINS=${OLLAMA_APP_URL}"
      echo "  Dann: docker compose -f docker-compose.full.yml up -d --force-recreate ollama"
    else
      warn "Kein laufender 'ollama' Container gefunden."
      echo ""
      echo "  Starten mit CORS-Unterstützung:"
      echo "  docker run -d --name ollama \\"
      echo "    -p 11434:11434 \\"
      echo "    -e OLLAMA_ORIGINS=\"${OLLAMA_APP_URL}\" \\"
      echo "    -v ollama-data:/root/.ollama \\"
      echo "    ollama/ollama"
    fi

    echo ""
    read -p "  Ollama-Port [11434]: " OLLAMA_PORT
    [[ -z "$OLLAMA_PORT" ]] && OLLAMA_PORT=11434
    OLLAMA_EXTERNAL_URL="http://localhost:${OLLAMA_PORT}"
    read -p "  Ollama-URL in .env aktualisieren mit '${OLLAMA_EXTERNAL_URL}'? [j/N]: " CONFIRM_URL
    [[ "${CONFIRM_URL,,}" != "j" && "${CONFIRM_URL,,}" != "y" ]] && OLLAMA_EXTERNAL_URL=""

  else
    # --- Extern ---
    header "Ollama — Externer Server"
    read -p "  Ollama Basis-URL (z.B. https://gpt.meine-domain.de): " OLLAMA_EXTERNAL_URL
    [[ -z "$OLLAMA_EXTERNAL_URL" ]] && { warn "Keine URL angegeben."; exit 0; }

    echo ""
    echo -e "  ${YELLOW}Wichtig: Dein externer Ollama-Server muss CORS-Header zurückgeben.${NC}"
    echo "  Stelle sicher dass OLLAMA_ORIGINS auf dem externen Server gesetzt ist."
  fi

  # .env aktualisieren falls vorhanden und URL gesetzt
  if [[ -n "$OLLAMA_EXTERNAL_URL" && -f ".env" ]]; then
    if grep -q "^OLLAMA_EXTERNAL_URL=" .env; then
      sed -i "s|^OLLAMA_EXTERNAL_URL=.*|OLLAMA_EXTERNAL_URL=${OLLAMA_EXTERNAL_URL}|" .env
    else
      echo "OLLAMA_EXTERNAL_URL=${OLLAMA_EXTERNAL_URL}" >> .env
    fi
    success ".env mit Ollama-URL aktualisiert: ${OLLAMA_EXTERNAL_URL}"
    echo ""
    echo "  In der App: Profil → KI-Einstellungen → Ollama → Basis-URL eintragen:"
    echo "  ${OLLAMA_EXTERNAL_URL}"
  fi

  echo ""
  success "Ollama-Konfiguration abgeschlossen."
  exit 0
fi

# ============================================================
# MODUS: Neuinstallation (vollstack oder apponly)
# ============================================================

# ---- Voraussetzungen prüfen ----
header "Schritt 1: Voraussetzungen prüfen"

command -v docker >/dev/null 2>&1 || err "Docker ist nicht installiert.\n  → https://docs.docker.com/get-docker/"
docker compose version >/dev/null 2>&1 || err "Docker Compose Plugin fehlt.\n  → Docker aktualisieren oder Plugin installieren."
command -v node >/dev/null 2>&1 || err "Node.js ist nicht installiert.\n  → https://nodejs.org/"
command -v openssl >/dev/null 2>&1 || err "openssl ist nicht installiert.\n  → sudo apt install openssl"

NODE_VERSION=$(node -e "console.log(process.version.slice(1).split('.')[0])")
[[ "$NODE_VERSION" -lt 16 ]] && err "Node.js Version ${NODE_VERSION} zu alt. Mindestens Version 16 erforderlich."

success "Alle Voraussetzungen erfüllt."

# ---- Konfiguration ----
header "Schritt 2: Konfiguration"

echo "Bitte gib folgende Informationen ein."
echo "(Enter drücken für den angezeigten Standardwert)"
echo ""

while true; do
  read -p "  App-URL (z.B. https://umzug.meine-domain.de): " APP_URL
  [[ -n "$APP_URL" ]] && break
  echo "  → App-URL ist erforderlich."
done

while true; do
  read -p "  Deine E-Mail-Adresse (für Push-Notifications): " ADMIN_EMAIL
  [[ -n "$ADMIN_EMAIL" ]] && break
  echo "  → E-Mail ist erforderlich."
done

read -p "  App-Port [3000]: " APP_PORT
[[ -z "$APP_PORT" ]] && APP_PORT=3000

if [[ "$MODE" == "vollstack" ]]; then
  read -p "  Supabase-URL [Standard: ${APP_URL}]: " SUPABASE_URL
  [[ -z "$SUPABASE_URL" ]] && SUPABASE_URL="$APP_URL"

  while true; do
    read -s -p "  Supabase Studio Passwort (mind. 8 Zeichen): " STUDIO_PASSWORD
    echo ""
    [[ ${#STUDIO_PASSWORD} -ge 8 ]] && break
    echo "  → Passwort muss mindestens 8 Zeichen lang sein."
  done

else
  echo ""
  info "Zugangsdaten der bestehenden Supabase-Instanz eingeben."
  info "Zu finden unter: Supabase Dashboard → Project Settings → API"
  echo ""

  while true; do
    read -p "  Supabase URL (z.B. https://supa.meine-domain.de): " SUPABASE_URL
    [[ -n "$SUPABASE_URL" ]] && break
    echo "  → Supabase URL ist erforderlich."
  done

  while true; do
    read -p "  Supabase Anon Key: " EXT_ANON_KEY
    [[ -n "$EXT_ANON_KEY" ]] && break
    echo "  → Anon Key ist erforderlich."
  done

  while true; do
    read -s -p "  Supabase Service Role Key (GEHEIM): " EXT_SERVICE_ROLE_KEY
    echo ""
    [[ -n "$EXT_SERVICE_ROLE_KEY" ]] && break
    echo "  → Service Role Key ist erforderlich."
  done
fi

# ---- Ollama ----
echo ""
echo "  KI-Assistent — Ollama:"
echo "  [1] Ollama via Docker mitinstallieren"
echo "  [2] Externer / bereits laufender Ollama-Server"
echo "  [3] Kein Ollama (nur OpenAI oder kein KI-Assistent)"
read -p "  → Wahl [3]: " OLLAMA_CHOICE
[[ -z "$OLLAMA_CHOICE" ]] && OLLAMA_CHOICE=3

INSTALL_OLLAMA=false
OLLAMA_PORT=11434
OLLAMA_EXTERNAL_URL=""

if [[ "$OLLAMA_CHOICE" == "1" ]]; then
  INSTALL_OLLAMA=true
  read -p "  Ollama Port [11434]: " OLLAMA_PORT
  [[ -z "$OLLAMA_PORT" ]] && OLLAMA_PORT=11434
  info "Ollama wird via Docker-Profil 'ollama' mitgestartet."
  info "Modell nach Installation laden: docker exec ollama ollama pull llama3.2"
elif [[ "$OLLAMA_CHOICE" == "2" ]]; then
  read -p "  Basis-URL deines Ollama-Servers (z.B. https://gpt.meine-domain.de): " OLLAMA_EXTERNAL_URL
  if [[ -z "$OLLAMA_EXTERNAL_URL" ]]; then
    warn "Keine URL angegeben. Ollama wird nicht konfiguriert."
  else
    echo ""
    warn "Stelle sicher dass CORS auf dem Ollama-Server erlaubt ist."
    echo "  → Für Linux systemd: sudo systemctl edit ollama"
    echo "    [Service]"
    echo "    Environment=\"OLLAMA_ORIGINS=${APP_URL}\""
    echo "  → Dann: sudo systemctl daemon-reload && sudo systemctl restart ollama"
    echo "  → Nachträgliche Einrichtung: ./scripts/install.sh → Option [4]"
  fi
fi

echo ""
success "Konfiguration abgeschlossen."

# ---- Schlüssel generieren ----
header "Schritt 3: Sicherheitsschlüssel generieren"

info "Generiere kryptografische Schlüssel..."
KEYS_JSON=$(node scripts/generate-keys.js) || err "Schlüsselgenerierung fehlgeschlagen. Ist Node.js korrekt installiert?"

extract_key() {
  echo "$KEYS_JSON" | node -e "
    let d = '';
    process.stdin.resume();
    process.stdin.on('data', c => d += c);
    process.stdin.on('end', () => console.log(JSON.parse(d)['$1']));
  "
}

VAPID_PUBLIC_KEY=$(extract_key VAPID_PUBLIC_KEY)
VAPID_PRIVATE_KEY=$(extract_key VAPID_PRIVATE_KEY)

if [[ "$MODE" == "vollstack" ]]; then
  POSTGRES_PASSWORD=$(extract_key POSTGRES_PASSWORD)
  JWT_SECRET=$(extract_key JWT_SECRET)
  SECRET_KEY_BASE=$(extract_key SECRET_KEY_BASE)
  VAULT_ENC_KEY=$(extract_key VAULT_ENC_KEY)
  PG_META_CRYPTO_KEY=$(extract_key PG_META_CRYPTO_KEY)
  LOGFLARE_PUBLIC=$(extract_key LOGFLARE_PUBLIC_ACCESS_TOKEN)
  LOGFLARE_PRIVATE=$(extract_key LOGFLARE_PRIVATE_ACCESS_TOKEN)
  S3_KEY_ID=$(extract_key S3_PROTOCOL_ACCESS_KEY_ID)
  S3_KEY_SECRET=$(extract_key S3_PROTOCOL_ACCESS_KEY_SECRET)
  ANON_KEY=$(extract_key ANON_KEY)
  SERVICE_ROLE_KEY=$(extract_key SERVICE_ROLE_KEY)
else
  ANON_KEY="$EXT_ANON_KEY"
  SERVICE_ROLE_KEY="$EXT_SERVICE_ROLE_KEY"
fi

success "Schlüssel generiert."

# ---- Supabase DB-Init-Dateien (nur Vollstack) ----
if [[ "$MODE" == "vollstack" ]]; then
  header "Schritt 4: Supabase-Initialisierungsdateien"

  SUPABASE_RAW="https://raw.githubusercontent.com/supabase/supabase/master/docker"
  SUPABASE_FILES=(
    "volumes/db/realtime.sql"
    "volumes/db/webhooks.sql"
    "volumes/db/roles.sql"
    "volumes/db/jwt.sql"
    "volumes/db/_supabase.sql"
    "volumes/db/logs.sql"
    "volumes/db/pooler.sql"
    "volumes/logs/vector.yml"
    "volumes/pooler/pooler.exs"
    "volumes/api/kong.yml"
  )

  mkdir -p volumes/db volumes/logs volumes/pooler volumes/storage volumes/functions/main \
           volumes/functions/send-push volumes/functions/check-reminders \
           volumes/functions/delete-account \
           volumes/snippets volumes/db/data volumes/api

  ALL_DOWNLOADED=true
  for file in "${SUPABASE_FILES[@]}"; do
    if [[ ! -f "$file" ]]; then
      info "Lade ${file}..."
      if curl -fsSL "${SUPABASE_RAW}/${file}" -o "${file}" 2>/dev/null; then
        echo "    ✓ ${file}"
      else
        warn "Konnte ${file} nicht herunterladen."
        ALL_DOWNLOADED=false
      fi
    else
      echo "    ✓ ${file} (bereits vorhanden)"
    fi
  done

  if [[ -f "volumes/db/jwt.sql" ]]; then
    sed -i "s/your-super-secret-jwt-token-with-at-least-32-characters-long/${JWT_SECRET}/g" volumes/db/jwt.sql 2>/dev/null || true
  fi

  if [[ ! -f "volumes/functions/main/index.ts" ]]; then
    cat > volumes/functions/main/index.ts << 'TSEOF'
Deno.serve(async (_req: Request) => {
  return new Response(
    JSON.stringify({ message: "Supabase Edge Functions running" }),
    { headers: { "Content-Type": "application/json" } }
  )
})
TSEOF
    echo "    ✓ volumes/functions/main/index.ts"
  fi

  for fn in send-push check-reminders delete-account; do
    if [[ -f "supabase/functions/${fn}/index.ts" ]]; then
      cp "supabase/functions/${fn}/index.ts" "volumes/functions/${fn}/index.ts"
      echo "    ✓ volumes/functions/${fn}/index.ts"
    fi
  done

  [[ "$ALL_DOWNLOADED" == "true" ]] && success "Initialisierungsdateien bereit." || warn "Einige Dateien konnten nicht heruntergeladen werden."
fi

# ---- .env schreiben ----
header "Schritt 5: Konfigurationsdatei erstellen"

PASSWORD_RESET_URL="${APP_URL}/update-password"
INSTALL_DATE=$(date "+%Y-%m-%d %H:%M:%S")

info "Schreibe .env..."

if [[ "$MODE" == "vollstack" ]]; then
  cat > .env << EOF
# ============================================================
# Umzughelfer + Supabase — Vollstack
# Automatisch generiert von install.sh am ${INSTALL_DATE}
# ============================================================

# App
APP_PORT=${APP_PORT}
SITE_URL=${APP_URL}
API_EXTERNAL_URL=${SUPABASE_URL}
SUPABASE_PUBLIC_URL=${SUPABASE_URL}
GENERATE_SOURCEMAP=false

# Supabase API-Keys
ANON_KEY=${ANON_KEY}
SERVICE_ROLE_KEY=${SERVICE_ROLE_KEY}

# React-App Build-Variablen
REACT_APP_SUPABASE_URL=${SUPABASE_URL}
REACT_APP_SUPABASE_ANON_KEY=${ANON_KEY}
REACT_APP_PASSWORD_RESET_REDIRECT_URL=${PASSWORD_RESET_URL}
REACT_APP_VAPID_PUBLIC_KEY=${VAPID_PUBLIC_KEY}

# Datenbank
POSTGRES_HOST=db
POSTGRES_PORT=5432
POSTGRES_DB=postgres
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}

# JWT
JWT_SECRET=${JWT_SECRET}
JWT_EXPIRY=3600

# Sicherheitsschlüssel
SECRET_KEY_BASE=${SECRET_KEY_BASE}
VAULT_ENC_KEY=${VAULT_ENC_KEY}
PG_META_CRYPTO_KEY=${PG_META_CRYPTO_KEY}

# Studio
DASHBOARD_USERNAME=supabase
DASHBOARD_PASSWORD=${STUDIO_PASSWORD}
STUDIO_DEFAULT_ORGANIZATION=Umzughelfer
STUDIO_DEFAULT_PROJECT=Umzughelfer

# Kong Ports
KONG_HTTP_PORT=8000
KONG_HTTPS_PORT=8443

# Analytics
LOGFLARE_PUBLIC_ACCESS_TOKEN=${LOGFLARE_PUBLIC}
LOGFLARE_PRIVATE_ACCESS_TOKEN=${LOGFLARE_PRIVATE}

# Storage
GLOBAL_S3_BUCKET=local
REGION=local
STORAGE_TENANT_ID=local
S3_PROTOCOL_ACCESS_KEY_ID=${S3_KEY_ID}
S3_PROTOCOL_ACCESS_KEY_SECRET=${S3_KEY_SECRET}

# Connection Pooler
POOLER_TENANT_ID=umzughelfer
POOLER_DEFAULT_POOL_SIZE=20
POOLER_MAX_CLIENT_CONN=100
POOLER_DB_POOL_SIZE=5
POOLER_PROXY_PORT_TRANSACTION=6543

# Auth
DISABLE_SIGNUP=false
ENABLE_EMAIL_SIGNUP=true
ENABLE_EMAIL_AUTOCONFIRM=false
ENABLE_PHONE_SIGNUP=false
ENABLE_PHONE_AUTOCONFIRM=false
ENABLE_ANONYMOUS_USERS=false
ADDITIONAL_REDIRECT_URLS=${APP_URL}
MAILER_URLPATHS_INVITE=/auth/v1/verify
MAILER_URLPATHS_CONFIRMATION=/auth/v1/verify
MAILER_URLPATHS_RECOVERY=/auth/v1/verify
MAILER_URLPATHS_EMAIL_CHANGE=/auth/v1/verify

# SMTP (optional - für E-Mail-Bestätigungen konfigurieren)
SMTP_ADMIN_EMAIL=${ADMIN_EMAIL}
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
SMTP_SENDER_NAME=Umzughelfer

# VAPID (Push-Notifications)
VAPID_SUBJECT=mailto:${ADMIN_EMAIL}
VAPID_PUBLIC_KEY=${VAPID_PUBLIC_KEY}
VAPID_PRIVATE_KEY=${VAPID_PRIVATE_KEY}

# Ollama (optional)
OLLAMA_PORT=${OLLAMA_PORT}
OLLAMA_EXTERNAL_URL=${OLLAMA_EXTERNAL_URL}
OLLAMA_ORIGINS=${APP_URL}

# Edge Functions
FUNCTIONS_VERIFY_JWT=true

# PostgREST
PGRST_DB_SCHEMAS=public,storage,graphql_public
PGRST_DB_MAX_ROWS=1000
PGRST_DB_EXTRA_SEARCH_PATH=public,extensions

# Sonstige
IMGPROXY_ENABLE_WEBP_DETECTION=true
DOCKER_SOCKET_LOCATION=/var/run/docker.sock
EOF

else
  cat > .env << EOF
# ============================================================
# Umzughelfer App — Bestehende Supabase-Instanz
# Automatisch generiert von install.sh am ${INSTALL_DATE}
# ============================================================

# App
APP_PORT=${APP_PORT}
GENERATE_SOURCEMAP=false

# React-App Build-Variablen
REACT_APP_SUPABASE_URL=${SUPABASE_URL}
REACT_APP_SUPABASE_ANON_KEY=${ANON_KEY}
REACT_APP_PASSWORD_RESET_REDIRECT_URL=${PASSWORD_RESET_URL}
REACT_APP_VAPID_PUBLIC_KEY=${VAPID_PUBLIC_KEY}

# Ollama (optional — Basis-URL ohne Pfad, z.B. https://gpt.meine-domain.de)
OLLAMA_EXTERNAL_URL=${OLLAMA_EXTERNAL_URL}
EOF
fi

success ".env geschrieben."

# ---- Docker Build und Start ----
header "Schritt 6: Docker Container starten"

COMPOSE_FILE="docker-compose.full.yml"
[[ "$MODE" == "apponly" ]] && COMPOSE_FILE="docker-compose.yml"

info "Baue React-App (kann einige Minuten dauern)..."
docker compose -f "$COMPOSE_FILE" build umzugsplaner-app

info "Starte Container..."
if [[ "$INSTALL_OLLAMA" == "true" ]]; then
  docker compose -f "$COMPOSE_FILE" --profile ollama up -d
else
  docker compose -f "$COMPOSE_FILE" up -d
fi

if [[ "$MODE" == "vollstack" ]]; then
  info "Warte auf Datenbankbereitschaft (bis zu 2 Minuten)..."
  RETRIES=24
  until docker exec supabase-db pg_isready -U postgres -h localhost >/dev/null 2>&1 || [[ $RETRIES -eq 0 ]]; do
    echo -n "."
    sleep 5
    RETRIES=$((RETRIES - 1))
  done
  echo ""
  [[ $RETRIES -eq 0 ]] && warn "Datenbank antwortet noch nicht. Bitte Logs prüfen falls Probleme auftreten."
fi

# ---- CREDENTIALS.txt ----
info "Schreibe CREDENTIALS.txt..."

if [[ "$MODE" == "vollstack" ]]; then
  cat > CREDENTIALS.txt << CREDS
============================================================
  Umzughelfer — Vollstack-Installation
  Erstellt: ${INSTALL_DATE}
============================================================

APP
  URL:        ${APP_URL}
  Port:       ${APP_PORT}

SUPABASE STUDIO (Admin-Oberfläche)
  URL:        http://localhost:8000
  Benutzer:   supabase
  Passwort:   ${STUDIO_PASSWORD}

SUPABASE DATENBANK
  Host:       localhost
  Port:       5432
  Datenbank:  postgres
  Benutzer:   postgres
  Passwort:   ${POSTGRES_PASSWORD}

SUPABASE API
  URL:              ${SUPABASE_URL}
  Anon Key:         ${ANON_KEY}

  Service Role Key (GEHEIM — niemals im Frontend verwenden!):
  ${SERVICE_ROLE_KEY}

JWT SECRET (GEHEIM)
  ${JWT_SECRET}

PUSH NOTIFICATIONS (VAPID)
  Public Key:   ${VAPID_PUBLIC_KEY}
  Private Key:  ${VAPID_PRIVATE_KEY}

============================================================
  NÄCHSTE SCHRITTE
============================================================

1. Datenbank einrichten:
   a) Supabase Studio öffnen: http://localhost:8000
   b) Mit "supabase" / "${STUDIO_PASSWORD}" anmelden
   c) SQL Editor → Neue Abfrage
   d) Inhalt von database_setup_complete.sql einfügen + ausführen

2. App aufrufen: ${APP_URL}

3. Ersten Benutzer registrieren und loslegen!

4. Optional — SMTP einrichten (.env → SMTP_* Variablen):
   docker compose -f docker-compose.full.yml restart supabase-auth

5. Optional — Push-Notifications testen:
   Profil → Push-Benachrichtigungen → Aktivieren

6. Optional — Ollama KI-Assistent:
$(if [[ "$INSTALL_OLLAMA" == "true" ]]; then
  echo "   Modell laden: docker exec ollama ollama pull llama3.2"
  echo "   In der App: Profil → KI-Einstellungen → Ollama → Basis-URL: http://localhost:${OLLAMA_PORT}"
elif [[ -n "$OLLAMA_EXTERNAL_URL" ]]; then
  echo "   Externer Server: ${OLLAMA_EXTERNAL_URL}"
  echo "   In der App: Profil → KI-Einstellungen → Ollama → Basis-URL eintragen"
  echo "   Wichtig: CORS auf dem Ollama-Server aktivieren!"
  echo "   Nachträgliche Einrichtung: ./scripts/install.sh → Option [4]"
else
  echo "   Nachträgliche Einrichtung jederzeit möglich:"
  echo "   ./scripts/install.sh → Option [4]"
fi)

============================================================
  SICHERHEITSHINWEIS
  Diese Datei enthält sensitive Zugangsdaten.
  Niemals in ein Git-Repository committen!
============================================================
CREDS

else
  cat > CREDENTIALS.txt << CREDS
============================================================
  Umzughelfer — App-Installation (externe Supabase)
  Erstellt: ${INSTALL_DATE}
============================================================

APP
  URL:        ${APP_URL}
  Port:       ${APP_PORT}

SUPABASE (extern)
  URL:        ${SUPABASE_URL}
  Anon Key:   ${ANON_KEY}

PUSH NOTIFICATIONS (VAPID)
  Public Key:   ${VAPID_PUBLIC_KEY}
  Private Key:  ${VAPID_PRIVATE_KEY}

  WICHTIG: VAPID-Secrets müssen in deiner Supabase-Instanz
  als Umgebungsvariablen für den Edge-Functions-Container
  eingetragen werden (siehe README.md → Push-Notifications).

  VAPID_SUBJECT=mailto:${ADMIN_EMAIL}
  VAPID_PUBLIC_KEY=${VAPID_PUBLIC_KEY}
  VAPID_PRIVATE_KEY=${VAPID_PRIVATE_KEY}

============================================================
  NÄCHSTE SCHRITTE
============================================================

1. Datenbank einrichten (in deiner Supabase-Instanz):
   → SQL Editor → Inhalt von database_setup_complete.sql ausführen

2. App aufrufen: ${APP_URL}

3. Ersten Benutzer registrieren und loslegen!

4. Optional — Push-Notifications:
   → VAPID-Secrets (siehe oben) in Supabase Edge-Functions eintragen
   → Siehe README.md → Push-Benachrichtigungen aktivieren

5. Optional — Ollama KI-Assistent:
$(if [[ -n "$OLLAMA_EXTERNAL_URL" ]]; then
  echo "   Server: ${OLLAMA_EXTERNAL_URL}"
  echo "   In der App: Profil → KI-Einstellungen → Ollama → Basis-URL eintragen"
  echo "   Wichtig: CORS auf dem Ollama-Server aktivieren!"
else
  echo "   Nachträgliche Einrichtung: ./scripts/install.sh → Option [4]"
fi)

============================================================
  SICHERHEITSHINWEIS
  Diese Datei enthält sensitive Zugangsdaten.
  Niemals in ein Git-Repository committen!
============================================================
CREDS
fi

# .gitignore
if [[ -f ".gitignore" ]]; then
  grep -qF "CREDENTIALS.txt" .gitignore || echo "CREDENTIALS.txt" >> .gitignore
  grep -qF ".env" .gitignore || echo ".env" >> .gitignore
else
  printf "CREDENTIALS.txt\n.env\n" > .gitignore
fi

success "CREDENTIALS.txt geschrieben."

# ---- Fertig ----
echo ""
echo -e "${BOLD}${GREEN}============================================================${NC}"
success "Installation abgeschlossen!"
echo -e "${BOLD}${GREEN}============================================================${NC}"
echo ""
echo -e "  App:            ${CYAN}${APP_URL}${NC}  (Port: ${APP_PORT})"
if [[ "$MODE" == "vollstack" ]]; then
  echo -e "  Supabase Studio: ${CYAN}http://localhost:8000${NC}"
else
  echo -e "  Supabase:        ${CYAN}${SUPABASE_URL}${NC}  (extern)"
fi
if [[ "$INSTALL_OLLAMA" == "true" ]]; then
  echo -e "  Ollama API:      ${CYAN}http://localhost:${OLLAMA_PORT}${NC}"
elif [[ -n "$OLLAMA_EXTERNAL_URL" ]]; then
  echo -e "  Ollama Server:   ${CYAN}${OLLAMA_EXTERNAL_URL}${NC}"
fi
echo -e "  Zugangsdaten:    ${CYAN}CREDENTIALS.txt${NC}"
echo ""
echo -e "  ${BOLD}➡ Nächster Schritt:${NC}"
if [[ "$MODE" == "vollstack" ]]; then
  echo "    1. Studio öffnen: http://localhost:8000"
  echo "    2. SQL Editor → database_setup_complete.sql ausführen"
  echo "    3. App aufrufen: ${APP_URL}"
else
  echo "    1. In Supabase SQL Editor: database_setup_complete.sql ausführen"
  echo "    2. App aufrufen: ${APP_URL}"
fi
echo ""
echo -e "  ${BOLD}Nachträgliche Konfiguration jederzeit:${NC}"
echo "    ./scripts/install.sh"
echo ""
