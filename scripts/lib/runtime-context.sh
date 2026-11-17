#!/usr/bin/env bash
# Shared installation context. Sourcing this file never starts services or reads secrets.

umzug_read_install_mode() {
  local config="${1}/.env"
  [[ -f "$config" ]] || return 0
  sed -n 's/^[[:space:]]*UMZUG_INSTALL_MODE[[:space:]]*=[[:space:]]*//p' "$config" \
    | tail -n 1 | tr -d '\r' | sed -e 's/[[:space:]]*$//' -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//"
}

umzug_save_install_mode() {
  local root="$1" mode="$2" temporary
  case "$mode" in apponly|vollstack) ;; *) return 1 ;; esac
  [[ "$(umzug_read_install_mode "$root")" == "$mode" ]] && return 0
  temporary="$(mktemp "${root}/.env.install-mode.XXXXXX")" || return 1
  if [[ -f "${root}/.env" ]]; then
    if ! awk '!/^[[:space:]]*UMZUG_INSTALL_MODE[[:space:]]*=/' "${root}/.env" > "$temporary"; then
      rm -f -- "$temporary"; return 1
    fi
  fi
  printf '\nUMZUG_INSTALL_MODE=%s\n' "$mode" >> "$temporary"
  if ! mv -- "$temporary" "${root}/.env"; then rm -f -- "$temporary"; return 1; fi
}

umzug_resolve_install_context() {
  local root="$1" language="${2:-de}" mode stored label choice
  stored="$(umzug_read_install_mode "$root")"
  mode="${UMZUG_INSTALL_MODE:-$stored}"
  UMZUG_MODE_SOURCE="configuration"
  if [[ -n "$mode" ]]; then
    case "$mode" in apponly|vollstack) ;; *)
      printf '%s\n' 'Invalid UMZUG_INSTALL_MODE. Expected apponly or vollstack.' >&2; return 1 ;;
    esac
  else
    # Actual Compose ownership is more reliable than the presence of template files.
    label="$(docker inspect --format '{{ index .Config.Labels "com.docker.compose.project.config_files" }}' umzugsplaner-pwa-container 2>/dev/null || true)"
    case "$label" in
      *docker-compose.full.yml*) mode="vollstack"; UMZUG_MODE_SOURCE="container" ;;
      *docker-compose.yml*) mode="apponly"; UMZUG_MODE_SOURCE="container" ;;
    esac
    if [[ -z "$mode" && ! -f "${root}/.env" ]]; then
      # No installation yet. The installer still offers both modes as before.
      COMPOSE_FILE="docker-compose.full.yml"; IS_VOLLSTACK=false; UMZUG_MODE_SOURCE="unconfigured"
      return 0
    fi
    if [[ -z "$mode" ]]; then
      if [[ -f "${root}/docker-compose.full.yml" && ! -f "${root}/docker-compose.yml" ]]; then
        mode="vollstack"; UMZUG_MODE_SOURCE="single-compose-file"
      elif [[ -f "${root}/docker-compose.yml" && ! -f "${root}/docker-compose.full.yml" ]]; then
        mode="apponly"; UMZUG_MODE_SOURCE="single-compose-file"
      else
        if [[ "$language" == en ]]; then
          printf '%s\n' 'Installation mode is ambiguous. Choose once: [1] Fullstack [2] App-only [0] Cancel' >&2
        else
          printf '%s\n' 'Installationsmodus unklar. Einmalig wählen: [1] Vollstack [2] App-only [0] Abbrechen' >&2
        fi
        if ! read -r choice; then printf '%s\n' 'No installation mode selected; operation cancelled.' >&2; return 1; fi
        case "$choice" in 1) mode="vollstack" ;; 2) mode="apponly" ;; *) return 1 ;; esac
        UMZUG_MODE_SOURCE="selection"
      fi
    fi
  fi
  case "$mode" in
    apponly) COMPOSE_FILE="docker-compose.yml"; IS_VOLLSTACK=false ;;
    vollstack) COMPOSE_FILE="docker-compose.full.yml"; IS_VOLLSTACK=true ;;
    *) return 1 ;;
  esac
  if [[ ! -f "${root}/${COMPOSE_FILE}" ]]; then
    printf 'Required Compose file missing: %s\n' "$COMPOSE_FILE" >&2; return 1
  fi
  if [[ -f "${root}/.env" ]]; then
    umzug_save_install_mode "$root" "$mode" || return 1
  fi
}

# Keep the documented maintenance command usable without Docker or an installation.
umzug_run_maintenance() {
  local root="$1" action="${2:-}" language="${3:-de}"
  if [[ "$action" == "backups" ]]; then
    command -v python3 >/dev/null 2>&1 || { echo 'python3 required.' >&2; return 1; }
    python3 "$root/scripts/lib/backup_maintenance.py" "$root" --language "$language"
    return $?
  fi
  if [[ "$action" != "browserslist" ]]; then
    printf '%s\n' 'Usage: manage.sh maintenance browserslist|backups' >&2
    return 2
  fi
  command -v npm >/dev/null 2>&1 || { printf '%s\n' 'npm is required for browserslist maintenance.' >&2; return 1; }
  [[ -f "${root}/umzugshelfer-pwa/package.json" ]] || return 1
  (
    cd "${root}/umzugshelfer-pwa" || exit 1
    npm exec --yes --package=update-browserslist-db -- update-browserslist-db
  )
}


# Bundled templates are reviewed together with the pinned service images. No
# master download and no replacement of existing installation-specific files.
umzug_prepare_supabase_files() {
  local root="$1" relative source
  for relative in volumes/db/realtime.sql volumes/db/webhooks.sql volumes/db/roles.sql volumes/db/jwt.sql volumes/db/_supabase.sql volumes/db/logs.sql volumes/db/pooler.sql volumes/logs/vector.yml volumes/pooler/pooler.exs volumes/api/kong.yml; do
    [[ ! -f "$root/$relative" ]] || continue
    source="$root/scripts/templates/supabase/$relative"
    [[ -s "$source" ]] || { printf 'Missing versioned initialization template: %s\n' "$source" >&2; return 1; }
    mkdir -p "$(dirname "$root/$relative")" || return 1
    cp "$source" "$root/$relative" || return 1
    chmod 644 "$root/$relative" || return 1
  done
}

# The gateway launcher is our versioned code, shared by manual setup and menus.
# Preserve installation-specific launchers exactly as other runtime templates.
umzug_prepare_kong_entrypoint() {
  local root="$1" target="$1/volumes/api/kong-entrypoint.sh"
  [[ ! -f "$target" ]] || return 0
  [[ -s "$root/scripts/templates/kong-entrypoint.sh" ]] || {
    printf '%s\n' 'Missing versioned Kong entrypoint template.' >&2; return 1;
  }
  mkdir -p "$root/volumes/api" || return 1
  cp "$root/scripts/templates/kong-entrypoint.sh" "$target" || return 1
  chmod 755 "$target" || return 1
}

# Files only: does not generate/replace secrets, contact Docker or start services.
umzug_prepare_fullstack_files() {
  local root="$1" directory
  umzug_prepare_supabase_files "$root" || return 1
  umzug_prepare_kong_entrypoint "$root" || return 1
  for directory in storage functions snippets db/data; do
    mkdir -p "$root/volumes/$directory" || return 1
  done
}

# Studio already includes Node (also used by its Compose healthcheck). Kong3
# no longer includes curl/wget; do not misreport missing tools as Studio failure.
# This probes Studio's internal HTTP endpoint, not the gateway's upstream path.
umzug_studio_http_status() {
  docker exec supabase-studio node -e 'fetch("http://studio:3000", {redirect: "manual", signal: AbortSignal.timeout(5000)}).then(response => process.stdout.write(String(response.status))).catch(() => process.exit(1))'
}

umzug_wait_fullstack_ready() {
  local remaining="${UMZUG_READINESS_RETRIES:-60}" storage query
  while (( remaining > 0 )); do
    storage="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' supabase-storage 2>/dev/null || true)"
    query="$(docker exec supabase-db psql -X -U postgres -d postgres -Atc "SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='storage' AND table_name='buckets' AND column_name='public');" 2>/dev/null || true)"
    if [[ "$storage" == healthy && "$query" == t ]] && docker exec supabase-kong kong health >/dev/null 2>&1; then return 0; fi
    remaining=$((remaining - 1))
    (( remaining == 0 )) || sleep 2
  done
  printf '%s\n' 'Storage migrations or Kong are not ready. Schema import was not started.' >&2
  return 1
}


umzug_env_value() {
  local root="$1" key="$2"
  [[ -f "$root/.env" ]] || return 0
  sed -n "s/^${key}=//p" "$root/.env" | head -1 | tr -d '\r' | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//"
}

umzug_store_setting() {
  local root="$1" key="$2" value="$3" temporary
  [[ "$key" =~ ^[A-Z][A-Z0-9_]*$ && -f "$root/.env" ]] || return 1
  temporary=$(mktemp "$root/.env.setting.XXXXXX") || return 1
  UMZUG_KEY="$key" UMZUG_VALUE="$value" awk 'index($0, ENVIRON["UMZUG_KEY"] "=") != 1 {print} END {print ENVIRON["UMZUG_KEY"] "=" ENVIRON["UMZUG_VALUE"]}' "$root/.env" > "$temporary" || return 1
  chmod 600 "$temporary" && mv -- "$temporary" "$root/.env"
}

umzug_redirect_allowlist() {
  local current="$1" base="${2%/}" previous="${3:-}" entry result='' entries=()
  previous=${previous%/}
  [[ -n "$base" ]] || { printf '%s' "$current"; return 0; }
  IFS=',' read -r -a entries <<< "$current"
  entries+=("$base" "$base/update-password")
  for entry in "${entries[@]}"; do
    entry="${entry#"${entry%%[![:space:]]*}"}"
    entry="${entry%"${entry##*[![:space:]]}"}"
    [[ -n "$entry" ]] || continue
    if [[ -n "$previous" && "$previous" != "$base" && ( "$entry" == "$previous" || "$entry" == "$previous/update-password" ) ]]; then continue; fi
    [[ ",$result," != *",$entry,"* ]] || continue
    result="${result:+$result,}$entry"
  done
  printf '%s' "$result"
}

umzug_ensure_auth_redirects() {
  AUTH_REDIRECTS_CHANGED=false
  local base current updated
  base=$(env_get SITE_URL)
  [[ -n "$base" ]] || base=$(env_get APP_URL)
  [[ -n "$base" ]] || return 0
  current=$(env_get ADDITIONAL_REDIRECT_URLS)
  updated=$(umzug_redirect_allowlist "$current" "$base") || return 1
  if [[ "$updated" != "$current" ]]; then
    env_set ADDITIONAL_REDIRECT_URLS "$updated" || return 1
    AUTH_REDIRECTS_CHANGED=true
  fi
}

# Preserve explicit GPU installs; new installs use CPU unless opted in. Every
# management/backup entrypoint uses the same wrapper, including restarts.
umzug_compose() {
  local root="${PROJECT_DIR:-$PWD}" gpu='' requests='' args=("$@")
  if [[ "${1:-}" == -f && "${2##*/}" == docker-compose.full.yml ]]; then
    gpu=$(umzug_env_value "$root" OLLAMA_USE_GPU)
    if [[ -z "$gpu" ]]; then
      requests=$(docker inspect --format '{{if .State.Running}}{{len .HostConfig.DeviceRequests}}{{else}}0{{end}}' ollama 2>/dev/null || true)
      if [[ "$requests" =~ ^[1-9][0-9]*$ ]]; then
        gpu=true
        umzug_store_setting "$root" OLLAMA_USE_GPU true || return 1
      fi
    fi
    case "$gpu" in
      true)
        [[ -f "$root/docker-compose.ollama-gpu.yml" ]] || { printf '%s\n' 'Missing Ollama GPU override.' >&2; return 1; }
        args=("$1" "$2" -f "$root/docker-compose.ollama-gpu.yml" "${@:3}") ;;
      ''|false) ;;
      *) printf '%s\n' 'OLLAMA_USE_GPU must be true or false.' >&2; return 1 ;;
    esac
  fi
  docker compose "${args[@]}"
}

umzug_wait_ollama_ready() {
  local remaining="${UMZUG_READINESS_RETRIES:-60}"
  while (( remaining > 0 )); do
    # `ollama list` queries GET /api/tags and fails when the daemon is unavailable.
    if docker exec ollama ollama list >/dev/null 2>&1; then return 0; fi
    remaining=$((remaining - 1))
    (( remaining == 0 )) || sleep 2
  done
  printf '%s\n' 'Ollama did not become ready; inspect its container logs.' >&2
  return 1
}


# Persisted installation choice survives a stopped/Created/failed container.
# Only adopt a legacy container actually owned by this Compose directory.
umzug_ollama_requested() {
  local root="$1" configured ownership
  configured=$(umzug_env_value "$root" OLLAMA_INSTALLED)
  case "$configured" in
    true) return 0 ;;
    false) return 1 ;;
    '') ;;
    *) printf '%s\n' 'OLLAMA_INSTALLED must be true or false.' >&2; return 2 ;;
  esac
  root=$(cd "$root" && pwd -P) || return 2
  ownership=$(docker inspect --format '{{index .Config.Labels "com.docker.compose.service"}}|{{index .Config.Labels "com.docker.compose.project.working_dir"}}' ollama 2>/dev/null || true)
  if [[ "$ownership" == "ollama|$root" ]]; then
    if [[ -f "$root/.env" ]]; then umzug_store_setting "$root" OLLAMA_INSTALLED true || return 2; fi
    return 0
  fi
  return 1
}

umzug_start_stack() {
  local compose="$1" include_ollama="$2" listed service core=()
  shift 2
  listed=$(umzug_compose -f "$compose" config --services) || return 1
  while IFS= read -r service; do
    [[ -n "$service" && "$service" != ollama ]] && core+=("$service")
  done <<< "$listed"
  (( ${#core[@]} )) || { echo 'No core services found.' >&2; return 1; }
  # An explicit service list prevents optional Ollama failures cancelling the
  # parallel startup/recreation of the rest of the project.
  umzug_compose -f "$compose" up -d "$@" "${core[@]}" || return 1
  # Kong caches upstream IPs; refresh only after auth and the other upstreams
  # have finished recreating, including when optional Ollama subsequently fails.
  for service in "${core[@]}"; do
    if [[ "$service" == kong ]]; then
      if [[ " $* " == *" --wait "* ]]; then
        # A successful core wait is not enough after refreshing gateway IPs:
        # wait for this replacement as well before reporting an image update.
        umzug_compose -f "$compose" up -d --no-build --no-deps --force-recreate --wait --wait-timeout 300 kong || return 1
      else
        umzug_compose -f "$compose" up -d --no-deps --force-recreate kong || return 1
      fi
      break
    fi
  done
  if [[ "$include_ollama" == true ]]; then
    # No dependencies or other services are recreated in this second phase.
    if ! umzug_compose -f "$compose" --profile ollama up -d --no-deps "$@" ollama; then
      echo 'Ollama failed; the core services have already been started.' >&2
      return 1
    fi
    umzug_wait_ollama_ready || return 1
  fi
  return 0
}

# Print a real standalone command (not this script's internal shell functions).
# The project's Compose definition pins the image and joins its own network.
umzug_print_ollama_start() {
  local root="$1"
  printf '  docker compose -f docker-compose.full.yml'
  if [[ "$(umzug_env_value "$root" OLLAMA_USE_GPU)" == true ]]; then
    printf ' -f docker-compose.ollama-gpu.yml'
  fi
  printf ' --profile ollama up -d --no-deps ollama\n'
}

# Ask Compose which optional local build services exist in this installation.
# Docker's build cache detects changed Dockerfiles, requirements and copied source;
# no private timestamp ledger or image-name guess is needed.
umzug_local_build_services() {
  local compose="$1" listed service
  listed=$(umzug_compose -f "$compose" config --services) || return 1
  for service in recipe-source-parser document-ocr-service; do
    if grep -Fxq "$service" <<< "$listed"; then printf '%s\n' "$service"; fi
  done
  return 0
}

umzug_build_update_images() {
  local compose="$1" fullstack="$2" listed service images=(umzugsplaner-app)
  if [[ "$fullstack" == true ]]; then
    listed=$(umzug_local_build_services "$compose") || return 1
    while IFS= read -r service; do
      [[ -n "$service" ]] && images+=("$service")
    done <<< "$listed"
  fi
  # Build every required image before any menu step replaces a running service.
  umzug_compose -f "$compose" build "${images[@]}" || return 1
}

umzug_start_updated_local_services() {
  local compose="$1" fullstack="$2" listed service services=()
  [[ "$fullstack" == true ]] || return 0
  listed=$(umzug_local_build_services "$compose") || return 1
  while IFS= read -r service; do
    [[ -n "$service" ]] && services+=("$service")
  done <<< "$listed"
  (( ${#services[@]} )) || return 0
  # Compose recreates only changed/missing containers. Wait for their healthchecks
  # and prohibit an implicit build after other containers have been replaced.
  umzug_compose -f "$compose" up -d --no-build --no-deps --wait --wait-timeout 180 "${services[@]}" || return 1
}
