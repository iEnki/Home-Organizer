#!/usr/bin/env bash
# ============================================================
# Umzughelfer — Deinstallations-Skript
#
# Entfernt alle durch install.sh erstellten Komponenten:
#   - Docker-Container und -Networks
#   - Docker Named Volumes (DB-Daten)
#   - volumes/ Verzeichnis (Supabase-Configs + Datenbankdateien)
#   - .env und CREDENTIALS.txt
#   - Optional: Docker-Images + Build-Cache
#
# Verwendung: chmod +x scripts/uninstall.sh && ./scripts/uninstall.sh
#             oder über install.sh → Option [5]
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
# Installationstyp erkennen
# ============================================================
COMPOSE_FILE="docker-compose.full.yml"
[[ ! -f "docker-compose.full.yml" ]] && COMPOSE_FILE="docker-compose.yml"
IS_VOLLSTACK=false
[[ "$COMPOSE_FILE" == "docker-compose.full.yml" ]] && IS_VOLLSTACK=true

# Projekt-Verzeichnisname für Docker Volume-Namen ermitteln
PROJECT_NAME="$(basename "$PROJECT_DIR" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]//g')"
# Häufige Varianten die Docker Compose nutzt
PROJECT_NAME_ALT="$(basename "$PROJECT_DIR" | tr '[:upper:]' '[:lower:]' | sed 's/ /-/g')"

# ============================================================
# Header
# ============================================================
clear
echo ""
echo -e "${BOLD}${RED}============================================================${NC}"
echo -e "${BOLD}${RED}  Umzughelfer — Deinstallation${NC}"
echo -e "${BOLD}${RED}============================================================${NC}"
echo ""

if [[ "$IS_VOLLSTACK" == "true" ]]; then
  echo -e "  Erkannte Installation: ${CYAN}Vollstack (Supabase + App)${NC}"
else
  echo -e "  Erkannte Installation: ${CYAN}App-only${NC}"
fi
echo ""

# ============================================================
# Modus wählen
# ============================================================
echo "  Was soll entfernt werden?"
echo ""
echo -e "  ${BOLD}[1] Vollständige Deinstallation${NC}"
echo "      Container, Docker-Volumes, volumes/-Verzeichnis,"
echo "      .env, CREDENTIALS.txt"
echo ""
echo -e "  ${BOLD}[2] Soft-Reset${NC} (Container + Docker-Volumes)"
echo "      Behält: volumes/, .env, CREDENTIALS.txt"
echo "      Sinnvoll wenn: Neustart mit gleicher Konfiguration"
echo ""
echo "  [3] Abbrechen"
echo ""
read -p "  → Wahl [1]: " MAIN_CHOICE
[[ -z "$MAIN_CHOICE" ]] && MAIN_CHOICE=1

case "$MAIN_CHOICE" in
  1) MODE="vollstaendig" ;;
  2) MODE="soft" ;;
  3) echo "  Abgebrochen."; exit 0 ;;
  *) err "Ungültige Auswahl." ;;
esac

# ============================================================
# Letzte Warnung
# ============================================================
echo ""
if [[ "$MODE" == "vollstaendig" ]]; then
  echo -e "  ${RED}${BOLD}ACHTUNG: Diese Aktion löscht ALLE Daten unwiderruflich!${NC}"
  echo -e "  ${RED}Das betrifft die gesamte Datenbank, alle Konfigurationen"
  echo -e "  und alle hochgeladenen Dateien.${NC}"
else
  echo -e "  ${YELLOW}Alle Container und Docker-Volumes werden entfernt.${NC}"
  echo -e "  ${YELLOW}Das volumes/-Verzeichnis und .env bleiben erhalten.${NC}"
fi
echo ""
read -p "  Fortfahren? [j/N]: " FINAL_CONFIRM
[[ "${FINAL_CONFIRM,,}" != "j" && "${FINAL_CONFIRM,,}" != "y" ]] && { echo "  Abgebrochen."; exit 0; }

# ============================================================
# Schritt 1: Backup (optional)
# ============================================================
header "Schritt 1: Backup"

BACKUP_GEMACHT=false
if [[ -f ".env" || -f "CREDENTIALS.txt" ]]; then
  read -p "  .env und CREDENTIALS.txt vorher sichern? [J/n]: " DO_BACKUP
  if [[ "${DO_BACKUP,,}" != "n" ]]; then
    BACKUP_DIR="backup_$(date +%Y%m%d_%H%M%S)"
    mkdir -p "$BACKUP_DIR"
    [[ -f ".env" ]]            && cp .env            "$BACKUP_DIR/.env"            && echo "    ✓ .env gesichert"
    [[ -f "CREDENTIALS.txt" ]] && cp CREDENTIALS.txt "$BACKUP_DIR/CREDENTIALS.txt" && echo "    ✓ CREDENTIALS.txt gesichert"
    BACKUP_GEMACHT=true
    success "Backup gespeichert in: ${BACKUP_DIR}/"
  else
    warn "Kein Backup erstellt."
  fi
else
  info "Keine .env oder CREDENTIALS.txt gefunden — kein Backup nötig."
fi

# ============================================================
# Schritt 2: Container stoppen und entfernen
# ============================================================
header "Schritt 2: Container stoppen und entfernen"

info "Stoppe und entferne Container..."

if [[ "$IS_VOLLSTACK" == "true" ]]; then
  docker compose -f "$COMPOSE_FILE" --profile ollama down --remove-orphans 2>/dev/null || \
  docker compose -f "$COMPOSE_FILE" down --remove-orphans 2>/dev/null || \
  warn "Compose konnte nicht alle Container entfernen (möglicherweise schon gestoppt)."
else
  docker compose -f "$COMPOSE_FILE" down --remove-orphans 2>/dev/null || \
  warn "Compose konnte nicht alle Container entfernen (möglicherweise schon gestoppt)."
fi

success "Container entfernt."

# ============================================================
# Schritt 3: Docker Named Volumes entfernen
# ============================================================
header "Schritt 3: Docker Volumes entfernen"

if [[ "$IS_VOLLSTACK" == "true" ]]; then
  info "Entferne Docker Named Volumes..."

  # Compose down -v entfernt alle in der compose-Datei definierten Volumes
  docker compose -f "$COMPOSE_FILE" --profile ollama down -v 2>/dev/null || \
  docker compose -f "$COMPOSE_FILE" down -v 2>/dev/null || true

  # Explizit nach häufigen Namensmustern suchen und entfernen
  for SUFFIX in db-config deno-cache ollama-data; do
    for PREFIX in "$PROJECT_NAME" "$PROJECT_NAME_ALT" "umzughelfer" "umzug-helfer"; do
      VOL="${PREFIX}_${SUFFIX}"
      if docker volume inspect "$VOL" >/dev/null 2>&1; then
        docker volume rm "$VOL" && echo "    ✓ Volume ${VOL} entfernt" || true
      fi
    done
  done

  success "Docker Volumes entfernt."
else
  info "App-only Installation — keine Named Volumes zu entfernen."
fi

# ============================================================
# Schritt 4: volumes/ Verzeichnis entfernen (nur Vollständig)
# ============================================================
if [[ "$MODE" == "vollstaendig" ]]; then
  header "Schritt 4: volumes/-Verzeichnis entfernen"

  if [[ -d "volumes" ]]; then
    echo ""
    warn "Das volumes/-Verzeichnis enthält:"
    echo "  • Alle PostgreSQL-Datenbankdaten (volumes/db/data/)"
    echo "  • Supabase-Konfigurationsdateien"
    echo "  • Edge Functions"
    echo "  • Hochgeladene Dateien (Storage)"
    echo ""
    read -p "  volumes/-Verzeichnis unwiderruflich löschen? [j/N]: " CONFIRM_VOL
    if [[ "${CONFIRM_VOL,,}" == "j" || "${CONFIRM_VOL,,}" == "y" ]]; then
      rm -rf volumes/
      success "volumes/-Verzeichnis gelöscht."
    else
      warn "volumes/ wurde NICHT gelöscht. Datenbankdaten bleiben erhalten."
    fi
  else
    info "volumes/-Verzeichnis nicht gefunden — nichts zu tun."
  fi
fi

# ============================================================
# Schritt 5: .env und CREDENTIALS.txt entfernen (nur Vollständig)
# ============================================================
if [[ "$MODE" == "vollstaendig" ]]; then
  header "Schritt 5: Konfigurationsdateien entfernen"

  ENTFERNT=false
  if [[ -f ".env" ]]; then
    rm .env
    echo "    ✓ .env entfernt"
    ENTFERNT=true
  fi
  if [[ -f "CREDENTIALS.txt" ]]; then
    rm CREDENTIALS.txt
    echo "    ✓ CREDENTIALS.txt entfernt"
    ENTFERNT=true
  fi

  if [[ "$ENTFERNT" == "true" ]]; then
    success "Konfigurationsdateien entfernt."
  else
    info "Keine Konfigurationsdateien gefunden."
  fi
fi

# ============================================================
# Schritt 6: Docker-Images entfernen (optional)
# ============================================================
header "Schritt 6: Docker-Images (optional)"

echo ""
echo "  Die Supabase-Docker-Images belegen ca. 3–5 GB Speicherplatz."
echo "  Entfernen spart Speicher, aber die nächste Installation"
echo "  muss alle Images erneut herunterladen (~10–20 Min)."
echo ""
read -p "  Docker-Images entfernen? [j/N]: " RM_IMAGES

if [[ "${RM_IMAGES,,}" == "j" || "${RM_IMAGES,,}" == "y" ]]; then
  info "Entferne Docker-Images..."
  docker compose -f "$COMPOSE_FILE" --profile ollama down --rmi all 2>/dev/null || \
  docker compose -f "$COMPOSE_FILE" down --rmi all 2>/dev/null || \
  warn "Einige Images konnten nicht entfernt werden."
  success "Docker-Images entfernt."
else
  info "Docker-Images bleiben erhalten (schnellere Neuinstallation)."
fi

# ============================================================
# Schritt 7: Build-Cache leeren (optional)
# ============================================================
header "Schritt 7: Docker Build-Cache (optional)"

echo ""
read -p "  Docker Build-Cache leeren? [j/N]: " RM_CACHE

if [[ "${RM_CACHE,,}" == "j" || "${RM_CACHE,,}" == "y" ]]; then
  info "Leere Docker Build-Cache..."
  docker builder prune -f
  success "Build-Cache geleert."
else
  info "Build-Cache bleibt erhalten."
fi

# ============================================================
# Abschluss
# ============================================================
echo ""
echo -e "${BOLD}${GREEN}============================================================${NC}"
success "Deinstallation abgeschlossen!"
echo -e "${BOLD}${GREEN}============================================================${NC}"
echo ""

if [[ "$MODE" == "vollstaendig" ]]; then
  echo -e "  Alle Komponenten wurden entfernt."
else
  echo -e "  Container und Docker-Volumes entfernt."
  echo -e "  volumes/, .env und CREDENTIALS.txt sind noch vorhanden."
fi

if [[ "$BACKUP_GEMACHT" == "true" ]]; then
  echo ""
  echo -e "  Backup gespeichert in: ${CYAN}${BACKUP_DIR}/${NC}"
fi

echo ""
echo -e "  ${BOLD}Neuinstallation starten:${NC}"
echo -e "  ${CYAN}./scripts/install.sh${NC}"
echo ""
