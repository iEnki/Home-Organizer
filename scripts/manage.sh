#!/usr/bin/env bash
# ============================================================
# Umzughelfer — Zentrales Verwaltungsskript
#
#   [1] Installation      — Vollstack oder App-only einrichten
#   [2] Update            — Updates einspielen, Container neu starten
#   [3] Deinstallation    — Container, Volumes oder alles entfernen
#   [4] Backup            — Datenbank + Konfiguration sichern
#   [5] Wiederherstellung — Backup importieren / Daten wiederherstellen
#   [6] SMTP              — E-Mail-Einstellungen konfigurieren
#   [7] Ollama            — KI-Assistent konfigurieren
#   [8] Konfiguration     — App-URL / Port / Admin-E-Mail anpassen
#   [9] Status            — Laufende Container und Logs anzeigen
#   [10] Docker bereinigen — Ungenutzte Container, Images + Volumes löschen
#   [0] Beenden
#
# Verwendung: chmod +x scripts/manage.sh && ./scripts/manage.sh
# ============================================================

# CRLF → LF
if grep -qU $'\r' "$0" 2>/dev/null; then
  sed -i 's/\r//' "$0"
  exec bash "$0" "$@"
fi

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

export BUILDKIT_PROGRESS="${BUILDKIT_PROGRESS:-plain}"
export COMPOSE_PROGRESS="${COMPOSE_PROGRESS:-plain}"

info()    { echo -e "${CYAN}▶ $1${NC}"; }
warn()    { echo -e "${YELLOW}⚠  $1${NC}"; }
err()     { echo -e "${RED}✗  FEHLER: $1${NC}"; exit 1; }
success() { echo -e "${GREEN}✅ $1${NC}"; }
header()  { echo -e "\n${BOLD}${GREEN}$1${NC}"; echo "$(printf '=%.0s' {1..60})"; }
dim()     { echo -e "${DIM}$1${NC}"; }

print_supabase_proxy_timeout_notice() {
  local public_url
  public_url="$(env_get "SUPABASE_PUBLIC_URL" 2>/dev/null || true)"
  [[ "$public_url" != https://* ]] && return 0
  echo ""
  warn "Reverse Proxy: KI-Bildanalysen koennen laenger als 90 Sekunden dauern."
  echo "  Fuer die Supabase-/Kong-Domain im location-Block erforderlich:"
  echo "    proxy_connect_timeout 30s;"
  echo "    proxy_send_timeout 210s;"
  echo "    proxy_read_timeout 210s;"
  echo "    send_timeout 210s;"
  echo "    client_max_body_size 32m;"
}

weiter() {
  echo ""
  read -rp "  Drücke Enter um zum Hauptmenü zurückzukehren..." _PAUSE
}

mit_spinner() {
  local MSG="$1"; shift
  local SPIN='|/-\'
  local LOG LAST_COPY INTERVAL LAST_SHOWN
  LOG=$(mktemp /tmp/umzug-command.XXXXXX)
  chmod 600 "$LOG"
  LAST_COPY="/tmp/umzug_last_command.log"
  INTERVAL="${UMZUG_LOG_INTERVAL:-20}"
  LAST_SHOWN=0

  "$@" >"$LOG" 2>&1 &
  local PID=$!
  local i=0

  echo -e "  ${DIM}Log: ${LOG} (latest: ${LAST_COPY})${NC}"
  while kill -0 "$PID" 2>/dev/null; do
    local c="${SPIN:$((i % ${#SPIN})):1}"
    printf "\r  ${CYAN}${c}${NC}  %s  ${DIM}(%ds)${NC}" "$MSG" "$i"
    cp "$LOG" "$LAST_COPY" 2>/dev/null && chmod 600 "$LAST_COPY" || true
    if [[ $i -gt 0 && $((i % INTERVAL)) -eq 0 ]]; then
      local LINE_COUNT
      LINE_COUNT=$(wc -l < "$LOG" 2>/dev/null | tr -d ' ' || echo 0)
      if [[ "$LINE_COUNT" -gt "$LAST_SHOWN" ]]; then
        printf "\n"
        echo -e "${DIM}--- Live-Log: letzte Zeilen (${MSG}) ---${NC}"
        tail -20 "$LOG" | sed 's/^/    /'
        LAST_SHOWN="$LINE_COUNT"
      fi
    fi
    sleep 1
    i=$((i + 1))
  done

  set +e
  wait "$PID"
  local EXIT_CODE=$?
  set -e
  printf "\r%60s\r" ""
  cp "$LOG" "$LAST_COPY" 2>/dev/null && chmod 600 "$LAST_COPY" || true

  if [[ $EXIT_CODE -eq 0 ]]; then
    success "$MSG"
  else
    echo -e "${RED}X  $MSG - fehlgeschlagen (Exit $EXIT_CODE)${NC}"
    cp "$LOG" /tmp/umzug_build_error.log 2>/dev/null && chmod 600 /tmp/umzug_build_error.log || true
    echo -e "${DIM}--- Relevante Fehler/Warnungen ---${NC}"
    grep -iE 'error|failed|fail|fatal|exception|traceback|denied|not found|no such file|cannot|unable|warn' "$LOG" | tail -50 >&2 || true
    echo -e "${DIM}--- Letzte Log-Zeilen ---${NC}"
    tail -120 "$LOG" >&2
    echo ""
    echo -e "${DIM}  Vollstaendiges Log: cat /tmp/umzug_build_error.log${NC}"
    echo -e "${DIM}  Live/letztes Log:  cat /tmp/umzug_last_command.log${NC}"
    echo -e "${DIM}  Nur Fehler:        grep -iE 'error|failed|fatal|unable|not found|warn' /tmp/umzug_build_error.log | tail -50${NC}"
    chmod 600 "$LOG"
    return $EXIT_CODE
  fi
  chmod 600 "$LOG"
}

deploy_edge_functions_to_volumes() {
  mkdir -p volumes/functions
  cp -R supabase/functions/. volumes/functions/
  DEPLOYED=$(find supabase/functions -mindepth 2 -maxdepth 2 -type f -name 'index.ts' 2>/dev/null | wc -l)
  local source_file relative_file
  while IFS= read -r source_file; do
    relative_file="${source_file#supabase/functions/}"
    if [[ ! -f "volumes/functions/${relative_file}" ]] \
      || ! cmp -s "$source_file" "volumes/functions/${relative_file}"; then
      warn "Edge-Functions-Sync unvollstaendig: ${relative_file}"
      return 1
    fi
  done < <(find supabase/functions -type f)
  if ! grep -A3 -F '"ki-chat": {' volumes/functions/main/index.ts \
    | grep -q 'timeoutMs: 180_000'; then
    warn "Der 180-Sekunden-Worker-Override fuer ki-chat fehlt im Deployment."
    return 1
  fi
  if ! grep -A3 -F '"send-push": {' volumes/functions/main/index.ts \
    | grep -q 'timeoutMs: 25_000'; then
    warn "Der 25-Sekunden-Worker-Override fuer send-push fehlt im Deployment."
    return 1
  fi
  echo "    OK ${DEPLOYED} Edge Functions inklusive gemeinsamer Module"
}

run_sql_in_db_container() {
  local sql_file="$1"
  local on_error_stop="${2:-1}"
  docker exec -i supabase-db psql -v ON_ERROR_STOP="${on_error_stop}" -U postgres -d postgres < "$sql_file"
}

run_sql_with_fallback() {
  # Keep the existing interface; never mask a failed schema import.
  run_sql_in_db_container "$1" 1
}

apply_fast_mutation_hotfix() {
  local sql_file="scripts/hotfix_2026_07_29_fast_mutations.sql"
  [[ "$IS_VOLLSTACK" != "true" ]] && return 0
  if [[ ! -f "$sql_file" ]]; then
    warn "Performance-Hotfix fehlt: ${sql_file}"
    return 1
  fi
  if ! run_sql_in_db_container "$sql_file"; then
    warn "Performance-Indizes konnten nicht angewendet werden."
    return 1
  fi
  info "Performance-Indexpruefung abgeschlossen; SQL-Warnungen zu fehlenden Rechten oder Namenskonflikten beachten."
}

ensure_kong_entrypoint_script() {
  umzug_prepare_kong_entrypoint "$PROJECT_DIR"
}

ensure_updated_at_functions() {
  docker exec -i supabase-db psql -v ON_ERROR_STOP=1 -U postgres -d postgres <<'UPDATED_AT_SQL'
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := NOW(); RETURN NEW; END; $$;

CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := NOW(); RETURN NEW; END; $$;
UPDATED_AT_SQL
}

env_get() {
  grep -E "^${1}=" .env 2>/dev/null | head -1 | cut -d= -f2- | sed 's/^[[:space:]]*//' | sed 's/[[:space:]]*$//' || true
}

env_set() {
  local KEY="$1" VAL="$2" TMP
  TMP=$(mktemp)
  grep -v "^${KEY}=" .env > "$TMP" 2>/dev/null || true
  printf '%s=%s\n' "$KEY" "$VAL" >> "$TMP"
  mv "$TMP" .env
}

ensure_recipe_parser_env() {
  [[ ! -f ".env" ]] && return 0
  local UPDATED=false
  if [[ -z "$(env_get "DOCUMENT_OCR_INTERNAL_TOKEN")" ]]; then
    local ocr_token
    ocr_token="$(node -e "process.stdout.write(require('crypto').randomBytes(32).toString('hex'))")" || return 1
    [[ -n "$ocr_token" ]] || return 1
    env_set "DOCUMENT_OCR_INTERNAL_TOKEN" "$ocr_token"
    UPDATED=true
  fi
  if ! grep -q '^BASG_API_TOKEN=' .env; then env_set "BASG_API_TOKEN" ""; UPDATED=true; fi


  if [[ -z "$(env_get "RECIPE_PARSER_INTERNAL_TOKEN")" ]]; then
    env_set "RECIPE_PARSER_INTERNAL_TOKEN" "$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")"
    UPDATED=true
  fi
  [[ -z "$(env_get "RECIPE_PARSER_URL")" ]] && env_set "RECIPE_PARSER_URL" "http://recipe-source-parser:8090" && UPDATED=true
  [[ -z "$(env_get "RECIPE_PARSER_PORT")" ]] && env_set "RECIPE_PARSER_PORT" "8090" && UPDATED=true
  [[ -z "$(env_get "WHISPER_DEVICE")" ]] && env_set "WHISPER_DEVICE" "auto" && UPDATED=true
  [[ -z "$(env_get "WHISPER_MODEL")" ]] && env_set "WHISPER_MODEL" "small" && UPDATED=true
  [[ -z "$(env_get "WHISPER_CPU_COMPUTE_TYPE")" ]] && env_set "WHISPER_CPU_COMPUTE_TYPE" "int8" && UPDATED=true
  [[ -z "$(env_get "WHISPER_GPU_COMPUTE_TYPE")" ]] && env_set "WHISPER_GPU_COMPUTE_TYPE" "auto" && UPDATED=true
  [[ -z "$(env_get "WHISPER_CPP_FALLBACK_ENABLED")" ]] && env_set "WHISPER_CPP_FALLBACK_ENABLED" "true" && UPDATED=true

  if [[ "$UPDATED" == "true" ]]; then
    success "Fehlende Kochbuch/Recipe-Parser-Werte in .env ergaenzt."
  fi
  return 0
}

check_recipe_parser_context() {
  [[ "$IS_VOLLSTACK" != "true" ]] && return 0
  if grep -q "recipe-source-parser:" "$COMPOSE_FILE" 2>/dev/null && [[ ! -d "services/recipe-source-parser" ]]; then
    warn "Docker Compose erwartet services/recipe-source-parser, aber der Ordner fehlt."
    echo "  Bitte kopiere/pulle den Ordner auf diesen Server:"
    echo "    services/recipe-source-parser/"
    echo ""
    echo "  Danach erneut starten:"
    echo "    docker compose -f ${COMPOSE_FILE} up -d --build recipe-source-parser functions"
    return 1
  fi
  return 0
}

check_edge_internal_service_config() {
  [[ "$IS_VOLLSTACK" != "true" ]] && return 0
  if ! grep -qE '^[[:space:]]+SUPABASE_AUTH_URL:[[:space:]]+http://auth:9999[[:space:]]*$' "$COMPOSE_FILE" 2>/dev/null \
    || ! grep -qE '^[[:space:]]+SUPABASE_REST_URL:[[:space:]]+http://rest:3000[[:space:]]*$' "$COMPOSE_FILE" 2>/dev/null; then
    warn "Im Functions-Service fehlen SUPABASE_AUTH_URL oder SUPABASE_REST_URL."
    echo "  Aktualisiere docker-compose.full.yml, bevor Edge Functions neu gestartet werden."
    return 1
  fi
  return 0
}

ensure_fullstack_update_prereqs() {
  [[ "$IS_VOLLSTACK" != "true" ]] && return 0
  if [[ ! -f "volumes/api/kong-entrypoint.sh" ]]; then
    warn "volumes/api/kong-entrypoint.sh fehlt. Wird neu erzeugt."
    ensure_kong_entrypoint_script
    KONG_RELOAD_REASON="${KONG_RELOAD_REASON:-kong-entrypoint neu erzeugt}"
  fi
  check_recipe_parser_context && check_edge_internal_service_config || return 1
  umzug_ensure_auth_redirects || return 1
  if [[ "$AUTH_REDIRECTS_CHANGED" == true ]]; then
    mit_spinner "Anmelde-Weiterleitungen aktualisieren" umzug_compose -f "$COMPOSE_FILE" up -d --force-recreate auth mail-templates || return 1
  fi
  return 0
}

reload_kong_if_needed() {
  [[ "$IS_VOLLSTACK" != "true" ]] && return 0
  local reason="${1:-}"
  [[ -z "$reason" ]] && return 0
  if ! mit_spinner "Kong configuration reload: $reason" umzug_compose -f "$COMPOSE_FILE" up -d --force-recreate kong; then
    warn "Kong reload failed."
    return 1
  fi
  return 0
}

maybe_reload_kong_for_git_range() {
  [[ "$IS_VOLLSTACK" != "true" ]] && return 0
  local before="$1" after="$2"
  [[ -z "$before" || -z "$after" || "$before" == "$after" ]] && return 0
  if ! command -v git >/dev/null 2>&1 || [[ ! -d ".git" ]]; then return 0; fi
  local changed
  changed="$(git diff --name-only "$before" "$after" 2>/dev/null | grep -E '^(docker-compose\.full\.yml|volumes/api/kong\.yml|volumes/api/kong-entrypoint\.sh)$' || true)"
  if [[ -n "$changed" ]]; then
    reload_kong_if_needed "$(echo "$changed" | tr '\n' ' ' | sed 's/[[:space:]]*$//')"
  fi
}

check_supabase_studio_access() {
  [[ "$IS_VOLLSTACK" != "true" ]] && return 0
  echo ""
  header "Supabase Studio / Kong Diagnose"

  local required=(supabase-kong supabase-studio supabase-meta supabase-db supabase-edge-functions)
  local missing=false
  for container in "${required[@]}"; do
    if docker ps --format '{{.Names}}' 2>/dev/null | grep -qx "$container"; then
      echo "    OK ${container} laeuft"
    else
      warn "${container} laeuft nicht."
      missing=true
    fi
  done

  local internal_code=""
  internal_code="$(umzug_studio_http_status 2>/dev/null || true)"
  if [[ "$internal_code" == "200" || "$internal_code" == "307" || "$internal_code" == "308" ]]; then
    echo "    OK Studio intern erreichbar (HTTP ${internal_code})"
  elif [[ -n "$internal_code" ]]; then
    warn "Interner Studio-Endpunkt liefert HTTP ${internal_code}."
  else
    warn "Interner Studio-Check konnte nicht ausgefuehrt werden."
  fi

  local supabase_public dashboard_user dashboard_pass
  supabase_public="$(env_get "SUPABASE_PUBLIC_URL")"
  dashboard_user="$(env_get "DASHBOARD_USERNAME")"
  dashboard_pass="$(env_get "DASHBOARD_PASSWORD")"
  if [[ -n "$supabase_public" ]]; then
    echo "    SUPABASE_PUBLIC_URL: ${supabase_public}"
    local public_code manifest_code auth_code
    public_code="$(curl -k -s -o /dev/null -w "%{http_code}" "$supabase_public" 2>/dev/null || true)"
    manifest_code="$(curl -k -s -o /dev/null -w "%{http_code}" "${supabase_public%/}/favicon/manifest.json" 2>/dev/null || true)"
    [[ -n "$public_code" ]] && echo "    Extern /: HTTP ${public_code}" || warn "Externer Check fuer ${supabase_public} nicht moeglich."
    if [[ "$manifest_code" == "401" ]]; then
      warn "/favicon/manifest.json liefert 401. Das ist ein Studio-Asset hinter Basic-Auth und kein Datenbankausfall."
    elif [[ -n "$manifest_code" ]]; then
      echo "    Extern /favicon/manifest.json: HTTP ${manifest_code}"
    fi
    if [[ -n "$dashboard_user" && -n "$dashboard_pass" ]]; then
      auth_code="$(curl -k -s -o /dev/null -w "%{http_code}" -u "${dashboard_user}:${dashboard_pass}" "$supabase_public/project/default" 2>/dev/null || true)"
      if [[ "$auth_code" == "200" || "$auth_code" == "307" || "$auth_code" == "308" ]]; then
        echo "    OK Studio Basic-Auth akzeptiert .env-Credentials (HTTP ${auth_code})"
      elif [[ "$auth_code" == "401" ]]; then
        warn "Studio Basic-Auth lehnt die .env-Credentials ab. Kong nutzt vermutlich alte/falsche Credentials."
        echo "    Reparatur auf dem Server:"
        echo "      docker compose -f ${COMPOSE_FILE} up -d --force-recreate kong"
        echo "      docker compose -f ${COMPOSE_FILE} logs --tail=80 kong"
      elif [[ -n "$auth_code" ]]; then
        warn "Credential-Test auf Studio liefert HTTP ${auth_code}."
      fi
    fi
  else
    warn "SUPABASE_PUBLIC_URL fehlt in .env."
  fi

  if [[ -n "$dashboard_user" && -n "$dashboard_pass" ]]; then
    echo "    Studio Basic-Auth: Benutzer '${dashboard_user}' aus .env verwenden."
  else
    warn "DASHBOARD_USERNAME oder DASHBOARD_PASSWORD fehlen in .env."
  fi

  if [[ "$missing" == "true" ]]; then
    warn "Mindestens ein Supabase-Container fehlt. Server-Check:"
    echo "    docker compose -f ${COMPOSE_FILE} ps kong studio meta db functions"
  fi
}

recipe_parser_image_exists() {
  docker image inspect umzughelfer-recipe-source-parser >/dev/null 2>&1 || \
  docker image inspect umzughelfer_recipe-source-parser >/dev/null 2>&1 || \
  docker image inspect umzughelfer-recipe-source-parser:latest >/dev/null 2>&1
}

container_is_running() {
  [[ "$(docker inspect --format '{{.State.Running}}' "$1" 2>/dev/null || true)" == "true" ]]
}

print_edge_functions_diagnostics() {
  echo ""
  warn "Edge-Functions-Start fehlgeschlagen. Containerstatus und letzte Logs:"
  umzug_compose -f "$COMPOSE_FILE" ps \
    analytics recipe-source-parser document-ocr-service functions 2>/dev/null || true
  echo ""
  umzug_compose -f "$COMPOSE_FILE" logs --tail=80 functions 2>/dev/null || \
    docker logs --tail=80 supabase-edge-functions 2>/dev/null || true
}

verify_edge_functions_running() {
  [[ "$IS_VOLLSTACK" != "true" ]] && return 0
  if ! container_is_running supabase-edge-functions; then
    print_edge_functions_diagnostics
    return 1
  fi

  local configured_env
  configured_env="$(docker inspect supabase-edge-functions --format '{{range .Config.Env}}{{println .}}{{end}}' 2>/dev/null || true)"
  if ! grep -qx 'SUPABASE_AUTH_URL=http://auth:9999' <<< "$configured_env" \
    || ! grep -qx 'SUPABASE_REST_URL=http://rest:3000' <<< "$configured_env"; then
    warn "Functions-Container laeuft, aber die direkten internen Supabase-Adressen fehlen."
    echo "  Erneut anwenden mit:"
    echo "    docker compose -f ${COMPOSE_FILE} up -d --no-deps --force-recreate functions"
    return 1
  fi
  if ! grep -A3 -F '"send-push": {' volumes/functions/main/index.ts \
    | grep -q 'timeoutMs: 25_000'; then
    warn "Functions-Container laeuft, aber der send-push-Worker-Override fehlt."
    return 1
  fi
  return 0
}

restart_edge_functions() {
  [[ "$IS_VOLLSTACK" != "true" ]] && return 0

  if ! mit_spinner "Abhaengige Dienste werden gestartet" \
    umzug_compose -f "$COMPOSE_FILE" up -d analytics recipe-source-parser document-ocr-service; then
    print_edge_functions_diagnostics
    return 1
  fi

  local dependency container
  for dependency in \
    "Analytics:supabase-analytics" \
    "Recipe-Parser:recipe-source-parser" \
    "Document-OCR:document-ocr-service"; do
    container="${dependency#*:}"
    if ! container_is_running "$container"; then
      warn "Abhaengiger Dienst ${dependency%%:*} (${container}) laeuft nicht."
      print_edge_functions_diagnostics
      return 1
    fi
  done

  if ! mit_spinner "Functions-Container wird neu erstellt" \
    umzug_compose -f "$COMPOSE_FILE" up -d --no-deps --force-recreate functions; then
    print_edge_functions_diagnostics
    return 1
  fi

  # Kurz warten, damit ein unmittelbar abstuerzender Runtime-Prozess erkannt wird.
  sleep 3
  verify_edge_functions_running || return 1
  print_supabase_proxy_timeout_notice
}

print_url_role_warnings() {
  local site_url api_external supabase_public react_supabase
  site_url="$(env_get "SITE_URL")"
  api_external="$(env_get "API_EXTERNAL_URL")"
  supabase_public="$(env_get "SUPABASE_PUBLIC_URL")"
  react_supabase="$(env_get "REACT_APP_SUPABASE_URL")"

  echo ""
  echo "  Erwartete Rollen:"
  echo "    SITE_URL                 -> App-Domain"
  echo "    SUPABASE_PUBLIC_URL      -> Supabase/Kong-Domain"
  echo "    REACT_APP_SUPABASE_URL   -> Supabase/Kong-Domain"
  echo "    API_EXTERNAL_URL         -> Supabase/Kong-Domain; nur mit /auth/v1 Reverse-Proxy darf sie App-Domain sein"

  if [[ -n "$site_url" && -n "$supabase_public" && "$site_url" == "$supabase_public" ]]; then
    warn "SITE_URL und SUPABASE_PUBLIC_URL sind identisch. App- und Supabase-Domain sollten getrennt bleiben."
  fi
  if [[ -n "$react_supabase" && -n "$supabase_public" && "$react_supabase" != "$supabase_public" ]]; then
    warn "REACT_APP_SUPABASE_URL weicht von SUPABASE_PUBLIC_URL ab. Nach Korrektur ist ein App-Rebuild noetig."
  fi
  if [[ -n "$site_url" && -n "$api_external" && "$api_external" == "$site_url" && "$site_url" != "$supabase_public" ]]; then
    warn "API_EXTERNAL_URL zeigt auf die App-Domain. Das ist nur korrekt, wenn /auth/v1/ dort zu Kong (:8000) weitergeleitet wird."
  fi
}

env_prompt() {
  local KEY="$1" BESCHREIBUNG="$2" CURRENT EINGABE
  CURRENT="$(env_get "$KEY")"
  if [[ -n "$CURRENT" ]]; then
    read -p "  ${BESCHREIBUNG} [${CURRENT}]: " EINGABE
    [[ -z "$EINGABE" ]] && EINGABE="$CURRENT"
  else
    read -p "  ${BESCHREIBUNG}: " EINGABE
  fi
  echo "$EINGABE"
}

env_prompt_secret() {
  local KEY="$1" BESCHREIBUNG="$2" CURRENT EINGABE
  CURRENT="$(env_get "$KEY")"
  if [[ -n "$CURRENT" ]]; then
    echo -e "  ${DIM}(stumme Eingabe — Enter = behalten)${NC}" >&2
    read -s -p "  ${BESCHREIBUNG}: " EINGABE; echo "" >&2
    [[ -z "$EINGABE" ]] && EINGABE="$CURRENT"
  else
    echo -e "  ${DIM}(stumme Eingabe)${NC}" >&2
    read -s -p "  ${BESCHREIBUNG}: " EINGABE; echo "" >&2
  fi
  echo "$EINGABE"
}

detect_local_ip() {
  local ip=""
  if command -v hostname >/dev/null 2>&1; then
    ip="$(hostname -I 2>/dev/null | awk '{for (i=1; i<=NF; i++) if ($i !~ /^127\./) { print $i; exit }}')"
  fi
  if [[ -z "$ip" ]] && command -v ip >/dev/null 2>&1; then
    ip="$(ip route get 1.1.1.1 2>/dev/null | awk '{for (i=1; i<=NF; i++) if ($i == "src") { print $(i+1); exit }}')"
  fi
  echo "$ip"
}

normalize_url_scheme() {
  local raw="$1"
  local default_scheme="${2:-http}"
  [[ -z "$raw" ]] && { echo ""; return; }
  if [[ "$raw" =~ ^https?:// ]]; then
    echo "$raw"
  else
    echo "${default_scheme}://${raw}"
  fi
}

prompt_install_access_urls() {
  local install_mode="$1"
  local app_port="$2"
  local access_choice local_ip access_host_input app_url_input supabase_input
  local app_url_default="" supabase_url_default=""

  INSTALL_ACCESS_MODE=""
  INSTALL_ACCESS_LABEL=""
  INSTALL_ACCESS_HOST=""
  INSTALL_APP_URL=""
  INSTALL_SUPABASE_URL=""

  while true; do
    echo "  Wie soll die App erreichbar sein?"
    echo "  [1] Mit Domain / Reverse Proxy"
    echo "  [2] Nur lokal auf diesem Geraet (localhost)"
    echo "  [3] Im lokalen Netzwerk ohne Domain (LAN-IP)"
    read -p "  -> Wahl [1]: " access_choice
    [[ -z "$access_choice" ]] && access_choice=1

    case "$access_choice" in
      1)
        while true; do
          read -p "  App-URL oder Host (z.B. https://umzug.meine-domain.de, 0 = Abbrechen): " app_url_input
          [[ "$app_url_input" == "0" ]] && return 1
          [[ -n "$app_url_input" ]] && break
          echo "  -> App-URL ist erforderlich."
        done

        INSTALL_ACCESS_MODE="domain"
        INSTALL_ACCESS_LABEL="Domain / Reverse Proxy"
        INSTALL_APP_URL="$(normalize_url_scheme "$app_url_input" "https")"

        if [[ "$install_mode" == "vollstack" ]]; then
          read -p "  Supabase-URL [Standard: ${INSTALL_APP_URL}]: " supabase_input
          [[ -z "$supabase_input" ]] && supabase_input="$INSTALL_APP_URL"
          INSTALL_SUPABASE_URL="$(normalize_url_scheme "$supabase_input" "https")"
        fi
        return 0
        ;;

      2)
        app_url_default="http://localhost:${app_port}"
        echo "  Lokaler Modus: Die App ist nur auf diesem Geraet ueber localhost erreichbar."
        read -p "  App-URL [${app_url_default}]: " app_url_input
        [[ "$app_url_input" == "0" ]] && return 1
        [[ -z "$app_url_input" ]] && app_url_input="$app_url_default"

        INSTALL_ACCESS_MODE="localhost"
        INSTALL_ACCESS_LABEL="Nur lokal auf diesem Geraet"
        INSTALL_ACCESS_HOST="localhost"
        INSTALL_APP_URL="$(normalize_url_scheme "$app_url_input" "http")"

        if [[ "$install_mode" == "vollstack" ]]; then
          supabase_url_default="http://localhost:8000"
          read -p "  Supabase-URL [${supabase_url_default}]: " supabase_input
          [[ -z "$supabase_input" ]] && supabase_input="$supabase_url_default"
          INSTALL_SUPABASE_URL="$(normalize_url_scheme "$supabase_input" "http")"
        fi
        return 0
        ;;

      3)
        local_ip="$(detect_local_ip)"
        if [[ -n "$local_ip" ]]; then
          read -p "  Lokale IP / Hostname [${local_ip}]: " access_host_input
          [[ "$access_host_input" == "0" ]] && return 1
          [[ -z "$access_host_input" ]] && access_host_input="$local_ip"
        else
          while true; do
            read -p "  Lokale IP / Hostname (z.B. 192.168.1.50, 0 = Abbrechen): " access_host_input
            [[ "$access_host_input" == "0" ]] && return 1
            [[ -n "$access_host_input" ]] && break
            echo "  -> IP oder Hostname ist erforderlich."
          done
        fi

        app_url_default="http://${access_host_input}:${app_port}"
        echo "  LAN-Modus: Andere Geraete im Heimnetz koennen diese Adresse verwenden."
        warn "Web Push und einige PWA-Funktionen sind ueber reines HTTP im LAN je nach Browser eingeschraenkt. Voller Umfang erfordert HTTPS oder localhost."
        read -p "  App-URL [${app_url_default}]: " app_url_input
        [[ "$app_url_input" == "0" ]] && return 1
        [[ -z "$app_url_input" ]] && app_url_input="$app_url_default"

        INSTALL_ACCESS_MODE="lan"
        INSTALL_ACCESS_LABEL="Lokales Netzwerk"
        INSTALL_ACCESS_HOST="$access_host_input"
        INSTALL_APP_URL="$(normalize_url_scheme "$app_url_input" "http")"

        if [[ "$install_mode" == "vollstack" ]]; then
          supabase_url_default="http://${access_host_input}:8000"
          read -p "  Supabase-URL [${supabase_url_default}]: " supabase_input
          [[ -z "$supabase_input" ]] && supabase_input="$supabase_url_default"
          INSTALL_SUPABASE_URL="$(normalize_url_scheme "$supabase_input" "http")"
        fi
        return 0
        ;;

      *)
        warn "Ungueltige Auswahl."
        echo ""
        ;;
    esac
  done
}

container_stoppen() {
  info "Stoppe und entferne Container..."
  if [[ "$IS_VOLLSTACK" == "true" ]]; then
    umzug_compose -f "$COMPOSE_FILE" --profile ollama down --remove-orphans 2>/dev/null || \
    umzug_compose -f "$COMPOSE_FILE" down --remove-orphans 2>/dev/null || \
    warn "Container konnten nicht entfernt werden (möglicherweise schon gestoppt)."
  else
    umzug_compose -f "$COMPOSE_FILE" down --remove-orphans 2>/dev/null || \
    warn "Container konnten nicht entfernt werden (möglicherweise schon gestoppt)."
  fi
  success "Container entfernt."
}

volumes_entfernen() {
  if [[ "$IS_VOLLSTACK" != "true" ]]; then
    info "App-only Installation — keine Named Volumes zu entfernen."
    return
  fi
  info "Entferne Docker Named Volumes..."
  umzug_compose -f "$COMPOSE_FILE" --profile ollama down -v 2>/dev/null || \
  umzug_compose -f "$COMPOSE_FILE" down -v 2>/dev/null || true

  local PROJECT_NAME PROJECT_NAME_ALT
  PROJECT_NAME="$(basename "$PROJECT_DIR" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]//g')"
  PROJECT_NAME_ALT="$(basename "$PROJECT_DIR" | tr '[:upper:]' '[:lower:]' | sed 's/ /-/g')"
  for SUFFIX in db-config deno-cache ollama-data; do
    for PREFIX in "$PROJECT_NAME" "$PROJECT_NAME_ALT" "umzughelfer" "umzug-helfer"; do
      local VOL="${PREFIX}_${SUFFIX}"
      if docker volume inspect "$VOL" >/dev/null 2>&1; then
        docker volume rm "$VOL" && echo "    OK Volume ${VOL} entfernt" || true
      fi
    done
  done
  success "Docker Volumes entfernt."
}

# ============================================================
cd "$PROJECT_DIR"
# Shared, non-destructive App-only / Fullstack detection.
source "$SCRIPT_DIR/lib/runtime-context.sh"

# ============================================================
# MODUS-FUNKTIONEN
# ============================================================

modus_status() {
  header "Container-Status"
  echo ""
  umzug_compose -f "$COMPOSE_FILE" ps
  echo ""
  echo -e "  ${BOLD}Letzte Zeilen aus App-Log:${NC}"
  umzug_compose -f "$COMPOSE_FILE" logs --tail=20 umzugsplaner-app 2>/dev/null || true
  echo ""
  if [[ "$IS_VOLLSTACK" == "true" ]]; then
    echo -e "  ${BOLD}Letzte Zeilen aus Functions-Log:${NC}"
    umzug_compose -f "$COMPOSE_FILE" logs --tail=10 functions 2>/dev/null || true
    echo ""
    check_supabase_studio_access
  fi
  weiter
}

modus_backup() {
  header "Datenbank-Backup erstellen"
  if [[ "$IS_VOLLSTACK" != "true" ]]; then
    warn "Nur für diese Vollstack-Installation verfügbar."; weiter; return 0
  fi
  bash "$SCRIPT_DIR/lib/backup-restore.sh" backup "$PROJECT_DIR" "$COMPOSE_FILE"
  weiter
}

modus_restore() {
  header "Datenbank wiederherstellen"
  if [[ "$IS_VOLLSTACK" != "true" ]]; then
    warn "Nur für diese Vollstack-Installation verfügbar."; weiter; return 0
  fi
  local backups=() directory choice confirm
  while IFS= read -r directory; do
    [[ -f "$directory/db.dump" ]] && backups+=("$directory")
  done < <(find backups -mindepth 1 -maxdepth 1 -type d -name 'backup_*' 2>/dev/null | sort -r)
  if (( ${#backups[@]} == 0 )); then
    warn "Keine Backups gefunden."; weiter; return 0
  fi
  local index
  for index in "${!backups[@]}"; do printf '  [%s] %s\n' "$((index + 1))" "${backups[$index]}"; done
  echo '  [0] Zurück'
  read -rp "Backup-Nummer wählen [1]: " choice || return 1
  choice=${choice:-1}
  [[ "$choice" == 0 ]] && return 0
  # Validate before arithmetic expansion; never interpret user input as shell code.
  if [[ ! "$choice" =~ ^[1-9][0-9]{0,5}$ ]] || (( choice > ${#backups[@]} )); then
    warn "Ungültige Auswahl."; return 1
  fi
  read -rp "Bestehende Daten wiederherstellen? [j/N]: " confirm || return 1
  [[ "${confirm,,}" == j || "${confirm,,}" == y ]] || return 0
  bash "$SCRIPT_DIR/lib/backup-restore.sh" restore "$PROJECT_DIR" "$COMPOSE_FILE" "${backups[$((choice - 1))]}"
  weiter
}

modus_smtp() {
  header "SMTP-Einstellungen konfigurieren"

  if [[ ! -f ".env" ]]; then
    warn ".env nicht gefunden. Bitte zuerst eine Installation durchführen."
    weiter; return 0
  fi
  if [[ "$IS_VOLLSTACK" != "true" ]]; then
    warn "Nur für Vollstack-Installation verfügbar (docker-compose.full.yml nicht gefunden)."
    weiter; return 0
  fi

  echo ""
  echo -e "  ${DIM}Aktuelle Werte aus .env werden als Vorschlag angezeigt.${NC}"
  print_url_role_warnings
  echo -e "  ${DIM}Enter drücken = Wert übernehmen. Neuer Wert = überschreiben.${NC}"
  echo ""

  local SMTP_HOST_NEW SMTP_PORT_NEW SMTP_USER_NEW SMTP_PASS_NEW SMTP_ADMIN_NEW SMTP_SENDER_NEW
  SMTP_HOST_NEW=$(env_prompt "SMTP_HOST" "SMTP Host (z.B. smtp.gmail.com)")
  SMTP_PORT_NEW=$(env_prompt "SMTP_PORT" "SMTP Port")
  [[ -z "$SMTP_PORT_NEW" ]] && SMTP_PORT_NEW=587
  SMTP_USER_NEW=$(env_prompt "SMTP_USER" "SMTP Benutzername / E-Mail")
  SMTP_PASS_NEW=$(env_prompt_secret "SMTP_PASS" "SMTP Passwort")
  SMTP_ADMIN_NEW=$(env_prompt "SMTP_ADMIN_EMAIL" "Absender-Adresse (From)")
  SMTP_SENDER_NEW=$(env_prompt "SMTP_SENDER_NAME" "Absender-Name")
  [[ -z "$SMTP_SENDER_NEW" ]] && SMTP_SENDER_NEW="Umzughelfer"
  echo ""

  echo -e "  ${BOLD}Zusammenfassung:${NC}"
  echo "    Host:    ${SMTP_HOST_NEW}:${SMTP_PORT_NEW}"
  echo "    User:    ${SMTP_USER_NEW}"
  echo "    Sender:  ${SMTP_SENDER_NEW} <${SMTP_ADMIN_NEW}>"
  echo ""
  read -p "  In .env speichern und auth-Container neu starten? [J/n]: " CONFIRM
  [[ "${CONFIRM,,}" == "n" ]] && { echo "  Abgebrochen."; return 0; }

  env_set "SMTP_HOST"                "$SMTP_HOST_NEW"
  env_set "SMTP_PORT"                "$SMTP_PORT_NEW"
  env_set "SMTP_USER"                "$SMTP_USER_NEW"
  env_set "SMTP_PASS"                "$SMTP_PASS_NEW"
  env_set "SMTP_ADMIN_EMAIL"         "$SMTP_ADMIN_NEW"
  env_set "SMTP_SENDER_NAME"         "$SMTP_SENDER_NEW"
  env_set "ENABLE_EMAIL_AUTOCONFIRM" "false"

  success "SMTP-Konfiguration in .env aktualisiert."
  info "Starte auth-Container neu..."
  umzug_compose -f "$COMPOSE_FILE" up -d --force-recreate auth
  success "auth-Container neu gestartet. SMTP ist jetzt aktiv."
  echo ""

  read -p "  Edge Functions jetzt auch deployen und neu starten? [J/n]: " DO_FN_DEPLOY
  if [[ "${DO_FN_DEPLOY,,}" != "n" ]]; then
    DEPLOYED=0
    deploy_edge_functions_to_volumes
    if [[ $DEPLOYED -gt 0 ]]; then
      if restart_edge_functions; then
        success "${DEPLOYED} Function(s) aktualisiert."
      else
        warn "SMTP wurde gespeichert, aber Edge Functions konnten nicht gestartet werden."
      fi
    else
      warn "Keine Functions-Dateien gefunden."
    fi
  fi

  echo ""
  echo -e "  ${BOLD}Tipp:${NC} Einladungen versenden: App → Haushalt → Mitglied einladen"
  weiter
}

modus_config() {
  header "Konfiguration anpassen"

  if [[ ! -f ".env" ]]; then
    warn ".env nicht gefunden. Bitte zuerst eine Installation durchführen."
    weiter; return 0
  fi
  echo ""
  echo -e "  ${BOLD}Was moechtest du konfigurieren?${NC}"
  echo ""
  echo -e "  ${BOLD}[1]${NC} Allgemein (App-URL, Port, Admin-E-Mail)"
  echo -e "  ${BOLD}[2]${NC} Invite-Link auf App-Domain umstellen"
  echo "  [0] Zurueck"
  echo ""
  read -p "  -> Wahl [1]: " CONFIG_CHOICE
  [[ -z "$CONFIG_CHOICE" ]] && CONFIG_CHOICE=1
  [[ "$CONFIG_CHOICE" == "0" ]] && return 0

  if [[ "$CONFIG_CHOICE" == "2" ]]; then
    header "Invite-Link auf App-Domain"
    echo ""

    if [[ "$IS_VOLLSTACK" != "true" ]]; then
      warn "Nur fuer Vollstack-Installation verfuegbar."
      warn "In App-only muss API_EXTERNAL_URL in der externen Supabase gesetzt werden."
      weiter; return 0
    fi

    local SITE_URL_NOW API_EXTERNAL_NOW SUPABASE_PUBLIC_NOW REACT_SUPA_NOW
    SITE_URL_NOW="$(env_get "SITE_URL")"
    API_EXTERNAL_NOW="$(env_get "API_EXTERNAL_URL")"
    SUPABASE_PUBLIC_NOW="$(env_get "SUPABASE_PUBLIC_URL")"
    REACT_SUPA_NOW="$(env_get "REACT_APP_SUPABASE_URL")"

    if [[ -z "$SITE_URL_NOW" ]]; then
      warn "SITE_URL fehlt in .env. Bitte zuerst Option [1] ausfuehren."
      weiter; return 0
    fi

    echo "  Ziel:"
    echo "    API_EXTERNAL_URL -> ${SITE_URL_NOW}"
    echo ""
    echo "  Aktuell:"
    echo "    SITE_URL:               ${SITE_URL_NOW}"
    echo "    API_EXTERNAL_URL:       ${API_EXTERNAL_NOW}"
    echo "    SUPABASE_PUBLIC_URL:    ${SUPABASE_PUBLIC_NOW}"
    echo "    REACT_APP_SUPABASE_URL: ${REACT_SUPA_NOW}"
    print_url_role_warnings
    echo ""
    read -p "  Umstellen? [J/n]: " DO_SWITCH
    if [[ "${DO_SWITCH,,}" == "n" ]]; then
      echo "  Abgebrochen."
      weiter; return 0
    fi

    env_set "API_EXTERNAL_URL" "$SITE_URL_NOW"
    local MAILER_INVITE_NOW
    MAILER_INVITE_NOW="$(env_get "MAILER_URLPATHS_INVITE")"
    if [[ -z "$MAILER_INVITE_NOW" ]]; then
      env_set "MAILER_URLPATHS_INVITE" "/auth/v1/verify"
    fi

    success "API_EXTERNAL_URL auf App-Domain gesetzt."
    echo ""
    read -p "  auth + mail-templates jetzt neu laden? [J/n]: " DO_RELOAD_AUTH
    if [[ "${DO_RELOAD_AUTH,,}" != "n" ]]; then
      mit_spinner "auth + mail-templates werden neu geladen" \
        umzug_compose -f "$COMPOSE_FILE" up -d --force-recreate mail-templates auth || {
        warn "Neustart fehlgeschlagen. Bitte Status pruefen: docker compose -f ${COMPOSE_FILE} ps"
        weiter; return 0
      }
      success "auth + mail-templates neu geladen."
    else
      warn "Aenderung aktiv nach manuellem Neustart von auth/mail-templates."
    fi

    echo ""
    warn "Wichtig: Nginx auf der App-Domain muss /auth/v1/ nach :8000 weiterleiten."
    echo "  Danach auf dem Host ausfuehren:"
    echo "    sudo nginx -t && sudo systemctl reload nginx"
    echo ""
    echo "  Fuer komplettes Nachladen nach Datei-Updates:"
    echo "    manage.sh -> [2] Update -> [5] Server-Sync komplett"
    weiter
    return 0
  fi

  if [[ "$CONFIG_CHOICE" != "1" ]]; then
    warn "Ungueltige Auswahl."
    weiter; return 0
  fi

  echo ""
  echo -e "  ${DIM}Aktuelle Werte aus .env werden als Vorschlag angezeigt.${NC}"
  echo -e "  ${DIM}Nur geänderte Werte werden gespeichert (App-URL/Port → Rebuild nötig).${NC}"
  echo ""

  print_url_role_warnings

  local CHANGED=false
  local AUTH_CONFIG_CHANGED=false

  local OLD_URL NEW_URL
  OLD_URL="$(env_get "SITE_URL")"
  [[ -z "$OLD_URL" ]] && OLD_URL="$(env_get "APP_URL")"
  [[ -z "$OLD_URL" ]] && OLD_URL="$(env_get "REACT_APP_PASSWORD_RESET_REDIRECT_URL" | sed 's#/update-password$##')"
  NEW_URL=$(env_prompt "SITE_URL" "App-URL oder lokale Adresse (z.B. https://umzug.meine-domain.de oder http://localhost:3000)")
  if [[ -n "$NEW_URL" && "$NEW_URL" != "$OLD_URL" ]]; then
    env_set "APP_URL"                               "$NEW_URL"
    env_set "SITE_URL"                              "$NEW_URL"
    AUTH_CONFIG_CHANGED=true
    env_set "REACT_APP_PASSWORD_RESET_REDIRECT_URL" "${NEW_URL}/update-password"
    env_set "ADDITIONAL_REDIRECT_URLS" "$(umzug_redirect_allowlist "$(env_get ADDITIONAL_REDIRECT_URLS)" "$NEW_URL" "$OLD_URL")"
    env_set "OLLAMA_ORIGINS"                        "$NEW_URL"
    warn "App-URL geändert → App-Rebuild erforderlich."
    CHANGED=true
  fi

  local OLD_SUPABASE_URL NEW_SUPABASE_URL
  OLD_SUPABASE_URL="$(env_get "REACT_APP_SUPABASE_URL")"
  [[ -z "$OLD_SUPABASE_URL" ]] && OLD_SUPABASE_URL="$(env_get "SUPABASE_PUBLIC_URL")"
  [[ -z "$OLD_SUPABASE_URL" ]] && OLD_SUPABASE_URL="$(env_get "API_EXTERNAL_URL")"
  NEW_SUPABASE_URL=$(env_prompt "REACT_APP_SUPABASE_URL" "Supabase-URL / API (z.B. https://supa.meine-domain.de oder http://localhost:8000)")
  if [[ -n "$NEW_SUPABASE_URL" && "$NEW_SUPABASE_URL" != "$OLD_SUPABASE_URL" ]]; then
    env_set "REACT_APP_SUPABASE_URL" "$NEW_SUPABASE_URL"
    AUTH_CONFIG_CHANGED=true
    if [[ -n "$(env_get "SUPABASE_PUBLIC_URL")" ]]; then
      env_set "SUPABASE_PUBLIC_URL" "$NEW_SUPABASE_URL"
    fi
    if [[ -n "$(env_get "API_EXTERNAL_URL")" ]]; then
      env_set "API_EXTERNAL_URL" "$NEW_SUPABASE_URL"
    fi
    warn "Supabase-URL geändert → App-Rebuild erforderlich."
    CHANGED=true
  fi

  local OLD_PORT NEW_PORT
  OLD_PORT="$(env_get "APP_PORT")"
  NEW_PORT=$(env_prompt "APP_PORT" "App-Port")
  if [[ -n "$NEW_PORT" && "$NEW_PORT" != "$OLD_PORT" ]]; then
    env_set "APP_PORT" "$NEW_PORT"
    warn "Port geändert → Container-Neustart erforderlich."
    CHANGED=true
  fi

  local OLD_EMAIL NEW_EMAIL
  OLD_EMAIL="$(env_get "SMTP_ADMIN_EMAIL")"
  NEW_EMAIL=$(env_prompt "SMTP_ADMIN_EMAIL" "Admin-E-Mail (für Push + SMTP)")
  if [[ -n "$NEW_EMAIL" && "$NEW_EMAIL" != "$OLD_EMAIL" ]]; then
    env_set "SMTP_ADMIN_EMAIL" "$NEW_EMAIL"
    env_set "VAPID_SUBJECT"    "mailto:${NEW_EMAIL}"
    success "Admin-E-Mail aktualisiert."
    CHANGED=true
  fi

  if [[ "$CHANGED" == "false" ]]; then
    echo ""; dim "  Keine Änderungen vorgenommen."; weiter; return 0
  fi

  echo ""
  success ".env aktualisiert."
  echo ""
  read -p "  App-Container jetzt neu bauen und starten? [J/n]: " DO_REBUILD
  if [[ "${DO_REBUILD,,}" != "n" ]]; then
    mit_spinner "App-Container wird gebaut (kann 2-5 Min dauern)" \
      umzug_compose -f "$COMPOSE_FILE" build umzugsplaner-app
    mit_spinner "Container wird neu gestartet" \
      umzug_compose -f "$COMPOSE_FILE" up -d --force-recreate umzugsplaner-app
    if [[ "$IS_VOLLSTACK" == true && "$AUTH_CONFIG_CHANGED" == true ]]; then
      mit_spinner "Anmeldedienst und Mailvorlagen neu laden" umzug_compose -f "$COMPOSE_FILE" up -d --force-recreate auth mail-templates
    fi
    success "App neu gestartet."
    local NEW_URL_FINAL
    NEW_URL_FINAL="$(env_get "SITE_URL")"
    [[ -n "$NEW_URL_FINAL" ]] && echo -e "  App: ${CYAN}${NEW_URL_FINAL}${NC}"
  else
    warn "Änderungen erst aktiv nach manuellem Neustart:"
    echo "  docker compose -f ${COMPOSE_FILE} up -d --force-recreate"
  fi
  weiter
}

modus_ollama() {
  header "Ollama konfigurieren"

  echo ""
  echo "  Wie ist dein Ollama-Server installiert?"
  echo ""
  echo "  [1] Direkt auf Linux (systemd-Dienst)"
  echo "  [2] Als Docker-Container (dieser oder anderer Server)"
  echo "  [3] Externer Server (nur URL aktualisieren)"
  echo "  [0] Zurück"
  echo ""
  read -p "  → Wahl [1]: " OLLAMA_SETUP
  [[ -z "$OLLAMA_SETUP" ]] && OLLAMA_SETUP=1
  [[ "$OLLAMA_SETUP" == "0" ]] && return 0

  echo ""
  local OLLAMA_EXTERNAL_URL=""

  if [[ "$OLLAMA_SETUP" == "1" ]]; then
    header "Ollama — Linux systemd"
    local OLLAMA_APP_URL
    read -p "  App-URL (für CORS, z.B. https://umzug.meine-domain.de): " OLLAMA_APP_URL
    [[ -z "$OLLAMA_APP_URL" ]] && OLLAMA_APP_URL="*"

    echo ""
    info "Konfiguriere OLLAMA_ORIGINS im systemd-Dienst..."

    if command -v systemctl >/dev/null 2>&1 && systemctl list-units --type=service 2>/dev/null | grep -q ollama; then
      local OVERRIDE_DIR="/etc/systemd/system/ollama.service.d"
      sudo mkdir -p "$OVERRIDE_DIR"
      sudo tee "$OVERRIDE_DIR/cors.conf" > /dev/null << SYSD
[Service]
Environment="OLLAMA_ORIGINS=${OLLAMA_APP_URL}"
SYSD
      sudo systemctl daemon-reload
      sudo systemctl restart ollama
      success "OLLAMA_ORIGINS=${OLLAMA_APP_URL} gesetzt und Dienst neu gestartet."
    else
      warn "Systemd-Dienst 'ollama' nicht gefunden. Manuelle Einrichtung:"
      echo ""
      echo "  sudo systemctl edit ollama"
      echo "  → Einfügen:"
      echo "    [Service]"
      echo "    Environment=\"OLLAMA_ORIGINS=${OLLAMA_APP_URL}\""
      echo ""
      echo "  Dann: sudo systemctl daemon-reload && sudo systemctl restart ollama"
    fi

    echo ""
    info "Nginx-Konfiguration für Ollama (CORS-Proxy):"
    echo ""
    echo "  location / {"
    echo "      proxy_pass http://127.0.0.1:11434;"
    echo "      proxy_http_version 1.1;"
    echo "      proxy_set_header Host \$host;"
    echo "      proxy_read_timeout 300s;"
    echo "      add_header 'Access-Control-Allow-Origin' '${OLLAMA_APP_URL}' always;"
    echo "      add_header 'Access-Control-Allow-Methods' 'GET, POST, OPTIONS' always;"
    echo "      add_header 'Access-Control-Allow-Headers' 'Content-Type, Authorization' always;"
    echo "      if (\$request_method = OPTIONS) { return 204; }"
    echo "  }"
    echo ""
    read -p "  Ollama-URL in .env aktualisieren? (z.B. https://gpt.meine-domain.de) [Enter = überspringen]: " OLLAMA_EXTERNAL_URL

  elif [[ "$OLLAMA_SETUP" == "2" ]]; then
    header "Ollama — Docker"
    OLLAMA_MANAGED=n
    if [[ "$IS_VOLLSTACK" == true ]]; then
      read -rp "  Compose-Dienst dieser Installation verwenden? [J/n]: " OLLAMA_MANAGED
      OLLAMA_MANAGED=${OLLAMA_MANAGED:-j}
    fi
    if [[ "${OLLAMA_MANAGED,,}" == j || "${OLLAMA_MANAGED,,}" == y ]]; then
      umzug_store_setting "$PROJECT_DIR" OLLAMA_INSTALLED true || return 1
      echo "  Im Installationsordner starten (festgelegte Version, App-Netz):"
      umzug_print_ollama_start "$PROJECT_DIR"
      OLLAMA_EXTERNAL_URL="http://ollama:11434"
    else
      echo "  Ollama auf dem anderen Host einrichten; die Adresse muss vom Backend erreichbar sein."
      read -rp "  Vom Backend erreichbare Ollama-URL (LAN-IP oder Domain): " OLLAMA_EXTERNAL_URL
    fi
    read -rp "  '${OLLAMA_EXTERNAL_URL}' als URL-Vorschlag speichern? [j/N]: " CONFIRM_URL
    [[ "${CONFIRM_URL,,}" != j && "${CONFIRM_URL,,}" != y ]] && OLLAMA_EXTERNAL_URL=""

  else
    header "Ollama — Externer Server"
    read -p "  Ollama Basis-URL (z.B. https://gpt.meine-domain.de): " OLLAMA_EXTERNAL_URL
    if [[ -z "$OLLAMA_EXTERNAL_URL" ]]; then
      warn "Keine URL angegeben."; weiter; return 0
    fi
    echo ""
    warn "Wichtig: Dein externer Ollama-Server muss CORS-Header zurückgeben."
  fi

  if [[ -n "$OLLAMA_EXTERNAL_URL" && -f ".env" ]]; then
    if grep -q "^OLLAMA_EXTERNAL_URL=" .env; then
      sed -i "s|^OLLAMA_EXTERNAL_URL=.*|OLLAMA_EXTERNAL_URL=${OLLAMA_EXTERNAL_URL}|" .env
    else
      echo "OLLAMA_EXTERNAL_URL=${OLLAMA_EXTERNAL_URL}" >> .env
    fi
    success ".env mit Ollama-URL aktualisiert: ${OLLAMA_EXTERNAL_URL}"
    echo ""
    echo "  In der App: Profil → KI-Einstellungen → Ollama → Basis-URL:"
    echo "  ${OLLAMA_EXTERNAL_URL}"
    echo "  Diese Adresse im App-Profil übernehmen; die .env speichert nur den Vorschlag."
  fi

  echo ""
  success "Ollama-Konfiguration abgeschlossen."
  weiter
}

modus_update() {
  local UPDATE_RESULT=0
  while true; do
    clear
    echo ""
    echo -e "${BOLD}${GREEN}============================================================${NC}"
    echo -e "${BOLD}${GREEN}  Umzughelfer — Update & Wartung${NC}"
    echo -e "${BOLD}${GREEN}============================================================${NC}"
    echo ""

    if [[ ! -f ".env" ]]; then
      warn ".env nicht gefunden. Bitte zuerst eine Installation durchführen."
      weiter; return 0
    fi

    if [[ "$IS_VOLLSTACK" == "true" ]]; then
      echo -e "  Installation: ${CYAN}Vollstack (Supabase + App)${NC}"
    else
      echo -e "  Installation: ${CYAN}App-only${NC}"
    fi
    local APP_URL_NOW
    APP_URL_NOW="$(env_get "SITE_URL")"
    [[ -n "$APP_URL_NOW" ]] && echo -e "  App-URL:      ${CYAN}${APP_URL_NOW}${NC}"
    echo ""
    echo -e "  ${BOLD}Was möchtest du tun?${NC}"
    echo ""
    echo -e "  ${BOLD}[1]${NC} App-Update          — git pull + neu bauen + neu starten"
    echo -e "  ${BOLD}[2]${NC} Nur App neu bauen   — ohne git pull (nach lokalen Änderungen)"
    echo -e "  ${BOLD}[3]${NC} Edge Functions      — supabase/functions/ deployen + neu starten"
    echo -e "  ${BOLD}[4]${NC} Docker-Images       — alle Images aktualisieren + neu starten"
    echo -e "  ${BOLD}[5]${NC} Server-Sync komplett — App, lokale Dienste und Functions aktualisieren"
    echo "  [0] Zurück zum Hauptmenü"
    echo ""
    read -p "  → Wahl [0]: " UPDATE_CHOICE
    [[ -z "$UPDATE_CHOICE" ]] && UPDATE_CHOICE=0

    case "$UPDATE_CHOICE" in
      0) return "$UPDATE_RESULT" ;;

      1)
        header "App-Update"
        local BEFORE_UPDATE_REF="" AFTER_UPDATE_REF=""
        KONG_RELOAD_REASON=""
        if command -v git >/dev/null 2>&1 && [[ -d ".git" ]]; then
          echo ""
          local CURRENT_BRANCH CURRENT_COMMIT BEHIND
          BEFORE_UPDATE_REF="$(git rev-parse HEAD 2>/dev/null || true)"
          CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unbekannt")
          CURRENT_COMMIT=$(git log --oneline -1 2>/dev/null || echo "unbekannt")
          echo -e "  Branch:  ${CYAN}${CURRENT_BRANCH}${NC}"
          echo -e "  Commit:  ${DIM}${CURRENT_COMMIT}${NC}"
          echo ""
          git fetch --quiet 2>/dev/null || warn "git fetch fehlgeschlagen (kein Netzwerk?)"
          BEHIND=$(git rev-list HEAD..@{u} --count 2>/dev/null || echo "0")
          if [[ "$BEHIND" -gt 0 ]]; then
            echo -e "  ${GREEN}${BEHIND} neue Commits verfügbar.${NC}"
          else
            echo -e "  ${DIM}Keine neuen Commits — Repository ist aktuell.${NC}"
          fi
          echo ""
          read -p "  git pull ausführen? [J/n]: " DO_PULL
          if [[ "${DO_PULL,,}" != "n" ]]; then
            info "Führe git pull aus..."
            if git pull; then
              success "Repository aktualisiert."
            else
              warn "git pull fehlgeschlagen. Update abgebrochen; fuer einen lokalen Neubau Option [2] verwenden."
              UPDATE_RESULT=1; weiter; continue
            fi
          fi
          AFTER_UPDATE_REF="$(git rev-parse HEAD 2>/dev/null || true)"
        else
          warn "Kein Git-Repository gefunden. Überspringe git pull."
        fi

        echo ""
        read -p "  Benötigte Images jetzt neu bauen und starten? [J/n]: " CONFIRM
        if [[ "${CONFIRM,,}" == "n" ]]; then echo "  Abgebrochen."; weiter; continue; fi

        mit_spinner "App und lokale Dienstimages werden gebaut (unveränderte Schritte aus dem Cache)" \
          umzug_build_update_images "$COMPOSE_FILE" "$IS_VOLLSTACK" || {
          warn "Image-Build fehlgeschlagen; laufende Container bleiben unverändert."
          UPDATE_RESULT=1; weiter; continue
        }

        echo ""
        info "Pruefe optionale Performance-Indizes..."
        apply_fast_mutation_hotfix || {
          warn "Update abgebrochen: Datenbank-Hotfix fehlgeschlagen."
          UPDATE_RESULT=1; weiter; continue
        }

        echo ""
        info "Aktualisiere Edge Functions..."
        DEPLOYED=0; deploy_edge_functions_to_volumes
        [[ $DEPLOYED -gt 0 ]] && success "${DEPLOYED} Function(s) aktualisiert." || dim "  Keine Functions-Dateien gefunden."
        if [[ "$IS_VOLLSTACK" == "true" ]]; then
          ensure_fullstack_update_prereqs || { UPDATE_RESULT=1; weiter; continue; }
          maybe_reload_kong_for_git_range "$BEFORE_UPDATE_REF" "$AFTER_UPDATE_REF"
          reload_kong_if_needed "$KONG_RELOAD_REASON" || { UPDATE_RESULT=1; weiter; continue; }
        fi
        echo ""
        mit_spinner "Container werden neu gestartet" \
          umzug_compose -f "$COMPOSE_FILE" up -d --force-recreate umzugsplaner-app || {
          warn "Neustart fehlgeschlagen. Status prüfen: docker compose ps"
          UPDATE_RESULT=1; weiter; continue
        }

        mit_spinner "Lokale Dienste werden aktualisiert und geprüft" \
          umzug_start_updated_local_services "$COMPOSE_FILE" "$IS_VOLLSTACK" || {
          warn "Lokale Dienste konnten nicht aktualisiert werden."
          UPDATE_RESULT=1; weiter; continue
        }

        if [[ "$IS_VOLLSTACK" == "true" && $DEPLOYED -gt 0 ]]; then
          restart_edge_functions || {
            warn "Update abgebrochen: Edge Functions laufen nicht."
            UPDATE_RESULT=1; weiter; continue
          }
          check_supabase_studio_access
        fi

        echo ""
        success "Update abgeschlossen."
        local NEW_COMMIT
        NEW_COMMIT=$(git log --oneline -1 2>/dev/null || echo "")
        [[ -n "$NEW_COMMIT" ]] && dim "  Aktueller Stand: ${NEW_COMMIT}"
        echo ""
        APP_URL_NOW="$(env_get "SITE_URL")"
        [[ -n "$APP_URL_NOW" ]] && echo -e "  App erreichbar: ${CYAN}${APP_URL_NOW}${NC}"
        weiter
        ;;

      2)
        header "App neu bauen"
        KONG_RELOAD_REASON=""
        echo ""
        echo "  Compose-Datei: ${COMPOSE_FILE}"
        echo ""
        read -p "  App-Container neu bauen und starten? [J/n]: " CONFIRM
        if [[ "${CONFIRM,,}" == "n" ]]; then echo "  Abgebrochen."; weiter; continue; fi

        ensure_fullstack_update_prereqs || { UPDATE_RESULT=1; weiter; continue; }
        mit_spinner "App-Container wird gebaut (kann 2-5 Min dauern)" \
          umzug_compose -f "$COMPOSE_FILE" build umzugsplaner-app || {
          warn "Build fehlgeschlagen. Logs prüfen: docker compose logs umzugsplaner-app"
          UPDATE_RESULT=1; weiter; continue
        }
        mit_spinner "Container wird neu gestartet" \
          umzug_compose -f "$COMPOSE_FILE" up -d --force-recreate umzugsplaner-app || {
          warn "Neustart fehlgeschlagen. Status prüfen: docker compose ps"
          UPDATE_RESULT=1; weiter; continue
        }

        [[ "$IS_VOLLSTACK" == "true" ]] && check_supabase_studio_access

        success "App erfolgreich neu gebaut und gestartet."
        APP_URL_NOW="$(env_get "SITE_URL")"
        [[ -n "$APP_URL_NOW" ]] && echo -e "  App: ${CYAN}${APP_URL_NOW}${NC}"
        weiter
        ;;

      3)
        header "Edge Functions deployen"
        KONG_RELOAD_REASON=""
        echo ""
        if [[ "$IS_VOLLSTACK" != "true" ]]; then
          warn "Nur für Vollstack-Installation verfügbar."
          UPDATE_RESULT=1; weiter; continue
        fi
        ensure_fullstack_update_prereqs || { UPDATE_RESULT=1; weiter; continue; }
        reload_kong_if_needed "$KONG_RELOAD_REASON" || { UPDATE_RESULT=1; weiter; continue; }
        DEPLOYED=0; deploy_edge_functions_to_volumes
        if [[ $DEPLOYED -gt 0 ]]; then
          echo ""
          restart_edge_functions || {
            warn "Functions-Deploy fehlgeschlagen."
            UPDATE_RESULT=1; weiter; continue
          }
          success "${DEPLOYED} Function(s) deployt und Container neu gestartet."
          check_supabase_studio_access
        else
          warn "Keine Functions deployt."
        fi
        weiter
        ;;

      4)
        header "Docker-Images aktualisieren"
        KONG_RELOAD_REASON=""
        echo ""
        warn "Alle Docker-Images werden auf die neueste Version aktualisiert."
        warn "Dies kann einige Minuten dauern (~500 MB - 2 GB Downloads)."
        echo ""
        read -p "  Fortfahren? [J/n]: " CONFIRM
        if [[ "${CONFIRM,,}" == "n" ]]; then echo "  Abgebrochen."; weiter; continue; fi

        if [[ "$HAS_OLLAMA" == "true" ]]; then
          mit_spinner "Images werden heruntergeladen (kann 5-15 Min dauern)" \
            umzug_compose -f "$COMPOSE_FILE" --profile ollama pull --ignore-buildable || {
            warn "Image-Download fehlgeschlagen; bestehende Container bleiben unverändert."
            UPDATE_RESULT=1; weiter; continue
          }
        else
          mit_spinner "Images werden heruntergeladen (kann 5-15 Min dauern)" \
            umzug_compose -f "$COMPOSE_FILE" pull --ignore-buildable || {
            warn "Image-Download fehlgeschlagen; bestehende Container bleiben unverändert."
            UPDATE_RESULT=1; weiter; continue
          }
        fi

        echo ""
        mit_spinner "App und lokale Dienstimages werden gebaut (unveränderte Schritte aus dem Cache)" \
          umzug_build_update_images "$COMPOSE_FILE" "$IS_VOLLSTACK" || {
          warn "Image-Build fehlgeschlagen; laufende Container bleiben unverändert."
          UPDATE_RESULT=1; weiter; continue
        }
        ensure_fullstack_update_prereqs || { UPDATE_RESULT=1; weiter; continue; }
        echo ""
        mit_spinner "Kerndienste und optionales Ollama werden getrennt gestartet" \
          umzug_start_stack "$COMPOSE_FILE" "$HAS_OLLAMA" --no-build --wait --wait-timeout 300 || {
          warn "Update unvollständig. Ollama-Fehler stoppen die Kerndienste nicht."
          UPDATE_RESULT=1; weiter; continue
        }

        mit_spinner "Lokale Dienste werden aktualisiert und geprüft" \
          umzug_start_updated_local_services "$COMPOSE_FILE" "$IS_VOLLSTACK" || {
          warn "Lokale Dienste konnten nicht aktualisiert werden."
          UPDATE_RESULT=1; weiter; continue
        }

        if [[ "$IS_VOLLSTACK" == "true" ]] && ! verify_edge_functions_running; then
          warn "Image-Update unvollstaendig: Edge Functions laufen nicht."
          UPDATE_RESULT=1; weiter; continue
        fi
        success "Docker-Images aktualisiert und Container neu gestartet."
        check_supabase_studio_access
        weiter
        ;;

      5)
        header "Server-Sync komplett"
        KONG_RELOAD_REASON=""
        echo ""
        if [[ "$IS_VOLLSTACK" != "true" ]]; then
          warn "Nur für Vollstack-Installation verfügbar."
          UPDATE_RESULT=1; weiter; continue
        fi
        echo "  Dieser Ablauf lädt nach Datei-Kopie alle relevanten Komponenten neu:"
        echo "    1) App- und lokale Dienstimages bauen"
        echo "    2) Edge Functions deployen, App und Dienste aktualisieren"
        echo "    3) mail-templates + auth force-recreate"
        echo "    4) functions neu starten"
        echo ""
        read -p "  Fortfahren? [J/n]: " CONFIRM
        if [[ "${CONFIRM,,}" == "n" ]]; then echo "  Abgebrochen."; weiter; continue; fi

        mit_spinner "App und lokale Dienstimages werden gebaut (unveränderte Schritte aus dem Cache)" \
          umzug_build_update_images "$COMPOSE_FILE" "$IS_VOLLSTACK" || {
          warn "Image-Build fehlgeschlagen; laufende Container bleiben unverändert."
          UPDATE_RESULT=1; weiter; continue
        }
        ensure_fullstack_update_prereqs || { UPDATE_RESULT=1; weiter; continue; }
        reload_kong_if_needed "$KONG_RELOAD_REASON" || { UPDATE_RESULT=1; weiter; continue; }

        echo ""
        info "Pruefe optionale Performance-Indizes..."
        apply_fast_mutation_hotfix || {
          warn "Server-Sync abgebrochen: Datenbank-Hotfix fehlgeschlagen."
          UPDATE_RESULT=1; weiter; continue
        }

        echo ""
        info "Aktualisiere Edge Functions..."
        DEPLOYED=0
        deploy_edge_functions_to_volumes
        [[ $DEPLOYED -gt 0 ]] && success "${DEPLOYED} Function(s) aktualisiert." || warn "Keine Functions-Dateien gefunden."

        echo ""
        mit_spinner "App-Container wird neu gestartet" \
          umzug_compose -f "$COMPOSE_FILE" up -d --force-recreate umzugsplaner-app || {
          warn "Neustart fehlgeschlagen. Status prüfen: docker compose ps"
          UPDATE_RESULT=1; weiter; continue
        }

        echo ""
        mit_spinner "Lokale Dienste werden aktualisiert und geprüft" \
          umzug_start_updated_local_services "$COMPOSE_FILE" "$IS_VOLLSTACK" || {
          warn "Lokale Dienste konnten nicht aktualisiert werden."
          UPDATE_RESULT=1; weiter; continue
        }

        mit_spinner "mail-templates + auth werden neu geladen" \
          umzug_compose -f "$COMPOSE_FILE" up -d --force-recreate mail-templates auth || {
          warn "auth/mail-templates Neustart fehlgeschlagen. Status prüfen: docker compose ps"
          UPDATE_RESULT=1; weiter; continue
        }

        echo ""
        restart_edge_functions || {
          warn "Server-Sync fehlgeschlagen: Edge Functions laufen nicht."
          UPDATE_RESULT=1; weiter; continue
        }

        echo ""
        success "Server-Sync komplett abgeschlossen."
        check_supabase_studio_access
        APP_URL_NOW="$(env_get "SITE_URL")"
        [[ -n "$APP_URL_NOW" ]] && echo -e "  App erreichbar: ${CYAN}${APP_URL_NOW}${NC}"
        weiter
        ;;

      *)
        warn "Ungültige Auswahl."
        sleep 1
        ;;
    esac
  done
}

modus_deinstall() {
  while true; do
    clear
    echo ""
    echo -e "${BOLD}${RED}============================================================${NC}"
    echo -e "${BOLD}${RED}  Umzughelfer — Deinstallation & Bereinigung${NC}"
    echo -e "${BOLD}${RED}============================================================${NC}"
    echo ""

    if [[ "$IS_VOLLSTACK" == "true" ]]; then
      echo -e "  Erkannte Installation: ${CYAN}Vollstack (Supabase + App)${NC}"
    else
      echo -e "  Erkannte Installation: ${CYAN}App-only${NC}"
    fi
    echo ""
    echo "  Was möchtest du tun?"
    echo ""
    echo -e "  ${BOLD}[1] Vollständige Deinstallation${NC}"
    echo "      Container, Docker-Volumes, volumes/, .env, CREDENTIALS.txt"
    echo ""
    echo -e "  ${BOLD}[2] Soft-Reset${NC}"
    echo "      Container + Docker-Volumes entfernen"
    echo "      Behält: volumes/, .env, CREDENTIALS.txt"
    echo ""
    echo -e "  ${BOLD}[3] Nur Container stoppen${NC}"
    echo "      Behält: Volumes, volumes/, .env (schnellster Neustart)"
    echo ""
    echo -e "  ${BOLD}[4] Edge Functions neu deployen${NC}"
    echo "      supabase/functions/ → volumes/functions/ + Container neu starten"
    echo ""
    echo -e "  ${BOLD}[5] Docker-Images entfernen${NC}"
    echo "      Gibt ~3-5 GB Speicher frei"
    echo ""
    echo "  [0] Zurück zum Hauptmenü"
    echo ""
    read -p "  → Wahl [0]: " DEINSTALL_CHOICE
    [[ -z "$DEINSTALL_CHOICE" ]] && DEINSTALL_CHOICE=0

    case "$DEINSTALL_CHOICE" in
      0) return 0 ;;

      3)
        header "Container stoppen"
        read -p "  Container stoppen und entfernen? [j/N]: " CONFIRM
        if [[ "${CONFIRM,,}" != "j" && "${CONFIRM,,}" != "y" ]]; then echo "  Abgebrochen."; weiter; continue; fi
        container_stoppen
        echo ""
        success "Fertig. Neustart mit: docker compose -f ${COMPOSE_FILE} up -d"
        weiter
        ;;

      4)
        header "Edge Functions neu deployen"
        DEPLOYED=0; deploy_edge_functions_to_volumes
        if [[ $DEPLOYED -gt 0 ]]; then
          restart_edge_functions || {
            warn "Functions-Deploy fehlgeschlagen."
            weiter; continue
          }
          success "${DEPLOYED} Function(s) deployt und Container neu gestartet."
        else
          warn "Keine Functions deployt."
        fi
        weiter
        ;;

      5)
        header "Docker-Images entfernen"
        echo ""
        warn "Die Supabase-Docker-Images (~3-5 GB) werden entfernt."
        warn "Die nächste Installation muss alle Images neu herunterladen."
        echo ""
        read -p "  Docker-Images entfernen? [j/N]: " CONFIRM
        if [[ "${CONFIRM,,}" != "j" && "${CONFIRM,,}" != "y" ]]; then echo "  Abgebrochen."; weiter; continue; fi

        info "Entferne Docker-Images..."
        umzug_compose -f "$COMPOSE_FILE" --profile ollama down --rmi all 2>/dev/null || \
        umzug_compose -f "$COMPOSE_FILE" down --rmi all 2>/dev/null || \
        warn "Einige Images konnten nicht entfernt werden."

        read -p "  Auch Docker Build-Cache leeren? [j/N]: " RM_CACHE
        [[ "${RM_CACHE,,}" == "j" || "${RM_CACHE,,}" == "y" ]] && docker builder prune -f

        success "Docker-Images entfernt."
        weiter
        ;;

      1|2)
        local DEINSTALL_MODE
        [[ "$DEINSTALL_CHOICE" == "1" ]] && DEINSTALL_MODE="vollstaendig" || DEINSTALL_MODE="soft"

        echo ""
        if [[ "$DEINSTALL_MODE" == "vollstaendig" ]]; then
          echo "  backups/ bleibt mit Datenbank-Sicherungen und Zugangsdaten erhalten."
          echo -e "  ${RED}${BOLD}ACHTUNG: Diese Aktion löscht die Installation unwiderruflich; backups/ bleibt erhalten!${NC}"
          echo -e "  ${RED}Betroffen: Datenbank, Konfiguration, hochgeladene Dateien.${NC}"
        else
          echo -e "  ${YELLOW}Container und Docker-Volumes werden entfernt.${NC}"
          echo -e "  ${YELLOW}volumes/, .env und CREDENTIALS.txt bleiben erhalten.${NC}"
        fi
        echo ""
        read -p "  Fortfahren? [j/N]: " FINAL_CONFIRM
        if [[ "${FINAL_CONFIRM,,}" != "j" && "${FINAL_CONFIRM,,}" != "y" ]]; then echo "  Abgebrochen."; weiter; continue; fi

        header "Schritt 1: Konfiguration sichern"
        if [[ -f ".env" || -f "CREDENTIALS.txt" ]]; then
          read -p "  .env und CREDENTIALS.txt vorher sichern? [J/n]: " DO_BACKUP
          if [[ "${DO_BACKUP,,}" != "n" ]]; then
            local CFG_BACKUP_DIR="backups/config_$(date +%Y%m%d_%H%M%S)_${RANDOM}"
            mkdir -p backups
            chmod 700 backups
            (umask 077; mkdir "$CFG_BACKUP_DIR")
            [[ -f ".env" ]]            && cp .env            "$CFG_BACKUP_DIR/.env"            && echo "    OK .env gesichert"
            [[ -f "CREDENTIALS.txt" ]] && cp CREDENTIALS.txt "$CFG_BACKUP_DIR/CREDENTIALS.txt" && echo "    OK CREDENTIALS.txt gesichert"
            find "$CFG_BACKUP_DIR" -maxdepth 1 -type f -exec chmod 600 {} +
            success "Backup gespeichert in: ${CFG_BACKUP_DIR}/"
          else
            warn "Kein Backup erstellt."
          fi
        fi

        header "Schritt 2: Container stoppen"
        container_stoppen

        header "Schritt 3: Docker Volumes entfernen"
        volumes_entfernen

        if [[ "$DEINSTALL_MODE" == "vollstaendig" ]]; then
          header "Schritt 4: volumes/-Verzeichnis entfernen"
          if [[ -d "volumes" ]]; then
            echo ""
            warn "Das volumes/-Verzeichnis enthält alle PostgreSQL-Daten,"
            warn "Supabase-Konfigurationen, Edge Functions und Storage-Dateien."
            echo ""
            read -p "  volumes/-Verzeichnis löschen? [j/N]: " CONFIRM_VOL
            if [[ "${CONFIRM_VOL,,}" == "j" || "${CONFIRM_VOL,,}" == "y" ]]; then
              rm -rf volumes/
              success "volumes/-Verzeichnis gelöscht."
            else
              warn "volumes/ wurde NICHT gelöscht."
            fi
          else
            info "volumes/-Verzeichnis nicht gefunden."
          fi

          header "Schritt 5: Konfigurationsdateien entfernen"
          local ENTFERNT=false
          [[ -f ".env" ]]            && rm .env            && echo "    OK .env entfernt"            && ENTFERNT=true
          [[ -f "CREDENTIALS.txt" ]] && rm CREDENTIALS.txt && echo "    OK CREDENTIALS.txt entfernt" && ENTFERNT=true
          [[ "$ENTFERNT" == "true" ]] && success "Konfigurationsdateien entfernt." || info "Keine Konfigurationsdateien gefunden."

          header "Schritt 6: Docker-Images (optional)"
          echo ""
          read -p "  Docker-Images entfernen? (~3-5 GB) [j/N]: " RM_IMAGES
          if [[ "${RM_IMAGES,,}" == "j" || "${RM_IMAGES,,}" == "y" ]]; then
            umzug_compose -f "$COMPOSE_FILE" --profile ollama down --rmi all 2>/dev/null || \
            umzug_compose -f "$COMPOSE_FILE" down --rmi all 2>/dev/null || true
            success "Docker-Images entfernt."
          fi

          header "Schritt 7: Build-Cache (optional)"
          read -p "  Docker Build-Cache leeren? [j/N]: " RM_CACHE
          [[ "${RM_CACHE,,}" == "j" || "${RM_CACHE,,}" == "y" ]] && docker builder prune -f && success "Build-Cache geleert."
        fi

        echo ""
        echo -e "${BOLD}${GREEN}============================================================${NC}"
        success "Abgeschlossen!"
        echo -e "${BOLD}${GREEN}============================================================${NC}"
        echo ""
        if [[ "$DEINSTALL_MODE" == "vollstaendig" ]]; then
          echo "  Alle Komponenten wurden entfernt."
        else
          echo "  Container und Docker-Volumes entfernt."
          echo "  volumes/, .env und CREDENTIALS.txt sind noch vorhanden."
        fi
        weiter
        ;;

      *)
        warn "Ungültige Auswahl."
        sleep 1
        ;;
    esac
  done
}

modus_installation() {
  while true; do
  local ZURUECK=false

  # Installationstyp wählen
  clear
  echo ""
  echo -e "${BOLD}${GREEN}============================================================${NC}"
  echo -e "${BOLD}${GREEN}  Umzughelfer — Installation${NC}"
  echo -e "${BOLD}${GREEN}============================================================${NC}"
  echo ""

  if [[ -f ".env" ]]; then
    echo -e "  ${YELLOW}⚠  Bestehende Installation erkannt (.env vorhanden)${NC}"
    echo ""
  fi

  echo "  Installationstyp wählen:"
  echo ""
  echo "  [1] Neuinstallation — Vollstack (Supabase + App via Docker)"
  echo "  [2] Neuinstallation — App only  (bestehende Supabase nutzen)"
  echo "  [0] Zurück zum Hauptmenü"
  echo ""
  read -p "  → Wahl [1]: " INSTALL_TYPE_CHOICE
  [[ -z "$INSTALL_TYPE_CHOICE" ]] && INSTALL_TYPE_CHOICE=1
  [[ "$INSTALL_TYPE_CHOICE" == "0" ]] && return 0

  local INSTALL_MODE
  case "$INSTALL_TYPE_CHOICE" in
    1) INSTALL_MODE="vollstack" ;;
    2) INSTALL_MODE="apponly" ;;
    *) warn "Ungültige Auswahl."; sleep 1; continue ;;
  esac

  local DB_SCHEMA_STATUS="nicht ausgeführt"
  local MULTIUSER_SCHEMA_STATUS="nicht ausgeführt"

  # ---- Schritt 1: Voraussetzungen ----
  header "Schritt 1: Voraussetzungen prüfen"

  command -v docker >/dev/null 2>&1      || err "Docker ist nicht installiert.\n  → https://docs.docker.com/get-docker/"
  umzug_compose version >/dev/null 2>&1 || err "Docker Compose Plugin fehlt.\n  → Docker aktualisieren oder Plugin installieren."
  command -v node >/dev/null 2>&1        || err "Node.js ist nicht installiert.\n  → https://nodejs.org/"
  command -v openssl >/dev/null 2>&1     || err "openssl ist nicht installiert.\n  → sudo apt install openssl"

  local NODE_VERSION
  NODE_VERSION=$(node -e "console.log(process.version.slice(1).split('.')[0])")
  [[ "$NODE_VERSION" -lt 16 ]] && err "Node.js Version ${NODE_VERSION} zu alt. Mindestens Version 16 erforderlich."

  success "Alle Voraussetzungen erfüllt."

  # ---- Schritt 2: Konfiguration ----
  header "Schritt 2: Konfiguration"

  echo "Bitte gib folgende Informationen ein."
  echo "(Enter drücken für den Standardwert)"
  echo ""

  local APP_URL ADMIN_EMAIL APP_PORT SUPABASE_URL STUDIO_PASSWORD EXT_ANON_KEY EXT_SERVICE_ROLE_KEY
  local ACCESS_LABEL STUDIO_ACCESS_URL

  while true; do
    read -p "  Deine E-Mail-Adresse (für Push-Notifications, 0 = Abbrechen): " ADMIN_EMAIL
    [[ "$ADMIN_EMAIL" == "0" ]] && { ZURUECK=true; break; }
    [[ -n "$ADMIN_EMAIL" ]] && break
    echo "  → E-Mail ist erforderlich."
  done
  [[ "$ZURUECK" == "true" ]] && continue

  read -p "  App-Port [3000]: " APP_PORT
  [[ -z "$APP_PORT" ]] && APP_PORT=3000

  echo ""
  if ! prompt_install_access_urls "$INSTALL_MODE" "$APP_PORT"; then
    ZURUECK=true
  fi
  [[ "$ZURUECK" == "true" ]] && continue

  APP_URL="$INSTALL_APP_URL"
  ACCESS_LABEL="$INSTALL_ACCESS_LABEL"

  if [[ "$INSTALL_MODE" == "vollstack" ]]; then
    SUPABASE_URL="$INSTALL_SUPABASE_URL"
    if [[ "$INSTALL_ACCESS_MODE" == "lan" && -n "$INSTALL_ACCESS_HOST" ]]; then
      STUDIO_ACCESS_URL="http://${INSTALL_ACCESS_HOST}:8000"
    else
      STUDIO_ACCESS_URL="http://localhost:8000"
    fi

    while true; do
      read -s -p "  Supabase Studio Passwort (mind. 8 Zeichen, 0 = Abbrechen): " STUDIO_PASSWORD
      echo ""
      [[ "$STUDIO_PASSWORD" == "0" ]] && { ZURUECK=true; break; }
      [[ ${#STUDIO_PASSWORD} -ge 8 ]] && break
      echo "  → Passwort muss mindestens 8 Zeichen lang sein."
    done
    [[ "$ZURUECK" == "true" ]] && continue
  else
    echo ""
    info "Zugangsdaten der bestehenden Supabase-Instanz eingeben."
    info "Zu finden unter: Supabase Dashboard → Project Settings → API"
    echo ""

    while true; do
      read -p "  Supabase URL (0 = Abbrechen): " SUPABASE_URL
      [[ "$SUPABASE_URL" == "0" ]] && { ZURUECK=true; break; }
      [[ -n "$SUPABASE_URL" ]] && break
      echo "  → Supabase URL ist erforderlich."
    done
    [[ "$ZURUECK" == "true" ]] && continue

    while true; do
      read -p "  Supabase Anon Key (0 = Abbrechen): " EXT_ANON_KEY
      [[ "$EXT_ANON_KEY" == "0" ]] && { ZURUECK=true; break; }
      [[ -n "$EXT_ANON_KEY" ]] && break
      echo "  → Anon Key ist erforderlich."
    done
    [[ "$ZURUECK" == "true" ]] && continue

    while true; do
      read -s -p "  Supabase Service Role Key (GEHEIM, 0 = Abbrechen): " EXT_SERVICE_ROLE_KEY
      echo ""
      [[ "$EXT_SERVICE_ROLE_KEY" == "0" ]] && { ZURUECK=true; break; }
      [[ -n "$EXT_SERVICE_ROLE_KEY" ]] && break
      echo "  → Service Role Key ist erforderlich."
    done
    [[ "$ZURUECK" == "true" ]] && continue
  fi

  # ---- Ollama ----
  echo ""
  echo "  KI-Assistent — Ollama:"
  echo "  [1] Ollama via Docker mitinstallieren"
  echo "  [2] Externer / bereits laufender Ollama-Server"
  echo "  [3] Kein Ollama (nur OpenAI oder kein KI-Assistent)"
  read -p "  → Wahl [3]: " OLLAMA_CHOICE
  [[ -z "$OLLAMA_CHOICE" ]] && OLLAMA_CHOICE=3

  local INSTALL_OLLAMA=false
  local OLLAMA_PORT=11434
  local OLLAMA_EXTERNAL_URL=""

  if [[ "$OLLAMA_CHOICE" == "1" ]]; then
    INSTALL_OLLAMA=true
    OLLAMA_EXTERNAL_URL="http://ollama:11434"
    read -p "  Ollama Port [11434]: " OLLAMA_PORT
    [[ -z "$OLLAMA_PORT" ]] && OLLAMA_PORT=11434
    info "Ollama wird via Docker-Profil 'ollama' mitgestartet."
    info "Modell nach Installation laden: docker exec ollama ollama pull llama3.2"
  elif [[ "$OLLAMA_CHOICE" == "2" ]]; then
    read -p "  Basis-URL deines Ollama-Servers: " OLLAMA_EXTERNAL_URL
    if [[ -z "$OLLAMA_EXTERNAL_URL" ]]; then
      warn "Keine URL angegeben. Ollama wird nicht konfiguriert."
    else
      warn "Stelle sicher dass CORS auf dem Ollama-Server erlaubt ist."
    fi
  fi

  # ---- SMTP optional ----
  echo ""
  echo "  ──────────────────────────────────────────────────────"
  echo "  SMTP (E-Mail-Versand) — optional konfigurieren?"
  echo "  Ermöglicht Registrierungsbestätigungen und Einladungs-Mails."
  echo "  ──────────────────────────────────────────────────────"
  read -p "  SMTP jetzt einrichten? [j/N]: " DO_SMTP_NOW

  local SMTP_HOST_VAL="smtp.example.com"
  local SMTP_PORT_VAL=587
  local SMTP_USER_VAL=""
  local SMTP_PASS_VAL=""
  local SMTP_SENDER_VAL="Umzughelfer"

  if [[ "${DO_SMTP_NOW,,}" == "j" || "${DO_SMTP_NOW,,}" == "y" ]]; then
    echo ""
    read -p "  SMTP Host (z.B. smtp.gmail.com): " SMTP_HOST_VAL
    [[ -z "$SMTP_HOST_VAL" ]] && SMTP_HOST_VAL="smtp.example.com"
    read -p "  SMTP Port [587]: " SMTP_PORT_VAL
    [[ -z "$SMTP_PORT_VAL" ]] && SMTP_PORT_VAL=587
    read -p "  SMTP Benutzername / E-Mail: " SMTP_USER_VAL
    echo -e "  ${DIM}(stumme Eingabe)${NC}"
    read -s -p "  SMTP Passwort: " SMTP_PASS_VAL; echo ""
    read -p "  Absender-Name [Umzughelfer]: " SMTP_SENDER_VAL
    [[ -z "$SMTP_SENDER_VAL" ]] && SMTP_SENDER_VAL="Umzughelfer"
    echo ""
    success "SMTP-Einstellungen werden in .env gespeichert."
  fi

  echo ""
  success "Konfiguration abgeschlossen."

  # ---- Schritt 3: Schlüssel generieren ----
  header "Schritt 3: Sicherheitsschlüssel generieren"

  info "Generiere kryptografische Schlüssel..."
  local KEYS_JSON
  KEYS_JSON=$(node scripts/generate-keys.js) || err "Schlüsselgenerierung fehlgeschlagen."

  extract_key() {
    echo "$KEYS_JSON" | node -e "
      let d = '';
      process.stdin.resume();
      process.stdin.on('data', c => d += c);
      process.stdin.on('end', () => console.log(JSON.parse(d)['$1']));
    "
  }

  local VAPID_PUBLIC_KEY VAPID_PRIVATE_KEY
  VAPID_PUBLIC_KEY=$(extract_key VAPID_PUBLIC_KEY)
  VAPID_PRIVATE_KEY=$(extract_key VAPID_PRIVATE_KEY)
  local DOCUMENT_OCR_INTERNAL_TOKEN
  local RECIPE_PARSER_INTERNAL_TOKEN
  RECIPE_PARSER_INTERNAL_TOKEN=$(extract_key RECIPE_PARSER_INTERNAL_TOKEN)
  DOCUMENT_OCR_INTERNAL_TOKEN=$(extract_key DOCUMENT_OCR_INTERNAL_TOKEN)

  local ANON_KEY SERVICE_ROLE_KEY
  local POSTGRES_PASSWORD JWT_SECRET SECRET_KEY_BASE VAULT_ENC_KEY PG_META_CRYPTO_KEY
  local LOGFLARE_PUBLIC LOGFLARE_PRIVATE S3_KEY_ID S3_KEY_SECRET

  if [[ "$INSTALL_MODE" == "vollstack" ]]; then
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

  # ---- Schritt 4: Supabase-Initialisierungsdateien (nur Vollstack) ----
  if [[ "$INSTALL_MODE" == "vollstack" ]]; then
    command -v python3 >/dev/null 2>&1 || err "python3 is required for storage backup/restore (apt install python3)."
    header "Schritt 4: Supabase-Initialisierungsdateien"

  mkdir -p volumes/db volumes/logs volumes/pooler volumes/storage volumes/functions volumes/snippets volumes/db/data volumes/api
  umzug_prepare_supabase_files "$PROJECT_DIR" || err "Versioned Supabase initialization files missing."
  ALL_DOWNLOADED=true
  ensure_kong_entrypoint_script

    if [[ -f "volumes/db/jwt.sql" ]]; then
      sed -i "s/your-super-secret-jwt-token-with-at-least-32-characters-long/${JWT_SECRET}/g" \
        volumes/db/jwt.sql 2>/dev/null || true
    fi

    info "Synchronisiere Edge Functions..."
    deploy_edge_functions_to_volumes

    [[ "$ALL_DOWNLOADED" == "true" ]] && success "Initialisierungsdateien bereit." \
      || warn "Einige Dateien konnten nicht heruntergeladen werden."
  fi

  # ---- Schritt 5: .env schreiben ----
  header "Schritt 5: Konfigurationsdatei erstellen"

  local PASSWORD_RESET_URL="${APP_URL}/update-password"
  local INSTALL_DATE
  INSTALL_DATE=$(date "+%Y-%m-%d %H:%M:%S")

  info "Schreibe .env..."

  if [[ "$INSTALL_MODE" == "vollstack" ]]; then
    (umask 077; touch .env)
  chmod 600 .env
  cat > .env << VOLLSTACK_ENV
# ============================================================
# Umzughelfer + Supabase — Vollstack
# Automatisch generiert von manage.sh am ${INSTALL_DATE}
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
ADDITIONAL_REDIRECT_URLS=$(umzug_redirect_allowlist "" "$APP_URL")
MAILER_URLPATHS_INVITE=/auth/v1/verify
MAILER_URLPATHS_CONFIRMATION=/auth/v1/verify
MAILER_URLPATHS_RECOVERY=/auth/v1/verify
MAILER_URLPATHS_EMAIL_CHANGE=/auth/v1/verify

# SMTP
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
OLLAMA_USE_GPU=false
OLLAMA_INSTALLED=${INSTALL_OLLAMA}
OLLAMA_ORIGINS=${APP_URL}

# Edge Functions
FUNCTIONS_VERIFY_JWT=true
RECIPE_PARSER_INTERNAL_TOKEN=${RECIPE_PARSER_INTERNAL_TOKEN}
DOCUMENT_OCR_INTERNAL_TOKEN=${DOCUMENT_OCR_INTERNAL_TOKEN}
BASG_API_TOKEN=
RECIPE_PARSER_URL=http://recipe-source-parser:8090
RECIPE_PARSER_PORT=8090
WHISPER_DEVICE=auto
WHISPER_MODEL=small
WHISPER_CPU_COMPUTE_TYPE=int8
WHISPER_GPU_COMPUTE_TYPE=auto
WHISPER_CPP_FALLBACK_ENABLED=true

# PostgREST
PGRST_DB_SCHEMAS=public,storage,graphql_public
PGRST_DB_MAX_ROWS=1000
PGRST_DB_EXTRA_SEARCH_PATH=public,extensions

# Sonstige
IMGPROXY_ENABLE_WEBP_DETECTION=true
DOCKER_SOCKET_LOCATION=/var/run/docker.sock
VOLLSTACK_ENV

  else
    (umask 077; touch .env)
  chmod 600 .env
  cat > .env << APPONLY_ENV
# ============================================================
# Umzughelfer App — Bestehende Supabase-Instanz
# Automatisch generiert von manage.sh am ${INSTALL_DATE}
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

# Ollama (optional)
OLLAMA_EXTERNAL_URL=${OLLAMA_EXTERNAL_URL}
OLLAMA_USE_GPU=false
OLLAMA_INSTALLED=${INSTALL_OLLAMA}
APPONLY_ENV
  fi

  umzug_save_install_mode "$PROJECT_DIR" "$INSTALL_MODE" || exit 1
  success ".env geschrieben."

  # SMTP-Werte via env_set schreiben — sicher gegen Sonderzeichen im Passwort (Heredoc würde $, `` etc. expandieren)
  if [[ "$INSTALL_MODE" == "vollstack" && ( "${DO_SMTP_NOW,,}" == "j" || "${DO_SMTP_NOW,,}" == "y" ) ]]; then
    env_set "SMTP_HOST"                "$SMTP_HOST_VAL"
    env_set "SMTP_PORT"                "$SMTP_PORT_VAL"
    env_set "SMTP_USER"                "$SMTP_USER_VAL"
    env_set "SMTP_PASS"                "$SMTP_PASS_VAL"
    env_set "SMTP_SENDER_NAME"         "$SMTP_SENDER_VAL"
    env_set "ENABLE_EMAIL_AUTOCONFIRM" "false"
    success "SMTP-Konfiguration in .env gespeichert."
  fi

  # ---- Schritt 6: Docker bauen und starten ----
  header "Schritt 6: Docker Container starten"

  local INST_COMPOSE_FILE="docker-compose.full.yml"
  [[ "$INSTALL_MODE" == "apponly" ]] && INST_COMPOSE_FILE="docker-compose.yml"

  info "Baue React-App (kann einige Minuten dauern)..."
  umzug_compose -f "$INST_COMPOSE_FILE" build umzugsplaner-app

  info "Starte Container..."
  set +e
  umzug_start_stack "$INST_COMPOSE_FILE" "$INSTALL_OLLAMA"
  local COMPOSE_EXIT=$?
  set -e

if [[ $COMPOSE_EXIT -ne 0 ]]; then
  err "Docker-Start fehlgeschlagen (Exit $COMPOSE_EXIT). Bitte Containerstatus und Logs prüfen."
fi


  # ---- DB-Schema anwenden (nur Vollstack) ----
  if [[ "$INSTALL_MODE" == "vollstack" ]]; then
    info "Warte auf Datenbankbereitschaft (bis zu 2 Minuten)..."
    local RETRIES=24
    until docker exec supabase-db pg_isready -U postgres -h localhost >/dev/null 2>&1 || [[ $RETRIES -eq 0 ]]; do
      echo -n "."; sleep 5; RETRIES=$((RETRIES - 1))
    done
    echo ""

    if [[ $RETRIES -eq 0 ]]; then
      warn "Datenbank antwortet noch nicht. SQL-Setup wird übersprungen."
      DB_SCHEMA_STATUS="übersprungen (DB nicht bereit)"
      MULTIUSER_SCHEMA_STATUS="übersprungen (DB nicht bereit)"
    else
      umzug_wait_fullstack_ready || err "Storage/Kong readiness failed; schema was not imported."
      read -p "  Schema jetzt anwenden? [J/n]: " APPLY_SCHEMA_NOW
      if [[ "${APPLY_SCHEMA_NOW,,}" == "n" ]]; then
        DB_SCHEMA_STATUS="manuell erforderlich"
        MULTIUSER_SCHEMA_STATUS="manuell erforderlich"
      else
        if [[ -f "database_setup_complete.sql" ]]; then
          info "Wende database_setup_complete.sql an..."
          local SQL_RC=0
          run_sql_with_fallback "database_setup_complete.sql" || SQL_RC=$?
          if [[ $SQL_RC -eq 0 ]]; then
            DB_SCHEMA_STATUS="angewendet"
            success "database_setup_complete.sql erfolgreich angewendet."
          elif [[ $SQL_RC -eq 2 ]]; then
            DB_SCHEMA_STATUS="angewendet (mit Warnungen)"
            warn "database_setup_complete.sql mit Warnungen angewendet."
          else
            DB_SCHEMA_STATUS="fehler"
            warn "database_setup_complete.sql konnte nicht vollständig angewendet werden."
          fi
        else
          DB_SCHEMA_STATUS="nicht gefunden"
          warn "database_setup_complete.sql nicht gefunden."
        fi

        MULTIUSER_SCHEMA_STATUS="in database_setup_complete.sql enthalten"
      fi
    fi
  else
    DB_SCHEMA_STATUS="manuell erforderlich"
    MULTIUSER_SCHEMA_STATUS="manuell erforderlich"
  fi

  # ---- CREDENTIALS.txt schreiben ----
  if [[ -f CREDENTIALS.txt ]]; then chmod 600 CREDENTIALS.txt; fi
info "Schreibe CREDENTIALS.txt..."

  if [[ "$INSTALL_MODE" == "vollstack" ]]; then
    (umask 077; touch CREDENTIALS.txt)
  chmod 600 CREDENTIALS.txt
  cat > CREDENTIALS.txt << VOLLSTACK_CREDS
============================================================
  Umzughelfer — Vollstack-Installation
  Erstellt: ${INSTALL_DATE}
============================================================

APP
  URL:        ${APP_URL}
  Port:       ${APP_PORT}
  Zugriff:    ${ACCESS_LABEL}

SUPABASE STUDIO (Admin-Oberfläche)
  URL:        ${STUDIO_ACCESS_URL}
  Benutzer:   supabase
  Passwort:   ${STUDIO_PASSWORD}

SUPABASE DATENBANK
  Host:       localhost / Port: 5432 / DB: postgres
  Benutzer:   postgres
  Passwort:   ${POSTGRES_PASSWORD}

SUPABASE API
  URL:      ${SUPABASE_URL}
  Anon Key: ${ANON_KEY}

  Service Role Key (GEHEIM):
  ${SERVICE_ROLE_KEY}

JWT SECRET (GEHEIM):  ${JWT_SECRET}

VAPID (Push-Notifications)
  Public Key:  ${VAPID_PUBLIC_KEY}
  Private Key: ${VAPID_PRIVATE_KEY}

SMTP
  Host:   ${SMTP_HOST_VAL}:${SMTP_PORT_VAL}
  User:   ${SMTP_USER_VAL}
  Sender: ${SMTP_SENDER_VAL}

OLLAMA (App-Profil)
  Basis-URL: ${OLLAMA_EXTERNAL_URL:-nicht konfiguriert}

SCHEMA-STATUS
  database_setup_complete.sql:  ${DB_SCHEMA_STATUS}

============================================================
  NÄCHSTE SCHRITTE
============================================================
1. Studio öffnen: ${STUDIO_ACCESS_URL}  (supabase / ${STUDIO_PASSWORD})
2. Falls Schema noch offen: database_setup_complete.sql ausführen
3. App aufrufen: ${APP_URL}
4. Verwaltung: ./scripts/manage.sh

============================================================
  SICHERHEITSHINWEIS: Nicht in Git committen!
============================================================
VOLLSTACK_CREDS

  else
    (umask 077; touch CREDENTIALS.txt)
  chmod 600 CREDENTIALS.txt
  cat > CREDENTIALS.txt << APPONLY_CREDS
============================================================
  Umzughelfer — App-Installation (externe Supabase)
  Erstellt: ${INSTALL_DATE}
============================================================

APP
  URL:      ${APP_URL}
  Port:     ${APP_PORT}
  Zugriff:  ${ACCESS_LABEL}

SUPABASE (extern)
  URL:      ${SUPABASE_URL}
  Anon Key: ${ANON_KEY}

VAPID (Push-Notifications)
  Public Key:  ${VAPID_PUBLIC_KEY}
  Private Key: ${VAPID_PRIVATE_KEY}

SCHEMA-STATUS
  database_setup_complete.sql:  ${DB_SCHEMA_STATUS}

============================================================
  NÄCHSTE SCHRITTE
============================================================
1. In Supabase SQL Editor: database_setup_complete.sql ausführen
3. App aufrufen: ${APP_URL}
4. Verwaltung: ./scripts/manage.sh

============================================================
  SICHERHEITSHINWEIS: Nicht in Git committen!
============================================================
APPONLY_CREDS
  fi

  if [[ -f ".gitignore" ]]; then
    grep -qF "CREDENTIALS.txt" .gitignore || echo "CREDENTIALS.txt" >> .gitignore
    grep -qF ".env"            .gitignore || echo ".env"            >> .gitignore
  else
    printf "CREDENTIALS.txt\n.env\n" > .gitignore
  fi

  chmod 600 CREDENTIALS.txt
success "CREDENTIALS.txt geschrieben."

  # ---- Abschluss ----
  echo ""
  echo -e "${BOLD}${GREEN}============================================================${NC}"
  if [[ "$INSTALL_MODE" == vollstack && "$DB_SCHEMA_STATUS" != angewendet && "$DB_SCHEMA_STATUS" != "manuell erforderlich" ]]; then
    err "Installation incomplete: database schema status = $DB_SCHEMA_STATUS"
  fi
  success "Installation abgeschlossen!"
  echo -e "${BOLD}${GREEN}============================================================${NC}"
  echo ""
  echo -e "  App:            ${CYAN}${APP_URL}${NC}  (Port: ${APP_PORT})"
  if [[ "$INSTALL_MODE" == "vollstack" ]]; then
    echo -e "  Supabase Studio: ${CYAN}${STUDIO_ACCESS_URL}${NC}"
  else
    echo -e "  Supabase:        ${CYAN}${SUPABASE_URL}${NC}  (extern)"
  fi
  [[ "$INSTALL_OLLAMA" == "true" ]]     && echo -e "  Ollama API:      ${CYAN}http://ollama:11434${NC}"
  [[ -n "$OLLAMA_EXTERNAL_URL" ]]       && echo -e "  Ollama Server:   ${CYAN}${OLLAMA_EXTERNAL_URL}${NC}"
  echo -e "  Schema:          ${CYAN}${DB_SCHEMA_STATUS}${NC}"
  echo ""
  echo -e "  ${BOLD}Verwaltung und Updates: ./scripts/manage.sh${NC}"
  print_supabase_proxy_timeout_notice
  weiter
  break   # Installation abgeschlossen → zurück zum Hauptmenü
  done
}

# ============================================================
# DOCKER BEREINIGEN
# ============================================================
modus_docker_cleanup() {
  header "Docker bereinigen"
  echo ""
  echo -e "  ${BOLD}Was wird gelöscht:${NC}"
  echo "  • Alle gestoppten Container"
  echo "  • Alle nicht verwendeten Images (auch tagged)"
  echo "  • Alle nicht verwendeten Volumes"
  echo "  • Alle nicht verwendeten Netzwerke"
  echo "  • Build-Cache"
  echo ""
  warn "Laufende Container und deren Daten werden NICHT gelöscht."
  warn "Supabase-Datenvolumes bleiben erhalten, solange der Stack läuft."
  echo ""

  # Vorher: belegten Speicher anzeigen
  echo -e "  ${DIM}Aktueller Docker-Speicherverbrauch:${NC}"
  docker system df 2>/dev/null || true
  echo ""

  read -rp "  Wirklich bereinigen? Nicht rückgängig zu machen! [j/N]: " CONFIRM
  if [[ "$CONFIRM" != "j" && "$CONFIRM" != "J" ]]; then
    info "Abgebrochen."
    weiter
    return
  fi

  echo ""
  info "Bereinige Docker-Ressourcen..."
  docker system prune -a --volumes -f
  echo ""
  success "Docker bereinigt."
  echo ""
  echo -e "  ${DIM}Speicherverbrauch nach Bereinigung:${NC}"
  docker system df 2>/dev/null || true
  weiter
}

# ============================================================
# LAUFZEITKONTEXT / HAUPTSCHLEIFE
# ============================================================
refresh_runtime_context() {
  # Also protect secrets created by older installers, before any update action.
  if [[ -f CREDENTIALS.txt ]]; then chmod 600 CREDENTIALS.txt || return 1; fi
  umzug_resolve_install_context "$PROJECT_DIR" "de" || exit 1

  HAS_OLLAMA=false
  if [[ "$IS_VOLLSTACK" == true ]]; then
    if umzug_ollama_requested "$PROJECT_DIR"; then
      HAS_OLLAMA=true
    else
      local ollama_choice_status=$?
      [[ "$ollama_choice_status" == 1 ]] || return "$ollama_choice_status"
    fi
  fi

  CURRENT_APP_URL=""
  CURRENT_PORT=""
  if [[ -f ".env" ]]; then
    CURRENT_APP_URL="$(env_get "SITE_URL")"
    CURRENT_PORT="$(env_get "APP_PORT")"
    [[ "$IS_VOLLSTACK" == "true" ]] && ensure_recipe_parser_env
  fi
  # App-only intentionally skips fullstack setup; that is not a failure under set -e.
  return 0
}

# Kompatibler Direkteinstieg fuer scripts/update.sh.
if [[ "${1:-}" == "maintenance" ]]; then
  umzug_run_maintenance "$PROJECT_DIR" "${2:-}" "de"
  exit $?
fi

if [[ "${1:-}" == "update" ]]; then
  refresh_runtime_context
  modus_update
  exit $?
fi

while true; do
  # Auto-Erkennung bei jedem Schleifendurchlauf aktualisieren
  refresh_runtime_context

  clear
  echo ""
  echo -e "${BOLD}${GREEN}============================================================${NC}"
  echo -e "${BOLD}${GREEN}  Umzughelfer — Verwaltung${NC}"
  echo -e "${BOLD}${GREEN}============================================================${NC}"
  echo ""

  if [[ "$IS_VOLLSTACK" == "true" ]]; then
    echo -e "  Installation: ${CYAN}Vollstack (Supabase + App)${NC}"
  elif [[ -f ".env" ]]; then
    echo -e "  Installation: ${CYAN}App-only${NC}"
  else
    echo -e "  Installation: ${YELLOW}Noch nicht eingerichtet${NC}"
  fi
  [[ -n "$CURRENT_APP_URL" ]] && echo -e "  App-URL:      ${CYAN}${CURRENT_APP_URL}${NC}"
  [[ -n "$CURRENT_PORT"    ]] && echo -e "  App-Port:     ${CYAN}${CURRENT_PORT}${NC}"

  echo ""
  CONTAINERS_RUNNING=0
  CONTAINERS_RUNNING=$(umzug_compose -f "$COMPOSE_FILE" ps --status running --format "{{.Name}}" 2>/dev/null | wc -l | tr -d ' ') || true
  if [[ "$CONTAINERS_RUNNING" -gt 0 ]]; then
    echo -e "  Container:    ${GREEN}${CONTAINERS_RUNNING} laufen${NC}"
  else
    echo -e "  Container:    ${YELLOW}Keine laufen${NC}"
  fi
  echo ""

  echo -e "  ${BOLD}Was möchtest du tun?${NC}"
  echo ""
  echo -e "  ${BOLD}[1]${NC} Installation      — Vollstack oder App-only einrichten"
  echo -e "  ${BOLD}[2]${NC} Update            — Updates einspielen, Container neu starten"
  echo -e "  ${BOLD}[3]${NC} Deinstallation    — Container, Volumes oder alles entfernen"
  echo -e "  ${BOLD}[4]${NC} Backup            — Datenbank + Konfiguration sichern"
  echo -e "  ${BOLD}[5]${NC} Wiederherstellung — Backup importieren / Daten wiederherstellen"
  echo -e "  ${BOLD}[6]${NC} SMTP              — E-Mail-Einstellungen konfigurieren"
  echo -e "  ${BOLD}[7]${NC} Ollama            — KI-Assistent konfigurieren"
  echo -e "  ${BOLD}[8]${NC} Konfiguration     — App-URL / Port / Admin-E-Mail anpassen"
  echo -e "  ${BOLD}[9]${NC} Status            — Laufende Container und Logs anzeigen"
  echo -e "  ${BOLD}[10]${NC} Docker bereinigen — Ungenutzte Container, Images + Volumes löschen"
  echo "  [0] Beenden"
  echo ""
  read -p "  → Wahl [1]: " MAIN_CHOICE
  [[ -z "$MAIN_CHOICE" ]] && MAIN_CHOICE=1

  case "$MAIN_CHOICE" in
    1) modus_installation ;;
    2) modus_update ;;
    3) modus_deinstall ;;
    4) modus_backup ;;
    5) modus_restore ;;
    6) modus_smtp ;;
    7) modus_ollama ;;
    8) modus_config ;;
    9) modus_status ;;
    10) modus_docker_cleanup ;;
    0) echo ""; echo "  Auf Wiedersehen."; echo ""; exit 0 ;;
    *) warn "Ungültige Auswahl."; sleep 1 ;;
  esac
done
