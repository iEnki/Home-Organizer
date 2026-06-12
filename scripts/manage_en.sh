#!/usr/bin/env bash
# ============================================================
# Umzughelfer — Central management script
#
#   [1] Installation      — set up fullstack or app-only
#   [2] Update            — apply updates and restart containers
#   [3] Uninstall         — remove containers, volumes or everything
#   [4] Backup            — back up database and configuration
#   [5] Restore           — import backup / restore data
#   [6] SMTP              — configure email settings
#   [7] Ollama            — configure AI assistant
#   [8] Configuration     — adjust app URL / port / admin email
#   [9] Status            — show running containers and logs
#   [10] Docker cleanup   — remove unused containers, images and volumes
#   [0] Exit
#
# Usage: chmod +x scripts/manage_en.sh && ./scripts/manage_en.sh
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
err()     { echo -e "${RED}✗  ERROR: $1${NC}"; exit 1; }
success() { echo -e "${GREEN}✅ $1${NC}"; }
header()  { echo -e "\n${BOLD}${GREEN}$1${NC}"; echo "$(printf '=%.0s' {1..60})"; }
dim()     { echo -e "${DIM}$1${NC}"; }

weiter() {
  echo ""
  read -rp "  Press Enter to return to the main menu..." _PAUSE
}

mit_spinner() {
  local MSG="$1"; shift
  local SPIN='|/-\'
  local LOG LAST_COPY INTERVAL LAST_SHOWN
  LOG=$(mktemp)
  LAST_COPY="/tmp/umzug_last_command.log"
  INTERVAL="${UMZUG_LOG_INTERVAL:-20}"
  LAST_SHOWN=0

  "$@" >"$LOG" 2>&1 &
  local PID=$!
  local i=0

  echo -e "  ${DIM}Log: ${LAST_COPY}${NC}"
  while kill -0 "$PID" 2>/dev/null; do
    local c="${SPIN:$((i % ${#SPIN})):1}"
    printf "\r  ${CYAN}${c}${NC}  %s  ${DIM}(%ds)${NC}" "$MSG" "$i"
    cp "$LOG" "$LAST_COPY" 2>/dev/null || true
    if [[ $i -gt 0 && $((i % INTERVAL)) -eq 0 ]]; then
      local LINE_COUNT
      LINE_COUNT=$(wc -l < "$LOG" 2>/dev/null | tr -d ' ' || echo 0)
      if [[ "$LINE_COUNT" -gt "$LAST_SHOWN" ]]; then
        printf "\n"
        echo -e "${DIM}--- Live log: latest lines (${MSG}) ---${NC}"
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
  cp "$LOG" "$LAST_COPY" 2>/dev/null || true

  if [[ $EXIT_CODE -eq 0 ]]; then
    success "$MSG"
  else
    echo -e "${RED}X  $MSG - failed (Exit $EXIT_CODE)${NC}"
    cp "$LOG" /tmp/umzug_build_error.log 2>/dev/null || true
    echo -e "${DIM}--- Relevant errors/warnings ---${NC}"
    grep -iE 'error|failed|fail|fatal|exception|traceback|denied|not found|no such file|cannot|unable|warn' "$LOG" | tail -50 >&2 || true
    echo -e "${DIM}--- Last log lines ---${NC}"
    tail -120 "$LOG" >&2
    echo ""
    echo -e "${DIM}  Full log:      cat /tmp/umzug_build_error.log${NC}"
    echo -e "${DIM}  Live/last log: cat /tmp/umzug_last_command.log${NC}"
    echo -e "${DIM}  Errors only:   grep -iE 'error|failed|fatal|unable|not found|warn' /tmp/umzug_build_error.log | tail -50${NC}"
    rm -f "$LOG"
    return $EXIT_CODE
  fi
  rm -f "$LOG"
}

deploy_edge_functions_to_volumes() {
  mkdir -p volumes/functions
  cp -R supabase/functions/. volumes/functions/
  DEPLOYED=$(find supabase/functions -mindepth 2 -maxdepth 2 -type f -name 'index.ts' 2>/dev/null | wc -l)
  echo "    OK ${DEPLOYED} Edge Functions including shared modules"
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
    cat "$log_file"; rm -f "$log_file"; return 0
  fi

  cat "$log_file"

  if [[ "$sql_file" == "database_setup_complete.sql" ]] && grep -qi "must be owner of table objects" "$log_file"; then
    warn "Storage policies could not be applied with full privileges."
    warn "Retrying import in tolerant mode..."
    if run_sql_in_db_container "$sql_file" 0; then
      rm -f "$log_file"; return 2
    fi
  fi

  rm -f "$log_file"; return 1
}

ensure_kong_entrypoint_script() {
  mkdir -p volumes/api
  cat > volumes/api/kong-entrypoint.sh << 'KONG_ENTRYPOINT'
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
KONG_ENTRYPOINT
  chmod +x volumes/api/kong-entrypoint.sh
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

  if [[ -z "$(env_get "RECIPE_PARSER_INTERNAL_TOKEN")" ]]; then
    env_set "RECIPE_PARSER_INTERNAL_TOKEN" "$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")"
    UPDATED=true
  fi
  [[ -z "$(env_get "RECIPE_PARSER_URL")" ]] && env_set "RECIPE_PARSER_URL" "http://recipe-source-parser:8090" && UPDATED=true
  [[ -z "$(env_get "RECIPE_PARSER_PORT")" ]] && env_set "RECIPE_PARSER_PORT" "8090" && UPDATED=true
  [[ -z "$(env_get "WHISPER_DEVICE")" ]] && env_set "WHISPER_DEVICE" "auto" && UPDATED=true
  [[ -z "$(env_get "WHISPER_MODEL")" ]] && env_set "WHISPER_MODEL" "small" && UPDATED=true
  [[ -z "$(env_get "WHISPER_CPU_COMPUTE_TYPE")" ]] && env_set "WHISPER_CPU_COMPUTE_TYPE" "int8" && UPDATED=true
  [[ -z "$(env_get "WHISPER_GPU_COMPUTE_TYPE")" ]] && env_set "WHISPER_GPU_COMPUTE_TYPE" "float16" && UPDATED=true
  [[ -z "$(env_get "WHISPER_CPP_FALLBACK_ENABLED")" ]] && env_set "WHISPER_CPP_FALLBACK_ENABLED" "true" && UPDATED=true

  if [[ "$UPDATED" == "true" ]]; then
    success "Missing cookbook/recipe parser values were added to .env."
  fi
  return 0
}

check_recipe_parser_context() {
  [[ "$IS_VOLLSTACK" != "true" ]] && return 0
  if grep -q "recipe-source-parser:" "$COMPOSE_FILE" 2>/dev/null && [[ ! -d "services/recipe-source-parser" ]]; then
    warn "Docker Compose expects services/recipe-source-parser, but the directory is missing."
    echo "  Copy/pull this directory to the server first:"
    echo "    services/recipe-source-parser/"
    echo ""
    echo "  Then restart:"
    echo "    docker compose -f ${COMPOSE_FILE} up -d --build recipe-source-parser functions"
    return 1
  fi
  return 0
}

ensure_fullstack_update_prereqs() {
  [[ "$IS_VOLLSTACK" != "true" ]] && return 0
  if [[ ! -f "volumes/api/kong-entrypoint.sh" ]]; then
    warn "volumes/api/kong-entrypoint.sh is missing. Regenerating it."
    ensure_kong_entrypoint_script
    KONG_RELOAD_REASON="${KONG_RELOAD_REASON:-kong-entrypoint regenerated}"
  fi
  check_recipe_parser_context
}

reload_kong_if_needed() {
  [[ "$IS_VOLLSTACK" != "true" ]] && return 0
  local reason="${1:-}"
  [[ -z "$reason" ]] && return 0
  warn "Kong configuration changed (${reason}). Reloading Kong."
  mit_spinner "Reloading Kong" \
    docker compose -f "$COMPOSE_FILE" up -d --force-recreate kong || \
    warn "Kong could not be reloaded. Check: docker compose -f ${COMPOSE_FILE} ps kong"
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
  header "Supabase Studio / Kong Diagnostics"

  local required=(supabase-kong supabase-studio supabase-meta supabase-db)
  local missing=false
  for container in "${required[@]}"; do
    if docker ps --format '{{.Names}}' 2>/dev/null | grep -qx "$container"; then
      echo "    OK ${container} is running"
    else
      warn "${container} is not running."
      missing=true
    fi
  done

  local internal_code=""
  internal_code="$(docker exec supabase-kong sh -lc 'if command -v curl >/dev/null 2>&1; then curl -s -o /dev/null -w "%{http_code}" http://studio:3000; elif command -v wget >/dev/null 2>&1; then wget -q -S -O /dev/null http://studio:3000 2>&1 | awk "/HTTP\\// {code=\\$2} END {print code}"; else echo no-http-client; fi' 2>/dev/null || true)"
  if [[ "$internal_code" == "200" || "$internal_code" == "307" || "$internal_code" == "308" ]]; then
    echo "    OK Kong can reach Studio internally (HTTP ${internal_code})"
  elif [[ -n "$internal_code" ]]; then
    warn "Kong cannot reach Studio cleanly internally (HTTP/status: ${internal_code})."
  else
    warn "Internal Studio check could not be executed."
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
    [[ -n "$public_code" ]] && echo "    External /: HTTP ${public_code}" || warn "External check for ${supabase_public} is not possible."
    if [[ "$manifest_code" == "401" ]]; then
      warn "/favicon/manifest.json returns 401. This is a Studio asset behind Basic Auth, not a database outage."
    elif [[ -n "$manifest_code" ]]; then
      echo "    External /favicon/manifest.json: HTTP ${manifest_code}"
    fi
    if [[ -n "$dashboard_user" && -n "$dashboard_pass" ]]; then
      auth_code="$(curl -k -s -o /dev/null -w "%{http_code}" -u "${dashboard_user}:${dashboard_pass}" "$supabase_public/project/default" 2>/dev/null || true)"
      if [[ "$auth_code" == "200" || "$auth_code" == "307" || "$auth_code" == "308" ]]; then
        echo "    OK Studio Basic Auth accepts .env credentials (HTTP ${auth_code})"
      elif [[ "$auth_code" == "401" ]]; then
        warn "Studio Basic Auth rejects the .env credentials. Kong is probably using stale/wrong credentials."
        echo "    Repair on the server:"
        echo "      docker compose -f ${COMPOSE_FILE} up -d --force-recreate kong"
        echo "      docker compose -f ${COMPOSE_FILE} logs --tail=80 kong"
      elif [[ -n "$auth_code" ]]; then
        warn "Credential test for Studio returns HTTP ${auth_code}."
      fi
    fi
  else
    warn "SUPABASE_PUBLIC_URL is missing in .env."
  fi

  if [[ -n "$dashboard_user" && -n "$dashboard_pass" ]]; then
    echo "    Studio Basic Auth: use user '${dashboard_user}' from .env."
  else
    warn "DASHBOARD_USERNAME or DASHBOARD_PASSWORD is missing in .env."
  fi

  if [[ "$missing" == "true" ]]; then
    warn "At least one Supabase container is missing. Server check:"
    echo "    docker compose -f ${COMPOSE_FILE} ps kong studio meta db"
  fi
}

recipe_parser_image_exists() {
  docker image inspect umzughelfer-recipe-source-parser >/dev/null 2>&1 || \
  docker image inspect umzughelfer_recipe-source-parser >/dev/null 2>&1 || \
  docker image inspect umzughelfer-recipe-source-parser:latest >/dev/null 2>&1
}

restart_recipe_services() {
  [[ "$IS_VOLLSTACK" != "true" ]] && return 0
  if recipe_parser_image_exists; then
    mit_spinner "Restarting recipe parser + functions" \
      docker compose -f "$COMPOSE_FILE" up -d --force-recreate recipe-source-parser functions || \
      warn "Recipe parser/functions could not be restarted."
  else
    warn "Recipe parser image is missing. A one-time build is required and can take 10-20 minutes."
    mit_spinner "Building/starting recipe parser + functions" \
      docker compose -f "$COMPOSE_FILE" up -d --build --force-recreate recipe-source-parser functions || \
      warn "Recipe parser/functions could not be built or started."
  fi
}

print_url_role_warnings() {
  local site_url api_external supabase_public react_supabase
  site_url="$(env_get "SITE_URL")"
  api_external="$(env_get "API_EXTERNAL_URL")"
  supabase_public="$(env_get "SUPABASE_PUBLIC_URL")"
  react_supabase="$(env_get "REACT_APP_SUPABASE_URL")"

  echo ""
  echo "  Expected roles:"
  echo "    SITE_URL                 -> app domain"
  echo "    SUPABASE_PUBLIC_URL      -> Supabase/Kong domain"
  echo "    REACT_APP_SUPABASE_URL   -> Supabase/Kong domain"
  echo "    API_EXTERNAL_URL         -> Supabase/Kong domain; app domain only if /auth/v1 is reverse-proxied"

  if [[ -n "$site_url" && -n "$supabase_public" && "$site_url" == "$supabase_public" ]]; then
    warn "SITE_URL and SUPABASE_PUBLIC_URL are identical. App and Supabase domains should remain separate."
  fi
  if [[ -n "$react_supabase" && -n "$supabase_public" && "$react_supabase" != "$supabase_public" ]]; then
    warn "REACT_APP_SUPABASE_URL differs from SUPABASE_PUBLIC_URL. An app rebuild is required after fixing it."
  fi
  if [[ -n "$site_url" && -n "$api_external" && "$api_external" == "$site_url" && "$site_url" != "$supabase_public" ]]; then
    warn "API_EXTERNAL_URL points to the app domain. This is only correct if /auth/v1/ is forwarded to Kong (:8000)."
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
    echo -e "  ${DIM}(hidden input — Enter = behalten)${NC}" >&2
    read -s -p "  ${BESCHREIBUNG}: " EINGABE; echo "" >&2
    [[ -z "$EINGABE" ]] && EINGABE="$CURRENT"
  else
    echo -e "  ${DIM}(hidden input)${NC}" >&2
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
    echo "  How should the app be reachable?"
    echo "  [1] Using a domain / reverse proxy"
    echo "  [2] Only locally on this device (localhost)"
    echo "  [3] In the local network without a domain (LAN IP)"
    read -p "  -> Choice [1]: " access_choice
    [[ -z "$access_choice" ]] && access_choice=1

    case "$access_choice" in
      1)
        while true; do
          read -p "  App URL or host (for example https://move.example.com, 0 = cancel): " app_url_input
          [[ "$app_url_input" == "0" ]] && return 1
          [[ -n "$app_url_input" ]] && break
          echo "  -> App URL is required."
        done

        INSTALL_ACCESS_MODE="domain"
        INSTALL_ACCESS_LABEL="Domain / Reverse Proxy"
        INSTALL_APP_URL="$(normalize_url_scheme "$app_url_input" "https")"

        if [[ "$install_mode" == "vollstack" ]]; then
          read -p "  Supabase URL [default: ${INSTALL_APP_URL}]: " supabase_input
          [[ -z "$supabase_input" ]] && supabase_input="$INSTALL_APP_URL"
          INSTALL_SUPABASE_URL="$(normalize_url_scheme "$supabase_input" "https")"
        fi
        return 0
        ;;

      2)
        app_url_default="http://localhost:${app_port}"
        echo "  Local mode: The app is only reachable on this device through localhost."
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
          read -p "  Local IP / hostname [${local_ip}]: " access_host_input
          [[ "$access_host_input" == "0" ]] && return 1
          [[ -z "$access_host_input" ]] && access_host_input="$local_ip"
        else
          while true; do
            read -p "  Local IP / hostname (z.B. 192.168.1.50, 0 = Cancel): " access_host_input
            [[ "$access_host_input" == "0" ]] && return 1
            [[ -n "$access_host_input" ]] && break
            echo "  -> IP or hostname is required."
          done
        fi

        app_url_default="http://${access_host_input}:${app_port}"
        echo "  LAN mode: Other devices in your home network can use this address."
        warn "Web Push and some PWA features may be limited over plain HTTP in a LAN depending on the browser. Full functionality requires HTTPS or localhost."
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
        warn "Invalid choice."
        echo ""
        ;;
    esac
  done
}

container_stoppen() {
  info "Stopping and removing containers..."
  if [[ "$IS_VOLLSTACK" == "true" ]]; then
    docker compose -f "$COMPOSE_FILE" --profile ollama down --remove-orphans 2>/dev/null || \
    docker compose -f "$COMPOSE_FILE" down --remove-orphans 2>/dev/null || \
    warn "Container konnten nicht removed werden (möglicherweise schon gestoppt)."
  else
    docker compose -f "$COMPOSE_FILE" down --remove-orphans 2>/dev/null || \
    warn "Container konnten nicht removed werden (möglicherweise schon gestoppt)."
  fi
  success "Containers removed."
}

volumes_entfernen() {
  if [[ "$IS_VOLLSTACK" != "true" ]]; then
    info "App-only Installation — keine Named Volumes zu entfernen."
    return
  fi
  info "Removing Docker named volumes..."
  docker compose -f "$COMPOSE_FILE" --profile ollama down -v 2>/dev/null || \
  docker compose -f "$COMPOSE_FILE" down -v 2>/dev/null || true

  local PROJECT_NAME PROJECT_NAME_ALT
  PROJECT_NAME="$(basename "$PROJECT_DIR" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]//g')"
  PROJECT_NAME_ALT="$(basename "$PROJECT_DIR" | tr '[:upper:]' '[:lower:]' | sed 's/ /-/g')"
  for SUFFIX in db-config deno-cache ollama-data; do
    for PREFIX in "$PROJECT_NAME" "$PROJECT_NAME_ALT" "umzughelfer" "umzug-helfer"; do
      local VOL="${PREFIX}_${SUFFIX}"
      if docker volume inspect "$VOL" >/dev/null 2>&1; then
        docker volume rm "$VOL" && echo "    OK Volume ${VOL} removed" || true
      fi
    done
  done
  success "Docker volumes removed."
}

# ============================================================
cd "$PROJECT_DIR"

# ============================================================
# MODUS-FUNKTIONEN
# ============================================================

modus_status() {
  header "Container Status"
  echo ""
  docker compose -f "$COMPOSE_FILE" ps
  echo ""
  echo -e "  ${BOLD}Last lines from app log:${NC}"
  docker compose -f "$COMPOSE_FILE" logs --tail=20 umzugsplaner-app 2>/dev/null || true
  echo ""
  if [[ "$IS_VOLLSTACK" == "true" ]]; then
    echo -e "  ${BOLD}Last lines from functions log:${NC}"
    docker compose -f "$COMPOSE_FILE" logs --tail=10 functions 2>/dev/null || true
    echo ""
    check_supabase_studio_access
  fi
  weiter
}

modus_backup() {
  header "Create Database Backup"
  echo ""

  if ! docker ps --format '{{.Names}}' 2>/dev/null | grep -q "^supabase-db$"; then
    warn "Container 'supabase-db' läuft nicht. Bitte zuerst die Container starten."
    weiter; return 0
  fi

  BACKUP_DIR="backups/backup_$(date +%Y%m%d_%H%M%S)"
  mkdir -p "$BACKUP_DIR"

  info "Creating database dump (pg_dump)..."
  docker exec supabase-db pg_dump -U postgres -d postgres -F c -f /tmp/db.dump
  docker cp supabase-db:/tmp/db.dump "${BACKUP_DIR}/db.dump"
  docker exec supabase-db rm -f /tmp/db.dump
  echo "    OK ${BACKUP_DIR}/db.dump"

  # Storage-Dateien sichern (Uploads, Fotos, Avatare)
  if [[ -d "./volumes/storage" ]] && [[ -n "$(ls -A ./volumes/storage 2>/dev/null)" ]]; then
    info "Backing up storage files (uploads, photos)..."
    tar -czf "${BACKUP_DIR}/storage.tar.gz" -C "./volumes" storage
    echo "    OK ${BACKUP_DIR}/storage.tar.gz"
  else
    echo "    INFO Storage-Verzeichnis leer oder nicht vorhanden, wird übersprungen."
  fi

  if [[ -f ".env" ]]; then
    cp .env "${BACKUP_DIR}/.env"
    echo "    OK ${BACKUP_DIR}/.env"
  fi
  if [[ -f "CREDENTIALS.txt" ]]; then
    cp CREDENTIALS.txt "${BACKUP_DIR}/credentials.txt"
    echo "    OK ${BACKUP_DIR}/credentials.txt"
  fi

  cat > "${BACKUP_DIR}/info.txt" << BACKUP_INFO
Umzughelfer Backup
==================
Datum:    $(date "+%Y-%m-%d %H:%M:%S")
Hostname: $(hostname)
Compose:  ${COMPOSE_FILE}

Dateien:
  db.dump         — PostgreSQL Database (pg_dump -Fc)
  storage.tar.gz  — Supabase Storage (Uploads, Fotos) [nur wenn Dateien vorhanden]
  .env            — Konfigurationsdatei
  credentials.txt — Zugangsdaten

Wiederherstellen:
  ./scripts/manage_en.sh -> [5] Restore
BACKUP_INFO

  echo ""
  BACKUP_SIZE=$(du -sh "$BACKUP_DIR" 2>/dev/null | cut -f1)
  success "Backup created: ${BACKUP_DIR}/ (${BACKUP_SIZE})"
  weiter
}

modus_restore() {
  header "Restore Database"
  echo ""

  if [[ "$IS_VOLLSTACK" != "true" ]]; then
    warn "Restore is only available for fullstack installations (supabase-db container required)."
    weiter; return 0
  fi

  if [[ ! -d "backups" ]] || ! ls -d backups/backup_* >/dev/null 2>&1; then
    warn "No backups found under backups/. Please create a backup first (option [4])."
    weiter; return 0
  fi

  echo "  Verfügbare Backups:"
  echo ""
  local i=1
  local BACKUP_LIST=()
  while IFS= read -r bdir; do
    local BSIZE BDATE
    BSIZE=$(du -sh "$bdir" 2>/dev/null | cut -f1)
    BDATE=$(basename "$bdir" | sed 's/backup_//' | \
      sed 's/\([0-9]\{4\}\)\([0-9]\{2\}\)\([0-9]\{2\}\)_\([0-9]\{2\}\)\([0-9]\{2\}\)\([0-9]\{2\}\)/\1-\2-\3 \4:\5:\6/')
    echo "  [${i}] ${bdir}  (${BSIZE}, ${BDATE})"
    BACKUP_LIST+=("$bdir")
    i=$((i + 1))
  done < <(ls -d backups/backup_* 2>/dev/null | sort -r)

  echo "  [0] Back"
  echo ""
  read -p "  Backup-Nummer wählen [1]: " BACKUP_NR
  [[ -z "$BACKUP_NR" ]] && BACKUP_NR=1
  [[ "$BACKUP_NR" == "0" ]] && return 0

  local SELECTED_BACKUP="${BACKUP_LIST[$((BACKUP_NR - 1))]}"
  if [[ -z "$SELECTED_BACKUP" ]]; then
    warn "Invalid choice."; weiter; return 0
  fi
  if [[ ! -f "${SELECTED_BACKUP}/db.dump" ]]; then
    warn "db.dump not found in ${SELECTED_BACKUP}/"; weiter; return 0
  fi

  echo ""
  warn "ACHTUNG: Die bestehende Database und Konfiguration werden vollständig überschrieben!"
  warn "Backup:  ${SELECTED_BACKUP}"
  echo ""
  read -p "  Continue? [j/N]: " CONFIRM
  [[ "${CONFIRM,,}" != "j" && "${CONFIRM,,}" != "y" ]] && { echo "  Cancelled."; return 0; }

  # 1) Alle Stop Containers
  info "Stopping all containers..."
  set +e
  docker compose -f "$COMPOSE_FILE" down --remove-orphans 2>/dev/null
  set -e

  # 2) Konfigurationsdateien automatisch wiederherstellen
  if [[ -f "${SELECTED_BACKUP}/.env" ]]; then
    cp "${SELECTED_BACKUP}/.env" .env
    success ".env restored from backup."
  else
    warn ".env nicht im Backup gefunden — bestehende .env wird verwendet."
  fi
  if [[ -f "${SELECTED_BACKUP}/credentials.txt" ]]; then
    cp "${SELECTED_BACKUP}/credentials.txt" CREDENTIALS.txt
    success "CREDENTIALS.txt restored from backup."
  fi

  # 3) Nur Database-Container starten
  info "Starting database container..."
  set +e; docker compose -f "$COMPOSE_FILE" up -d db; set -e

  # 4) Auf Databasebereitschaft warten (max. 2 Minuten)
  info "Waiting for database readiness..."
  local RETRIES=24
  until docker exec supabase-db pg_isready -U postgres -h localhost >/dev/null 2>&1 || [[ $RETRIES -eq 0 ]]; do
    echo -n "."; sleep 5; RETRIES=$((RETRIES - 1))
  done
  echo ""
  if [[ $RETRIES -eq 0 ]]; then
    warn "Database antwortet nicht. Bitte Container manuell prüfen."
    weiter; return 0
  fi

  # 5) Restore Database
  info "Copying backup into container..."
  docker cp "${SELECTED_BACKUP}/db.dump" supabase-db:/tmp/restore.dump

  # 5a) auth.users leeren — Frischinstallation legt automatisch neue User an,
  #     deren UUIDs sich von den Backup-UUIDs unterscheiden → FK-Konflikte
  info "Bereite auth.users für Restore vor..."
  docker exec supabase-db psql -U postgres -d postgres \
    -c "DELETE FROM auth.users;" 2>/dev/null || true

  # 5b) auth.users aus Backup wiederherstellen — UUIDs müssen vor public-Daten existieren
  info "Restoring auth.users..."
  set +e
  docker exec supabase-db pg_restore -U postgres -d postgres \
    --data-only --no-owner --no-privileges \
    --schema=auth --table=users /tmp/restore.dump 2>&1 \
    | grep -v "^pg_restore: warning"
  set -e

  # 5c) public-Schema leeren — handle_new_user-Trigger hat durch 5b automatisch
  #     Einträge angelegt; außerdem sicherstellen dass keine Altdaten stören
  info "Leere public-Schema für sauberen Restore..."
  docker exec supabase-db psql -U postgres -d postgres -c "
SET session_replication_role = replica;
DO \$\$ DECLARE r RECORD; BEGIN
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE 'TRUNCATE TABLE public.' || quote_ident(r.tablename) || ' CASCADE';
  END LOOP;
END \$\$;
SET session_replication_role = DEFAULT;
" 2>/dev/null

  # 5d) public-Daten mit deaktivierten FK-Checks einspielen
  # session_replication_role = replica deaktiviert alle FK-Constraint-Trigger
  # ohne Table-Owner-Rechte zu benötigen (--disable-triggers schlägt fehl da
  # Tabellen supabase_admin gehören, nicht postgres)
  info "Restoring public schema..."
  set +e
  local RESTORE_ERRORS
  RESTORE_ERRORS=$(docker exec supabase-db bash -c "
(echo 'SET session_replication_role = replica;';
 pg_restore -f - --schema=public --data-only --no-owner --no-privileges /tmp/restore.dump;
 echo 'SET session_replication_role = DEFAULT;') | \
psql -U postgres -d postgres 2>&1
" | grep "^ERROR" | grep -v "duplicate key\|already exists")
  set -e

  if [[ -n "$RESTORE_ERRORS" ]]; then
    warn "Restore-Warnungen (möglicherweise harmlos):"
    echo "$RESTORE_ERRORS" | head -10
  fi

  docker exec supabase-db rm -f /tmp/restore.dump

  # 5e) Storage-Dateien wiederherstellen (Uploads, Fotos, Avatare)
  # VOR Container-Start: Bind-Mount ./volumes/storage ist sofort verfügbar
  if [[ -f "${SELECTED_BACKUP}/storage.tar.gz" ]]; then
    info "Restoring storage files..."
    mkdir -p "./volumes/storage"
    tar -xzf "${SELECTED_BACKUP}/storage.tar.gz" -C "./volumes"
    echo "    OK Storage files restored"
  else
    warn "Kein storage.tar.gz im Backup — Uploads/Fotos werden nicht wiederhergestellt."
  fi

  # 6) Trigger-Funktionen sicherstellen
  info "Ensuring database helper functions..."
  ensure_updated_at_functions

  # 7) Edge Functions in Volumes deployen
  info "Deploying Edge Functions into volumes..."
  deploy_edge_functions_to_volumes

  # 8) Alle Container starten
  info "Starting all containers..."
  set +e; docker compose -f "$COMPOSE_FILE" up -d; set -e

  # 9) Functions-restart container, damit neue Functions geladen werden
  if [[ ${DEPLOYED:-0} -gt 0 ]]; then
    info "Restarting functions container..."
    docker compose -f "$COMPOSE_FILE" restart functions 2>/dev/null || true
  fi

  local APP_URL_NOW
  APP_URL_NOW="$(env_get "SITE_URL")"

  echo ""
  success "Restore completed from: ${SELECTED_BACKUP}"
  [[ -n "$APP_URL_NOW" ]] && echo -e "  App available at: ${CYAN}${APP_URL_NOW}${NC}"
  weiter
}

modus_smtp() {
  header "Configure SMTP Settings"

  if [[ ! -f ".env" ]]; then
    warn ".env nicht gefunden. Bitte zuerst eine Installation durchführen."
    weiter; return 0
  fi
  if [[ "$IS_VOLLSTACK" != "true" ]]; then
    warn "Nur für Vollstack-Installation verfügbar (docker-compose.full.yml nicht gefunden)."
    weiter; return 0
  fi

  echo ""
  echo -e "  ${DIM}Current values from .env are shown as suggestions.${NC}"
  echo -e "  ${DIM}Enter drücken = Wert übernehmen. Neuer Wert = überschreiben.${NC}"
  echo ""

  local SMTP_HOST_NEW SMTP_PORT_NEW SMTP_USER_NEW SMTP_PASS_NEW SMTP_ADMIN_NEW SMTP_SENDER_NEW
  SMTP_HOST_NEW=$(env_prompt "SMTP_HOST" "SMTP Host (z.B. smtp.gmail.com)")
  SMTP_PORT_NEW=$(env_prompt "SMTP_PORT" "SMTP Port")
  [[ -z "$SMTP_PORT_NEW" ]] && SMTP_PORT_NEW=587
  SMTP_USER_NEW=$(env_prompt "SMTP_USER" "SMTP username / email")
  SMTP_PASS_NEW=$(env_prompt_secret "SMTP_PASS" "SMTP password")
  SMTP_ADMIN_NEW=$(env_prompt "SMTP_ADMIN_EMAIL" "Absender-Adresse (From)")
  SMTP_SENDER_NEW=$(env_prompt "SMTP_SENDER_NAME" "Sender name")
  [[ -z "$SMTP_SENDER_NEW" ]] && SMTP_SENDER_NEW="Umzughelfer"
  echo ""

  echo -e "  ${BOLD}Summary:${NC}"
  echo "    Host:    ${SMTP_HOST_NEW}:${SMTP_PORT_NEW}"
  echo "    User:    ${SMTP_USER_NEW}"
  echo "    Sender:  ${SMTP_SENDER_NEW} <${SMTP_ADMIN_NEW}>"
  echo ""
  read -p "  Save to .env and restart auth container? [J/n]: " CONFIRM
  [[ "${CONFIRM,,}" == "n" ]] && { echo "  Cancelled."; return 0; }

  env_set "SMTP_HOST"                "$SMTP_HOST_NEW"
  env_set "SMTP_PORT"                "$SMTP_PORT_NEW"
  env_set "SMTP_USER"                "$SMTP_USER_NEW"
  env_set "SMTP_PASS"                "$SMTP_PASS_NEW"
  env_set "SMTP_ADMIN_EMAIL"         "$SMTP_ADMIN_NEW"
  env_set "SMTP_SENDER_NAME"         "$SMTP_SENDER_NEW"
  env_set "ENABLE_EMAIL_AUTOCONFIRM" "false"

  success "SMTP configuration updated in .env."
  info "Restarting auth container..."
  docker compose -f "$COMPOSE_FILE" up -d --force-recreate auth
  success "auth container restarted. SMTP is now active."
  echo ""

  read -p "  Deploy and restart Edge Functions now? [J/n]: " DO_FN_DEPLOY
  if [[ "${DO_FN_DEPLOY,,}" != "n" ]]; then
    DEPLOYED=0
    deploy_edge_functions_to_volumes
    if [[ $DEPLOYED -gt 0 ]]; then
      info "Restarting functions container..."
      restart_recipe_services
      success "${DEPLOYED} function(s) updated."
    else
      warn "No function files found."
    fi
  fi

  echo ""
  echo -e "  ${BOLD}Tip:${NC} Einladungen versenden: App → Haushalt → Mitglied einladen"
  weiter
}

modus_config() {
  header "Adjust Configuration"

  if [[ ! -f ".env" ]]; then
    warn ".env nicht gefunden. Bitte zuerst eine Installation durchführen."
    weiter; return 0
  fi
  echo ""
  echo -e "  ${BOLD}What would you like to configure?${NC}"
  echo ""
  echo -e "  ${BOLD}[1]${NC} General (app URL, port, admin email)"
  echo -e "  ${BOLD}[2]${NC} Switch invite link to app domain"
  echo "  [0] Back"
  echo ""
  read -p "  -> Choice [1]: " CONFIG_CHOICE
  [[ -z "$CONFIG_CHOICE" ]] && CONFIG_CHOICE=1
  [[ "$CONFIG_CHOICE" == "0" ]] && return 0

  if [[ "$CONFIG_CHOICE" == "2" ]]; then
    header "Invite Link on App Domain"
    echo ""

    if [[ "$IS_VOLLSTACK" != "true" ]]; then
      warn "Only available for fullstack installations."
      warn "In app-only mode, API_EXTERNAL_URL must be set in the external Supabase instance."
      weiter; return 0
    fi

    local SITE_URL_NOW API_EXTERNAL_NOW SUPABASE_PUBLIC_NOW REACT_SUPA_NOW
    SITE_URL_NOW="$(env_get "SITE_URL")"
    API_EXTERNAL_NOW="$(env_get "API_EXTERNAL_URL")"
    SUPABASE_PUBLIC_NOW="$(env_get "SUPABASE_PUBLIC_URL")"
    REACT_SUPA_NOW="$(env_get "REACT_APP_SUPABASE_URL")"

    if [[ -z "$SITE_URL_NOW" ]]; then
      warn "SITE_URL is missing in .env. Please run option [1] first."
      weiter; return 0
    fi

    echo "  Target:"
    echo "    API_EXTERNAL_URL -> ${SITE_URL_NOW}"
    echo ""
    echo "  Current:"
    echo "    SITE_URL:               ${SITE_URL_NOW}"
    echo "    API_EXTERNAL_URL:       ${API_EXTERNAL_NOW}"
    echo "    SUPABASE_PUBLIC_URL:    ${SUPABASE_PUBLIC_NOW}"
    echo "    REACT_APP_SUPABASE_URL: ${REACT_SUPA_NOW}"
    print_url_role_warnings
    echo ""
    read -p "  Switch? [J/n]: " DO_SWITCH
    if [[ "${DO_SWITCH,,}" == "n" ]]; then
      echo "  Cancelled."
      weiter; return 0
    fi

    env_set "API_EXTERNAL_URL" "$SITE_URL_NOW"
    local MAILER_INVITE_NOW
    MAILER_INVITE_NOW="$(env_get "MAILER_URLPATHS_INVITE")"
    if [[ -z "$MAILER_INVITE_NOW" ]]; then
      env_set "MAILER_URLPATHS_INVITE" "/auth/v1/verify"
    fi

    success "API_EXTERNAL_URL set to the app domain."
    echo ""
    read -p "  Reload auth + mail templates now? [J/n]: " DO_RELOAD_AUTH
    if [[ "${DO_RELOAD_AUTH,,}" != "n" ]]; then
      mit_spinner "auth + mail-templates werden neu geladen" \
        docker compose -f "$COMPOSE_FILE" up -d --force-recreate mail-templates auth || {
        warn "Restart failed. Please check status: docker compose -f ${COMPOSE_FILE} ps"
        weiter; return 0
      }
      success "auth + mail templates reloaded."
    else
      warn "Change will become active after manually restarting auth/mail templates."
    fi

    echo ""
    warn "Important: Nginx on the app domain must forward /auth/v1/ to :8000."
    echo "  Then run on the host:"
    echo "    sudo nginx -t && sudo systemctl reload nginx"
    echo ""
    echo "  For a complete reload after file updates:"
    echo "    manage_en.sh -> [2] Update -> [5] Full Server Sync"
    weiter
    return 0
  fi

  if [[ "$CONFIG_CHOICE" != "1" ]]; then
    warn "Invalid choice."
    weiter; return 0
  fi

  echo ""
  echo -e "  ${DIM}Current values from .env are shown as suggestions.${NC}"
  print_url_role_warnings
  echo -e "  ${DIM}Nur geänderte Werte werden gespeichert (App-URL/Port → Rebuild nötig).${NC}"
  echo ""

  local CHANGED=false

  local OLD_URL NEW_URL
  OLD_URL="$(env_get "SITE_URL")"
  [[ -z "$OLD_URL" ]] && OLD_URL="$(env_get "APP_URL")"
  [[ -z "$OLD_URL" ]] && OLD_URL="$(env_get "REACT_APP_PASSWORD_RESET_REDIRECT_URL" | sed 's#/update-password$##')"
  NEW_URL=$(env_prompt "SITE_URL" "App-URL oder lokale Adresse (z.B. https://umzug.meine-domain.de oder http://localhost:3000)")
  if [[ -n "$NEW_URL" && "$NEW_URL" != "$OLD_URL" ]]; then
    env_set "APP_URL"                               "$NEW_URL"
    env_set "SITE_URL"                              "$NEW_URL"
    env_set "REACT_APP_PASSWORD_RESET_REDIRECT_URL" "${NEW_URL}/update-password"
    if [[ -n "$(env_get "ADDITIONAL_REDIRECT_URLS")" ]]; then
      env_set "ADDITIONAL_REDIRECT_URLS"            "$NEW_URL"
    fi
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
    if [[ -n "$(env_get "SUPABASE_PUBLIC_URL")" ]]; then
      env_set "SUPABASE_PUBLIC_URL" "$NEW_SUPABASE_URL"
    fi
    if [[ -n "$(env_get "API_EXTERNAL_URL")" ]]; then
      env_set "API_EXTERNAL_URL" "$NEW_SUPABASE_URL"
    fi
    warn "Supabase-URL geÃ¤ndert â†’ App-Rebuild erforderlich."
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
    success "Admin email updated."
    CHANGED=true
  fi

  if [[ "$CHANGED" == "false" ]]; then
    echo ""; dim "  Keine Änderungen vorgenommen."; weiter; return 0
  fi

  echo ""
  success ".env updated."
  echo ""
  read -p "  Rebuild and start the app container now? [J/n]: " DO_REBUILD
  if [[ "${DO_REBUILD,,}" != "n" ]]; then
    mit_spinner "App-Container wird gebaut (kann 2-5 Min dauern)" \
      docker compose -f "$COMPOSE_FILE" build umzugsplaner-app
    mit_spinner "Container wird neu gestartet" \
      docker compose -f "$COMPOSE_FILE" up -d --force-recreate umzugsplaner-app
    success "App restarted."
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
  header "Configure Ollama"

  echo ""
  echo "  How is your Ollama server installed?"
  echo ""
  echo "  [1] Directly on Linux (systemd service)"
  echo "  [2] As a Docker container (this or another server)"
  echo "  [3] External server (update URL only)"
  echo "  [0] Back"
  echo ""
  read -p "  → Choice [1]: " OLLAMA_SETUP
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
    info "Configuring OLLAMA_ORIGINS in the systemd service..."

    if command -v systemctl >/dev/null 2>&1 && systemctl list-units --type=service 2>/dev/null | grep -q ollama; then
      local OVERRIDE_DIR="/etc/systemd/system/ollama.service.d"
      sudo mkdir -p "$OVERRIDE_DIR"
      sudo tee "$OVERRIDE_DIR/cors.conf" > /dev/null << SYSD
[Service]
Environment="OLLAMA_ORIGINS=${OLLAMA_APP_URL}"
SYSD
      sudo systemctl daemon-reload
      sudo systemctl restart ollama
      success "OLLAMA_ORIGINS=${OLLAMA_APP_URL} set and service restarted."
    else
      warn "Systemd service 'ollama' not found. Manual setup:"
      echo ""
      echo "  sudo systemctl edit ollama"
      echo "  → Einfügen:"
      echo "    [Service]"
      echo "    Environment=\"OLLAMA_ORIGINS=${OLLAMA_APP_URL}\""
      echo ""
      echo "  Then: sudo systemctl daemon-reload && sudo systemctl restart ollama"
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
    read -p "  Update Ollama URL in .env? (z.B. https://gpt.meine-domain.de) [Enter = überspringen]: " OLLAMA_EXTERNAL_URL

  elif [[ "$OLLAMA_SETUP" == "2" ]]; then
    header "Ollama — Docker"
    local OLLAMA_APP_URL
    read -p "  App-URL (für CORS): " OLLAMA_APP_URL

    echo ""
    if docker ps --format '{{.Names}}' 2>/dev/null | grep -q "^ollama$"; then
      info "Running 'ollama' container found."
      echo "  OLLAMA_ORIGINS setzen: OLLAMA_ORIGINS=${OLLAMA_APP_URL}"
      echo "  Then: docker compose -f docker-compose.full.yml up -d --force-recreate ollama"
    else
      warn "No running 'ollama' container found."
      echo ""
      echo "  docker run -d --name ollama \\"
      echo "    -p 11434:11434 \\"
      echo "    -e OLLAMA_ORIGINS=\"${OLLAMA_APP_URL}\" \\"
      echo "    -v ollama-data:/root/.ollama \\"
      echo "    ollama/ollama"
    fi

    echo ""
    local OLLAMA_PORT_INPUT
    read -p "  Ollama-Port [11434]: " OLLAMA_PORT_INPUT
    [[ -z "$OLLAMA_PORT_INPUT" ]] && OLLAMA_PORT_INPUT=11434
    OLLAMA_EXTERNAL_URL="http://localhost:${OLLAMA_PORT_INPUT}"
    local CONFIRM_URL
    read -p "  Update Ollama URL in .env with '${OLLAMA_EXTERNAL_URL}'? [j/N]: " CONFIRM_URL
    [[ "${CONFIRM_URL,,}" != "j" && "${CONFIRM_URL,,}" != "y" ]] && OLLAMA_EXTERNAL_URL=""

  else
    header "Ollama — Externer Server"
    read -p "  Ollama base URL (z.B. https://gpt.meine-domain.de): " OLLAMA_EXTERNAL_URL
    if [[ -z "$OLLAMA_EXTERNAL_URL" ]]; then
      warn "No URL provided."; weiter; return 0
    fi
    echo ""
    warn "Important: your external Ollama server must return CORS headers."
  fi

  if [[ -n "$OLLAMA_EXTERNAL_URL" && -f ".env" ]]; then
    if grep -q "^OLLAMA_EXTERNAL_URL=" .env; then
      sed -i "s|^OLLAMA_EXTERNAL_URL=.*|OLLAMA_EXTERNAL_URL=${OLLAMA_EXTERNAL_URL}|" .env
    else
      echo "OLLAMA_EXTERNAL_URL=${OLLAMA_EXTERNAL_URL}" >> .env
    fi
    success ".env updated with Ollama URL: ${OLLAMA_EXTERNAL_URL}"
    echo ""
    echo "  In der App: Profil → KI-Einstellungen → Ollama → Basis-URL:"
    echo "  ${OLLAMA_EXTERNAL_URL}"
  fi

  echo ""
  success "Ollama configuration completed."
  weiter
}

modus_update() {
  while true; do
    clear
    echo ""
    echo -e "${BOLD}${GREEN}============================================================${NC}"
    echo -e "${BOLD}${GREEN}  Umzughelfer — Update & Maintenance${NC}"
    echo -e "${BOLD}${GREEN}============================================================${NC}"
    echo ""

    if [[ ! -f ".env" ]]; then
      warn ".env nicht gefunden. Bitte zuerst eine Installation durchführen."
      weiter; return 0
    fi

    if [[ "$IS_VOLLSTACK" == "true" ]]; then
      echo -e "  Installation: ${CYAN}Fullstack (Supabase + app)${NC}"
    else
      echo -e "  Installation: ${CYAN}App-only${NC}"
    fi
    local APP_URL_NOW
    APP_URL_NOW="$(env_get "SITE_URL")"
    [[ -n "$APP_URL_NOW" ]] && echo -e "  App-URL:      ${CYAN}${APP_URL_NOW}${NC}"
    echo ""
    echo -e "  ${BOLD}What would you like to do?${NC}"
    echo ""
    echo -e "  ${BOLD}[1]${NC} App update          — git pull + rebuild + restart"
    echo -e "  ${BOLD}[2]${NC} Rebuild app only    — without git pull (after local changes)"
    echo -e "  ${BOLD}[3]${NC} Edge Functions      — deploy supabase/functions/ + restart"
    echo -e "  ${BOLD}[4]${NC} Docker images       — update all images + restart"
    echo -e "  ${BOLD}[5]${NC} Full server sync    — reload app + invite template + functions"
    echo "  [0] Back to main menu"
    echo ""
    read -p "  → Choice [1]: " UPDATE_CHOICE
    [[ -z "$UPDATE_CHOICE" ]] && UPDATE_CHOICE=1

    case "$UPDATE_CHOICE" in
      0) return 0 ;;

      1)
        header "App-Update"
        local BEFORE_UPDATE_REF="" AFTER_UPDATE_REF=""
        KONG_RELOAD_REASON=""
        if command -v git >/dev/null 2>&1 && [[ -d ".git" ]]; then
          echo ""
          local CURRENT_BRANCH CURRENT_COMMIT BEHIND
          BEFORE_UPDATE_REF="$(git rev-parse HEAD 2>/dev/null || true)"
          CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")
          CURRENT_COMMIT=$(git log --oneline -1 2>/dev/null || echo "unknown")
          echo -e "  Branch:  ${CYAN}${CURRENT_BRANCH}${NC}"
          echo -e "  Commit:  ${DIM}${CURRENT_COMMIT}${NC}"
          echo ""
          git fetch --quiet 2>/dev/null || warn "git fetch failed (no network?)"
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
            git pull || warn "git pull failed. Continuing anyway."
            success "Repository updated."
          fi
          AFTER_UPDATE_REF="$(git rev-parse HEAD 2>/dev/null || true)"
        else
          warn "Kein Git-Repository gefunden. Überspringe git pull."
        fi

        echo ""
        read -p "  Rebuild and start the app container now? [J/n]: " CONFIRM
        if [[ "${CONFIRM,,}" == "n" ]]; then echo "  Cancelled."; weiter; continue; fi

        echo ""
        info "Updating Edge Functions..."
        DEPLOYED=0; deploy_edge_functions_to_volumes
        [[ $DEPLOYED -gt 0 ]] && success "${DEPLOYED} function(s) updated." || dim "  No function files found."
        if [[ "$IS_VOLLSTACK" == "true" ]]; then
          ensure_fullstack_update_prereqs || { weiter; continue; }
          maybe_reload_kong_for_git_range "$BEFORE_UPDATE_REF" "$AFTER_UPDATE_REF"
          reload_kong_if_needed "$KONG_RELOAD_REASON"
        fi
        echo ""
        mit_spinner "App-Container wird gebaut (kann 2-5 Min dauern)" \
          docker compose -f "$COMPOSE_FILE" build umzugsplaner-app || {
          warn "Build failed. Logs prüfen: docker compose logs umzugsplaner-app"
          weiter; continue
        }
        mit_spinner "Container werden neu gestartet" \
          docker compose -f "$COMPOSE_FILE" up -d --force-recreate umzugsplaner-app || {
          warn "Neustart failed. Status prüfen: docker compose ps"
          weiter; continue
        }

        if [[ "$IS_VOLLSTACK" == "true" ]]; then
          restart_recipe_services
          check_supabase_studio_access
        fi

        echo ""
        success "Update completed."
        local NEW_COMMIT
        NEW_COMMIT=$(git log --oneline -1 2>/dev/null || echo "")
        [[ -n "$NEW_COMMIT" ]] && dim "  Currenter Stand: ${NEW_COMMIT}"
        echo ""
        APP_URL_NOW="$(env_get "SITE_URL")"
        [[ -n "$APP_URL_NOW" ]] && echo -e "  App available: ${CYAN}${APP_URL_NOW}${NC}"
        weiter
        ;;

      2)
        header "Rebuild App"
        KONG_RELOAD_REASON=""
        echo ""
        echo "  Compose file: ${COMPOSE_FILE}"
        echo ""
        read -p "  Rebuild and start app container? [J/n]: " CONFIRM
        if [[ "${CONFIRM,,}" == "n" ]]; then echo "  Cancelled."; weiter; continue; fi

        mit_spinner "App-Container wird gebaut (kann 2-5 Min dauern)" \
          docker compose -f "$COMPOSE_FILE" build umzugsplaner-app || {
          warn "Build failed. Logs prüfen: docker compose logs umzugsplaner-app"
          weiter; continue
        }
        mit_spinner "Container wird neu gestartet" \
          docker compose -f "$COMPOSE_FILE" up -d --force-recreate umzugsplaner-app || {
          warn "Neustart failed. Status prüfen: docker compose ps"
          weiter; continue
        }

        if [[ "$IS_VOLLSTACK" == "true" ]]; then
          ensure_fullstack_update_prereqs || { weiter; continue; }
          reload_kong_if_needed "$KONG_RELOAD_REASON"
          restart_recipe_services
          check_supabase_studio_access
        fi

        success "App rebuilt and started successfully."
        APP_URL_NOW="$(env_get "SITE_URL")"
        [[ -n "$APP_URL_NOW" ]] && echo -e "  App: ${CYAN}${APP_URL_NOW}${NC}"
        weiter
        ;;

      3)
        header "Deploy Edge Functions"
        KONG_RELOAD_REASON=""
        echo ""
        if [[ "$IS_VOLLSTACK" != "true" ]]; then
          warn "Nur für Vollstack-Installation verfügbar."
          weiter; continue
        fi
        ensure_fullstack_update_prereqs || { weiter; continue; }
        reload_kong_if_needed "$KONG_RELOAD_REASON"
        DEPLOYED=0; deploy_edge_functions_to_volumes
        if [[ $DEPLOYED -gt 0 ]]; then
          echo ""
          restart_recipe_services
          success "${DEPLOYED} Function(s) deployed and container restarted."
          check_supabase_studio_access
        else
          warn "No functions deployed."
        fi
        weiter
        ;;

      4)
        header "Update Docker Images"
        KONG_RELOAD_REASON=""
        echo ""
        ensure_fullstack_update_prereqs || { weiter; continue; }
        warn "All Docker images will be updated to the latest version."
        warn "This can take several minutes (~500 MB - 2 GB Downloads)."
        echo ""
        read -p "  Continue? [J/n]: " CONFIRM
        if [[ "${CONFIRM,,}" == "n" ]]; then echo "  Cancelled."; weiter; continue; fi

        if [[ "$HAS_OLLAMA" == "true" ]]; then
          mit_spinner "Images werden heruntergeladen (kann 5-15 Min dauern)" \
            bash -c "docker compose -f '$COMPOSE_FILE' --profile ollama pull --ignore-pull-failures 2>&1 | grep -v 'pull access denied' || true"
        else
          mit_spinner "Images werden heruntergeladen (kann 5-15 Min dauern)" \
            bash -c "docker compose -f '$COMPOSE_FILE' pull --ignore-pull-failures 2>&1 | grep -v 'pull access denied' || true"
        fi

        echo ""
        mit_spinner "App-Image wird lokal gebaut (kann 2-5 Min dauern)" \
          docker compose -f "$COMPOSE_FILE" build umzugsplaner-app || {
          warn "Build failed. Logs prüfen: docker compose logs umzugsplaner-app"
          weiter; continue
        }
        if [[ "$IS_VOLLSTACK" == "true" ]]; then
          if recipe_parser_image_exists; then
            echo ""
            warn "Recipe parser image already exists. Rebuilding often takes 10-20 minutes."
            read -p "  Rebuild recipe parser image anyway? [y/N]: " BUILD_RECIPE_PARSER
          else
            warn "Recipe parser image is missing. It will be built once (can take 10-20 minutes)."
            BUILD_RECIPE_PARSER="y"
          fi
          if [[ "${BUILD_RECIPE_PARSER,,}" == "j" || "${BUILD_RECIPE_PARSER,,}" == "y" ]]; then
            mit_spinner "Building local recipe parser image (can take 10-20 min)" \
              docker compose -f "$COMPOSE_FILE" build recipe-source-parser || {
              warn "Recipe parser build failed. Check logs: docker compose logs recipe-source-parser"
              weiter; continue
            }
          else
            dim "  Recipe parser image will not be rebuilt."
          fi
        fi
        echo ""
        if [[ "$HAS_OLLAMA" == "true" ]]; then
          mit_spinner "Alle Container werden neu gestartet" \
            docker compose -f "$COMPOSE_FILE" --profile ollama up -d --force-recreate || {
            warn "Neustart failed. Status prüfen: docker compose ps"
            weiter; continue
          }
        else
          mit_spinner "Alle Container werden neu gestartet" \
            docker compose -f "$COMPOSE_FILE" up -d --force-recreate || {
            warn "Neustart failed. Status prüfen: docker compose ps"
            weiter; continue
          }
        fi

        success "Docker images updated and containers restarted."
        check_supabase_studio_access
        weiter
        ;;

      5)
        header "Full Server Sync"
        KONG_RELOAD_REASON=""
        echo ""
        if [[ "$IS_VOLLSTACK" != "true" ]]; then
          warn "Nur für Vollstack-Installation verfügbar."
          weiter; continue
        fi
        echo "  Dieser Ablauf lädt nach Datei-Kopie alle relevanten Komponenten neu:"
        ensure_fullstack_update_prereqs || { weiter; continue; }
        reload_kong_if_needed "$KONG_RELOAD_REASON"
        echo "    1) Deploy Edge Functions"
        echo "    2) Rebuild + restart app"
        echo "    3) force-recreate mail templates + auth"
        echo "    4) restart functions"
        echo ""
        read -p "  Continue? [J/n]: " CONFIRM
        if [[ "${CONFIRM,,}" == "n" ]]; then echo "  Cancelled."; weiter; continue; fi

        echo ""
        info "Updating Edge Functions..."
        DEPLOYED=0
        deploy_edge_functions_to_volumes
        [[ $DEPLOYED -gt 0 ]] && success "${DEPLOYED} function(s) updated." || warn "No function files found."

        echo ""
        mit_spinner "App-Container wird gebaut (kann 2-5 Min dauern)" \
          docker compose -f "$COMPOSE_FILE" build umzugsplaner-app || {
          warn "Build failed. Logs prüfen: docker compose logs umzugsplaner-app"
          weiter; continue
        }
        mit_spinner "App-Container wird neu gestartet" \
          docker compose -f "$COMPOSE_FILE" up -d --force-recreate umzugsplaner-app || {
          warn "Neustart failed. Status prüfen: docker compose ps"
          weiter; continue
        }

        echo ""
        mit_spinner "mail-templates + auth werden neu geladen" \
          docker compose -f "$COMPOSE_FILE" up -d --force-recreate mail-templates auth || {
          warn "auth/mail-templates Neustart failed. Status prüfen: docker compose ps"
          weiter; continue
        }

        echo ""
        restart_recipe_services

        echo ""
        success "Full server sync completed."
        check_supabase_studio_access
        APP_URL_NOW="$(env_get "SITE_URL")"
        [[ -n "$APP_URL_NOW" ]] && echo -e "  App available: ${CYAN}${APP_URL_NOW}${NC}"
        weiter
        ;;

      *)
        warn "Invalid choice."
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
    echo -e "${BOLD}${RED}  Umzughelfer — Uninstall & Cleanup${NC}"
    echo -e "${BOLD}${RED}============================================================${NC}"
    echo ""

    if [[ "$IS_VOLLSTACK" == "true" ]]; then
      echo -e "  Detected installation: ${CYAN}Fullstack (Supabase + app)${NC}"
    else
      echo -e "  Detected installation: ${CYAN}App-only${NC}"
    fi
    echo ""
    echo "  What would you like to do?"
    echo ""
    echo -e "  ${BOLD}[1] Complete uninstall${NC}"
    echo "      Containers, Docker volumes, volumes/, .env, CREDENTIALS.txt"
    echo ""
    echo -e "  ${BOLD}[2] Soft-Reset${NC}"
    echo "      Remove containers + Docker volumes"
    echo "      Keeps: volumes/, .env, CREDENTIALS.txt"
    echo ""
    echo -e "  ${BOLD}[3] Stop containers only${NC}"
    echo "      Keeps: volumes, volumes/, .env (fastest restart)"
    echo ""
    echo -e "  ${BOLD}[4] Redeploy Edge Functions${NC}"
    echo "      supabase/functions/ → volumes/functions/ + restart container"
    echo ""
    echo -e "  ${BOLD}[5] Remove Docker Images${NC}"
    echo "      Frees about 3-5 GB of disk space"
    echo ""
    echo "  [0] Back to main menu"
    echo ""
    read -p "  → Choice [0]: " DEINSTALL_CHOICE
    [[ -z "$DEINSTALL_CHOICE" ]] && DEINSTALL_CHOICE=0

    case "$DEINSTALL_CHOICE" in
      0) return 0 ;;

      3)
        header "Stop Containers"
        read -p "  Stop and remove containers? [j/N]: " CONFIRM
        if [[ "${CONFIRM,,}" != "j" && "${CONFIRM,,}" != "y" ]]; then echo "  Cancelled."; weiter; continue; fi
        container_stoppen
        echo ""
        success "Done. Restart with: docker compose -f ${COMPOSE_FILE} up -d"
        weiter
        ;;

      4)
        header "Redeploy Edge Functions"
        DEPLOYED=0; deploy_edge_functions_to_volumes
        if [[ $DEPLOYED -gt 0 ]]; then
          info "Restarting functions container..."
          restart_recipe_services
          success "${DEPLOYED} Function(s) deployed and container restarted."
        else
          warn "No functions deployed."
        fi
        weiter
        ;;

      5)
        header "Remove Docker Images"
        echo ""
        warn "The Supabase Docker images (~3-5 GB) will be removed."
        warn "The next installation must download all images again."
        echo ""
        read -p "  Remove Docker Images? [j/N]: " CONFIRM
        if [[ "${CONFIRM,,}" != "j" && "${CONFIRM,,}" != "y" ]]; then echo "  Cancelled."; weiter; continue; fi

        info "Removing Docker images..."
        docker compose -f "$COMPOSE_FILE" --profile ollama down --rmi all 2>/dev/null || \
        docker compose -f "$COMPOSE_FILE" down --rmi all 2>/dev/null || \
        warn "Some images could not be removed."

        read -p "  Also clear Docker build cache? [j/N]: " RM_CACHE
        [[ "${RM_CACHE,,}" == "j" || "${RM_CACHE,,}" == "y" ]] && docker builder prune -f

        success "Docker images removed."
        weiter
        ;;

      1|2)
        local DEINSTALL_MODE
        [[ "$DEINSTALL_CHOICE" == "1" ]] && DEINSTALL_MODE="vollstaendig" || DEINSTALL_MODE="soft"

        echo ""
        if [[ "$DEINSTALL_MODE" == "vollstaendig" ]]; then
          echo -e "  ${RED}${BOLD}ACHTUNG: Diese Aktion löscht ALLE Daten unwiderruflich!${NC}"
          echo -e "  ${RED}Affected: database, configuration, uploaded files.${NC}"
        else
          echo -e "  ${YELLOW}Containers and Docker volumes will be removed.${NC}"
          echo -e "  ${YELLOW}volumes/, .env and CREDENTIALS.txt will be kept.${NC}"
        fi
        echo ""
        read -p "  Continue? [j/N]: " FINAL_CONFIRM
        if [[ "${FINAL_CONFIRM,,}" != "j" && "${FINAL_CONFIRM,,}" != "y" ]]; then echo "  Cancelled."; weiter; continue; fi

        header "Step 1: Back Up Configuration"
        if [[ -f ".env" || -f "CREDENTIALS.txt" ]]; then
          read -p "  Back up .env and CREDENTIALS.txt first? [J/n]: " DO_BACKUP
          if [[ "${DO_BACKUP,,}" != "n" ]]; then
            local CFG_BACKUP_DIR="backup_$(date +%Y%m%d_%H%M%S)"
            mkdir -p "$CFG_BACKUP_DIR"
            [[ -f ".env" ]]            && cp .env            "$CFG_BACKUP_DIR/.env"            && echo "    OK .env backed up"
            [[ -f "CREDENTIALS.txt" ]] && cp CREDENTIALS.txt "$CFG_BACKUP_DIR/CREDENTIALS.txt" && echo "    OK CREDENTIALS.txt backed up"
            success "Backup saved in: ${CFG_BACKUP_DIR}/"
          else
            warn "No backup created."
          fi
        fi

        header "Step 2: Stop Containers"
        container_stoppen

        header "Step 3: Remove Docker Volumes"
        volumes_entfernen

        if [[ "$DEINSTALL_MODE" == "vollstaendig" ]]; then
          header "Step 4: Remove volumes/ Directory"
          if [[ -d "volumes" ]]; then
            echo ""
            warn "Das volumes/-Verzeichnis enthält alle PostgreSQL-Daten,"
            warn "Supabase configuration, Edge Functions and storage files."
            echo ""
            read -p "  volumes/-Verzeichnis löschen? [j/N]: " CONFIRM_VOL
            if [[ "${CONFIRM_VOL,,}" == "j" || "${CONFIRM_VOL,,}" == "y" ]]; then
              rm -rf volumes/
              success "volumes/ directory deleted."
            else
              warn "volumes/ was NOT deleted."
            fi
          else
            info "volumes/ directory not found."
          fi

          header "Step 5: Remove Configuration Files"
          local ENTFERNT=false
          [[ -f ".env" ]]            && rm .env            && echo "    OK .env removed"            && ENTFERNT=true
          [[ -f "CREDENTIALS.txt" ]] && rm CREDENTIALS.txt && echo "    OK CREDENTIALS.txt removed" && ENTFERNT=true
          [[ "$ENTFERNT" == "true" ]] && success "Configuration files removed." || info "No configuration files found."

          header "Step 6: Docker Images (optional)"
          echo ""
          read -p "  Remove Docker Images? (~3-5 GB) [j/N]: " RM_IMAGES
          if [[ "${RM_IMAGES,,}" == "j" || "${RM_IMAGES,,}" == "y" ]]; then
            docker compose -f "$COMPOSE_FILE" --profile ollama down --rmi all 2>/dev/null || \
            docker compose -f "$COMPOSE_FILE" down --rmi all 2>/dev/null || true
            success "Docker images removed."
          fi

          header "Step 7: Build Cache (optional)"
          read -p "  Clear Docker build cache? [j/N]: " RM_CACHE
          [[ "${RM_CACHE,,}" == "j" || "${RM_CACHE,,}" == "y" ]] && docker builder prune -f && success "Build cache cleared."
        fi

        echo ""
        echo -e "${BOLD}${GREEN}============================================================${NC}"
        success "Completed!"
        echo -e "${BOLD}${GREEN}============================================================${NC}"
        echo ""
        if [[ "$DEINSTALL_MODE" == "vollstaendig" ]]; then
          echo "  All components were removed."
        else
          echo "  Containers and Docker volumes removed."
          echo "  volumes/, .env und CREDENTIALS.txt sind noch vorhanden."
        fi
        weiter
        ;;

      *)
        warn "Invalid choice."
        sleep 1
        ;;
    esac
  done
}

modus_installation() {
  while true; do
  local ZURUECK=false

  # Choose installation type
  clear
  echo ""
  echo -e "${BOLD}${GREEN}============================================================${NC}"
  echo -e "${BOLD}${GREEN}  Umzughelfer — Installation${NC}"
  echo -e "${BOLD}${GREEN}============================================================${NC}"
  echo ""

  if [[ -f ".env" ]]; then
    echo -e "  ${YELLOW}⚠  Existing installation detected (.env found)${NC}"
    echo ""
  fi

  echo "  Choose installation type:"
  echo ""
  echo "  [1] New installation — fullstack (Supabase + app via Docker)"
  echo "  [2] New installation — app only (use existing Supabase)"
  echo "  [0] Back to main menu"
  echo ""
  read -p "  → Choice [1]: " INSTALL_TYPE_CHOICE
  [[ -z "$INSTALL_TYPE_CHOICE" ]] && INSTALL_TYPE_CHOICE=1
  [[ "$INSTALL_TYPE_CHOICE" == "0" ]] && return 0

  local INSTALL_MODE
  case "$INSTALL_TYPE_CHOICE" in
    1) INSTALL_MODE="vollstack" ;;
    2) INSTALL_MODE="apponly" ;;
    *) warn "Invalid choice."; sleep 1; continue ;;
  esac

  local DB_SCHEMA_STATUS="not executed"
  local MULTIUSER_SCHEMA_STATUS="not executed"

  # ---- Step 1: requirements ----
  header "Step 1: Check requirements"

  command -v docker >/dev/null 2>&1      || err "Docker is not installed.\n  → https://docs.docker.com/get-docker/"
  docker compose version >/dev/null 2>&1 || err "Docker Compose plugin is missing.\n  → Update Docker or install the plugin."
  command -v node >/dev/null 2>&1        || err "Node.js is not installed.\n  → https://nodejs.org/"
  command -v openssl >/dev/null 2>&1     || err "openssl is not installed.\n  → sudo apt install openssl"

  local NODE_VERSION
  NODE_VERSION=$(node -e "console.log(process.version.slice(1).split('.')[0])")
  [[ "$NODE_VERSION" -lt 16 ]] && err "Node.js Version ${NODE_VERSION} too old. Version 16 or newer is required."

  success "All requirements met."

  # ---- Step 2: Configuration ----
  header "Step 2: Configuration"

  echo "Please enter the following information."
  echo "(Enter drücken für den Standardwert)"
  echo ""

  local APP_URL ADMIN_EMAIL APP_PORT SUPABASE_URL STUDIO_PASSWORD EXT_ANON_KEY EXT_SERVICE_ROLE_KEY
  local ACCESS_LABEL STUDIO_ACCESS_URL

  while true; do
    read -p "  Deine E-Mail-Adresse (für Push-Notifications, 0 = Cancel): " ADMIN_EMAIL
    [[ "$ADMIN_EMAIL" == "0" ]] && { ZURUECK=true; break; }
    [[ -n "$ADMIN_EMAIL" ]] && break
    echo "  → Email is required."
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
      read -s -p "  Supabase Studio Password (mind. 8 Zeichen, 0 = Cancel): " STUDIO_PASSWORD
      echo ""
      [[ "$STUDIO_PASSWORD" == "0" ]] && { ZURUECK=true; break; }
      [[ ${#STUDIO_PASSWORD} -ge 8 ]] && break
      echo "  → Password must be at least 8 characters long."
    done
    [[ "$ZURUECK" == "true" ]] && continue
  else
    echo ""
    info "Enter credentials for the existing Supabase instance."
    info "Found under: Supabase Dashboard → Project Settings → API"
    echo ""

    while true; do
      read -p "  Supabase URL (0 = Cancel): " SUPABASE_URL
      [[ "$SUPABASE_URL" == "0" ]] && { ZURUECK=true; break; }
      [[ -n "$SUPABASE_URL" ]] && break
      echo "  → Supabase URL is required."
    done
    [[ "$ZURUECK" == "true" ]] && continue

    while true; do
      read -p "  Supabase Anon Key (0 = Cancel): " EXT_ANON_KEY
      [[ "$EXT_ANON_KEY" == "0" ]] && { ZURUECK=true; break; }
      [[ -n "$EXT_ANON_KEY" ]] && break
      echo "  → Anon Key is required."
    done
    [[ "$ZURUECK" == "true" ]] && continue

    while true; do
      read -s -p "  Supabase Service Role Key (SECRET, 0 = Cancel): " EXT_SERVICE_ROLE_KEY
      echo ""
      [[ "$EXT_SERVICE_ROLE_KEY" == "0" ]] && { ZURUECK=true; break; }
      [[ -n "$EXT_SERVICE_ROLE_KEY" ]] && break
      echo "  → Service Role Key is required."
    done
    [[ "$ZURUECK" == "true" ]] && continue
  fi

  # ---- Ollama ----
  echo ""
  echo "  KI-Assistent — Ollama:"
  echo "  [1] Install Ollama via Docker"
  echo "  [2] External / already running Ollama server"
  echo "  [3] No Ollama (OpenAI only or no AI assistant)"
  read -p "  → Choice [3]: " OLLAMA_CHOICE
  [[ -z "$OLLAMA_CHOICE" ]] && OLLAMA_CHOICE=3

  local INSTALL_OLLAMA=false
  local OLLAMA_PORT=11434
  local OLLAMA_EXTERNAL_URL=""

  if [[ "$OLLAMA_CHOICE" == "1" ]]; then
    INSTALL_OLLAMA=true
    read -p "  Ollama Port [11434]: " OLLAMA_PORT
    [[ -z "$OLLAMA_PORT" ]] && OLLAMA_PORT=11434
    info "Ollama will be started via Docker profile 'ollama'."
    info "Load a model after installation: docker exec ollama ollama pull llama3.2"
  elif [[ "$OLLAMA_CHOICE" == "2" ]]; then
    read -p "  Base URL of your Ollama server: " OLLAMA_EXTERNAL_URL
    if [[ -z "$OLLAMA_EXTERNAL_URL" ]]; then
      warn "No URL provided. Ollama will not be configured."
    else
      warn "Make sure CORS is allowed on the Ollama server."
    fi
  fi

  # ---- SMTP optional ----
  echo ""
  echo "  ──────────────────────────────────────────────────────"
  echo "  SMTP (E-Mail-Versand) — optional konfigurieren?"
  echo "  Ermöglicht Registrierungsbestätigungen und Einladungs-Mails."
  echo "  ──────────────────────────────────────────────────────"
  read -p "  Set up SMTP now? [j/N]: " DO_SMTP_NOW

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
    read -p "  SMTP username / email: " SMTP_USER_VAL
    echo -e "  ${DIM}(hidden input)${NC}"
    read -s -p "  SMTP password: " SMTP_PASS_VAL; echo ""
    read -p "  Sender name [Umzughelfer]: " SMTP_SENDER_VAL
    [[ -z "$SMTP_SENDER_VAL" ]] && SMTP_SENDER_VAL="Umzughelfer"
    echo ""
    success "SMTP settings will be saved to .env."
  fi

  echo ""
  success "Configuration completed."

  # ---- Schritt 3: Schlüssel generieren ----
  header "Step 3: Generate security keys"

  info "Generiere kryptografische Schlüssel..."
  local KEYS_JSON
  KEYS_JSON=$(node scripts/generate-keys.js) || err "Schlüsselgenerierung failed."

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
  local RECIPE_PARSER_INTERNAL_TOKEN
  RECIPE_PARSER_INTERNAL_TOKEN=$(extract_key RECIPE_PARSER_INTERNAL_TOKEN)

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

  # ---- Step 4: Supabase Initialization Files (nur Vollstack) ----
  if [[ "$INSTALL_MODE" == "vollstack" ]]; then
    header "Step 4: Supabase Initialization Files"

    local SUPABASE_RAW="https://raw.githubusercontent.com/supabase/supabase/master/docker"
    local SUPABASE_FILES=(
      "volumes/db/realtime.sql" "volumes/db/webhooks.sql"
      "volumes/db/roles.sql"    "volumes/db/jwt.sql"
      "volumes/db/_supabase.sql" "volumes/db/logs.sql"
      "volumes/db/pooler.sql"   "volumes/logs/vector.yml"
      "volumes/pooler/pooler.exs" "volumes/api/kong.yml"
    )

    mkdir -p volumes/db volumes/logs volumes/pooler volumes/storage volumes/functions \
             volumes/snippets volumes/db/data volumes/api

    local ALL_DOWNLOADED=true
    for file in "${SUPABASE_FILES[@]}"; do
      if [[ ! -f "$file" ]]; then
        info "Downloading ${file}..."
        if curl -fsSL "${SUPABASE_RAW}/${file}" -o "${file}" 2>/dev/null; then
          echo "    OK ${file}"
        else
          warn "Could not download ${file} download."
          ALL_DOWNLOADED=false
        fi
      else
        echo "    OK ${file} (already exists)"
      fi
    done

    ensure_kong_entrypoint_script

    if [[ -f "volumes/db/jwt.sql" ]]; then
      sed -i "s/your-super-secret-jwt-token-with-at-least-32-characters-long/${JWT_SECRET}/g" \
        volumes/db/jwt.sql 2>/dev/null || true
    fi

    info "Synchronizing Edge Functions..."
    deploy_edge_functions_to_volumes

    [[ "$ALL_DOWNLOADED" == "true" ]] && success "Initialization files ready." \
      || warn "Some files could not be downloaded."
  fi

  # ---- Schritt 5: .env schreiben ----
  header "Step 5: Create Configuration File"

  local PASSWORD_RESET_URL="${APP_URL}/update-password"
  local INSTALL_DATE
  INSTALL_DATE=$(date "+%Y-%m-%d %H:%M:%S")

  info "Writing .env..."

  if [[ "$INSTALL_MODE" == "vollstack" ]]; then
    cat > .env << VOLLSTACK_ENV
# ============================================================
# Umzughelfer + Supabase — Vollstack
# Automatically generated by manage_en.sh on ${INSTALL_DATE}
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

# React app build variables
REACT_APP_SUPABASE_URL=${SUPABASE_URL}
REACT_APP_SUPABASE_ANON_KEY=${ANON_KEY}
REACT_APP_PASSWORD_RESET_REDIRECT_URL=${PASSWORD_RESET_URL}
REACT_APP_VAPID_PUBLIC_KEY=${VAPID_PUBLIC_KEY}

# Database
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

# Invitation emails (optional, Resend)
RESEND_API_KEY=
INVITE_FROM_EMAIL=
INVITE_BRAND_NAME=Umzughelfer

# Ollama (optional)
OLLAMA_PORT=${OLLAMA_PORT}
OLLAMA_EXTERNAL_URL=${OLLAMA_EXTERNAL_URL}
OLLAMA_ORIGINS=${APP_URL}

# Edge Functions
FUNCTIONS_VERIFY_JWT=true
RECIPE_PARSER_INTERNAL_TOKEN=${RECIPE_PARSER_INTERNAL_TOKEN}
RECIPE_PARSER_URL=http://recipe-source-parser:8090
RECIPE_PARSER_PORT=8090
WHISPER_DEVICE=auto
WHISPER_MODEL=small
WHISPER_CPU_COMPUTE_TYPE=int8
WHISPER_GPU_COMPUTE_TYPE=float16
WHISPER_CPP_FALLBACK_ENABLED=true

# PostgREST
PGRST_DB_SCHEMAS=public,storage,graphql_public
PGRST_DB_MAX_ROWS=1000
PGRST_DB_EXTRA_SEARCH_PATH=public,extensions

# Other
IMGPROXY_ENABLE_WEBP_DETECTION=true
DOCKER_SOCKET_LOCATION=/var/run/docker.sock
VOLLSTACK_ENV

  else
    cat > .env << APPONLY_ENV
# ============================================================
# Umzughelfer App — Existing Supabase instance
# Automatically generated by manage_en.sh on ${INSTALL_DATE}
# ============================================================

# App
APP_PORT=${APP_PORT}
GENERATE_SOURCEMAP=false

# React app build variables
REACT_APP_SUPABASE_URL=${SUPABASE_URL}
REACT_APP_SUPABASE_ANON_KEY=${ANON_KEY}
REACT_APP_PASSWORD_RESET_REDIRECT_URL=${PASSWORD_RESET_URL}
REACT_APP_VAPID_PUBLIC_KEY=${VAPID_PUBLIC_KEY}

# Invitation emails (optional, in externer Supabase/Edge Runtime setzen)
# RESEND_API_KEY=
# INVITE_FROM_EMAIL=
# INVITE_BRAND_NAME=Umzughelfer

# Ollama (optional)
OLLAMA_EXTERNAL_URL=${OLLAMA_EXTERNAL_URL}
APPONLY_ENV
  fi

  success ".env written."

  # SMTP-Werte via env_set schreiben — sicher gegen Sonderzeichen im Password (Heredoc würde $, `` etc. expandieren)
  if [[ "$INSTALL_MODE" == "vollstack" && ( "${DO_SMTP_NOW,,}" == "j" || "${DO_SMTP_NOW,,}" == "y" ) ]]; then
    env_set "SMTP_HOST"                "$SMTP_HOST_VAL"
    env_set "SMTP_PORT"                "$SMTP_PORT_VAL"
    env_set "SMTP_USER"                "$SMTP_USER_VAL"
    env_set "SMTP_PASS"                "$SMTP_PASS_VAL"
    env_set "SMTP_SENDER_NAME"         "$SMTP_SENDER_VAL"
    env_set "ENABLE_EMAIL_AUTOCONFIRM" "false"
    success "SMTP configuration saved to .env."
  fi

  # ---- Schritt 6: Docker bauen und starten ----
  header "Step 6: Start Docker Containers"

  local INST_COMPOSE_FILE="docker-compose.full.yml"
  [[ "$INSTALL_MODE" == "apponly" ]] && INST_COMPOSE_FILE="docker-compose.yml"

  info "Building React app (this can take a few minutes)..."
  docker compose -f "$INST_COMPOSE_FILE" build umzugsplaner-app

  info "Starting containers..."
  set +e
  if [[ "$INSTALL_OLLAMA" == "true" ]]; then
    docker compose -f "$INST_COMPOSE_FILE" --profile ollama up -d
  else
    docker compose -f "$INST_COMPOSE_FILE" up -d
  fi
  local COMPOSE_EXIT=$?
  set -e

  if [[ $COMPOSE_EXIT -ne 0 ]]; then
    warn "Docker Compose reported an error (Exit ${COMPOSE_EXIT})."
    if docker ps --format '{{.Names}}' 2>/dev/null | grep -q "supabase-analytics"; then
      warn "Waiting for analytics container (can take up to 3 minutes during first install)..."
      local ANALYTICS_OK=false
      for _i in $(seq 1 36); do
        if docker exec supabase-analytics curl -sf http://localhost:4000/health >/dev/null 2>&1; then
          ANALYTICS_OK=true; break
        fi
        sleep 5; echo -n "."
      done
      echo ""
      if [[ "$ANALYTICS_OK" == "true" ]]; then
        success "Analytics ready."
        docker compose -f "$INST_COMPOSE_FILE" up -d --no-recreate 2>/dev/null || true
      else
        warn "Analytics is not responding yet. App features are not affected."
        warn "Restart if needed: docker compose -f ${INST_COMPOSE_FILE} restart supabase-analytics"
      fi
    else
      err "Docker start failed (Exit ${COMPOSE_EXIT}). Logs: docker compose -f ${INST_COMPOSE_FILE} logs"
    fi
  fi

  # ---- DB-Schema anwenden (nur Vollstack) ----
  if [[ "$INSTALL_MODE" == "vollstack" ]]; then
    info "Waiting for database readiness (up to 2 minutes)..."
    local RETRIES=24
    until docker exec supabase-db pg_isready -U postgres -h localhost >/dev/null 2>&1 || [[ $RETRIES -eq 0 ]]; do
      echo -n "."; sleep 5; RETRIES=$((RETRIES - 1))
    done
    echo ""

    if [[ $RETRIES -eq 0 ]]; then
      warn "Database antwortet noch nicht. SQL-Setup wird übersprungen."
      DB_SCHEMA_STATUS="übersprungen (DB nicht bereit)"
      MULTIUSER_SCHEMA_STATUS="übersprungen (DB nicht bereit)"
    else
      read -p "  Apply schema now? [J/n]: " APPLY_SCHEMA_NOW
      if [[ "${APPLY_SCHEMA_NOW,,}" == "n" ]]; then
        DB_SCHEMA_STATUS="manuell erforderlich"
        MULTIUSER_SCHEMA_STATUS="manuell erforderlich"
      else
        if [[ -f "database_setup_complete.sql" ]]; then
          info "Applying database_setup_complete.sql..."
          local SQL_RC=0
          run_sql_with_fallback "database_setup_complete.sql" || SQL_RC=$?
          if [[ $SQL_RC -eq 0 ]]; then
            DB_SCHEMA_STATUS="angewendet"
            success "database_setup_complete.sql applied successfully."
          elif [[ $SQL_RC -eq 2 ]]; then
            DB_SCHEMA_STATUS="angewendet (mit Warnungen)"
            warn "database_setup_complete.sql applied with warnings."
          else
            DB_SCHEMA_STATUS="fehler"
            warn "database_setup_complete.sql konnte nicht vollständig angewendet werden."
          fi
        else
          DB_SCHEMA_STATUS="nicht gefunden"
          warn "database_setup_complete.sql not found."
        fi

        if [[ -f "umzugshelfer-pwa/haushalt_multiuser_setup.sql" ]]; then
          ensure_updated_at_functions
          info "Applying haushalt_multiuser_setup.sql..."
          if run_sql_in_db_container "umzugshelfer-pwa/haushalt_multiuser_setup.sql"; then
            MULTIUSER_SCHEMA_STATUS="angewendet"
            success "haushalt_multiuser_setup.sql applied successfully."
          else
            MULTIUSER_SCHEMA_STATUS="fehler"
            warn "haushalt_multiuser_setup.sql konnte nicht vollständig angewendet werden."
          fi
        else
          MULTIUSER_SCHEMA_STATUS="nicht vorhanden"
          warn "Optional file haushalt_multiuser_setup.sql not found."
        fi
      fi
    fi
  else
    DB_SCHEMA_STATUS="manuell erforderlich"
    MULTIUSER_SCHEMA_STATUS="manuell erforderlich"
  fi

  # ---- CREDENTIALS.txt schreiben ----
  info "Writing CREDENTIALS.txt..."

  if [[ "$INSTALL_MODE" == "vollstack" ]]; then
    cat > CREDENTIALS.txt << VOLLSTACK_CREDS
============================================================
  Umzughelfer — Fullstack installation
  Created: ${INSTALL_DATE}
============================================================

APP
  URL:        ${APP_URL}
  Port:       ${APP_PORT}
  Access:    ${ACCESS_LABEL}

SUPABASE STUDIO (admin UI)
  URL:        ${STUDIO_ACCESS_URL}
  User:   supabase
  Password:   ${STUDIO_PASSWORD}

SUPABASE DATABASE
  Host:       localhost / Port: 5432 / DB: postgres
  User:   postgres
  Password:   ${POSTGRES_PASSWORD}

SUPABASE API
  URL:      ${SUPABASE_URL}
  Anon Key: ${ANON_KEY}

  Service Role Key (SECRET):
  ${SERVICE_ROLE_KEY}

JWT SECRET (SECRET):  ${JWT_SECRET}

VAPID (Push-Notifications)
  Public Key:  ${VAPID_PUBLIC_KEY}
  Private Key: ${VAPID_PRIVATE_KEY}

SMTP
  Host:   ${SMTP_HOST_VAL}:${SMTP_PORT_VAL}
  User:   ${SMTP_USER_VAL}
  Sender: ${SMTP_SENDER_VAL}

SCHEMA STATUS
  database_setup_complete.sql:  ${DB_SCHEMA_STATUS}
  haushalt_multiuser_setup.sql: ${MULTIUSER_SCHEMA_STATUS}

============================================================
  NEXT STEPS
============================================================
1. Open Studio: ${STUDIO_ACCESS_URL}  (supabase / ${STUDIO_PASSWORD})
2. If schema is still pending: run database_setup_complete.sql
3. Open app: ${APP_URL}
4. Management: ./scripts/manage_en.sh

============================================================
  SECURITY NOTE: Do not commit this to Git!
============================================================
VOLLSTACK_CREDS

  else
    cat > CREDENTIALS.txt << APPONLY_CREDS
============================================================
  Umzughelfer — App Installation (external Supabase)
  Created: ${INSTALL_DATE}
============================================================

APP
  URL:      ${APP_URL}
  Port:     ${APP_PORT}
  Access:  ${ACCESS_LABEL}

SUPABASE (external)
  URL:      ${SUPABASE_URL}
  Anon Key: ${ANON_KEY}

VAPID (Push-Notifications)
  Public Key:  ${VAPID_PUBLIC_KEY}
  Private Key: ${VAPID_PRIVATE_KEY}

SCHEMA STATUS
  database_setup_complete.sql:  ${DB_SCHEMA_STATUS}
  haushalt_multiuser_setup.sql: ${MULTIUSER_SCHEMA_STATUS}

============================================================
  NEXT STEPS
============================================================
1. In the Supabase SQL editor: run database_setup_complete.sql
2. Then run haushalt_multiuser_setup.sql
3. Open app: ${APP_URL}
4. Management: ./scripts/manage_en.sh

============================================================
  SECURITY NOTE: Do not commit this to Git!
============================================================
APPONLY_CREDS
  fi

  if [[ -f ".gitignore" ]]; then
    grep -qF "CREDENTIALS.txt" .gitignore || echo "CREDENTIALS.txt" >> .gitignore
    grep -qF ".env"            .gitignore || echo ".env"            >> .gitignore
  else
    printf "CREDENTIALS.txt\n.env\n" > .gitignore
  fi

  success "CREDENTIALS.txt written."

  # ---- Abschluss ----
  echo ""
  echo -e "${BOLD}${GREEN}============================================================${NC}"
  success "Installation completed!"
  echo -e "${BOLD}${GREEN}============================================================${NC}"
  echo ""
  echo -e "  App:            ${CYAN}${APP_URL}${NC}  (Port: ${APP_PORT})"
  if [[ "$INSTALL_MODE" == "vollstack" ]]; then
    echo -e "  Supabase Studio: ${CYAN}${STUDIO_ACCESS_URL}${NC}"
  else
    echo -e "  Supabase:        ${CYAN}${SUPABASE_URL}${NC}  (extern)"
  fi
  [[ "$INSTALL_OLLAMA" == "true" ]]     && echo -e "  Ollama API:      ${CYAN}http://localhost:${OLLAMA_PORT}${NC}"
  [[ -n "$OLLAMA_EXTERNAL_URL" ]]       && echo -e "  Ollama Server:   ${CYAN}${OLLAMA_EXTERNAL_URL}${NC}"
  echo -e "  Schema:          ${CYAN}${DB_SCHEMA_STATUS}${NC}"
  echo ""
  echo -e "  ${BOLD}Management and updates: ./scripts/manage_en.sh${NC}"
  weiter
  break   # Installation abgeschlossen → zurück zum Hauptmenü
  done
}

# ============================================================
# DOCKER BEREINIGEN
# ============================================================
modus_docker_cleanup() {
  header "Docker Cleanup"
  echo ""
  echo -e "  ${BOLD}What will be deleted:${NC}"
  echo "  • All stopped containers"
  echo "  • All unused images (including tagged images)"
  echo "  • All unused volumes"
  echo "  • All unused networks"
  echo "  • Build-Cache"
  echo ""
  warn "Running containers and their data will NOT be deleted."
  warn "Supabase data volumes are kept as long as the stack is running."
  echo ""

  # Vorher: belegten Speicher anzeigen
  echo -e "  ${DIM}Current Docker disk usage:${NC}"
  docker system df 2>/dev/null || true
  echo ""

  read -rp "  Really clean up? This cannot be undone! [y/N]: " CONFIRM
  if [[ "$CONFIRM" != "j" && "$CONFIRM" != "J" && "$CONFIRM" != "y" && "$CONFIRM" != "Y" ]]; then
    info "Cancelled."
    weiter
    return
  fi

  echo ""
  info "Cleaning Docker resources..."
  docker system prune -a --volumes -f
  echo ""
  success "Docker cleaned up."
  echo ""
  echo -e "  ${DIM}Disk usage after cleanup:${NC}"
  docker system df 2>/dev/null || true
  weiter
}

# ============================================================
# MAIN LOOP
# ============================================================
while true; do
  # Auto-Erkennung bei jedem Schleifendurchlauf aktualisieren
  COMPOSE_FILE="docker-compose.full.yml"
  [[ ! -f "docker-compose.full.yml" ]] && COMPOSE_FILE="docker-compose.yml"
  IS_VOLLSTACK=false
  [[ "$COMPOSE_FILE" == "docker-compose.full.yml" ]] && IS_VOLLSTACK=true

  HAS_OLLAMA=false
  docker ps --format '{{.Names}}' 2>/dev/null | grep -qi "ollama" && HAS_OLLAMA=true || true

  CURRENT_APP_URL=""
  CURRENT_PORT=""
  if [[ -f ".env" ]]; then
    CURRENT_APP_URL="$(env_get "SITE_URL")"
    CURRENT_PORT="$(env_get "APP_PORT")"
    [[ "$IS_VOLLSTACK" == "true" ]] && ensure_recipe_parser_env
  fi

  clear
  echo ""
  echo -e "${BOLD}${GREEN}============================================================${NC}"
  echo -e "${BOLD}${GREEN}  Umzughelfer — Management${NC}"
  echo -e "${BOLD}${GREEN}============================================================${NC}"
  echo ""

  if [[ "$IS_VOLLSTACK" == "true" ]]; then
    echo -e "  Installation: ${CYAN}Fullstack (Supabase + app)${NC}"
  elif [[ -f ".env" ]]; then
    echo -e "  Installation: ${CYAN}App-only${NC}"
  else
    echo -e "  Installation: ${YELLOW}Not set up yet${NC}"
  fi
  [[ -n "$CURRENT_APP_URL" ]] && echo -e "  App-URL:      ${CYAN}${CURRENT_APP_URL}${NC}"
  [[ -n "$CURRENT_PORT"    ]] && echo -e "  App-Port:     ${CYAN}${CURRENT_PORT}${NC}"

  echo ""
  CONTAINERS_RUNNING=0
  CONTAINERS_RUNNING=$(docker compose -f "$COMPOSE_FILE" ps --status running --format "{{.Name}}" 2>/dev/null | wc -l | tr -d ' ') || true
  if [[ "$CONTAINERS_RUNNING" -gt 0 ]]; then
    echo -e "  Container:    ${GREEN}${CONTAINERS_RUNNING} running${NC}"
  else
    echo -e "  Container:    ${YELLOW}None running${NC}"
  fi
  echo ""

  echo -e "  ${BOLD}What would you like to do?${NC}"
  echo ""
  echo -e "  ${BOLD}[1]${NC} Installation      — set up fullstack or app-only"
  echo -e "  ${BOLD}[2]${NC} Update            — apply updates and restart containers"
  echo -e "  ${BOLD}[3]${NC} Uninstall         — remove containers, volumes or everything"
  echo -e "  ${BOLD}[4]${NC} Backup            — back up database and configuration"
  echo -e "  ${BOLD}[5]${NC} Restore           — import backup / restore data"
  echo -e "  ${BOLD}[6]${NC} SMTP              — configure email settings"
  echo -e "  ${BOLD}[7]${NC} Ollama            — configure AI assistant"
  echo -e "  ${BOLD}[8]${NC} Configuration     — adjust app URL / port / admin email"
  echo -e "  ${BOLD}[9]${NC} Status            — show running containers and logs"
  echo -e "  ${BOLD}[10]${NC} Docker cleanup   — remove unused containers, images and volumes"
  echo "  [0] Exit"
  echo ""
  read -p "  → Choice [1]: " MAIN_CHOICE
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
    0) echo ""; echo "  Goodbye."; echo ""; exit 0 ;;
    *) warn "Invalid choice."; sleep 1 ;;
  esac
done
