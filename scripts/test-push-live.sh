#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ROOT_DIR}/.env"
TARGET_EMAIL="${PUSH_TEST_USER_EMAIL:-}"
ASSUME_YES=false
INCLUDE_REMINDERS=false
KEEP_REPORT=false
REPORT_FILE=""

usage() {
  cat <<'EOF'
Live-End-to-End-Test fuer Push-Nachrichten

Aufruf:
  ./scripts/test-push-live.sh [Optionen]

Optionen:
  --email ADRESSE       Zielkonto (muss Push abonniert haben)
  --include-reminders   Zusaetzlich check-reminders fuer alle Module ausfuehren
  --yes                 Sicherheitsabfrage ueberspringen
  --keep-report         JSON-Bericht im Projektverzeichnis behalten
  -h, --help            Hilfe anzeigen

Standardmaessig werden 12 markierte Test-Pushs ueber die echte send-push
Edge-Function verschickt. Es werden keine Fachdaten angelegt oder veraendert.

ACHTUNG: --include-reminders kann vorhandene, aktuell faellige Erinnerungen
des Zielkontos wirklich versenden und deren Dedupe-Status aktualisieren.
EOF
}

while (($#)); do
  case "$1" in
    --email)
      TARGET_EMAIL="${2:-}"
      shift 2
      ;;
    --include-reminders)
      INCLUDE_REMINDERS=true
      shift
      ;;
    --yes)
      ASSUME_YES=true
      shift
      ;;
    --keep-report)
      KEEP_REPORT=true
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

for command_name in docker curl python3; do
  command -v "$command_name" >/dev/null 2>&1 || {
    echo "Fehlendes Programm: ${command_name}" >&2
    exit 1
  }
done

[[ -f "$ENV_FILE" ]] || {
  echo "Keine .env unter ${ENV_FILE} gefunden." >&2
  exit 1
}

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

SUPABASE_URL="${SUPABASE_PUBLIC_URL:-${REACT_APP_SUPABASE_URL:-}}"
SERVICE_KEY="${SERVICE_ROLE_KEY:-${SUPABASE_SERVICE_ROLE_KEY:-}}"
SUPABASE_URL="${SUPABASE_URL%/}"

[[ -n "$SUPABASE_URL" ]] || {
  echo "SUPABASE_PUBLIC_URL fehlt in .env." >&2
  exit 1
}
[[ -n "$SERVICE_KEY" ]] || {
  echo "SERVICE_ROLE_KEY fehlt in .env." >&2
  exit 1
}
docker inspect supabase-db >/dev/null 2>&1 || {
  echo "Docker-Container 'supabase-db' wurde nicht gefunden." >&2
  exit 1
}

psql_scalar() {
  docker exec -i supabase-db psql -X -qAt -v ON_ERROR_STOP=1 \
    -U postgres -d "${POSTGRES_DB:-postgres}" "$@"
}

if [[ -z "$TARGET_EMAIL" ]]; then
  TARGET_EMAIL="$(
    psql_scalar -c "
      SELECT u.email
      FROM auth.users u
      JOIN public.push_subscriptions ps ON ps.user_id = u.id
      LEFT JOIN public.household_members hm ON hm.user_id = u.id
      ORDER BY (hm.role = 'admin') DESC NULLS LAST, ps.created_at DESC
      LIMIT 1;
    "
  )"
fi

[[ -n "$TARGET_EMAIL" ]] || {
  echo "Kein Benutzer mit aktiver Push-Subscription gefunden." >&2
  exit 1
}

TARGET_EMAIL_SQL="${TARGET_EMAIL//\'/\'\'}"
USER_ROW="$(
  psql_scalar -F $'\t' -c "
    SELECT u.id, u.email, COUNT(ps.id)
    FROM auth.users u
    JOIN public.push_subscriptions ps ON ps.user_id = u.id
    WHERE lower(u.email) = lower('${TARGET_EMAIL_SQL}')
    GROUP BY u.id, u.email;
  "
)"

[[ -n "$USER_ROW" ]] || {
  echo "Konto '${TARGET_EMAIL}' nicht gefunden oder ohne Push-Subscription." >&2
  exit 1
}

IFS=$'\t' read -r TARGET_USER_ID TARGET_EMAIL SUBSCRIPTION_COUNT <<<"$USER_ROW"
RUN_ID="push-e2e-$(date -u +%Y%m%dT%H%M%SZ)-$$"
REPORT_FILE="${ROOT_DIR}/${RUN_ID}.json"
TMP_REPORT="$(mktemp)"
trap 'rm -f "$TMP_REPORT"; if [[ "$KEEP_REPORT" != true ]]; then rm -f "$REPORT_FILE"; fi' EXIT

echo
echo "Push-Live-Test"
echo "  Server:        ${SUPABASE_URL}"
echo "  Zielkonto:     ${TARGET_EMAIL}"
echo "  Subscriptions: ${SUBSCRIPTION_COUNT}"
echo "  Testlauf:      ${RUN_ID}"
echo "  Reminder-Test: ${INCLUDE_REMINDERS}"
echo

if [[ "$ASSUME_YES" != true ]]; then
  read -r -p "Jetzt echte Test-Pushs senden? [j/N] " answer
  [[ "$answer" =~ ^[jJyY]$ ]] || exit 0
fi

python3 - "$TMP_REPORT" "$RUN_ID" "$TARGET_USER_ID" <<'PY'
import json, sys
path, run_id, user_id = sys.argv[1:]
json.dump({
    "run_id": run_id,
    "user_id": user_id,
    "direct_pushes": [],
    "reminders": None,
}, open(path, "w", encoding="utf-8"), indent=2)
PY

MODULES=(
  "aufgaben|Aufgaben|/home/aufgaben"
  "vorraete|Vorraete|/home/vorraete"
  "medikamente|Medikamente|/home/heimapotheke"
  "geraete|Geraete|/home/geraete"
  "kfz|KFZ|/home/kfz"
  "projekte|Projekte|/home/projekte"
  "vertraege|Vertraege|/home/vertraege"
  "versicherungen|Versicherungen|/home/versicherungen"
  "budget|Budget|/home/budget"
  "einkauf|Einkauf|/home/einkaufliste"
  "ausgleiche|Ausgleiche|/home/budget?tab=ausgleich"
  "buecher|Buecher|/home/inventar?tab=buecher"
)

FAILED=0
INDEX=0
for module_row in "${MODULES[@]}"; do
  IFS='|' read -r module label url <<<"$module_row"
  INDEX=$((INDEX + 1))
  payload="$(
    python3 - "$TARGET_USER_ID" "$label" "$url" "$RUN_ID" "$module" "$INDEX" <<'PY'
import json, sys
user_id, label, url, run_id, module, index = sys.argv[1:]
print(json.dumps({
    "user_id": user_id,
    "title": f"[PUSH-TEST {index}/12] {label}",
    "body": f"Automatischer Live-Test {run_id}. Antippen prueft die Zielnavigation.",
    "url": url,
    "tag": f"{run_id}-{module}",
}))
PY
  )"

  response_file="$(mktemp)"
  http_code="$(
    curl --silent --show-error --output "$response_file" --write-out '%{http_code}' \
      --request POST "${SUPABASE_URL}/functions/v1/send-push" \
      --header "Authorization: Bearer ${SERVICE_KEY}" \
      --header "apikey: ${SERVICE_KEY}" \
      --header "Content-Type: application/json" \
      --data "$payload" || echo "000"
  )"

  result="$(
    python3 - "$response_file" "$http_code" "$module" <<'PY'
import json, sys
path, status, module = sys.argv[1:]
try:
    data = json.load(open(path, encoding="utf-8"))
except Exception as exc:
    data = {"error": f"Ungueltige JSON-Antwort: {exc}"}
sent = int(data.get("sent", 0))
failed = int(data.get("failed", 0))
removed = int(data.get("removed", 0))
ok = status.startswith("2") and sent > 0 and failed == 0
print(json.dumps({"module": module, "http_status": status, "ok": ok, "response": data}))
PY
  )"
  rm -f "$response_file"

  python3 - "$TMP_REPORT" "$result" <<'PY'
import json, sys
path, raw = sys.argv[1:]
report = json.load(open(path, encoding="utf-8"))
report["direct_pushes"].append(json.loads(raw))
json.dump(report, open(path, "w", encoding="utf-8"), indent=2)
PY

  if python3 -c 'import json,sys; raise SystemExit(0 if json.loads(sys.argv[1])["ok"] else 1)' "$result"; then
    delivery_counts="$(python3 -c 'import json,sys; d=json.loads(sys.argv[1])["response"]; print("{}|{}".format(d.get("sent", 0), d.get("removed", 0)))' "$result")"
    IFS='|' read -r sent_count removed_count <<<"$delivery_counts"
    if ((removed_count > 0)); then
      printf '  [OK]     %-18s gesendet: %s, defekte Subscriptions entfernt: %s\n' "$label" "$sent_count" "$removed_count"
    else
      printf '  [OK]     %-18s gesendet: %s\n' "$label" "$sent_count"
    fi
  else
    FAILED=$((FAILED + 1))
    error_text="$(python3 -c 'import json,sys; d=json.loads(sys.argv[1]); print(d["response"].get("error") or d["response"].get("errors") or d["response"])' "$result")"
    printf '  [FEHLER] %-18s %s\n' "$label" "$error_text"
  fi
done

if [[ "$INCLUDE_REMINDERS" == true ]]; then
  echo
  echo "Produktive Reminder-Logik wird fuer das Zielkonto ausgefuehrt ..."
  reminder_payload="$(
    python3 - "$TARGET_USER_ID" <<'PY'
import json, sys
print(json.dumps({
    "only_user_id": sys.argv[1],
    "modules": [
        "tasks", "inventory", "medicine", "devices", "kfz", "projects",
        "contracts", "insurance", "budget", "shopping", "settlements", "books"
    ],
}))
PY
  )"
  reminder_response="$(mktemp)"
  reminder_http="$(
    curl --silent --show-error --output "$reminder_response" --write-out '%{http_code}' \
      --request POST "${SUPABASE_URL}/functions/v1/check-reminders" \
      --header "Authorization: Bearer ${SERVICE_KEY}" \
      --header "apikey: ${SERVICE_KEY}" \
      --header "Content-Type: application/json" \
      --data "$reminder_payload" || echo "000"
  )"

  python3 - "$TMP_REPORT" "$reminder_response" "$reminder_http" <<'PY'
import json, sys
report_path, response_path, status = sys.argv[1:]
report = json.load(open(report_path, encoding="utf-8"))
try:
    response = json.load(open(response_path, encoding="utf-8"))
except Exception as exc:
    response = {"error": f"Ungueltige JSON-Antwort: {exc}"}
report["reminders"] = {"http_status": status, "response": response}
json.dump(report, open(report_path, "w", encoding="utf-8"), indent=2)
PY
  rm -f "$reminder_response"

  reminder_summary="$(
    python3 - "$TMP_REPORT" <<'PY'
import json, sys
r = json.load(open(sys.argv[1], encoding="utf-8"))["reminders"]
d = r["response"]
errors = d.get("module_errors") or d.get("errors") or []
ok = str(r["http_status"]).startswith("2") and not errors
print(f"{'OK' if ok else 'FEHLER'}|candidates={d.get('candidates', '?')}, sent={d.get('sent', '?')}, failed={d.get('failed', '?')}, module_errors={len(errors)}")
PY
  )"
  IFS='|' read -r reminder_status reminder_text <<<"$reminder_summary"
  printf '  [%s] Reminder: %s\n' "$reminder_status" "$reminder_text"
  [[ "$reminder_status" == "OK" ]] || FAILED=$((FAILED + 1))
fi

cp "$TMP_REPORT" "$REPORT_FILE"
echo
if ((FAILED == 0)); then
  echo "Automatischer API-Test erfolgreich."
else
  echo "Test mit ${FAILED} Fehler(n) abgeschlossen."
fi
echo "Am Zielgeraet jetzt pruefen:"
echo "  1. Alle 12 Meldungen sind angekommen."
echo "  2. Jede Meldung erscheint nur einmal."
echo "  3. Antippen oeffnet das jeweils genannte Modul."
echo "  4. Test bei geschlossener App und bei bereits geoeffneter App wiederholen."
[[ "$KEEP_REPORT" == true ]] && echo "JSON-Bericht: ${REPORT_FILE}"

((FAILED == 0))
