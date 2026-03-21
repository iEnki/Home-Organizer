#!/usr/bin/env bash
# ============================================================
# Umzughelfer — Update & Wartungsskript
#
# Erkennt automatisch:
#   - Installationstyp (Vollstack / App-only)
#   - Bestehende .env-Werte (werden als Vorschlag angezeigt)
#   - Laufende Container
#
# Modi:
#   1) App-Update       — git pull + React-App neu bauen + Container neu starten
#   2) Nur App bauen    — React-Container neu bauen (ohne git pull)
#   3) Functions        — Edge Functions deployen + neu starten
#   4) Docker-Images    — docker compose pull + Container neu starten
#   5) SMTP             — Einstellungen ändern (Werte aus .env als Vorschlag)
#   6) Ollama           — CORS / URL konfigurieren
#   7) Konfiguration    — App-URL / Port / Admin-E-Mail anpassen
#   8) Status           — Laufende Container + Dienste anzeigen
#   9) Beenden
#
# Verwendung: chmod +x scripts/update.sh && ./scripts/update.sh
# ============================================================

# CRLF → LF (Windows-Editor-Kompatibilität)
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

# Spinner: Befehl im Hintergrund mit animierter Wartemeldung
# Verwendung: mit_spinner "Beschreibung" befehl arg1 arg2 ...
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
  printf "\r%60s\r" ""  # Zeile löschen

  if [[ $EXIT_CODE -eq 0 ]]; then
    success "$MSG"
  else
    echo -e "${RED}✗  $MSG — fehlgeschlagen (Exit $EXIT_CODE)${NC}"
    echo -e "${DIM}--- Letzte Log-Zeilen ---${NC}"
    tail -20 "$LOG" >&2
    rm -f "$LOG"
    exit $EXIT_CODE
  fi
  rm -f "$LOG"
}

cd "$PROJECT_DIR"

# Edge Functions dynamisch nach volumes/functions synchronisieren
deploy_edge_functions_to_volumes() {
  DEPLOYED=0
  while IFS= read -r fn_index; do
    local fn_dir
    fn_dir="$(dirname "$fn_index")"
    local fn_name
    fn_name="$(basename "$fn_dir")"
    mkdir -p "volumes/functions/${fn_name}"
    cp "$fn_index" "volumes/functions/${fn_name}/index.ts"
    echo "    OK ${fn_name}"
    DEPLOYED=$((DEPLOYED + 1))
  done < <(find supabase/functions -mindepth 2 -maxdepth 2 -type f -name 'index.ts' | sort)
}

# ============================================================
# Voraussetzungen
# ============================================================
[[ ! -f ".env" ]] && err ".env nicht gefunden. Bitte zuerst ./scripts/install.sh ausführen."

# ============================================================
# .env-Hilfsfunktionen
# ============================================================

# Wert aus .env lesen (leer wenn nicht vorhanden)
env_get() {
  local KEY="$1"
  grep -E "^${KEY}=" .env 2>/dev/null | head -1 | cut -d= -f2- | sed 's/^[[:space:]]*//' | sed 's/[[:space:]]*$//' || true
}

# Wert in .env setzen — robust gegenüber Sonderzeichen im Wert
env_set() {
  local KEY="$1" VAL="$2"
  local TMP
  TMP=$(mktemp)
  grep -v "^${KEY}=" .env > "$TMP" 2>/dev/null || true
  printf '%s=%s\n' "$KEY" "$VAL" >> "$TMP"
  mv "$TMP" .env
}

# Eingabe mit Vorschlag aus .env (leer = Vorschlag übernehmen)
env_prompt() {
  local KEY="$1"
  local BESCHREIBUNG="$2"
  local CURRENT EINGABE
  CURRENT="$(env_get "$KEY")"
  if [[ -n "$CURRENT" ]]; then
    read -p "  ${BESCHREIBUNG} [${CURRENT}]: " EINGABE
    [[ -z "$EINGABE" ]] && EINGABE="$CURRENT"
  else
    read -p "  ${BESCHREIBUNG}: " EINGABE
  fi
  echo "$EINGABE"
}

# Geheime Eingabe mit Vorschlag (stumm — Zeichen werden nicht angezeigt)
# Hinweise gehen nach stderr, damit sie bei $(...) trotzdem sichtbar sind
env_prompt_secret() {
  local KEY="$1"
  local BESCHREIBUNG="$2"
  local CURRENT EINGABE
  CURRENT="$(env_get "$KEY")"
  if [[ -n "$CURRENT" ]]; then
    echo -e "  ${DIM}(stumme Eingabe — Zeichen werden nicht angezeigt, Enter = behalten)${NC}" >&2
    read -s -p "  ${BESCHREIBUNG}: " EINGABE; echo "" >&2
    [[ -z "$EINGABE" ]] && EINGABE="$CURRENT"
  else
    echo -e "  ${DIM}(stumme Eingabe — Zeichen werden nicht angezeigt)${NC}" >&2
    read -s -p "  ${BESCHREIBUNG}: " EINGABE; echo "" >&2
  fi
  echo "$EINGABE"
}

# ============================================================
# Installationstyp erkennen
# ============================================================
COMPOSE_FILE="docker-compose.full.yml"
[[ ! -f "docker-compose.full.yml" ]] && COMPOSE_FILE="docker-compose.yml"
IS_VOLLSTACK=false
[[ "$COMPOSE_FILE" == "docker-compose.full.yml" ]] && IS_VOLLSTACK=true

# Ollama-Profil aktiv?
HAS_OLLAMA=false
docker ps --format '{{.Names}}' 2>/dev/null | grep -qi "ollama" && HAS_OLLAMA=true

# Bestehende Werte aus .env vorladen
CURRENT_APP_URL="$(env_get "SITE_URL")"
CURRENT_PORT="$(env_get "APP_PORT")"
CURRENT_SUPABASE_URL="$(env_get "API_EXTERNAL_URL")"
CURRENT_SMTP_HOST="$(env_get "SMTP_HOST")"
CURRENT_SMTP_USER="$(env_get "SMTP_USER")"

# ============================================================
# Hauptmenü
# ============================================================
clear
echo ""
echo -e "${BOLD}${GREEN}============================================================${NC}"
echo -e "${BOLD}${GREEN}  Umzughelfer — Update & Wartung${NC}"
echo -e "${BOLD}${GREEN}============================================================${NC}"
echo ""

# Installationstyp anzeigen
if [[ "$IS_VOLLSTACK" == "true" ]]; then
  echo -e "  Installation: ${CYAN}Vollstack (Supabase + App)${NC}"
else
  echo -e "  Installation: ${CYAN}App-only${NC}"
fi
[[ -n "$CURRENT_APP_URL" ]] && echo -e "  App-URL:      ${CYAN}${CURRENT_APP_URL}${NC}"
[[ -n "$CURRENT_PORT"    ]] && echo -e "  App-Port:     ${CYAN}${CURRENT_PORT}${NC}"
echo ""

# Laufende Container kurz prüfen
CONTAINERS_RUNNING=$(docker compose -f "$COMPOSE_FILE" ps --status running --format "{{.Name}}" 2>/dev/null | wc -l | tr -d ' ')
if [[ "$CONTAINERS_RUNNING" -gt 0 ]]; then
  echo -e "  Container:    ${GREEN}${CONTAINERS_RUNNING} laufen${NC}"
else
  echo -e "  Container:    ${YELLOW}Keine laufen${NC}"
fi
echo ""
echo -e "  ${BOLD}Was möchtest du tun?${NC}"
echo ""
echo -e "  ${BOLD}[1]${NC} App-Update          — git pull + neu bauen + neu starten"
echo -e "  ${BOLD}[2]${NC} Nur App neu bauen   — ohne git pull (nach lokalen Änderungen)"
echo -e "  ${BOLD}[3]${NC} Edge Functions      — supabase/functions/ deployen + neu starten"
echo -e "  ${BOLD}[4]${NC} Docker-Images       — alle Images aktualisieren + Container neu starten"
echo -e "  ${BOLD}[5]${NC} SMTP anpassen       — E-Mail-Einstellungen ändern"
echo -e "  ${BOLD}[6]${NC} Ollama anpassen     — CORS / URL konfigurieren"
echo -e "  ${BOLD}[7]${NC} Konfiguration       — App-URL / Port / Admin-E-Mail anpassen"
echo -e "  ${BOLD}[8]${NC} Status anzeigen     — Container + Logs"
echo "  [9] Beenden"
echo ""
read -p "  → Wahl [1]: " MAIN_CHOICE
[[ -z "$MAIN_CHOICE" ]] && MAIN_CHOICE=1

case "$MAIN_CHOICE" in
  1) MODE="update" ;;
  2) MODE="rebuild" ;;
  3) MODE="functions" ;;
  4) MODE="images" ;;
  5) MODE="smtp" ;;
  6) MODE="ollama" ;;
  7) MODE="config" ;;
  8) MODE="status" ;;
  9) echo "  Auf Wiedersehen."; exit 0 ;;
  *) err "Ungültige Auswahl." ;;
esac

# ============================================================
# MODUS: Status anzeigen
# ============================================================
if [[ "$MODE" == "status" ]]; then
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
  success "Status angezeigt."
  exit 0
fi

# ============================================================
# MODUS: App-Update (git pull + rebuild)
# ============================================================
if [[ "$MODE" == "update" ]]; then
  header "App-Update"

  # Git-Status prüfen
  if command -v git >/dev/null 2>&1 && [[ -d ".git" ]]; then
    echo ""
    CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unbekannt")
    CURRENT_COMMIT=$(git log --oneline -1 2>/dev/null || echo "unbekannt")
    echo -e "  Branch:  ${CYAN}${CURRENT_BRANCH}${NC}"
    echo -e "  Commit:  ${DIM}${CURRENT_COMMIT}${NC}"
    echo ""

    # Prüfen ob Remote-Änderungen vorliegen
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
  [[ "${CONFIRM,,}" == "n" ]] && { echo "  Abgebrochen."; exit 0; }

  # Edge Functions aktualisieren
  echo ""
  info "Aktualisiere Edge Functions..."
  DEPLOYED=0
  deploy_edge_functions_to_volumes
  [[ $DEPLOYED -gt 0 ]] && success "${DEPLOYED} Function(s) aktualisiert." || dim "    Keine Functions-Dateien gefunden."

  # App neu bauen
  echo ""
  mit_spinner "App-Container wird gebaut (kann 2-5 Min dauern)" \
    docker compose -f "$COMPOSE_FILE" build umzugsplaner-app

  mit_spinner "Container werden neu gestartet" \
    docker compose -f "$COMPOSE_FILE" up -d --force-recreate umzugsplaner-app

  if [[ "$IS_VOLLSTACK" == "true" && $DEPLOYED -gt 0 ]]; then
    mit_spinner "Functions-Container wird neu gestartet" \
      docker compose -f "$COMPOSE_FILE" restart functions 2>/dev/null || \
      warn "Functions-Container konnte nicht neu gestartet werden."
  fi

  echo ""
  success "Update abgeschlossen."
  NEW_COMMIT=$(git log --oneline -1 2>/dev/null || echo "")
  [[ -n "$NEW_COMMIT" ]] && dim "  Aktueller Stand: ${NEW_COMMIT}"
  echo ""
  [[ -n "$CURRENT_APP_URL" ]] && echo -e "  App erreichbar: ${CYAN}${CURRENT_APP_URL}${NC}"
  exit 0
fi

# ============================================================
# MODUS: Nur App neu bauen
# ============================================================
if [[ "$MODE" == "rebuild" ]]; then
  header "App neu bauen"
  echo ""
  echo "  Compose-Datei: ${COMPOSE_FILE}"
  echo ""
  read -p "  App-Container neu bauen und starten? [J/n]: " CONFIRM
  [[ "${CONFIRM,,}" == "n" ]] && { echo "  Abgebrochen."; exit 0; }

  mit_spinner "App-Container wird gebaut (kann 2-5 Min dauern)" \
    docker compose -f "$COMPOSE_FILE" build umzugsplaner-app

  mit_spinner "Container wird neu gestartet" \
    docker compose -f "$COMPOSE_FILE" up -d --force-recreate umzugsplaner-app

  success "App erfolgreich neu gebaut und gestartet."
  [[ -n "$CURRENT_APP_URL" ]] && echo -e "  App: ${CYAN}${CURRENT_APP_URL}${NC}"
  exit 0
fi

# ============================================================
# MODUS: Edge Functions deployen
# ============================================================
if [[ "$MODE" == "functions" ]]; then
  header "Edge Functions deployen"
  echo ""

  if [[ "$IS_VOLLSTACK" != "true" ]]; then
    warn "Nur für Vollstack-Installation verfügbar."
    exit 0
  fi

  DEPLOYED=0
  deploy_edge_functions_to_volumes

  if [[ $DEPLOYED -gt 0 ]]; then
    echo ""
    mit_spinner "Functions-Container wird neu gestartet" \
      docker compose -f "$COMPOSE_FILE" restart functions 2>/dev/null || \
      warn "Functions-Container konnte nicht neu gestartet werden."
    success "${DEPLOYED} Function(s) deployt und Container neu gestartet."
  else
    warn "Keine Functions deployt."
  fi
  exit 0
fi

# ============================================================
# MODUS: Docker-Images aktualisieren
# ============================================================
if [[ "$MODE" == "images" ]]; then
  header "Docker-Images aktualisieren"
  echo ""
  warn "Alle Docker-Images werden auf die neueste Version aktualisiert."
  warn "Dies kann einige Minuten dauern (~500 MB - 2 GB Downloads)."
  echo ""
  read -p "  Fortfahren? [J/n]: " CONFIRM
  [[ "${CONFIRM,,}" == "n" ]] && { echo "  Abgebrochen."; exit 0; }

  if [[ "$HAS_OLLAMA" == "true" ]]; then
    mit_spinner "Images werden heruntergeladen (kann 5-15 Min dauern)" \
      bash -c "docker compose -f '$COMPOSE_FILE' --profile ollama pull --ignore-pull-failures 2>&1 | grep -v 'pull access denied' || true"
  else
    mit_spinner "Images werden heruntergeladen (kann 5-15 Min dauern)" \
      bash -c "docker compose -f '$COMPOSE_FILE' pull --ignore-pull-failures 2>&1 | grep -v 'pull access denied' || true"
  fi

  echo ""
  mit_spinner "App-Image wird lokal gebaut (kann 2-5 Min dauern)" \
    docker compose -f "$COMPOSE_FILE" build umzugsplaner-app

  echo ""
  if [[ "$HAS_OLLAMA" == "true" ]]; then
    mit_spinner "Alle Container werden neu gestartet" \
      docker compose -f "$COMPOSE_FILE" --profile ollama up -d --force-recreate
  else
    mit_spinner "Alle Container werden neu gestartet" \
      docker compose -f "$COMPOSE_FILE" up -d --force-recreate
  fi

  success "Docker-Images aktualisiert und Container neu gestartet."
  exit 0
fi

# ============================================================
# MODUS: SMTP anpassen
# ============================================================
if [[ "$MODE" == "smtp" ]]; then
  header "SMTP-Einstellungen anpassen"

  if [[ "$IS_VOLLSTACK" != "true" ]]; then
    err "Nur für Vollstack-Installation verfügbar (docker-compose.full.yml nicht gefunden)."
  fi

  echo ""
  echo -e "  ${DIM}Aktuelle Werte aus .env werden als Vorschlag angezeigt.${NC}"
  echo -e "  ${DIM}Enter drücken = Wert übernehmen. Neuer Wert = überschreiben.${NC}"
  echo ""

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
  [[ "${CONFIRM,,}" == "n" ]] && { echo "  Abgebrochen."; exit 0; }

  env_set "SMTP_HOST"        "$SMTP_HOST_NEW"
  env_set "SMTP_PORT"        "$SMTP_PORT_NEW"
  env_set "SMTP_USER"        "$SMTP_USER_NEW"
  env_set "SMTP_PASS"        "$SMTP_PASS_NEW"
  env_set "SMTP_ADMIN_EMAIL" "$SMTP_ADMIN_NEW"
  env_set "SMTP_SENDER_NAME" "$SMTP_SENDER_NEW"
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
  exit 0
fi

# ============================================================
# MODUS: Ollama anpassen
# ============================================================
if [[ "$MODE" == "ollama" ]]; then
  # Weiterleitung an install.sh Ollama-Modus
  info "Starte Ollama-Konfiguration (via install.sh)..."
  sed -i 's/\r//' "$SCRIPT_DIR/install.sh" 2>/dev/null || true
  # install.sh mit Ollama-Option direkt aufrufen geht nicht interaktiv,
  # daher Hinweis + direkter Aufruf
  bash "$SCRIPT_DIR/install.sh" <<< "4"
  exit 0
fi

# ============================================================
# MODUS: Konfiguration anpassen
# ============================================================
if [[ "$MODE" == "config" ]]; then
  header "Konfiguration anpassen"
  echo ""
  echo -e "  ${DIM}Aktuelle Werte aus .env werden als Vorschlag angezeigt.${NC}"
  echo -e "  ${DIM}Nur geänderte Werte werden neu gebaut (App-URL/Port → Rebuild nötig).${NC}"
  echo ""

  CHANGED=false

  # App-URL
  OLD_URL="$(env_get "SITE_URL")"
  NEW_URL=$(env_prompt "SITE_URL" "App-URL (z.B. https://umzug.meine-domain.de)")
  if [[ -n "$NEW_URL" && "$NEW_URL" != "$OLD_URL" ]]; then
    env_set "APP_URL"    "$NEW_URL"
    env_set "SITE_URL"   "$NEW_URL"
    env_set "API_EXTERNAL_URL" "$NEW_URL"
    env_set "SUPABASE_PUBLIC_URL" "$NEW_URL"
    env_set "REACT_APP_PASSWORD_RESET_REDIRECT_URL" "${NEW_URL}/update-password"
    env_set "ADDITIONAL_REDIRECT_URLS" "${NEW_URL}/**"
    env_set "OLLAMA_ORIGINS" "$NEW_URL"
    warn "App-URL geändert → App-Rebuild erforderlich."
    CHANGED=true
  fi

  # App-Port
  OLD_PORT="$(env_get "APP_PORT")"
  NEW_PORT=$(env_prompt "APP_PORT" "App-Port")
  if [[ -n "$NEW_PORT" && "$NEW_PORT" != "$OLD_PORT" ]]; then
    env_set "APP_PORT" "$NEW_PORT"
    warn "Port geändert → Container-Neustart erforderlich."
    CHANGED=true
  fi

  # Admin-E-Mail (VAPID-Subject + SMTP_ADMIN_EMAIL)
  OLD_EMAIL="$(env_get "SMTP_ADMIN_EMAIL")"
  NEW_EMAIL=$(env_prompt "SMTP_ADMIN_EMAIL" "Admin-E-Mail (für Push + SMTP)")
  if [[ -n "$NEW_EMAIL" && "$NEW_EMAIL" != "$OLD_EMAIL" ]]; then
    env_set "SMTP_ADMIN_EMAIL" "$NEW_EMAIL"
    env_set "VAPID_SUBJECT" "mailto:${NEW_EMAIL}"
    success "Admin-E-Mail aktualisiert."
    CHANGED=true
  fi

  if [[ "$CHANGED" == "false" ]]; then
    echo ""
    dim "  Keine Änderungen vorgenommen."
    exit 0
  fi

  echo ""
  success ".env aktualisiert."

  # Rebuild anbieten falls URL oder Port geändert
  echo ""
  read -p "  App-Container jetzt neu bauen und starten? [J/n]: " DO_REBUILD
  if [[ "${DO_REBUILD,,}" != "n" ]]; then
    info "Baue App-Container neu..."
    docker compose -f "$COMPOSE_FILE" build umzugsplaner-app
    info "Starte Container neu..."
    docker compose -f "$COMPOSE_FILE" up -d --force-recreate umzugsplaner-app
    success "App neu gestartet."
    NEW_URL_FINAL="$(env_get "SITE_URL")"
    [[ -n "$NEW_URL_FINAL" ]] && echo -e "  App: ${CYAN}${NEW_URL_FINAL}${NC}"
  else
    warn "Änderungen erst aktiv nach manuellem Neustart:"
    echo "  docker compose -f ${COMPOSE_FILE} up -d --force-recreate"
  fi
  exit 0
fi

# ============================================================
# Fallback — sollte nie erreicht werden
# ============================================================
err "Unbekannter Modus: ${MODE}"
