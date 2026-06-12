#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ROOT_DIR}/.env"
LIMIT=500
APPLY_SCHEMA=true
REPORT_FILE="${ROOT_DIR}/recipe-image-backfill-$(date -u +%Y%m%dT%H%M%SZ).json"

usage() {
  cat <<'EOF'
Backfill fuer dauerhaft gespeicherte Kochbuchbilder

Aufruf:
  ./scripts/backfill-recipe-images.sh [--limit ANZAHL] [--skip-schema]

Das Skript:
  - wendet den idempotenten Recipe-Images-Hotfix an,
  - ruft den internen Recipe-Parser auf,
  - speichert erreichbare Bilder im privaten Bucket recipe-images,
  - schreibt einen JSON-Abschlussbericht.
EOF
}

while (($#)); do
  case "$1" in
    --limit)
      LIMIT="${2:-}"
      shift 2
      ;;
    --skip-schema)
      APPLY_SCHEMA=false
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unbekannte Option: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

[[ "$LIMIT" =~ ^[0-9]+$ ]] && ((LIMIT >= 1 && LIMIT <= 1000)) || {
  echo "--limit muss zwischen 1 und 1000 liegen." >&2
  exit 1
}
[[ -f "$ENV_FILE" ]] || {
  echo ".env nicht gefunden: ${ENV_FILE}" >&2
  exit 1
}

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

command -v docker >/dev/null 2>&1 || { echo "docker fehlt." >&2; exit 1; }
command -v curl >/dev/null 2>&1 || { echo "curl fehlt." >&2; exit 1; }
command -v python3 >/dev/null 2>&1 || { echo "python3 fehlt." >&2; exit 1; }
[[ -n "${RECIPE_PARSER_INTERNAL_TOKEN:-}" ]] || {
  echo "RECIPE_PARSER_INTERNAL_TOKEN fehlt in .env." >&2
  exit 1
}
[[ -n "${POSTGRES_PASSWORD:-}" ]] || {
  echo "POSTGRES_PASSWORD fehlt in .env." >&2
  exit 1
}

cd "$ROOT_DIR"

if [[ "$APPLY_SCHEMA" == true ]]; then
  echo "Wende Recipe-Images-Schema an ..."
  docker exec -i supabase-db psql -X -qAt -v ON_ERROR_STOP=1 \
    -U postgres -d "${POSTGRES_DB:-postgres}" \
    -c "SELECT 1 FROM pg_roles WHERE rolname IN ('supabase_admin','supabase_storage_admin') HAVING COUNT(*) = 2;" \
    | grep -qx "1" || {
      echo "Erforderliche Supabase-Owner-Rollen wurden nicht gefunden." >&2
      exit 1
  }
  docker exec -i supabase-db psql -X -v ON_ERROR_STOP=1 \
    -U supabase_admin -d "${POSTGRES_DB:-postgres}" \
    < scripts/hotfix_2026_06_11_recipe_images.sql
  docker exec -i -e "PGPASSWORD=${POSTGRES_PASSWORD}" supabase-db \
    psql -X -v ON_ERROR_STOP=1 -h 127.0.0.1 \
    -U supabase_storage_admin -d "${POSTGRES_DB:-postgres}" \
    < scripts/hotfix_2026_06_11_recipe_images_storage.sql
fi

echo "Pruefe Recipe-Parser ..."
PARSER_HEALTH="$(
  curl --fail --silent --show-error "http://127.0.0.1:${RECIPE_PARSER_PORT:-8090}/health"
)"
python3 - "$PARSER_HEALTH" <<'PY'
import json, sys
data = json.loads(sys.argv[1])
required_route = "/recipe-images/backfill"
routes = data.get("recipe_image_routes") or []
if data.get("recipe_images_api_version") != 2 or required_route not in routes:
    print(
        "Der laufende Recipe-Parser enthaelt den Backfill-Endpunkt noch nicht.\n"
        "Bitte zuerst ausfuehren:\n"
        "  docker compose -f docker-compose.full.yml build --no-cache recipe-source-parser\n"
        "  docker compose -f docker-compose.full.yml up -d --force-recreate recipe-source-parser",
        file=sys.stderr,
    )
    print(f"Gemeldete API-Version: {data.get('recipe_images_api_version')}", file=sys.stderr)
    print(f"Gemeldete Routen: {routes}", file=sys.stderr)
    raise SystemExit(1)
if data.get("yt_dlp") is not True:
    print("yt-dlp fehlt im Recipe-Parser.", file=sys.stderr)
    raise SystemExit(1)
PY

echo "Starte Backfill fuer maximal ${LIMIT} Rezepte ..."
HTTP_CODE="$(
  curl --silent --show-error --output "$REPORT_FILE" --write-out '%{http_code}' \
    --request POST "http://127.0.0.1:${RECIPE_PARSER_PORT:-8090}/recipe-images/backfill" \
    --header "Authorization: Bearer ${RECIPE_PARSER_INTERNAL_TOKEN}" \
    --header "Content-Type: application/json" \
    --data "{\"limit\":${LIMIT}}"
)"

if [[ ! "$HTTP_CODE" =~ ^2 ]]; then
  echo "Backfill fehlgeschlagen (HTTP ${HTTP_CODE})." >&2
  cat "$REPORT_FILE" >&2
  if [[ "$HTTP_CODE" == "404" ]]; then
    echo >&2
    echo "Der Container verwendet nicht denselben Parser-Stand wie das Skript." >&2
    echo "Neuaufbau ohne Cache:" >&2
    echo "  docker compose -f docker-compose.full.yml build --no-cache recipe-source-parser" >&2
    echo "  docker compose -f docker-compose.full.yml up -d --force-recreate recipe-source-parser" >&2
  fi
  exit 1
fi

python3 - "$REPORT_FILE" <<'PY'
import json, sys
path = sys.argv[1]
data = json.load(open(path, encoding="utf-8"))
print()
print("Backfill abgeschlossen")
print(f"  Geprueft:       {data.get('checked', 0)}")
print(f"  Gespeichert:    {data.get('stored', 0)}")
print(f"  Uebersprungen:  {data.get('skipped', 0)}")
print(f"  Fehlgeschlagen: {data.get('failed', 0)}")
print(f"  Bericht:        {path}")
raise SystemExit(1 if data.get("failed", 0) else 0)
PY
