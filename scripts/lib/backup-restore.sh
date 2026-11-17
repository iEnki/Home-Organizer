#!/usr/bin/env bash
# Shared, deliberately separate process: errexit remains effective even when a caller
# handles our status in an if statement. Never source this file.
set -Eeuo pipefail
umask 077
operation=${1:?backup or restore}
root=${2:?project directory}
compose=${3:?compose file}
source_backup=${4:-}
cd "$root"
root=$(pwd -P)
[[ "$compose" == docker-compose.full.yml && -f "$compose" ]] || { echo 'Fullstack required.' >&2; exit 1; }
# A fixed container name alone does not prove this installation owns the database.
owner=$(docker inspect --format '{{ index .Config.Labels "com.docker.compose.project.working_dir" }}' supabase-db)
[[ "$owner" == "$root" ]] || { echo 'Database belongs to a different project directory.' >&2; exit 1; }
[[ "$operation" == backup || "$operation" == restore ]] || exit 2

work=$(mktemp -d "$root/.backup-work.XXXXXX")
chmod 700 "$work"
remote=''
stopped=()
mutation_started=0
storage_swapped=0
config_changed=0
recovery=''
succeeded=0
committed=0
stage=''
app_name=''

source "$root/scripts/lib/runtime-context.sh"
compose_run() { umzug_compose -f "$compose" "$@"; }
prepare_dump() {
  # List validation alone cannot detect damage in compressed data blocks.
  local archive="$1" output="$2"
  docker exec supabase-db pg_restore --list "$archive" > "$work/toc"
  awk '($4=="TABLE" && $5=="DATA" && ($6=="public" || $6=="auth" || $6=="storage") && !($6=="auth" && $7=="schema_migrations") && !($6=="storage" && $7=="migrations")) || ($4=="SEQUENCE" && $5=="SET" && ($6=="public" || $6=="auth" || $6=="storage"))' "$work/toc" > "$work/selected.list"
  for entry in 'auth users' 'auth identities' 'storage buckets' 'storage objects' 'public households'; do
    grep -Eq " TABLE DATA ${entry} " "$work/selected.list" || { echo "Missing backup data: $entry" >&2; return 1; }
  done
  docker cp "$work/selected.list" "supabase-db:$remote/selected.list"
  docker exec supabase-db pg_restore --exit-on-error --data-only --no-owner --no-privileges --use-list="$remote/selected.list" --file="$output" "$archive"
}
apply_data() {
  docker exec supabase-db psql -X -U supabase_admin -d "dbname=postgres application_name=$app_name" --set=ON_ERROR_STOP=1 --single-transaction \
    -f "$remote/clear.sql" -f "$1"
}
snapshot() {
  local destination="$1"
  mkdir -m 700 "$destination"
  docker exec supabase-db pg_dump -U postgres -d postgres -Fc -f "$remote/current.dump"
  docker cp "supabase-db:$remote/current.dump" "$destination/db.dump"
  # Services are paused, so file contents and database metadata cannot diverge.
  (umask 022; mkdir -p "$root/volumes/storage")
  tar --xattrs --xattrs-include='user.*' -czf "$destination/storage.tar.gz" -C "$root/volumes" storage
  [[ ! -f .env ]] || cp .env "$destination/.env"
  [[ ! -f CREDENTIALS.txt ]] || cp CREDENTIALS.txt "$destination/credentials.txt"
  printf 'Umzughelfer Backup\nDate: %s\nCompose: %s\n' "$(date -Is)" "$compose" > "$destination/info.txt"
  (cd "$destination"; sha256sum db.dump storage.tar.gz > SHA256SUMS; for f in .env credentials.txt; do [[ ! -f "$f" ]] || sha256sum "$f" >> SHA256SUMS; done)
  chmod 600 "$destination"/*
  if [[ -f "$destination/.env" ]]; then chmod 600 "$destination/.env"; fi
}
finish() {
  local result=$? recovery_ok=1
  trap - EXIT INT TERM
  set +e
  if (( result != 0 && committed == 0 )); then
    if (( mutation_started )); then
      # A lost client/interrupt may leave its server backend running. Terminate
      # only this uniquely named session before attempting a recovery import.
      docker exec supabase-db psql -X -U supabase_admin -d postgres --set=ON_ERROR_STOP=1 \
        -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE application_name = '$app_name' AND pid <> pg_backend_pid();" || recovery_ok=0

      echo 'Restore failed. Recovering the pre-restore database.' >&2
      if (( recovery_ok )); then apply_data "$remote/recovery.sql" || recovery_ok=0; fi
    fi
    if (( storage_swapped )); then
      # Keep the rejected candidate; never merge it over the original files.
      if [[ -d "$root/volumes/storage" ]]; then mv "$root/volumes/storage" "$stage/rejected-storage" || recovery_ok=0; fi
      if [[ -d "$stage/original-storage" ]]; then mv "$stage/original-storage" "$root/volumes/storage" || recovery_ok=0; fi
    fi
    if (( config_changed )); then
      for pair in '.env:.env' 'credentials.txt:CREDENTIALS.txt'; do
        local saved=${pair%%:*} target=${pair#*:}
        if [[ -f "$recovery/$saved" ]]; then cp "$recovery/$saved" "$target" && chmod 600 "$target" || recovery_ok=0; fi
      done
      if [[ ! -f "$recovery/credentials.txt" && -f CREDENTIALS.txt ]]; then mv CREDENTIALS.txt "$work/rejected-credentials.txt" || recovery_ok=0; fi
    fi
  fi
  if (( ${#stopped[@]} && recovery_ok )); then
    # Recreate affected services so restored configuration actually takes effect.
    compose_run up -d "${stopped[@]}" || result=1
  fi
  if (( ! recovery_ok )); then
    echo "Recovery could not complete. Services remain stopped. Recovery backup: $recovery" >&2
    result=1
  fi
  if [[ "$remote" =~ ^/tmp/umzug-backup\.[a-zA-Z0-9]+$ ]]; then docker exec supabase-db rm -rf -- "$remote" >/dev/null 2>&1; fi
  if (( result == 0 && succeeded )); then
    # Validate absolute containment before removing only our own private dirs.
    for directory in "$work" "$stage"; do
      [[ -n "$directory" && -d "$directory" && ! -L "$directory" ]] || continue
      resolved=$(cd "$directory" && pwd -P)
      case "$resolved" in
        "$root"/.backup-work.*|"$root"/volumes/.restore-stage.*) rm -rf -- "$resolved" || echo 'Private temporary cleanup failed.' >&2 ;;
        *) echo 'Refusing cleanup outside the private backup directories.' >&2 ;;
      esac
    done
    echo "OK $operation: ${recovery:-$source_backup}"
  else
    echo "FAILED $operation. No success reported. Evidence: $work; recovery backup: $recovery" >&2
    result=1
  fi
  # On error keep evidence; pre-restore backups always remain private on disk.
  exit "$result"
}
trap finish EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
remote=$(docker exec supabase-db mktemp -d /tmp/umzug-backup.XXXXXX)
[[ "$remote" =~ ^/tmp/umzug-backup\.[a-zA-Z0-9]+$ ]] || exit 1
app_name="umzug_restore_${remote##*.}"
# Verify all platform requirements before pausing any running service.
command -v python3 >/dev/null 2>&1 || { echo 'python3 is required (e.g. apt install python3).' >&2; exit 1; }
tar --help > "$work/tar-help"
grep -q -- '--xattrs' "$work/tar-help" || { echo 'GNU tar with --xattrs is required.' >&2; exit 1; }
probe_directory="$root/volumes/storage"
[[ -d "$probe_directory" ]] || probe_directory="$root"
python3 "$root/scripts/lib/storage_xattrs.py" probe "$probe_directory"
if [[ "$operation" == restore ]]; then
  docker exec supabase-db psql -X -U supabase_admin -d postgres --set=ON_ERROR_STOP=1 \
    -c "DO \$\$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = current_user AND rolsuper) THEN RAISE EXCEPTION 'Restore requires local supabase_admin privileges'; END IF; END \$\$;"
fi


if [[ "$operation" == restore ]]; then
  [[ -d "$source_backup" && -s "$source_backup/db.dump" ]] || { echo 'Missing or empty db.dump.' >&2; exit 1; }
  source_backup=$(cd "$source_backup" && pwd -P)
  # This restore imports postgres only, not _supabase. Keep the destination key
  # matching the untouched pooler credentials instead of importing an old key.
  target_vault=$(umzug_env_value "$root" VAULT_ENC_KEY)
  backup_vault=$(umzug_env_value "$source_backup" VAULT_ENC_KEY)
  if [[ -n "$backup_vault" && -z "$target_vault" ]]; then
    echo 'Destination VAULT_ENC_KEY is missing; restore it before importing an app backup.' >&2
    exit 1
  fi
  if [[ -f "$source_backup/SHA256SUMS" ]]; then
    # Only our four payload names are accepted; hashes cannot reference other paths.
    awk 'NF!=2 || length($1)!=64 || $1 ~ /[^0-9a-f]/ || ($2!="db.dump" && $2!="storage.tar.gz" && $2!=".env" && $2!="credentials.txt") {bad=1} END {exit bad}' "$source_backup/SHA256SUMS"
    grep -Eq '^[0-9a-f]{64}  db.dump$' "$source_backup/SHA256SUMS"
    (cd "$source_backup"; sha256sum --check --strict SHA256SUMS)
  else
    echo 'Legacy backup: no checksum manifest; validating all restore data.' >&2
  fi
  docker cp "$source_backup/db.dump" "supabase-db:$remote/restore.dump"
  prepare_dump "$remote/restore.dump" "$remote/restore.sql"
  # Host and container staging contain sensitive data and remain mode 0700.
  mkdir -p "$root/volumes"
  stage=$(mktemp -d "$root/volumes/.restore-stage.XXXXXX")
  if [[ -f "$source_backup/storage.tar.gz" ]]; then
    tar -tzf "$source_backup/storage.tar.gz" > "$work/storage.list"
    awk '$0 !~ /^storage(\/|$)/ || $0 ~ /(^|\/)\.\.(\/|$)/ {bad=1} END {exit bad}' "$work/storage.list"
    tar -tvzf "$source_backup/storage.tar.gz" > "$work/storage.types"
    awk 'substr($0,1,1)!="-" && substr($0,1,1)!="d" {bad=1} END {exit bad}' "$work/storage.types"
    tar --xattrs --xattrs-include='user.*' -xzf "$source_backup/storage.tar.gz" -C "$stage"
  else
    # Older backups omitted an empty storage directory. Permit that only when
    # the backed-up objects table has no rows; never silently lose uploaded files.
    docker cp "supabase-db:$remote/restore.sql" "$work/restore.sql"
    awk '/^COPY storage.objects / {copy=1;next} copy && $0=="\\." {copy=0;next} copy {bad=1} /^INSERT INTO storage.objects / {bad=1} END {exit bad}' "$work/restore.sql"
    (umask 022; mkdir "$stage/storage")
  fi
  [[ -d "$stage/storage" ]] || { echo 'Storage archive has no storage directory.' >&2; exit 1; }
fi

# Only stop services that were actually running. Keep the database alive for a
# transactional import; no down/up cycle and no database-volume deletion.
compose_run ps --services --status running > "$work/running-services"
grep -qx db "$work/running-services" || { echo 'Start this fullstack database first.' >&2; exit 1; }
while IFS= read -r service; do [[ "$service" == db || -z "$service" ]] || stopped+=("$service"); done < "$work/running-services"
if (( ${#stopped[@]} )); then compose_run stop "${stopped[@]}"; fi
mkdir -p backups
chmod 700 backups
recovery="$root/backups/$(basename "$(mktemp -d "$root/backups/.reserved.XXXXXX")")"
# Reserve unique names without exposing an incomplete backup in the restore menu.
rmdir "$recovery"
if [[ "$operation" == backup ]]; then
  recovery="$root/backups/backup_$(date +%Y%m%d_%H%M%S)_${recovery##*.}"
else
  recovery="$root/backups/pre_restore_$(date +%Y%m%d_%H%M%S)_${recovery##*.}"
fi
snapshot "$recovery"
if [[ "$operation" == backup ]]; then succeeded=1; exit 0; fi

prepare_dump "$remote/current.dump" "$remote/recovery.sql"
# Sequence setval calls are not transactional. Save them separately so a known
# SQL rollback needs only sequence repair, never another table-clearing import.
awk '$4=="SEQUENCE" && $5=="SET"' "$work/selected.list" > "$work/sequences.list"
docker cp "$work/sequences.list" "supabase-db:$remote/sequences.list"
docker exec supabase-db pg_restore --exit-on-error --data-only --no-owner --no-privileges \
  --use-list="$remote/sequences.list" --file="$remote/recovery-sequences.sql" "$remote/current.dump"

docker cp "$root/scripts/lib/restore-clear.sql" "supabase-db:$remote/clear.sql"
# Check that all required destination tables exist before clearing anything.
docker exec supabase-db psql -X -U supabase_admin -d postgres --set=ON_ERROR_STOP=1 -c "DO \$\$ BEGIN IF to_regclass('auth.identities') IS NULL OR to_regclass('storage.objects') IS NULL OR to_regclass('public.households') IS NULL THEN RAISE EXCEPTION 'Install matching schemas before restore'; END IF; END \$\$;"
# Stage filesystem changes while consumers are stopped. EXIT restores originals
# on any import/configuration error. Rejected candidate files are retained.
if [[ -d "$root/volumes/storage" ]]; then mv "$root/volumes/storage" "$stage/original-storage"; fi
storage_swapped=1
mv "$stage/storage" "$root/volumes/storage"
mutation_started=1
if apply_data "$remote/restore.sql"; then
  # A later attribute/configuration error must restore the previous database.
  mutation_started=1
else
  import_status=$?
  if [[ "$import_status" == 3 ]]; then
    # psql ON_ERROR_STOP + --single-transaction reported a SQL rollback.
    # Table data are unchanged. Restore only nontransactional sequence values.
    if docker exec supabase-db psql -X -U supabase_admin -d postgres --set=ON_ERROR_STOP=1 -f "$remote/recovery-sequences.sql"; then
      mutation_started=0
      echo 'Import transaction rolled back; table recovery is not needed.' >&2
    fi
  fi
  exit "$import_status"
fi
# Modern tar archives retain these. For legacy backups reconstruct only missing
# attributes from the imported metadata before consumers can access the files.
docker exec supabase-db psql -X -U supabase_admin -d postgres -At --set=ON_ERROR_STOP=1 \
  -c "SELECT COALESCE(json_agg(json_build_object('bucket_id', bucket_id, 'name', name, 'version', version, 'metadata', metadata)), '[]'::json) FROM storage.objects;" > "$work/storage-metadata.json"
storage_config="$source_backup/.env"
[[ -f "$storage_config" ]] || storage_config="$recovery/.env"
python3 "$root/scripts/lib/storage_xattrs.py" repair "$root/volumes/storage" "$work/storage-metadata.json" --config "$storage_config"
config_changed=1
if [[ -f "$source_backup/.env" ]]; then cp "$source_backup/.env" .env; chmod 600 .env; fi
if [[ -f "$source_backup/credentials.txt" ]]; then cp "$source_backup/credentials.txt" CREDENTIALS.txt; chmod 600 CREDENTIALS.txt; fi
# Data-only restore intentionally keeps destination service roles. Their database
# password is therefore the installed target's password, including on a fresh
# target. Retain it while restoring source JWT/Vault/application configuration.
current_db_line=$(grep -m1 '^POSTGRES_PASSWORD=' "$recovery/.env" || true)
source_db_line=$(grep -m1 '^POSTGRES_PASSWORD=' .env || true)
if [[ -n "$current_db_line" && -n "$source_db_line" && "$current_db_line" != "$source_db_line" ]]; then
  UMZUG_DB_LINE="$current_db_line" awk '!/^POSTGRES_PASSWORD=/ {print} END {print ENVIRON["UMZUG_DB_LINE"]}' .env > "$work/target.env"
  mv "$work/target.env" .env
  if [[ -f CREDENTIALS.txt ]]; then
    old_password=${source_db_line#*=}; new_password=${current_db_line#*=}
    # The installer writes bare hex; preserve simple quoted manual configurations.
    for variable in old_password new_password; do
      value=${!variable}
      if [[ "$value" == \"*\" || "$value" == \'*\' ]]; then value=${value:1:${#value}-2}; fi
      printf -v "$variable" '%s' "$value"
    done
    if [[ -n "$old_password" ]]; then
      UMZUG_OLD_PASSWORD="$old_password" UMZUG_NEW_PASSWORD="$new_password" awk '
        {line=$0; result=""; old=ENVIRON["UMZUG_OLD_PASSWORD"]; while ((i=index(line,old))>0) {result=result substr(line,1,i-1) ENVIRON["UMZUG_NEW_PASSWORD"]; line=substr(line,i+length(old))} print result line}
      ' CREDENTIALS.txt > "$work/target-credentials"
      mv "$work/target-credentials" CREDENTIALS.txt
    fi
  fi
fi
# GPU availability is a property of the destination host, just like its local
# service-role password. Do not import an incompatible hardware requirement.
target_gpu=$(umzug_env_value "$recovery" OLLAMA_USE_GPU)
umzug_store_setting "$root" OLLAMA_USE_GPU "${target_gpu:-false}"
if [[ -n "$target_vault" ]]; then
  umzug_store_setting "$root" VAULT_ENC_KEY "$target_vault"
fi
# Database + files + configuration are now coherent. A later service-start error
# must not roll data back underneath partially restarted consumers.
committed=1
succeeded=1
