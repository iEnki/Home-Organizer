"""Orchestration regression tests. Docker is replaced; real DB acceptance is HOME-10."""
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import tarfile
import io
import unittest

PROJECT = Path(__file__).resolve().parents[2]
BASH = os.environ.get('BASH_BIN') or (r'C:\Program Files\Git\bin\bash.exe' if os.name == 'nt' else shutil.which('bash'))
MOCK = r"""#!/usr/bin/env bash
set -eu
printf '%s\n' "$*" >> "$MOCK_LOG"
if [[ "$1" == inspect ]]; then printf '%s\n' "${MOCK_OWNER:-$MOCK_ROOT}"; exit 0; fi
if [[ "$1" == cp ]]; then
  src="$2"; dst="$3"
  [[ "$src" != supabase-db:* ]] || src="$MOCK_CONTAINER${src#supabase-db:}"
  [[ "$dst" != supabase-db:* ]] || dst="$MOCK_CONTAINER${dst#supabase-db:}"
  cp "$src" "$dst"; exit $?
fi
if [[ "$1" == compose ]]; then
  shift
  while (( $# )); do
    case "$1" in -f|--profile) shift 2 ;; *) break ;; esac
  done
  case "$1" in
    ps) printf 'db\nauth\nstorage\n' ;;
    up) exit "${MOCK_START_EXIT:-0}" ;;
  esac
  exit 0
fi
[[ "$1" == exec && "$2" == supabase-db ]] || exit 90
shift 2
case "$1" in
 mktemp) mkdir -p "$MOCK_CONTAINER/tmp/umzug-backup.test"; echo /tmp/umzug-backup.test ;;
 pg_restore)
  if [[ " $* " == *' --list '* ]]; then
    [[ "${MOCK_INVALID_ARCHIVE:-0}" != 1 ]] || exit 42
    printf '1; 0 1 TABLE DATA auth users postgres\n2; 0 2 TABLE DATA auth identities postgres\n3; 0 3 TABLE DATA storage buckets postgres\n4; 0 4 TABLE DATA storage objects postgres\n5; 0 5 TABLE DATA public households postgres\n6; 0 6 TABLE DATA auth schema_migrations postgres\n7; 0 7 TABLE DATA storage migrations postgres\n'
  else
    [[ "${MOCK_PAYLOAD_FAILURE:-0}" != 1 ]] || exit 43
    for arg in "$@"; do
      if [[ "$arg" == --file=* ]]; then
        output="$MOCK_CONTAINER${arg#--file=}"
        printf 'COPY storage.objects (id) FROM stdin;\n' > "$output"
        [[ "${MOCK_BACKUP_OBJECTS:-0}" == 0 ]] || printf 'object-1\n' >> "$output"
        printf '\\.\n' >> "$output"
      fi
    done
  fi ;;
 pg_dump) printf 'CURRENT-DATABASE' > "$MOCK_CONTAINER/tmp/umzug-backup.test/current.dump" ;;
 psql)
  if [[ " $* " == *' --single-transaction '* ]]; then
    if [[ " $* " == *'/restore.sql'* ]]; then exit "${MOCK_IMPORT_EXIT:-0}"; fi
    if [[ " $* " == *'/recovery.sql'* ]]; then exit "${MOCK_RECOVERY_EXIT:-0}"; fi
  fi ;;
 rm) : ;;
 *) exit 91 ;;
esac
"""

@unittest.skipUnless(BASH and Path(BASH).exists(), 'Bash required')
class BackupRestoreTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='home-restore-', dir=os.environ.get('UMZUG_TEST_TEMP_ROOT'))
        self.root = Path(self.temp.name)
        (self.root/'scripts/lib').mkdir(parents=True)
        for name in ['backup-restore.sh', 'restore-clear.sql', 'storage_xattrs.py', 'runtime-context.sh']:
            shutil.copyfile(PROJECT/'scripts/lib'/name, self.root/'scripts/lib'/name)
        (self.root/'docker-compose.full.yml').write_text('services: {}\n')
        (self.root/'.env').write_text('CURRENT=keep\n')
        (self.root/'CREDENTIALS.txt').write_text('original-credentials\n')
        (self.root/'volumes/storage').mkdir(parents=True)
        (self.root/'volumes/storage/original.txt').write_text('original-file')
        self.backup=self.root/'backups/backup_test'
        self.backup.mkdir(parents=True)
        (self.backup/'db.dump').write_text('candidate-dump')
        (self.backup/'.env').write_text('CANDIDATE=restored\n')
        (self.backup/'credentials.txt').write_text('candidate-credentials\n')
        (self.root/'mockbin').mkdir()
        docker=self.root/'mockbin/docker'
        docker.write_text(MOCK,encoding='utf-8',newline='\n'); docker.chmod(0o755)
        (self.root/'container').mkdir()
        python_stub=self.root/'mockbin/python3'
        python_stub.write_text('#!/usr/bin/env bash\nprintf "python3 %s\\n" "$*" >> "$MOCK_LOG"\nif [[ "$2" == probe ]]; then exit "${MOCK_XATTR_PROBE_EXIT:-0}"; fi\nexit "${MOCK_XATTR_REPAIR_EXIT:-0}"\n',encoding='utf-8',newline='\n')
        python_stub.chmod(0o755)
        tar_stub=self.root/'mockbin/tar'
        tar_stub.write_text(r'''#!/usr/bin/env bash
printf 'tar %s\n' "$*" >> "$MOCK_LOG"
if [[ "$1" == --help ]]; then printf '%s\n' '--xattrs'; fi
args=()
for arg in "$@"; do
  if [[ "$OSTYPE" == msys* && ( "$arg" == --xattrs || "$arg" == --xattrs-include=* ) ]]; then continue; fi
  args+=("$arg")
done
exec "$REAL_TAR" "${args[@]}"
''',encoding='utf-8',newline='\n')
        tar_stub.chmod(0o755)

    def tearDown(self):
        self.temp.cleanup()

    def run_operation(self, operation='restore', **extra):
        env=os.environ.copy(); env.update(extra)
        env['TEST_ROOT']=self.root.as_posix()
        result=subprocess.run([BASH,'-c',r"""
cd "$TEST_ROOT" || exit 1
export MOCK_ROOT="$PWD" MOCK_CONTAINER="$PWD/container" MOCK_LOG="$PWD/docker.log"
export REAL_TAR="$(command -v tar)"
export PATH="$PWD/mockbin:$PATH"
exec bash scripts/lib/backup-restore.sh "$1" "$PWD" docker-compose.full.yml "$PWD/backups/backup_test"
""",'test',operation],env=env,capture_output=True,timeout=20)
        self.log=(self.root/'docker.log').read_text()
        return result

    def assert_original(self):
        self.assertEqual((self.root/'.env').read_text(),'CURRENT=keep\n')
        self.assertEqual((self.root/'CREDENTIALS.txt').read_text(),'original-credentials\n')
        self.assertEqual((self.root/'volumes/storage/original.txt').read_text(),'original-file')

    def test_invalid_archive_fails_before_stop_or_import(self):
        r=self.run_operation(MOCK_INVALID_ARCHIVE='1')
        self.assertNotEqual(r.returncode,0)
        self.assertNotIn(' stop ',self.log); self.assertNotIn('--single-transaction',self.log)
        self.assert_original()

    def test_damaged_compressed_payload_fails_before_stop(self):
        r=self.run_operation(MOCK_PAYLOAD_FAILURE='1')
        self.assertNotEqual(r.returncode,0); self.assertNotIn(' stop ',self.log)
        self.assert_original()

    def test_foreign_database_is_rejected(self):
        r=self.run_operation(MOCK_OWNER='/different/install')
        self.assertNotEqual(r.returncode,0); self.assertNotIn('pg_restore',self.log)
        self.assert_original()

    def test_missing_file_archive_with_objects_is_rejected(self):
        r=self.run_operation(MOCK_BACKUP_OBJECTS='1')
        self.assertNotEqual(r.returncode,0); self.assertNotIn(' stop ',self.log)
        self.assert_original()

    def test_invalid_storage_archive_is_rejected_before_stop(self):
        (self.backup/'storage.tar.gz').write_text('broken')
        r=self.run_operation()
        self.assertNotEqual(r.returncode,0); self.assertNotIn(' stop ',self.log)
        self.assert_original()

    def test_checksum_mismatch_is_rejected_before_archive_access(self):
        (self.backup/'SHA256SUMS').write_text('0'*64+'  db.dump\n')
        r=self.run_operation()
        self.assertNotEqual(r.returncode,0); self.assertNotIn('pg_restore',self.log)
        self.assert_original()

    def test_checksum_paths_outside_backup_are_rejected(self):
        (self.backup/'SHA256SUMS').write_text('0'*64+'  ../../.env\n')
        r=self.run_operation()
        self.assertNotEqual(r.returncode,0); self.assertNotIn('pg_restore',self.log)
        self.assert_original()

    def test_uncertain_import_failure_recovers_and_never_reports_success(self):
        r=self.run_operation(MOCK_IMPORT_EXIT='2')
        self.assertNotEqual(r.returncode,0); self.assertNotIn(b'OK restore',r.stdout)
        self.assertIn('-f /tmp/umzug-backup.test/recovery.sql',self.log)
        self.assertIn(' up -d auth storage',self.log)
        self.assert_original()

    def test_recovery_failure_keeps_services_stopped(self):
        r=self.run_operation(MOCK_IMPORT_EXIT='2',MOCK_RECOVERY_EXIT='3')
        self.assertNotEqual(r.returncode,0); self.assertNotIn(' up -d',self.log)
        self.assert_original()

    def test_legacy_empty_storage_restores_with_private_checkpoint(self):
        r=self.run_operation()
        self.assertEqual(r.returncode,0,r.stderr.decode(errors='replace'))
        self.assertIn('--set=ON_ERROR_STOP=1 --single-transaction',self.log)
        self.assertIn('CANDIDATE=restored\n',(self.root/'.env').read_text())
        self.assertFalse((self.root/'volumes/storage/original.txt').exists())
        checkpoints=list((self.root/'backups').glob('pre_restore_*'))
        self.assertEqual(len(checkpoints),1)
        self.assertTrue((checkpoints[0]/'SHA256SUMS').exists())
        selected=(self.root/'container/tmp/umzug-backup.test/selected.list').read_text()
        self.assertIn('auth identities',selected); self.assertIn('storage objects',selected)
        self.assertNotIn('schema_migrations',selected); self.assertNotIn('storage migrations',selected)

    def test_start_failure_returns_failure_after_coherent_restore(self):
        r=self.run_operation(MOCK_START_EXIT='1')
        self.assertNotEqual(r.returncode,0); self.assertNotIn(b'OK restore',r.stdout)
        self.assertIn('CANDIDATE=restored\n',(self.root/'.env').read_text())
        self.assertNotIn('-f /tmp/umzug-backup.test/recovery.sql',self.log)

    def test_backup_contains_manifest_and_storage(self):
        r=self.run_operation('backup')
        self.assertEqual(r.returncode,0,r.stderr.decode(errors='replace'))
        archives=[d for d in (self.root/'backups').glob('backup_*') if d!=self.backup]
        self.assertEqual(len(archives),1)
        self.assertTrue((archives[0]/'storage.tar.gz').exists())
        self.assertTrue((archives[0]/'SHA256SUMS').exists())
        self.assert_original()

    def test_valid_storage_replaces_stale_files(self):
        with tarfile.open(self.backup/'storage.tar.gz','w:gz') as archive:
            entry=tarfile.TarInfo('storage/new.txt'); payload=b'candidate-file';entry.size=len(payload)
            archive.addfile(entry,io.BytesIO(payload))
        r=self.run_operation(MOCK_BACKUP_OBJECTS='1')
        self.assertEqual(r.returncode,0,r.stderr.decode(errors='replace'))
        self.assertEqual((self.root/'volumes/storage/new.txt').read_text(),'candidate-file')
        self.assertFalse((self.root/'volumes/storage/original.txt').exists())

    def test_storage_path_traversal_is_rejected_before_stop(self):
        with tarfile.open(self.backup/'storage.tar.gz','w:gz') as archive:
            entry=tarfile.TarInfo('storage/../../outside.txt');entry.size=1
            archive.addfile(entry,io.BytesIO(b'x'))
        r=self.run_operation()
        self.assertNotEqual(r.returncode,0);self.assertNotIn(' stop ',self.log)
        self.assertFalse((self.root/'outside.txt').exists());self.assert_original()

    def test_new_target_keeps_its_database_role_password(self):
        (self.root/'.env').write_text('POSTGRES_PASSWORD=target-password\nCURRENT=keep\n')
        (self.backup/'.env').write_text('POSTGRES_PASSWORD=source-password\nJWT_SECRET=source-jwt\n')
        (self.backup/'credentials.txt').write_text('Database: source-password\nJWT: source-jwt\n')
        r=self.run_operation()
        self.assertEqual(r.returncode,0,r.stderr.decode(errors='replace'))
        self.assertIn('POSTGRES_PASSWORD=target-password',(self.root/'.env').read_text())
        self.assertIn('JWT_SECRET=source-jwt',(self.root/'.env').read_text())
        self.assertIn('Database: target-password',(self.root/'CREDENTIALS.txt').read_text())
        self.assertNotIn(b'target-password',r.stdout+r.stderr)

    def test_sql_rollback_does_not_repeat_table_import(self):
        r=self.run_operation(MOCK_IMPORT_EXIT='3',MOCK_RECOVERY_EXIT='3')
        self.assertNotEqual(r.returncode,0)
        self.assertNotIn('-f /tmp/umzug-backup.test/recovery.sql',self.log)
        self.assertIn('-f /tmp/umzug-backup.test/recovery-sequences.sql',self.log)
        self.assertIn(' up -d auth storage',self.log)
        self.assert_original()

    def test_import_uses_local_admin_role(self):
        r=self.run_operation()
        self.assertEqual(r.returncode,0,r.stderr)
        import_line=next(line for line in self.log.splitlines() if '--single-transaction' in line)
        self.assertIn('-U supabase_admin',import_line)

    def test_xattr_probe_failure_does_not_stop_services(self):
        r=self.run_operation(MOCK_XATTR_PROBE_EXIT='1')
        self.assertNotEqual(r.returncode,0);self.assertNotIn(' stop ',self.log)
        self.assert_original()

    def test_xattr_repair_failure_recovers_committed_database(self):
        r=self.run_operation(MOCK_XATTR_REPAIR_EXIT='1')
        self.assertNotEqual(r.returncode,0)
        self.assertIn('-f /tmp/umzug-backup.test/recovery.sql',self.log)
        self.assertIn(' up -d auth storage',self.log)
        self.assert_original()

    def test_success_removes_private_work_and_stage_only(self):
        (self.root/'unrelated').mkdir()
        r=self.run_operation()
        self.assertEqual(r.returncode,0,r.stderr)
        self.assertFalse(list(self.root.glob('.backup-work.*')))
        self.assertFalse(list((self.root/'volumes').glob('.restore-stage.*')))
        self.assertTrue((self.root/'unrelated').is_dir())
        self.assertTrue(list((self.root/'backups').glob('pre_restore_*')))
        self.assertIn("--xattrs --xattrs-include=user.*",self.log)

    def test_legacy_backup_keeps_destination_gpu_choice(self):
        (self.root/'.env').write_text('CURRENT=keep\nOLLAMA_USE_GPU=true\n')
        (self.root/'docker-compose.ollama-gpu.yml').write_text('services: {}\n')
        r=self.run_operation()
        self.assertEqual(r.returncode,0,r.stderr)
        self.assertIn('OLLAMA_USE_GPU=true',(self.root/'.env').read_text())
        self.assertIn('docker-compose.ollama-gpu.yml',self.log)

    def test_app_restore_keeps_destination_vault_key(self):
        (self.root/'.env').write_text('CURRENT=keep\nVAULT_ENC_KEY=destination-key\n')
        (self.backup/'.env').write_text('CANDIDATE=restored\nVAULT_ENC_KEY=backup-key\n')
        result=self.run_operation()
        self.assertEqual(result.returncode,0,result.stderr)
        restored=(self.root/'.env').read_text()
        self.assertIn('VAULT_ENC_KEY=destination-key\n',restored)
        self.assertNotIn('backup-key',restored)
        self.assertIn('CANDIDATE=restored',restored)
        self.assertNotIn(b'destination-key',result.stdout+result.stderr)
        self.assertNotIn(b'backup-key',result.stdout+result.stderr)

    def test_legacy_app_backup_keeps_destination_vault_key(self):
        (self.root/'.env').write_text('CURRENT=keep\nVAULT_ENC_KEY=destination-key\n')
        result=self.run_operation()
        self.assertEqual(result.returncode,0,result.stderr)
        self.assertIn('VAULT_ENC_KEY=destination-key',(self.root/'.env').read_text())

    def test_missing_destination_vault_key_fails_before_stopping_services(self):
        (self.backup/'.env').write_text('VAULT_ENC_KEY=backup-key\n')
        result=self.run_operation()
        self.assertNotEqual(result.returncode,0)
        self.assertNotIn(' stop ',self.log)
        self.assertNotIn('--single-transaction',self.log)
        self.assert_original()

    def test_failed_restore_preserves_original_vault_key(self):
        (self.root/'.env').write_text('CURRENT=keep\nVAULT_ENC_KEY=destination-key\n')
        (self.backup/'.env').write_text('VAULT_ENC_KEY=backup-key\n')
        result=self.run_operation(MOCK_XATTR_REPAIR_EXIT='1')
        self.assertNotEqual(result.returncode,0)
        self.assertEqual((self.root/'.env').read_text(),'CURRENT=keep\nVAULT_ENC_KEY=destination-key\n')

if __name__=='__main__': unittest.main()
