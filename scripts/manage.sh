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

info()    { echo -e "${CYAN}▶ $1${NC}"; }
warn()    { echo -e "${YELLOW}⚠  $1${NC}"; }
err()     { echo -e "${RED}✗  FEHLER: $1${NC}"; exit 1; }
success() { echo -e "${GREEN}✅ $1${NC}"; }
header()  { echo -e "\n${BOLD}${GREEN}$1${NC}"; echo "$(printf '=%.0s' {1..60})"; }
dim()     { echo -e "${DIM}$1${NC}"; }

weiter() {
  echo ""
  read -rp "  Drücke Enter um zum Hauptmenü zurückzukehren..." _PAUSE
}

mit_spinner() {
  local MSG="$1"; shift
  local SPIN='⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏'
  local LOG
  LOG=$(mktemp)

  "$@" >"$LOG" 2>&1 &
  local PID=$!
  local i=0

  while kill -0 "$PID" 2>/dev/null; do
    local c="${SPIN:$((i % ${#SPIN})):1}"
    printf "\r  ${CYAN}${c}${NC}  %s  ${DIM}(%ds)${NC}" "$MSG" "$i"
    sleep 1
    i=$((i + 1))
  done

  wait "$PID"
  local EXIT_CODE=$?
  printf "\r%60s\r" ""

  if [[ $EXIT_CODE -eq 0 ]]; then
    success "$MSG"
  else
    echo -e "${RED}✗  $MSG — fehlgeschlagen (Exit $EXIT_CODE)${NC}"
    cp "$LOG" /tmp/umzug_build_error.log 2>/dev/null || true
    echo -e "${DIM}--- Letzte Log-Zeilen ---${NC}"
    tail -80 "$LOG" >&2
    echo ""
    echo -e "${DIM}  Vollständiges Log: cat /tmp/umzug_build_error.log${NC}"
    echo -e "${DIM}  Nur Fehler:        grep -i 'error\|failed\|warn' /tmp/umzug_build_error.log | head -30${NC}"
    rm -f "$LOG"
    return $EXIT_CODE
  fi
  rm -f "$LOG"
}

deploy_edge_functions_to_volumes() {
  DEPLOYED=0
  while IFS= read -r fn_index; do
    local fn_dir fn_name
    fn_dir="$(dirname "$fn_index")"
    fn_name="$(basename "$fn_dir")"
    mkdir -p "volumes/functions/${fn_name}"
    cp "$fn_index" "volumes/functions/${fn_name}/index.ts"
    echo "    OK ${fn_name}"
    DEPLOYED=$((DEPLOYED + 1))
  done < <(find supabase/functions -mindepth 2 -maxdepth 2 -type f -name 'index.ts' 2>/dev/null | sort)
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
    warn "Storage-Policies konnten nicht mit voller Berechtigung gesetzt werden."
    warn "Import wird tolerant wiederholt..."
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

container_stoppen() {
  info "Stoppe und entferne Container..."
  if [[ "$IS_VOLLSTACK" == "true" ]]; then
    docker compose -f "$COMPOSE_FILE" --profile ollama down --remove-orphans 2>/dev/null || \
    docker compose -f "$COMPOSE_FILE" down --remove-orphans 2>/dev/null || \
    warn "Container konnten nicht entfernt werden (möglicherweise schon gestoppt)."
  else
    docker compose -f "$COMPOSE_FILE" down --remove-orphans 2>/dev/null || \
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
  docker compose -f "$COMPOSE_FILE" --profile ollama down -v 2>/dev/null || \
  docker compose -f "$COMPOSE_FILE" down -v 2>/dev/null || true

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

# ============================================================
# MODUS-FUNKTIONEN
# ============================================================

modus_status() {
  header "Container-Status"
  echo ""
  docker compose -f "$COMPOSE_FILE" ps
  echo ""
  echo -e "  ${BOLD}Letzte Zeilen aus App-Log:${NC}"
  docker compose -f "$COMPOSE_FILE" logs --tail=20 umzugsplaner-app 2>/dev/null || true
  echo ""
  if [[ "$IS_VOLLSTACK" == "true" ]]; then
    echo -e "  ${BOLD}Letzte Zeilen aus Functions-Log:${NC}"
    docker compose -f "$COMPOSE_FILE" logs --tail=10 functions 2>/dev/null || true
    echo ""
  fi
  weiter
}

modus_backup() {
  header "Datenbank-Backup erstellen"
  echo ""

  if ! docker ps --format '{{.Names}}' 2>/dev/null | grep -q "^supabase-db$"; then
    warn "Container 'supabase-db' läuft nicht. Bitte zuerst die Container starten."
    weiter; return 0
  fi

  BACKUP_DIR="backups/backup_$(date +%Y%m%d_%H%M%S)"
  mkdir -p "$BACKUP_DIR"

  info "Erstelle Datenbank-Dump (pg_dump)..."
  docker exec supabase-db pg_dump -U postgres -d postgres -F c -f /tmp/db.dump
  docker cp supabase-db:/tmp/db.dump "${BACKUP_DIR}/db.dump"
  docker exec supabase-db rm -f /tmp/db.dump
  echo "    OK ${BACKUP_DIR}/db.dump"

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
  db.dump         — PostgreSQL Datenbank (pg_dump -Fc)
  .env            — Konfigurationsdatei
  credentials.txt — Zugangsdaten

Wiederherstellen:
  ./scripts/manage.sh -> [5] Wiederherstellung
BACKUP_INFO

  echo ""
  BACKUP_SIZE=$(du -sh "$BACKUP_DIR" 2>/dev/null | cut -f1)
  success "Backup erstellt: ${BACKUP_DIR}/ (${BACKUP_SIZE})"
  weiter
}

modus_restore() {
  header "Datenbank wiederherstellen"
  echo ""

  if [[ "$IS_VOLLSTACK" != "true" ]]; then
    warn "Wiederherstellung nur für Vollstack-Installation verfügbar (supabase-db Container erforderlich)."
    weiter; return 0
  fi

  if [[ ! -d "backups" ]] || ! ls -d backups/backup_* >/dev/null 2>&1; then
    warn "Keine Backups gefunden unter backups/. Bitte zuerst ein Backup erstellen (Option [4])."
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

  echo "  [0] Zurück"
  echo ""
  read -p "  Backup-Nummer wählen [1]: " BACKUP_NR
  [[ -z "$BACKUP_NR" ]] && BACKUP_NR=1
  [[ "$BACKUP_NR" == "0" ]] && return 0

  local SELECTED_BACKUP="${BACKUP_LIST[$((BACKUP_NR - 1))]}"
  if [[ -z "$SELECTED_BACKUP" ]]; then
    warn "Ungültige Auswahl."; weiter; return 0
  fi
  if [[ ! -f "${SELECTED_BACKUP}/db.dump" ]]; then
    warn "db.dump nicht gefunden in ${SELECTED_BACKUP}/"; weiter; return 0
  fi

  echo ""
  warn "ACHTUNG: Die bestehende Datenbank und Konfiguration werden vollständig überschrieben!"
  warn "Backup:  ${SELECTED_BACKUP}"
  echo ""
  read -p "  Fortfahren? [j/N]: " CONFIRM
  [[ "${CONFIRM,,}" != "j" && "${CONFIRM,,}" != "y" ]] && { echo "  Abgebrochen."; return 0; }

  # 1) Alle Container stoppen
  info "Stoppe alle Container..."
  set +e
  docker compose -f "$COMPOSE_FILE" down --remove-orphans 2>/dev/null
  set -e

  # 2) Konfigurationsdateien automatisch wiederherstellen
  if [[ -f "${SELECTED_BACKUP}/.env" ]]; then
    cp "${SELECTED_BACKUP}/.env" .env
    success ".env aus Backup wiederhergestellt."
  else
    warn ".env nicht im Backup gefunden — bestehende .env wird verwendet."
  fi
  if [[ -f "${SELECTED_BACKUP}/credentials.txt" ]]; then
    cp "${SELECTED_BACKUP}/credentials.txt" CREDENTIALS.txt
    success "CREDENTIALS.txt aus Backup wiederhergestellt."
  fi

  # 3) Nur Datenbank-Container starten
  info "Starte Datenbank-Container..."
  set +e; docker compose -f "$COMPOSE_FILE" up -d db; set -e

  # 4) Auf Datenbankbereitschaft warten (max. 2 Minuten)
  info "Warte auf Datenbankbereitschaft..."
  local RETRIES=24
  until docker exec supabase-db pg_isready -U postgres -h localhost >/dev/null 2>&1 || [[ $RETRIES -eq 0 ]]; do
    echo -n "."; sleep 5; RETRIES=$((RETRIES - 1))
  done
  echo ""
  if [[ $RETRIES -eq 0 ]]; then
    warn "Datenbank antwortet nicht. Bitte Container manuell prüfen."
    weiter; return 0
  fi

  # 5) Datenbank wiederherstellen
  info "Kopiere Backup in Container..."
  docker cp "${SELECTED_BACKUP}/db.dump" supabase-db:/tmp/restore.dump

  info "Stelle Datenbank wieder her (pg_restore --clean --if-exists --no-owner)..."
  set +e
  docker exec supabase-db pg_restore -U postgres -d postgres \
    --clean --if-exists --no-owner /tmp/restore.dump
  local PG_EXIT=$?
  set -e
  docker exec supabase-db rm -f /tmp/restore.dump

  if [[ $PG_EXIT -ne 0 ]]; then
    warn "pg_restore meldete Fehler (Exit ${PG_EXIT}) — häufig harmlose Warnungen bei --clean. Fortfahren..."
  fi

  # 6) Trigger-Funktionen sicherstellen
  info "Stelle Datenbank-Hilfsfunktionen sicher..."
  ensure_updated_at_functions

  # 7) Edge Functions in Volumes deployen
  info "Deploye Edge Functions in Volumes..."
  deploy_edge_functions_to_volumes

  # 8) Alle Container starten
  info "Starte alle Container..."
  set +e; docker compose -f "$COMPOSE_FILE" up -d; set -e

  # 9) Functions-Container neu starten, damit neue Functions geladen werden
  if [[ ${DEPLOYED:-0} -gt 0 ]]; then
    info "Starte Functions-Container neu..."
    docker compose -f "$COMPOSE_FILE" restart functions 2>/dev/null || true
  fi

  local APP_URL_NOW
  APP_URL_NOW="$(env_get "SITE_URL")"

  echo ""
  success "Wiederherstellung abgeschlossen aus: ${SELECTED_BACKUP}"
  [[ -n "$APP_URL_NOW" ]] && echo -e "  App erreichbar unter: ${CYAN}${APP_URL_NOW}${NC}"
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
  docker compose -f "$COMPOSE_FILE" up -d --force-recreate auth
  success "auth-Container neu gestartet. SMTP ist jetzt aktiv."
  echo ""

  read -p "  Edge Functions jetzt auch deployen und neu starten? [J/n]: " DO_FN_DEPLOY
  if [[ "${DO_FN_DEPLOY,,}" != "n" ]]; then
    DEPLOYED=0
    deploy_edge_functions_to_volumes
    if [[ $DEPLOYED -gt 0 ]]; then
      info "Starte Functions-Container neu..."
      docker compose -f "$COMPOSE_FILE" restart functions 2>/dev/null || \
        warn "Functions-Container konnte nicht neu gestartet werden."
      success "${DEPLOYED} Function(s) aktualisiert."
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
        docker compose -f "$COMPOSE_FILE" up -d --force-recreate mail-templates auth || {
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

  local CHANGED=false

  local OLD_URL NEW_URL
  OLD_URL="$(env_get "SITE_URL")"
  NEW_URL=$(env_prompt "SITE_URL" "App-URL (z.B. https://umzug.meine-domain.de)")
  if [[ -n "$NEW_URL" && "$NEW_URL" != "$OLD_URL" ]]; then
    env_set "APP_URL"                               "$NEW_URL"
    env_set "SITE_URL"                              "$NEW_URL"
    env_set "API_EXTERNAL_URL"                      "$NEW_URL"
    env_set "SUPABASE_PUBLIC_URL"                   "$NEW_URL"
    env_set "REACT_APP_PASSWORD_RESET_REDIRECT_URL" "${NEW_URL}/update-password"
    env_set "ADDITIONAL_REDIRECT_URLS"              "${NEW_URL}/**"
    env_set "OLLAMA_ORIGINS"                        "$NEW_URL"
    warn "App-URL geändert → App-Rebuild erforderlich."
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
      docker compose -f "$COMPOSE_FILE" build umzugsplaner-app
    mit_spinner "Container wird neu gestartet" \
      docker compose -f "$COMPOSE_FILE" up -d --force-recreate umzugsplaner-app
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
    local OLLAMA_APP_URL
    read -p "  App-URL (für CORS): " OLLAMA_APP_URL

    echo ""
    if docker ps --format '{{.Names}}' 2>/dev/null | grep -q "^ollama$"; then
      info "Laufender 'ollama' Container gefunden."
      echo "  OLLAMA_ORIGINS setzen: OLLAMA_ORIGINS=${OLLAMA_APP_URL}"
      echo "  Dann: docker compose -f docker-compose.full.yml up -d --force-recreate ollama"
    else
      warn "Kein laufender 'ollama' Container gefunden."
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
    read -p "  Ollama-URL in .env aktualisieren mit '${OLLAMA_EXTERNAL_URL}'? [j/N]: " CONFIRM_URL
    [[ "${CONFIRM_URL,,}" != "j" && "${CONFIRM_URL,,}" != "y" ]] && OLLAMA_EXTERNAL_URL=""

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
  fi

  echo ""
  success "Ollama-Konfiguration abgeschlossen."
  weiter
}

modus_update() {
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
    echo -e "  ${BOLD}[5]${NC} Server-Sync komplett — App + Invite-Template + Functions neu laden"
    echo "  [0] Zurück zum Hauptmenü"
    echo ""
    read -p "  → Wahl [1]: " UPDATE_CHOICE
    [[ -z "$UPDATE_CHOICE" ]] && UPDATE_CHOICE=1

    case "$UPDATE_CHOICE" in
      0) return 0 ;;

      1)
        header "App-Update"
        if command -v git >/dev/null 2>&1 && [[ -d ".git" ]]; then
          echo ""
          local CURRENT_BRANCH CURRENT_COMMIT BEHIND
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
            git pull || warn "git pull fehlgeschlagen. Fahre trotzdem fort."
            success "Repository aktualisiert."
          fi
        else
          warn "Kein Git-Repository gefunden. Überspringe git pull."
        fi

        echo ""
        read -p "  App-Container jetzt neu bauen und starten? [J/n]: " CONFIRM
        if [[ "${CONFIRM,,}" == "n" ]]; then echo "  Abgebrochen."; weiter; continue; fi

        echo ""
        info "Aktualisiere Edge Functions..."
        DEPLOYED=0; deploy_edge_functions_to_volumes
        [[ $DEPLOYED -gt 0 ]] && success "${DEPLOYED} Function(s) aktualisiert." || dim "  Keine Functions-Dateien gefunden."

        echo ""
        mit_spinner "App-Container wird gebaut (kann 2-5 Min dauern)" \
          docker compose -f "$COMPOSE_FILE" build umzugsplaner-app || {
          warn "Build fehlgeschlagen. Logs prüfen: docker compose logs umzugsplaner-app"
          weiter; continue
        }
        mit_spinner "Container werden neu gestartet" \
          docker compose -f "$COMPOSE_FILE" up -d --force-recreate umzugsplaner-app || {
          warn "Neustart fehlgeschlagen. Status prüfen: docker compose ps"
          weiter; continue
        }

        if [[ "$IS_VOLLSTACK" == "true" && $DEPLOYED -gt 0 ]]; then
          mit_spinner "Functions-Container wird neu gestartet" \
            docker compose -f "$COMPOSE_FILE" restart functions 2>/dev/null || \
            warn "Functions-Container konnte nicht neu gestartet werden."
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
        echo ""
        echo "  Compose-Datei: ${COMPOSE_FILE}"
        echo ""
        read -p "  App-Container neu bauen und starten? [J/n]: " CONFIRM
        if [[ "${CONFIRM,,}" == "n" ]]; then echo "  Abgebrochen."; weiter; continue; fi

        mit_spinner "App-Container wird gebaut (kann 2-5 Min dauern)" \
          docker compose -f "$COMPOSE_FILE" build umzugsplaner-app || {
          warn "Build fehlgeschlagen. Logs prüfen: docker compose logs umzugsplaner-app"
          weiter; continue
        }
        mit_spinner "Container wird neu gestartet" \
          docker compose -f "$COMPOSE_FILE" up -d --force-recreate umzugsplaner-app || {
          warn "Neustart fehlgeschlagen. Status prüfen: docker compose ps"
          weiter; continue
        }

        success "App erfolgreich neu gebaut und gestartet."
        APP_URL_NOW="$(env_get "SITE_URL")"
        [[ -n "$APP_URL_NOW" ]] && echo -e "  App: ${CYAN}${APP_URL_NOW}${NC}"
        weiter
        ;;

      3)
        header "Edge Functions deployen"
        echo ""
        if [[ "$IS_VOLLSTACK" != "true" ]]; then
          warn "Nur für Vollstack-Installation verfügbar."
          weiter; continue
        fi
        DEPLOYED=0; deploy_edge_functions_to_volumes
        if [[ $DEPLOYED -gt 0 ]]; then
          echo ""
          mit_spinner "Functions-Container wird neu gestartet" \
            docker compose -f "$COMPOSE_FILE" restart functions 2>/dev/null || \
            warn "Functions-Container konnte nicht neu gestartet werden."
          success "${DEPLOYED} Function(s) deployt und Container neu gestartet."
        else
          warn "Keine Functions deployt."
        fi
        weiter
        ;;

      4)
        header "Docker-Images aktualisieren"
        echo ""
        warn "Alle Docker-Images werden auf die neueste Version aktualisiert."
        warn "Dies kann einige Minuten dauern (~500 MB - 2 GB Downloads)."
        echo ""
        read -p "  Fortfahren? [J/n]: " CONFIRM
        if [[ "${CONFIRM,,}" == "n" ]]; then echo "  Abgebrochen."; weiter; continue; fi

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
          warn "Build fehlgeschlagen. Logs prüfen: docker compose logs umzugsplaner-app"
          weiter; continue
        }

        echo ""
        if [[ "$HAS_OLLAMA" == "true" ]]; then
          mit_spinner "Alle Container werden neu gestartet" \
            docker compose -f "$COMPOSE_FILE" --profile ollama up -d --force-recreate || {
            warn "Neustart fehlgeschlagen. Status prüfen: docker compose ps"
            weiter; continue
          }
        else
          mit_spinner "Alle Container werden neu gestartet" \
            docker compose -f "$COMPOSE_FILE" up -d --force-recreate || {
            warn "Neustart fehlgeschlagen. Status prüfen: docker compose ps"
            weiter; continue
          }
        fi

        success "Docker-Images aktualisiert und Container neu gestartet."
        weiter
        ;;

      5)
        header "Server-Sync komplett"
        echo ""
        if [[ "$IS_VOLLSTACK" != "true" ]]; then
          warn "Nur für Vollstack-Installation verfügbar."
          weiter; continue
        fi
        echo "  Dieser Ablauf lädt nach Datei-Kopie alle relevanten Komponenten neu:"
        echo "    1) Edge Functions deployen"
        echo "    2) App neu bauen + neu starten"
        echo "    3) mail-templates + auth force-recreate"
        echo "    4) functions neu starten"
        echo ""
        read -p "  Fortfahren? [J/n]: " CONFIRM
        if [[ "${CONFIRM,,}" == "n" ]]; then echo "  Abgebrochen."; weiter; continue; fi

        echo ""
        info "Aktualisiere Edge Functions..."
        DEPLOYED=0
        deploy_edge_functions_to_volumes
        [[ $DEPLOYED -gt 0 ]] && success "${DEPLOYED} Function(s) aktualisiert." || warn "Keine Functions-Dateien gefunden."

        echo ""
        mit_spinner "App-Container wird gebaut (kann 2-5 Min dauern)" \
          docker compose -f "$COMPOSE_FILE" build umzugsplaner-app || {
          warn "Build fehlgeschlagen. Logs prüfen: docker compose logs umzugsplaner-app"
          weiter; continue
        }
        mit_spinner "App-Container wird neu gestartet" \
          docker compose -f "$COMPOSE_FILE" up -d --force-recreate umzugsplaner-app || {
          warn "Neustart fehlgeschlagen. Status prüfen: docker compose ps"
          weiter; continue
        }

        echo ""
        mit_spinner "mail-templates + auth werden neu geladen" \
          docker compose -f "$COMPOSE_FILE" up -d --force-recreate mail-templates auth || {
          warn "auth/mail-templates Neustart fehlgeschlagen. Status prüfen: docker compose ps"
          weiter; continue
        }

        echo ""
        mit_spinner "Functions-Container wird neu gestartet" \
          docker compose -f "$COMPOSE_FILE" restart functions 2>/dev/null || \
          warn "Functions-Container konnte nicht neu gestartet werden."

        echo ""
        success "Server-Sync komplett abgeschlossen."
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
          info "Starte Functions-Container neu..."
          docker compose -f "$COMPOSE_FILE" restart functions 2>/dev/null || \
            warn "Functions-Container konnte nicht neu gestartet werden."
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
        docker compose -f "$COMPOSE_FILE" --profile ollama down --rmi all 2>/dev/null || \
        docker compose -f "$COMPOSE_FILE" down --rmi all 2>/dev/null || \
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
          echo -e "  ${RED}${BOLD}ACHTUNG: Diese Aktion löscht ALLE Daten unwiderruflich!${NC}"
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
            local CFG_BACKUP_DIR="backup_$(date +%Y%m%d_%H%M%S)"
            mkdir -p "$CFG_BACKUP_DIR"
            [[ -f ".env" ]]            && cp .env            "$CFG_BACKUP_DIR/.env"            && echo "    OK .env gesichert"
            [[ -f "CREDENTIALS.txt" ]] && cp CREDENTIALS.txt "$CFG_BACKUP_DIR/CREDENTIALS.txt" && echo "    OK CREDENTIALS.txt gesichert"
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
            docker compose -f "$COMPOSE_FILE" --profile ollama down --rmi all 2>/dev/null || \
            docker compose -f "$COMPOSE_FILE" down --rmi all 2>/dev/null || true
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
  docker compose version >/dev/null 2>&1 || err "Docker Compose Plugin fehlt.\n  → Docker aktualisieren oder Plugin installieren."
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

  while true; do
    read -p "  App-URL (z.B. https://umzug.meine-domain.de, 0 = Abbrechen): " APP_URL
    [[ "$APP_URL" == "0" ]] && { ZURUECK=true; break; }
    [[ -n "$APP_URL" ]] && break
    echo "  → App-URL ist erforderlich."
  done
  [[ "$ZURUECK" == "true" ]] && continue

  while true; do
    read -p "  Deine E-Mail-Adresse (für Push-Notifications, 0 = Abbrechen): " ADMIN_EMAIL
    [[ "$ADMIN_EMAIL" == "0" ]] && { ZURUECK=true; break; }
    [[ -n "$ADMIN_EMAIL" ]] && break
    echo "  → E-Mail ist erforderlich."
  done
  [[ "$ZURUECK" == "true" ]] && continue

  read -p "  App-Port [3000]: " APP_PORT
  [[ -z "$APP_PORT" ]] && APP_PORT=3000

  if [[ "$INSTALL_MODE" == "vollstack" ]]; then
    read -p "  Supabase-URL [Standard: ${APP_URL}]: " SUPABASE_URL
    [[ -z "$SUPABASE_URL" ]] && SUPABASE_URL="$APP_URL"

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
    header "Schritt 4: Supabase-Initialisierungsdateien"

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
VOLLSTACK_ENV

  else
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
APPONLY_ENV
  fi

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
  docker compose -f "$INST_COMPOSE_FILE" build umzugsplaner-app

  info "Starte Container..."
  set +e
  if [[ "$INSTALL_OLLAMA" == "true" ]]; then
    docker compose -f "$INST_COMPOSE_FILE" --profile ollama up -d
  else
    docker compose -f "$INST_COMPOSE_FILE" up -d
  fi
  local COMPOSE_EXIT=$?
  set -e

  if [[ $COMPOSE_EXIT -ne 0 ]]; then
    warn "Docker Compose meldete einen Fehler (Exit ${COMPOSE_EXIT})."
    if docker ps --format '{{.Names}}' 2>/dev/null | grep -q "supabase-analytics"; then
      warn "Warte auf Analytics-Container (kann bei Erstinstallation bis zu 3 Min dauern)..."
      local ANALYTICS_OK=false
      for _i in $(seq 1 36); do
        if docker exec supabase-analytics curl -sf http://localhost:4000/health >/dev/null 2>&1; then
          ANALYTICS_OK=true; break
        fi
        sleep 5; echo -n "."
      done
      echo ""
      if [[ "$ANALYTICS_OK" == "true" ]]; then
        success "Analytics bereit."
        docker compose -f "$INST_COMPOSE_FILE" up -d --no-recreate 2>/dev/null || true
      else
        warn "Analytics antwortet noch nicht. Die App-Funktionen sind davon nicht betroffen."
        warn "Neustart bei Bedarf: docker compose -f ${INST_COMPOSE_FILE} restart supabase-analytics"
      fi
    else
      err "Docker-Start fehlgeschlagen (Exit ${COMPOSE_EXIT}). Logs: docker compose -f ${INST_COMPOSE_FILE} logs"
    fi
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

        if [[ -f "umzugshelfer-pwa/haushalt_multiuser_setup.sql" ]]; then
          ensure_updated_at_functions
          info "Wende haushalt_multiuser_setup.sql an..."
          if run_sql_in_db_container "umzugshelfer-pwa/haushalt_multiuser_setup.sql"; then
            MULTIUSER_SCHEMA_STATUS="angewendet"
            success "haushalt_multiuser_setup.sql erfolgreich angewendet."
          else
            MULTIUSER_SCHEMA_STATUS="fehler"
            warn "haushalt_multiuser_setup.sql konnte nicht vollständig angewendet werden."
          fi
        else
          MULTIUSER_SCHEMA_STATUS="nicht vorhanden"
          warn "Optionale Datei haushalt_multiuser_setup.sql nicht gefunden."
        fi
      fi
    fi
  else
    DB_SCHEMA_STATUS="manuell erforderlich"
    MULTIUSER_SCHEMA_STATUS="manuell erforderlich"
  fi

  # ---- CREDENTIALS.txt schreiben ----
  info "Schreibe CREDENTIALS.txt..."

  if [[ "$INSTALL_MODE" == "vollstack" ]]; then
    cat > CREDENTIALS.txt << VOLLSTACK_CREDS
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

SCHEMA-STATUS
  database_setup_complete.sql:  ${DB_SCHEMA_STATUS}
  haushalt_multiuser_setup.sql: ${MULTIUSER_SCHEMA_STATUS}

============================================================
  NÄCHSTE SCHRITTE
============================================================
1. Studio öffnen: http://localhost:8000  (supabase / ${STUDIO_PASSWORD})
2. Falls Schema noch offen: database_setup_complete.sql ausführen
3. App aufrufen: ${APP_URL}
4. Verwaltung: ./scripts/manage.sh

============================================================
  SICHERHEITSHINWEIS: Nicht in Git committen!
============================================================
VOLLSTACK_CREDS

  else
    cat > CREDENTIALS.txt << APPONLY_CREDS
============================================================
  Umzughelfer — App-Installation (externe Supabase)
  Erstellt: ${INSTALL_DATE}
============================================================

APP
  URL:      ${APP_URL}
  Port:     ${APP_PORT}

SUPABASE (extern)
  URL:      ${SUPABASE_URL}
  Anon Key: ${ANON_KEY}

VAPID (Push-Notifications)
  Public Key:  ${VAPID_PUBLIC_KEY}
  Private Key: ${VAPID_PRIVATE_KEY}

SCHEMA-STATUS
  database_setup_complete.sql:  ${DB_SCHEMA_STATUS}
  haushalt_multiuser_setup.sql: ${MULTIUSER_SCHEMA_STATUS}

============================================================
  NÄCHSTE SCHRITTE
============================================================
1. In Supabase SQL Editor: database_setup_complete.sql ausführen
2. Dann: haushalt_multiuser_setup.sql ausführen
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

  success "CREDENTIALS.txt geschrieben."

  # ---- Abschluss ----
  echo ""
  echo -e "${BOLD}${GREEN}============================================================${NC}"
  success "Installation abgeschlossen!"
  echo -e "${BOLD}${GREEN}============================================================${NC}"
  echo ""
  echo -e "  App:            ${CYAN}${APP_URL}${NC}  (Port: ${APP_PORT})"
  if [[ "$INSTALL_MODE" == "vollstack" ]]; then
    echo -e "  Supabase Studio: ${CYAN}http://localhost:8000${NC}"
  else
    echo -e "  Supabase:        ${CYAN}${SUPABASE_URL}${NC}  (extern)"
  fi
  [[ "$INSTALL_OLLAMA" == "true" ]]     && echo -e "  Ollama API:      ${CYAN}http://localhost:${OLLAMA_PORT}${NC}"
  [[ -n "$OLLAMA_EXTERNAL_URL" ]]       && echo -e "  Ollama Server:   ${CYAN}${OLLAMA_EXTERNAL_URL}${NC}"
  echo -e "  Schema:          ${CYAN}${DB_SCHEMA_STATUS}${NC}"
  echo ""
  echo -e "  ${BOLD}Verwaltung und Updates: ./scripts/manage.sh${NC}"
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
# HAUPTSCHLEIFE
# ============================================================
while true; do
  # Auto-Erkennung bei jedem Schleifendurchlauf aktualisieren
  COMPOSE_FILE="docker-compose.full.yml"
  [[ ! -f "docker-compose.full.yml" ]] && COMPOSE_FILE="docker-compose.yml"
  IS_VOLLSTACK=false
  [[ "$COMPOSE_FILE" == "docker-compose.full.yml" ]] && IS_VOLLSTACK=true

  HAS_OLLAMA=false
  docker ps --format '{{.Names}}' 2>/dev/null | grep -qi "ollama" && HAS_OLLAMA=true

  CURRENT_APP_URL=""
  CURRENT_PORT=""
  if [[ -f ".env" ]]; then
    CURRENT_APP_URL="$(env_get "SITE_URL")"
    CURRENT_PORT="$(env_get "APP_PORT")"
  fi

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
  CONTAINERS_RUNNING=$(docker compose -f "$COMPOSE_FILE" ps --status running --format "{{.Name}}" 2>/dev/null | wc -l | tr -d ' ') || true
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
