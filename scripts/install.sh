#!/usr/bin/env bash
# ============================================================
# Umzughelfer - Installer & Wartungsskript
#
# Modi:
#   1) Neuinstallation - Vollstack (Supabase + App via Docker)
#   2) Neuinstallation - App only (bestehende Supabase nutzen)
#   3) App neu bauen   - nach Updates oder .env-Aenderungen
#   4) Ollama konfigurieren - CORS, URL, systemd-Einrichtung
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

info()    { echo -e "${CYAN}> $1${NC}"; }
warn()    { echo -e "${YELLOW}! $1${NC}"; }
err()     { echo -e "${RED}x FEHLER: $1${NC}"; exit 1; }
success() { echo -e "${GREEN}OK $1${NC}"; }
header()  { echo -e "\n${BOLD}${GREEN}$1${NC}"; echo "$(printf '=%.0s' {1..60})"; }

cd "$PROJECT_DIR"

deploy_edge_functions_to_volumes() {
  local deployed=0
  while IFS= read -r fn_index; do
    local fn_dir
    fn_dir="$(dirname "$fn_index")"
    local fn_name
    fn_name="$(basename "$fn_dir")"
    mkdir -p "volumes/functions/${fn_name}"
    cp "$fn_index" "volumes/functions/${fn_name}/index.ts"
    echo "    OK volumes/functions/${fn_name}/index.ts"
    deployed=$((deployed + 1))
  done < <(find supabase/functions -mindepth 2 -maxdepth 2 -type f -name 'index.ts' | sort)

  if [[ $deployed -eq 0 ]]; then
    warn "Keine Edge Functions unter supabase/functions/*/index.ts gefunden."
  else
    success "${deployed} Edge Function(s) synchronisiert."
  fi
}

run_sql_in_db_container() {
  local sql_file="$1"
  local on_error_stop="${2:-1}"
  docker exec -i supabase-db psql -v ON_ERROR_STOP="${on_error_stop}" -U postgres -d postgres < "$sql_file"
}

run_sql_with_fallback() {
  local sql_file="$1"
  local log_file
  log_file="$(mktemp)"

  if run_sql_in_db_container "$sql_file" 1 >"$log_file" 2>&1; then
    cat "$log_file"
    rm -f "$log_file"
    return 0
  fi

  cat "$log_file"

  if [[ "$sql_file" == "database_setup_complete.sql" ]] && grep -qi "must be owner of table objects" "$log_file"; then
    warn "Storage-Policies auf storage.objects konnten nicht mit voller Berechtigung gesetzt werden."
    warn "Import wird tolerant wiederholt, damit restliches Schema nicht abbricht."
    if run_sql_in_db_container "$sql_file" 0; then
      rm -f "$log_file"
      return 2
    fi
  fi

  rm -f "$log_file"
  return 1
}

ensure_kong_entrypoint_script() {
  mkdir -p volumes/api
  cat > volumes/api/kong-entrypoint.sh << 'EOF'
#!/usr/bin/env bash
set -euo pipefail

if [[ -n "${SUPABASE_SECRET_KEY:-}" && -n "${SUPABASE_PUBLISHABLE_KEY:-}" ]]; then
  export LUA_AUTH_EXPR="\$((headers.authorization ~= nil and headers.authorization:sub(1, 10) ~= 'Bearer sb_' and headers.authorization) or (headers.apikey == '${SUPABASE_SECRET_KEY}' and 'Bearer ${SERVICE_ROLE_KEY_ASYMMETRIC}') or (headers.apikey == '${SUPABASE_PUBLISHABLE_KEY}' and 'Bearer ${ANON_KEY_ASYMMETRIC}') or headers.apikey)"
  export LUA_RT_WS_EXPR="\$((query_params.apikey == '${SUPABASE_SECRET_KEY}' and '${SERVICE_ROLE_KEY_ASYMMETRIC}') or (query_params.apikey == '${SUPABASE_PUBLISHABLE_KEY}' and '${ANON_KEY_ASYMMETRIC}') or query_params.apikey)"
else
  export LUA_AUTH_EXPR="\$((headers.authorization ~= nil and headers.authorization:sub(1, 10) ~= 'Bearer sb_' and headers.authorization) or headers.apikey)"
  export LUA_RT_WS_EXPR="\$(query_params.apikey)"
fi

awk '{
  result = ""
  rest = $0
  while (match(rest, /\$[A-Za-z_][A-Za-z_0-9]*/)) {
    varname = substr(rest, RSTART + 1, RLENGTH - 1)
    if (varname in ENVIRON) {
      result = result substr(rest, 1, RSTART - 1) ENVIRON[varname]
    } else {
      result = result substr(rest, 1, RSTART + RLENGTH - 1)
    }
    rest = substr(rest, RSTART + RLENGTH)
  }
  print result rest
}' /home/kong/temp.yml > "${KONG_DECLARATIVE_CONFIG}"

sed -i '/^[[:space:]]*- key:[[:space:]]*$/d' "${KONG_DECLARATIVE_CONFIG}"

if [[ -x /entrypoint.sh ]]; then
  exec /entrypoint.sh kong docker-start
fi

exec /docker-entrypoint.sh kong docker-start
EOF
  chmod +x volumes/api/kong-entrypoint.sh
}

ensure_updated_at_functions() {
  docker exec -i supabase-db psql -v ON_ERROR_STOP=1 -U postgres -d postgres <<'SQL'
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;
SQL
}

# ============================================================
# Hauptmenue
# ============================================================
clear
echo ""
echo -e "${BOLD}${GREEN}============================================================${NC}"
echo -e "${BOLD}${GREEN}  Umzughelfer - Installer & Wartung${NC}"
echo -e "${BOLD}${GREEN}============================================================${NC}"
echo ""

# Bestehende Installation erkennen
EXISTING_ENV=false
[[ -f ".env" ]] && EXISTING_ENV=true

if [[ "$EXISTING_ENV" == "true" ]]; then
  echo -e "  ${YELLOW}!  Bestehende Installation erkannt (.env vorhanden)${NC}"
  echo ""
fi

echo "  Was moechtest du tun?"
echo ""
echo "  [1] Neuinstallation - Vollstack (Supabase + App via Docker)"
echo "  [2] Neuinstallation - App only (bestehende Supabase nutzen)"
echo "  [3] App neu bauen   (nach Updates oder .env-Aenderungen)"
echo "  [4] Ollama konfigurieren / CORS einrichten"
echo "  [5] Deinstallieren  (alle Komponenten entfernen)"
echo "  [6] Beenden"
echo ""
read -p "  -> Wahl [1]: " MAIN_CHOICE
[[ -z "$MAIN_CHOICE" ]] && MAIN_CHOICE=1

case "$MAIN_CHOICE" in
  1) MODE="vollstack" ;;
  2) MODE="apponly" ;;
  3) MODE="rebuild" ;;
  4) MODE="ollama" ;;
  5) sed -i 's/\r//' "$SCRIPT_DIR/uninstall.sh" 2>/dev/null || true
     bash "$SCRIPT_DIR/uninstall.sh"; exit 0 ;;
  6) echo "  Auf Wiedersehen."; exit 0 ;;
  *) err "Ungueltige Auswahl." ;;
esac

# ============================================================
# MODUS: App neu bauen
# ============================================================
if [[ "$MODE" == "rebuild" ]]; then
  header "App neu bauen"

  [[ ! -f ".env" ]] && err ".env nicht gefunden. Bitte zuerst eine Neuinstallation durchfuehren."

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
  read -p "  -> Wahl [1]: " OLLAMA_SETUP
  [[ -z "$OLLAMA_SETUP" ]] && OLLAMA_SETUP=1

  echo ""

  if [[ "$OLLAMA_SETUP" == "1" ]]; then
    # --- Systemd-Dienst ---
    header "Ollama - Linux systemd"

    read -p "  App-URL (fuer CORS, z.B. https://umzug.meine-domain.de): " OLLAMA_APP_URL
    [[ -z "$OLLAMA_APP_URL" ]] && OLLAMA_APP_URL="*"

    echo ""
    info "Konfiguriere OLLAMA_ORIGINS im systemd-Dienst..."

    if command -v systemctl >/dev/null 2>&1 && systemctl list-units --type=service 2>/dev/null | grep -q ollama; then
      # Automatisch ueber systemd konfigurieren
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
      echo "  Folgenden Inhalt einfuegen:"
      echo "  -------------------------------------"
      echo "  [Service]"
      echo "  Environment=\"OLLAMA_ORIGINS=${OLLAMA_APP_URL}\""
      echo "  -------------------------------------"
      echo ""
      echo "  Dann:"
      echo "  sudo systemctl daemon-reload"
      echo "  sudo systemctl restart ollama"
    fi

    echo ""
    info "Nginx-Konfiguration fuer Ollama (CORS-Proxy):"
    echo ""
    OLLAMA_DOMAIN="${OLLAMA_APP_URL#https://}"
    OLLAMA_DOMAIN="${OLLAMA_DOMAIN#http://}"
    echo "  Falls Ollama unter einer eigenen (Sub-)Domain erreichbar sein soll,"
    echo "  fuege folgendes in deinen Nginx-Serverblock fuer diese Domain ein:"
    echo ""
    echo "  -------------------------------------"
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
    echo "  -------------------------------------"
    echo ""
    echo "  Nach Aenderungen: nginx -t && systemctl reload nginx"

    OLLAMA_EXTERNAL_URL=""
    read -p "  Ollama-URL in .env aktualisieren? (z.B. https://gpt.meine-domain.de) [Enter = ueberspringen]: " OLLAMA_EXTERNAL_URL

  elif [[ "$OLLAMA_SETUP" == "2" ]]; then
    # --- Docker ---
    header "Ollama - Docker"

    read -p "  App-URL (fuer CORS, z.B. https://umzug.meine-domain.de): " OLLAMA_APP_URL

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
      echo "  Starten mit CORS-Unterstuetzung:"
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
    header "Ollama - Externer Server"
    read -p "  Ollama Basis-URL (z.B. https://gpt.meine-domain.de): " OLLAMA_EXTERNAL_URL
    [[ -z "$OLLAMA_EXTERNAL_URL" ]] && { warn "Keine URL angegeben."; exit 0; }

    echo ""
    echo -e "  ${YELLOW}Wichtig: Dein externer Ollama-Server muss CORS-Header zurueckgeben.${NC}"
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
    echo "  In der App: Profil -> KI-Einstellungen -> Ollama -> Basis-URL eintragen:"
    echo "  ${OLLAMA_EXTERNAL_URL}"
  fi

  echo ""
  success "Ollama-Konfiguration abgeschlossen."
  exit 0
fi

# ============================================================
# MODUS: Neuinstallation (vollstack oder apponly)
# ============================================================

DB_SCHEMA_STATUS="nicht ausgefuehrt"
MULTIUSER_SCHEMA_STATUS="nicht ausgefuehrt"

# ---- Voraussetzungen pruefen ----
header "Schritt 1: Voraussetzungen pruefen"

command -v docker >/dev/null 2>&1 || err "Docker ist nicht installiert.\n  -> https://docs.docker.com/get-docker/"
docker compose version >/dev/null 2>&1 || err "Docker Compose Plugin fehlt.\n  -> Docker aktualisieren oder Plugin installieren."
command -v node >/dev/null 2>&1 || err "Node.js ist nicht installiert.\n  -> https://nodejs.org/"
command -v openssl >/dev/null 2>&1 || err "openssl ist nicht installiert.\n  -> sudo apt install openssl"

NODE_VERSION=$(node -e "console.log(process.version.slice(1).split('.')[0])")
[[ "$NODE_VERSION" -lt 16 ]] && err "Node.js Version ${NODE_VERSION} zu alt. Mindestens Version 16 erforderlich."

success "Alle Voraussetzungen erfuellt."

# ---- Konfiguration ----
header "Schritt 2: Konfiguration"

echo "Bitte gib folgende Informationen ein."
echo "(Enter druecken fuer den angezeigten Standardwert)"
echo ""

while true; do
  read -p "  App-URL (z.B. https://umzug.meine-domain.de): " APP_URL
  [[ -n "$APP_URL" ]] && break
  echo "  -> App-URL ist erforderlich."
done

while true; do
  read -p "  Deine E-Mail-Adresse (fuer Push-Notifications): " ADMIN_EMAIL
  [[ -n "$ADMIN_EMAIL" ]] && break
  echo "  -> E-Mail ist erforderlich."
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
    echo "  -> Passwort muss mindestens 8 Zeichen lang sein."
  done

else
  echo ""
  info "Zugangsdaten der bestehenden Supabase-Instanz eingeben."
  info "Zu finden unter: Supabase Dashboard -> Project Settings -> API"
  echo ""

  while true; do
    read -p "  Supabase URL (z.B. https://supa.meine-domain.de): " SUPABASE_URL
    [[ -n "$SUPABASE_URL" ]] && break
    echo "  -> Supabase URL ist erforderlich."
  done

  while true; do
    read -p "  Supabase Anon Key: " EXT_ANON_KEY
    [[ -n "$EXT_ANON_KEY" ]] && break
    echo "  -> Anon Key ist erforderlich."
  done

  while true; do
    read -s -p "  Supabase Service Role Key (GEHEIM): " EXT_SERVICE_ROLE_KEY
    echo ""
    [[ -n "$EXT_SERVICE_ROLE_KEY" ]] && break
    echo "  -> Service Role Key ist erforderlich."
  done
fi

# ---- Ollama ----
echo ""
echo "  KI-Assistent - Ollama:"
echo "  [1] Ollama via Docker mitinstallieren"
echo "  [2] Externer / bereits laufender Ollama-Server"
echo "  [3] Kein Ollama (nur OpenAI oder kein KI-Assistent)"
read -p "  -> Wahl [3]: " OLLAMA_CHOICE
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
    echo "  -> Fuer Linux systemd: sudo systemctl edit ollama"
    echo "    [Service]"
    echo "    Environment=\"OLLAMA_ORIGINS=${APP_URL}\""
    echo "  -> Dann: sudo systemctl daemon-reload && sudo systemctl restart ollama"
    echo "  -> Nachtraegliche Einrichtung: ./scripts/install.sh -> Option [4]"
  fi
fi

echo ""
success "Konfiguration abgeschlossen."

# ---- Schluessel generieren ----
header "Schritt 3: Sicherheitsschluessel generieren"

info "Generiere kryptografische Schluessel..."
KEYS_JSON=$(node scripts/generate-keys.js) || err "Schluesselgenerierung fehlgeschlagen. Ist Node.js korrekt installiert?"

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

success "Schluessel generiert."

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

  mkdir -p volumes/db volumes/logs volumes/pooler volumes/storage volumes/functions \
           volumes/snippets volumes/db/data volumes/api

  ALL_DOWNLOADED=true
  for file in "${SUPABASE_FILES[@]}"; do
    if [[ ! -f "$file" ]]; then
      info "Lade ${file}..."
      if curl -fsSL "${SUPABASE_RAW}/${file}" -o "${file}" 2>/dev/null; then
        echo "    OK ${file}"
      else
        warn "Konnte ${file} nicht herunterladen."
        ALL_DOWNLOADED=false
      fi
    else
      echo "    OK ${file} (bereits vorhanden)"
    fi
  done

  ensure_kong_entrypoint_script

  if [[ -f "volumes/db/jwt.sql" ]]; then
    sed -i "s/your-super-secret-jwt-token-with-at-least-32-characters-long/${JWT_SECRET}/g" volumes/db/jwt.sql 2>/dev/null || true
  fi

  info "Synchronisiere Edge Functions..."
  deploy_edge_functions_to_volumes

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
# Umzughelfer + Supabase - Vollstack
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
SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SECRET_KEY=
ANON_KEY_ASYMMETRIC=
SERVICE_ROLE_KEY_ASYMMETRIC=

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

# Sicherheitsschluessel
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

# SMTP (optional - fuer E-Mail-Bestaetigungen konfigurieren)
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

# Einladungs-E-Mails (optional, Resend)
RESEND_API_KEY=
INVITE_FROM_EMAIL=
INVITE_BRAND_NAME=Umzughelfer

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
# Umzughelfer App - Bestehende Supabase-Instanz
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

# Einladungs-E-Mails (optional, in externer Supabase/Edge Runtime setzen)
# RESEND_API_KEY=
# INVITE_FROM_EMAIL=
# INVITE_BRAND_NAME=Umzughelfer

# Ollama (optional - Basis-URL ohne Pfad, z.B. https://gpt.meine-domain.de)
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
set +e
if [[ "$INSTALL_OLLAMA" == "true" ]]; then
  docker compose -f "$COMPOSE_FILE" --profile ollama up -d
else
  docker compose -f "$COMPOSE_FILE" up -d
fi
COMPOSE_EXIT=$?
set -e

if [[ $COMPOSE_EXIT -ne 0 ]]; then
  warn "Docker Compose meldete einen Fehler (Exit ${COMPOSE_EXIT})."
  # Analytics benoetigt bei Erstinstallation bis zu 3 Min fuer DB-Initialisierung.
  # Pruefen ob er der einzige Fehler ist und ggf. warten.
  if docker ps --format '{{.Names}}' 2>/dev/null | grep -q "supabase-analytics"; then
    warn "Warte auf Analytics-Container (kann bei Erstinstallation bis zu 3 Min dauern)..."
    ANALYTICS_OK=false
    for _i in $(seq 1 36); do
      if docker exec supabase-analytics curl -sf http://localhost:4000/health >/dev/null 2>&1; then
        ANALYTICS_OK=true
        break
      fi
      sleep 5
      echo -n "."
    done
    echo ""
    if [[ "$ANALYTICS_OK" == "true" ]]; then
      success "Analytics bereit."
      docker compose -f "$COMPOSE_FILE" up -d --no-recreate 2>/dev/null || true
    else
      warn "Analytics antwortet noch nicht. Die App-Funktionen sind davon nicht betroffen."
      warn "Neustart bei Bedarf: docker compose -f ${COMPOSE_FILE} restart supabase-analytics"
    fi
  else
    err "Docker-Start fehlgeschlagen (Exit ${COMPOSE_EXIT}). Logs: docker compose -f ${COMPOSE_FILE} logs"
  fi
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
  if [[ $RETRIES -eq 0 ]]; then
    warn "Datenbank antwortet noch nicht. SQL-Setup wird uebersprungen."
    DB_SCHEMA_STATUS="uebersprungen (DB nicht bereit)"
    MULTIUSER_SCHEMA_STATUS="uebersprungen (DB nicht bereit)"
  else
    read -p "  Schema jetzt anwenden? [J/n]: " APPLY_SCHEMA_NOW
    if [[ "${APPLY_SCHEMA_NOW,,}" == "n" ]]; then
      DB_SCHEMA_STATUS="manuell erforderlich"
      MULTIUSER_SCHEMA_STATUS="manuell erforderlich"
    else
      if [[ -f "database_setup_complete.sql" ]]; then
        info "Wende database_setup_complete.sql an..."
        if run_sql_with_fallback "database_setup_complete.sql"; then
          DB_SCHEMA_STATUS="angewendet"
          success "database_setup_complete.sql erfolgreich angewendet."
        else
          SQL_RC=$?
          if [[ $SQL_RC -eq 2 ]]; then
            DB_SCHEMA_STATUS="angewendet (mit Warnungen)"
            warn "database_setup_complete.sql mit Warnungen angewendet (Storage-Policies uebersprungen)."
          else
            DB_SCHEMA_STATUS="fehler"
            warn "database_setup_complete.sql konnte nicht vollstaendig angewendet werden."
          fi
        fi
      else
        DB_SCHEMA_STATUS="nicht gefunden"
        warn "database_setup_complete.sql nicht gefunden."
      fi

      if [[ -f "umzugshelfer-pwa/haushalt_multiuser_setup.sql" ]]; then
        ensure_updated_at_functions
        info "Wende optional umzugshelfer-pwa/haushalt_multiuser_setup.sql an..."
        if run_sql_in_db_container "umzugshelfer-pwa/haushalt_multiuser_setup.sql"; then
          MULTIUSER_SCHEMA_STATUS="angewendet"
          success "haushalt_multiuser_setup.sql erfolgreich angewendet."
        else
          MULTIUSER_SCHEMA_STATUS="fehler"
          warn "haushalt_multiuser_setup.sql konnte nicht vollstaendig angewendet werden."
        fi
      else
        MULTIUSER_SCHEMA_STATUS="nicht vorhanden"
        warn "Optionale Datei umzugshelfer-pwa/haushalt_multiuser_setup.sql nicht gefunden."
      fi
    fi
  fi
else
  DB_SCHEMA_STATUS="manuell erforderlich"
  MULTIUSER_SCHEMA_STATUS="manuell erforderlich"
fi

# ---- CREDENTIALS.txt ----
info "Schreibe CREDENTIALS.txt..."

if [[ "$MODE" == "vollstack" ]]; then
  cat > CREDENTIALS.txt << CREDS
============================================================
  Umzughelfer - Vollstack-Installation
  Erstellt: ${INSTALL_DATE}
============================================================

APP
  URL:        ${APP_URL}
  Port:       ${APP_PORT}

SUPABASE STUDIO (Admin-Oberflaeche)
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

  Service Role Key (GEHEIM - niemals im Frontend verwenden!):
  ${SERVICE_ROLE_KEY}

JWT SECRET (GEHEIM)
  ${JWT_SECRET}

PUSH NOTIFICATIONS (VAPID)
  Public Key:   ${VAPID_PUBLIC_KEY}
  Private Key:  ${VAPID_PRIVATE_KEY}

EINLADUNGS-MAIL (optional, Edge Function send-household-invite)
  RESEND_API_KEY:    ${RESEND_API_KEY:-<nicht gesetzt>}
  INVITE_FROM_EMAIL: ${INVITE_FROM_EMAIL:-<nicht gesetzt>}
  INVITE_BRAND_NAME: ${INVITE_BRAND_NAME:-Umzughelfer}

============================================================
  NAECHSTE SCHRITTE
============================================================

1. Datenbank einrichten:
   a) Supabase Studio oeffnen: http://localhost:8000
   b) Mit "supabase" / "${STUDIO_PASSWORD}" anmelden
   c) SQL Editor -> Neue Abfrage
   d) Falls noch offen: database_setup_complete.sql ausfuehren
   e) Optional/empfohlen: umzugshelfer-pwa/haushalt_multiuser_setup.sql ausfuehren

SCHEMA-STATUS
  database_setup_complete.sql: ${DB_SCHEMA_STATUS}
  haushalt_multiuser_setup.sql: ${MULTIUSER_SCHEMA_STATUS}

2. App aufrufen: ${APP_URL}

3. Ersten Benutzer registrieren und loslegen!

4. Optional - SMTP einrichten (.env -> SMTP_* Variablen):
   docker compose -f docker-compose.full.yml restart supabase-auth

5. Optional - Push-Notifications testen:
   Profil -> Push-Benachrichtigungen -> Aktivieren

6. Optional - Ollama KI-Assistent:
$(if [[ "$INSTALL_OLLAMA" == "true" ]]; then
  echo "   Modell laden: docker exec ollama ollama pull llama3.2"
  echo "   In der App: Profil -> KI-Einstellungen -> Ollama -> Basis-URL: http://localhost:${OLLAMA_PORT}"
elif [[ -n "$OLLAMA_EXTERNAL_URL" ]]; then
  echo "   Externer Server: ${OLLAMA_EXTERNAL_URL}"
  echo "   In der App: Profil -> KI-Einstellungen -> Ollama -> Basis-URL eintragen"
  echo "   Wichtig: CORS auf dem Ollama-Server aktivieren!"
  echo "   Nachtraegliche Einrichtung: ./scripts/install.sh -> Option [4]"
else
  echo "   Nachtraegliche Einrichtung jederzeit moeglich:"
  echo "   ./scripts/install.sh -> Option [4]"
fi)

7. Optional - Einladungs-E-Mails aktivieren:
   In .env setzen: RESEND_API_KEY + INVITE_FROM_EMAIL
   Optional: INVITE_BRAND_NAME
   Dann: docker compose -f docker-compose.full.yml restart supabase-edge-functions

============================================================
  SICHERHEITSHINWEIS
  Diese Datei enthaelt sensitive Zugangsdaten.
  Niemals in ein Git-Repository committen!
============================================================
CREDS

else
  cat > CREDENTIALS.txt << CREDS
============================================================
  Umzughelfer - App-Installation (externe Supabase)
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

  WICHTIG: VAPID-Secrets muessen in deiner Supabase-Instanz
  als Umgebungsvariablen fuer den Edge-Functions-Container
  eingetragen werden (siehe README.md -> Push-Notifications).

  VAPID_SUBJECT=mailto:${ADMIN_EMAIL}
  VAPID_PUBLIC_KEY=${VAPID_PUBLIC_KEY}
  VAPID_PRIVATE_KEY=${VAPID_PRIVATE_KEY}

  Optional fuer Haushalts-Einladungsmails (Edge Function):
  RESEND_API_KEY=<dein-resend-api-key>
  INVITE_FROM_EMAIL=<verifizierter-absender>
  INVITE_BRAND_NAME=Umzughelfer

============================================================
  NAECHSTE SCHRITTE
============================================================

1. Datenbank einrichten (in deiner Supabase-Instanz):
   -> SQL Editor -> zuerst database_setup_complete.sql ausfuehren
   -> danach (falls vorhanden) umzugshelfer-pwa/haushalt_multiuser_setup.sql ausfuehren

SCHEMA-STATUS
  database_setup_complete.sql: ${DB_SCHEMA_STATUS}
  haushalt_multiuser_setup.sql: ${MULTIUSER_SCHEMA_STATUS}

2. App aufrufen: ${APP_URL}

3. Ersten Benutzer registrieren und loslegen!

4. Optional - Push-Notifications:
   -> VAPID-Secrets (siehe oben) in Supabase Edge-Functions eintragen
   -> Siehe README.md -> Push-Benachrichtigungen aktivieren

5. Optional - Ollama KI-Assistent:
$(if [[ -n "$OLLAMA_EXTERNAL_URL" ]]; then
  echo "   Server: ${OLLAMA_EXTERNAL_URL}"
  echo "   In der App: Profil -> KI-Einstellungen -> Ollama -> Basis-URL eintragen"
  echo "   Wichtig: CORS auf dem Ollama-Server aktivieren!"
else
  echo "   Nachtraegliche Einrichtung: ./scripts/install.sh -> Option [4]"
fi)

6. Optional - Einladungs-E-Mails:
   In deiner externen Supabase-Edge-Runtime setzen:
   RESEND_API_KEY, INVITE_FROM_EMAIL, INVITE_BRAND_NAME
   Danach Edge Functions neu starten/deployen.

============================================================
  SICHERHEITSHINWEIS
  Diese Datei enthaelt sensitive Zugangsdaten.
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
echo -e "  Schema:         ${CYAN}database_setup_complete.sql = ${DB_SCHEMA_STATUS}${NC}"
echo -e "  Multiuser:      ${CYAN}haushalt_multiuser_setup.sql = ${MULTIUSER_SCHEMA_STATUS}${NC}"
echo ""
echo -e "  ${BOLD}=> Naechster Schritt:${NC}"
if [[ "$MODE" == "vollstack" ]]; then
  echo "    1. Studio oeffnen: http://localhost:8000"
  echo "    2. Falls offen: database_setup_complete.sql ausfuehren"
  echo "    3. Optional/empfohlen: umzugshelfer-pwa/haushalt_multiuser_setup.sql ausfuehren"
  echo "    4. App aufrufen: ${APP_URL}"
  echo "    5. Nach Erstlogin: Haushalt erstellen oder per Invite-Link beitreten"
else
  echo "    1. In Supabase SQL Editor: database_setup_complete.sql ausfuehren"
  echo "    2. Danach (falls vorhanden): umzugshelfer-pwa/haushalt_multiuser_setup.sql ausfuehren"
  echo "    3. App aufrufen: ${APP_URL}"
  echo "    4. Nach Erstlogin: Haushalt erstellen oder per Invite-Link beitreten"
fi
echo ""
echo -e "  ${BOLD}Nachtraegliche Konfiguration jederzeit:${NC}"
echo "    ./scripts/install.sh"
echo ""
