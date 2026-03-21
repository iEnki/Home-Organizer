#!/usr/bin/env bash
# ============================================================
# Umzughelfer — Deinstallations-Skript
#
# Optionen:
#   1) Vollstaendige Deinstallation  — alles entfernen
#   2) Soft-Reset                    — Container + Volumes (Daten bleiben)
#   3) Nur Container stoppen         — nichts loeschen
#   4) Edge Functions neu deployen   — volumes/functions aktualisieren
#   5) Docker-Images entfernen       — Speicher freigeben
#   6) Abbrechen
#
# Verwendung: chmod +x scripts/uninstall.sh && ./scripts/uninstall.sh
#             oder ueber install.sh -> Option [5]
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
warn()    { echo -e "${YELLOW}!  $1${NC}"; }
err()     { echo -e "${RED}x  FEHLER: $1${NC}"; exit 1; }
success() { echo -e "${GREEN}OK $1${NC}"; }
header()  { echo -e "\n${BOLD}${GREEN}$1${NC}"; echo "$(printf '=%.0s' {1..60})"; }

cd "$PROJECT_DIR"

# ============================================================
# Installationstyp erkennen
# ============================================================
COMPOSE_FILE="docker-compose.full.yml"
[[ ! -f "docker-compose.full.yml" ]] && COMPOSE_FILE="docker-compose.yml"
IS_VOLLSTACK=false
[[ "$COMPOSE_FILE" == "docker-compose.full.yml" ]] && IS_VOLLSTACK=true

PROJECT_NAME="$(basename "$PROJECT_DIR" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]//g')"
PROJECT_NAME_ALT="$(basename "$PROJECT_DIR" | tr '[:upper:]' '[:lower:]' | sed 's/ /-/g')"

# ============================================================
# Hilfsfunktionen
# ============================================================

container_stoppen() {
  info "Stoppe und entferne Container..."
  if [[ "$IS_VOLLSTACK" == "true" ]]; then
    docker compose -f "$COMPOSE_FILE" --profile ollama down --remove-orphans 2>/dev/null || \
    docker compose -f "$COMPOSE_FILE" down --remove-orphans 2>/dev/null || \
    warn "Container konnten nicht entfernt werden (moeglicherweise schon gestoppt)."
  else
    docker compose -f "$COMPOSE_FILE" down --remove-orphans 2>/dev/null || \
    warn "Container konnten nicht entfernt werden (moeglicherweise schon gestoppt)."
  fi
  success "Container entfernt."
}

volumes_entfernen() {
  if [[ "$IS_VOLLSTACK" != "true" ]]; then
    info "App-only Installation -- keine Named Volumes zu entfernen."
    return
  fi
  info "Entferne Docker Named Volumes..."
  docker compose -f "$COMPOSE_FILE" --profile ollama down -v 2>/dev/null || \
  docker compose -f "$COMPOSE_FILE" down -v 2>/dev/null || true
  for SUFFIX in db-config deno-cache ollama-data; do
    for PREFIX in "$PROJECT_NAME" "$PROJECT_NAME_ALT" "umzughelfer" "umzug-helfer"; do
      VOL="${PREFIX}_${SUFFIX}"
      if docker volume inspect "$VOL" >/dev/null 2>&1; then
        docker volume rm "$VOL" && echo "    OK Volume ${VOL} entfernt" || true
      fi
    done
  done
  success "Docker Volumes entfernt."
}

backup_erstellen() {
  if [[ -f ".env" || -f "CREDENTIALS.txt" ]]; then
    read -p "  .env und CREDENTIALS.txt vorher sichern? [J/n]: " DO_BACKUP
    if [[ "${DO_BACKUP,,}" != "n" ]]; then
      BACKUP_DIR="backup_$(date +%Y%m%d_%H%M%S)"
      mkdir -p "$BACKUP_DIR"
      [[ -f ".env" ]]            && cp .env            "$BACKUP_DIR/.env"            && echo "    OK .env gesichert"
      [[ -f "CREDENTIALS.txt" ]] && cp CREDENTIALS.txt "$BACKUP_DIR/CREDENTIALS.txt" && echo "    OK CREDENTIALS.txt gesichert"
      success "Backup gespeichert in: ${BACKUP_DIR}/"
    else
      warn "Kein Backup erstellt."
    fi
  fi
}

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
# Header
# ============================================================
clear
echo ""
echo -e "${BOLD}${RED}============================================================${NC}"
echo -e "${BOLD}${RED}  Umzughelfer -- Deinstallation & Wartung${NC}"
echo -e "${BOLD}${RED}============================================================${NC}"
echo ""

if [[ "$IS_VOLLSTACK" == "true" ]]; then
  echo -e "  Erkannte Installation: ${CYAN}Vollstack (Supabase + App)${NC}"
else
  echo -e "  Erkannte Installation: ${CYAN}App-only${NC}"
fi
echo ""

# ============================================================
# Hauptmenue
# ============================================================
echo "  Was moechtest du tun?"
echo ""
echo -e "  ${BOLD}[1] Vollstaendige Deinstallation${NC}"
echo "      Container, Docker-Volumes, volumes/, .env, CREDENTIALS.txt"
echo ""
echo -e "  ${BOLD}[2] Soft-Reset${NC}"
echo "      Container + Docker-Volumes entfernen"
echo "      Behaelt: volumes/, .env, CREDENTIALS.txt"
echo ""
echo -e "  ${BOLD}[3] Nur Container stoppen${NC}"
echo "      Alle Container stoppen und entfernen"
echo "      Behaelt: Volumes, volumes/, .env (schnellster Neustart)"
echo ""
echo -e "  ${BOLD}[4] Edge Functions neu deployen${NC}"
echo "      supabase/functions/ -> volumes/functions/ kopieren"
echo "      + Functions-Container neu starten"
echo ""
echo -e "  ${BOLD}[5] Docker-Images entfernen${NC}"
echo "      Gibt ~3-5 GB Speicher frei (naechste Installation laedt neu)"
echo ""
echo "  [6] Abbrechen"
echo ""
read -p "  -> Wahl [6]: " MAIN_CHOICE
[[ -z "$MAIN_CHOICE" ]] && MAIN_CHOICE=6

case "$MAIN_CHOICE" in
  1) MODE="vollstaendig" ;;
  2) MODE="soft" ;;
  3) MODE="stoppen" ;;
  4) MODE="functions" ;;
  5) MODE="images" ;;
  6) echo "  Auf Wiedersehen."; exit 0 ;;
  *) err "Ungueltige Auswahl." ;;
esac

# ============================================================
# MODUS: Nur Container stoppen
# ============================================================
if [[ "$MODE" == "stoppen" ]]; then
  header "Container stoppen"
  read -p "  Container stoppen und entfernen? [j/N]: " CONFIRM
  [[ "${CONFIRM,,}" != "j" && "${CONFIRM,,}" != "y" ]] && { echo "  Abgebrochen."; exit 0; }
  container_stoppen
  echo ""
  success "Fertig. Neustart mit: docker compose -f ${COMPOSE_FILE} up -d"
  exit 0
fi

# ============================================================
# MODUS: Edge Functions deployen
# ============================================================
if [[ "$MODE" == "functions" ]]; then
  header "Edge Functions neu deployen"

  DEPLOYED=0
  deploy_edge_functions_to_volumes

  if [[ $DEPLOYED -gt 0 ]]; then
    info "Starte Functions-Container neu..."
    docker compose -f "$COMPOSE_FILE" restart functions 2>/dev/null || \
    warn "Functions-Container konnte nicht neu gestartet werden."
    success "${DEPLOYED} Function(s) deployt und Container neu gestartet."
  else
    warn "Keine Functions deployt."
  fi
  exit 0
fi

# ============================================================
# MODUS: Nur Images entfernen
# ============================================================
if [[ "$MODE" == "images" ]]; then
  header "Docker-Images entfernen"
  echo ""
  warn "Die Supabase-Docker-Images (~3-5 GB) werden entfernt."
  warn "Die naechste Installation muss alle Images neu herunterladen."
  echo ""
  read -p "  Docker-Images entfernen? [j/N]: " CONFIRM
  [[ "${CONFIRM,,}" != "j" && "${CONFIRM,,}" != "y" ]] && { echo "  Abgebrochen."; exit 0; }

  info "Entferne Docker-Images..."
  docker compose -f "$COMPOSE_FILE" --profile ollama down --rmi all 2>/dev/null || \
  docker compose -f "$COMPOSE_FILE" down --rmi all 2>/dev/null || \
  warn "Einige Images konnten nicht entfernt werden."

  read -p "  Auch Docker Build-Cache leeren? [j/N]: " RM_CACHE
  [[ "${RM_CACHE,,}" == "j" || "${RM_CACHE,,}" == "y" ]] && docker builder prune -f

  success "Docker-Images entfernt."
  exit 0
fi

# ============================================================
# MODUS: Soft-Reset oder Vollstaendige Deinstallation
# ============================================================
echo ""
if [[ "$MODE" == "vollstaendig" ]]; then
  echo -e "  ${RED}${BOLD}ACHTUNG: Diese Aktion loescht ALLE Daten unwiederruflich!${NC}"
  echo -e "  ${RED}Betroffen: Datenbank, Konfiguration, hochgeladene Dateien.${NC}"
else
  echo -e "  ${YELLOW}Container und Docker-Volumes werden entfernt.${NC}"
  echo -e "  ${YELLOW}volumes/, .env und CREDENTIALS.txt bleiben erhalten.${NC}"
fi
echo ""
read -p "  Fortfahren? [j/N]: " FINAL_CONFIRM
[[ "${FINAL_CONFIRM,,}" != "j" && "${FINAL_CONFIRM,,}" != "y" ]] && { echo "  Abgebrochen."; exit 0; }

# Backup
header "Schritt 1: Backup"
backup_erstellen

# Container stoppen
header "Schritt 2: Container stoppen"
container_stoppen

# Docker Volumes
header "Schritt 3: Docker Volumes entfernen"
volumes_entfernen

# volumes/ Verzeichnis (nur Vollstaendig)
if [[ "$MODE" == "vollstaendig" ]]; then
  header "Schritt 4: volumes/-Verzeichnis entfernen"
  if [[ -d "volumes" ]]; then
    echo ""
    warn "Das volumes/-Verzeichnis enthaelt alle PostgreSQL-Daten,"
    warn "Supabase-Konfigurationen, Edge Functions und Storage-Dateien."
    echo ""
    read -p "  volumes/-Verzeichnis loeschen? [j/N]: " CONFIRM_VOL
    if [[ "${CONFIRM_VOL,,}" == "j" || "${CONFIRM_VOL,,}" == "y" ]]; then
      rm -rf volumes/
      success "volumes/-Verzeichnis geloescht."
    else
      warn "volumes/ wurde NICHT geloescht."
    fi
  else
    info "volumes/-Verzeichnis nicht gefunden."
  fi

  header "Schritt 5: Konfigurationsdateien entfernen"
  ENTFERNT=false
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

# ============================================================
# Abschluss
# ============================================================
echo ""
echo -e "${BOLD}${GREEN}============================================================${NC}"
success "Abgeschlossen!"
echo -e "${BOLD}${GREEN}============================================================${NC}"
echo ""

if [[ "$MODE" == "vollstaendig" ]]; then
  echo "  Alle Komponenten wurden entfernt."
else
  echo "  Container und Docker-Volumes entfernt."
  echo "  volumes/, .env und CREDENTIALS.txt sind noch vorhanden."
fi

echo ""
echo -e "  ${BOLD}Neuinstallation starten:${NC}"
echo -e "  ${CYAN}./scripts/install.sh${NC}"
echo ""
