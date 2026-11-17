"""HOME-14 redirect, GPU, health and explicit backup cleanup regressions."""
import importlib.util
import os
from pathlib import Path
import subprocess
import tempfile
import time
import unittest
from test_runtime_context import BASH, PROJECT
from test_install_guards import function

spec=importlib.util.spec_from_file_location('backup_maintenance',PROJECT/'scripts/lib/backup_maintenance.py')
maintenance=importlib.util.module_from_spec(spec);spec.loader.exec_module(maintenance)

@unittest.skipUnless(BASH and Path(BASH).exists(),'Bash required')
class Home14Guards(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory(prefix='home14-');self.root=Path(self.temp.name)
        (self.root/'.env').write_text('SITE_URL=https://app.test\n',encoding='utf-8')
        (self.root/'docker-compose.ollama-gpu.yml').write_text('services: {}\n')
    def tearDown(self):self.temp.cleanup()
    def run_bash(self,code,**extra):
        env=os.environ.copy();env.update(extra)
        return subprocess.run([BASH,'-c','set -eu\ncd "$1"\nsource "$2"\n'+code,'test',self.root.as_posix(),(PROJECT/'scripts/lib/runtime-context.sh').as_posix()],capture_output=True,env=env,timeout=10)
    def test_redirect_adds_exact_reset_and_preserves_custom_targets(self):
        r=self.run_bash('umzug_redirect_allowlist "https://preview.test/**,https://app.test" "https://app.test/"')
        self.assertEqual(r.returncode,0,r.stderr)
        self.assertEqual(r.stdout.decode(),'https://preview.test/**,https://app.test,https://app.test/update-password')
    def test_redirect_change_replaces_old_app_targets_only(self):
        r=self.run_bash('umzug_redirect_allowlist "https://old.test,https://old.test/update-password,https://custom.test/callback" "https://new.test" "https://old.test"')
        self.assertEqual(r.returncode,0,r.stderr)
        self.assertEqual(r.stdout.decode(),'https://custom.test/callback,https://new.test,https://new.test/update-password')
    def test_redirect_is_idempotent(self):
        r=self.run_bash('value=$(umzug_redirect_allowlist "" "https://app.test"); umzug_redirect_allowlist "$value" "https://app.test"')
        self.assertEqual(r.stdout.decode(),'https://app.test,https://app.test/update-password')
    def test_existing_installation_redirect_backfill_is_idempotent(self):
        (self.root/'.env').write_text('SITE_URL=https://app.test\nADDITIONAL_REDIRECT_URLS=https://custom.test/callback\n')
        code='\n'.join(function('manage.sh',name) for name in ['env_get','env_set'])+'\numzug_ensure_auth_redirects; [[ "$AUTH_REDIRECTS_CHANGED" == true ]]; umzug_ensure_auth_redirects; [[ "$AUTH_REDIRECTS_CHANGED" == false ]]; env_get ADDITIONAL_REDIRECT_URLS'
        r=self.run_bash(code)
        self.assertEqual(r.returncode,0,r.stderr)
        self.assertIn('https://custom.test/callback,https://app.test,https://app.test/update-password',r.stdout.decode())

    def compose(self,mode='',detected='0'):
        (self.root/'.env').write_text('CUSTOM=keep\n'+('OLLAMA_USE_GPU='+mode+'\n' if mode else ''))
        return self.run_bash(r'''
docker() { if [[ "$1" == inspect ]]; then echo "$TEST_GPU_REQUESTS"; else printf '%s\n' "$*"; fi; }
umzug_compose -f docker-compose.full.yml --profile ollama up -d
''',TEST_GPU_REQUESTS=detected)
    def test_cpu_default_requires_no_gpu_override(self):
        r=self.compose();self.assertEqual(r.returncode,0,r.stderr)
        self.assertNotIn('ollama-gpu',r.stdout.decode())
    def test_explicit_gpu_loads_override(self):
        r=self.compose('true');self.assertEqual(r.returncode,0,r.stderr)
        self.assertIn('docker-compose.ollama-gpu.yml',r.stdout.decode())
    def test_running_legacy_gpu_is_preserved_and_remembered(self):
        r=self.compose(detected='1');self.assertEqual(r.returncode,0,r.stderr)
        self.assertIn('docker-compose.ollama-gpu.yml',r.stdout.decode())
        self.assertIn('OLLAMA_USE_GPU=true',(self.root/'.env').read_text())
        self.assertIn('CUSTOM=keep',(self.root/'.env').read_text())
    def test_explicit_cpu_overrides_previous_gpu(self):
        r=self.compose('false','1');self.assertEqual(r.returncode,0,r.stderr)
        self.assertNotIn('ollama-gpu',r.stdout.decode())
    def test_invalid_gpu_flag_fails(self):self.assertNotEqual(self.compose('garbage').returncode,0)
    def test_compose_version_remains_usable_without_arguments(self):
        r=self.run_bash('docker() { printf "%s" "$*"; }; umzug_compose version')
        self.assertEqual(r.returncode,0,r.stderr);self.assertEqual(r.stdout.decode(),'compose version')
    def test_failed_ollama_health_is_an_error(self):
        r=self.run_bash('docker() { return 1; }; umzug_wait_ollama_ready',UMZUG_READINESS_RETRIES='1')
        self.assertNotEqual(r.returncode,0)
    def test_ollama_health_calls_api_via_cli(self):
        r=self.run_bash('docker() { [[ "$*" == "exec ollama ollama list" ]]; }; umzug_wait_ollama_ready',UMZUG_READINESS_RETRIES='1')
        self.assertEqual(r.returncode,0,r.stderr)

class BackupMaintenanceTests(unittest.TestCase):
    def setUp(self):self.temp=tempfile.TemporaryDirectory(prefix='home14-clean-');self.root=Path(self.temp.name)
    def tearDown(self):self.temp.cleanup()
    def directory(self,name,age=30):
        p=self.root/name;p.mkdir(parents=True);(p/'data').write_text('keep')
        old=time.time()-age*86400
        os.utime(p/'data',(old,old));os.utime(p,(old,old));return p
    def test_keep_normal_backups_and_newest_three_recovery_points(self):
        normal=self.directory('backups/backup_20200101_000000')
        points=[self.directory(f'backups/pre_restore_2020010{i}_000000',age=40-i) for i in range(1,6)]
        planned=maintenance.candidates(self.root)
        self.assertEqual(set(planned),set(points[:2]));self.assertNotIn(normal,planned)
    def test_recent_work_is_not_removed(self):
        p=self.directory('.backup-work.RECENT',age=1)
        self.assertNotIn(p,maintenance.candidates(self.root))
    def test_old_work_is_offered_but_staging_is_excluded(self):
        p=self.directory('.backup-work.OLD123');stage=self.directory('volumes/.restore-stage.OLD123')
        self.assertIn(p,maintenance.candidates(self.root));self.assertNotIn(stage,maintenance.candidates(self.root))
    def test_revalidate_before_deleting_one_selected_path(self):
        p=self.directory('.backup-work.OLD123');other=self.directory('unrelated')
        maintenance.remove_candidate(self.root,p)
        self.assertFalse(p.exists());self.assertTrue(other.exists())
    def test_outside_path_is_refused(self):
        with tempfile.TemporaryDirectory(prefix='home14-outside-') as other:
            with self.assertRaises(ValueError):maintenance.remove_candidate(self.root,Path(other))
            self.assertTrue(Path(other).exists())

if __name__=='__main__':unittest.main()
