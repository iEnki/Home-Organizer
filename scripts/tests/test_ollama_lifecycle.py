"""Optional Ollama startup must not cancel the core stack."""
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from test_runtime_context import BASH, PROJECT

@unittest.skipUnless(BASH and Path(BASH).exists(),'Bash required')
class OllamaLifecycleTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory(prefix='ollama-lifecycle-');self.root=Path(self.temp.name)
        (self.root/'.env').write_text('OLLAMA_USE_GPU=false\n',encoding='utf-8')
    def tearDown(self):self.temp.cleanup()
    def run_bash(self,code):
        return subprocess.run([BASH,'-c','set -eu\ncd "$1"\nsource "$2"\n'+code,'test',self.root.as_posix(),(PROJECT/'scripts/lib/runtime-context.sh').as_posix()],capture_output=True,timeout=10)
    def test_optional_failure_occurs_after_core_start_and_retry_keeps_choice(self):
        r=self.run_bash(r'''
umzug_store_setting "$PWD" OLLAMA_INSTALLED true
fail=true
umzug_compose() {
  if [[ "$*" == *"config --services"* ]]; then printf 'db\nauth\napp\nkong\nollama\n'; return; fi
  printf '%s\n' "$*" >> calls
  if [[ "${!#}" == ollama ]]; then
    [[ -f core-up ]] || return 77
    [[ "$*" == *--no-deps* ]] || return 78
    [[ "$fail" == false ]] || return 1
  else touch core-up; fi
}
umzug_wait_ollama_ready() { touch healthy; }
if umzug_start_stack docker-compose.full.yml true --force-recreate; then exit 80; fi
[[ -f core-up && ! -f healthy ]]
umzug_ollama_requested "$PWD"
fail=false
umzug_start_stack docker-compose.full.yml true --force-recreate
[[ -f healthy ]]
''')
        self.assertEqual(r.returncode,0,r.stderr)
        calls=(self.root/'calls').read_text().splitlines()
        self.assertEqual(len(calls),6)
        self.assertNotIn('ollama',calls[0]);self.assertTrue(calls[1].endswith('--no-deps --force-recreate kong'));self.assertTrue(calls[2].endswith('ollama'))
    def test_failed_core_does_not_start_ollama(self):
        r=self.run_bash('umzug_compose() { if [[ "$*" == *"config --services"* ]]; then echo app; else return 1; fi; }; umzug_wait_ollama_ready() { touch unexpected; }; umzug_start_stack docker-compose.full.yml true')
        self.assertNotEqual(r.returncode,0);self.assertFalse((self.root/'unexpected').exists())
    def test_stopped_legacy_compose_container_is_adopted_and_remembered(self):
        r=self.run_bash('docker() { printf "ollama|%s" "$PWD"; }; umzug_ollama_requested "$PWD"; docker() { return 1; }; umzug_ollama_requested "$PWD"')
        self.assertEqual(r.returncode,0,r.stderr)
        self.assertIn('OLLAMA_INSTALLED=true',(self.root/'.env').read_text())
    def test_foreign_container_is_not_adopted(self):
        r=self.run_bash('docker() { echo "ollama|/another/project"; }; umzug_ollama_requested "$PWD"')
        self.assertEqual(r.returncode,1)
    def test_explicit_false_is_preserved(self):
        r=self.run_bash('umzug_store_setting "$PWD" OLLAMA_INSTALLED false; docker() { printf "ollama|%s" "$PWD"; }; umzug_ollama_requested "$PWD"')
        self.assertEqual(r.returncode,1)
    def test_invalid_installation_flag_fails(self):
        r=self.run_bash('umzug_store_setting "$PWD" OLLAMA_INSTALLED invalid; umzug_ollama_requested "$PWD"')
        self.assertEqual(r.returncode,2)
    def test_printed_compose_command_preserves_gpu_and_network(self):
        r=self.run_bash('umzug_store_setting "$PWD" OLLAMA_USE_GPU true; umzug_print_ollama_start "$PWD"')
        self.assertEqual(r.returncode,0,r.stderr)
        self.assertIn('-f docker-compose.ollama-gpu.yml --profile ollama up -d --no-deps ollama',r.stdout.decode())

    def test_docker_menu_offers_managed_service_without_running_container(self):
        from test_install_guards import function
        for name in ['manage.sh','manage_en.sh']:
            with self.subTest(script=name):
                code=function(name,'modus_ollama')+r"""
PROJECT_DIR="$PWD"
IS_VOLLSTACK=true
header() { :; }; info() { :; }; warn() { :; }; success() { :; }; weiter() { :; }; clear() { :; }
docker() { return 91; }
modus_ollama <<'ANSWERS'
2

y
ANSWERS
"""
                r=self.run_bash(code)
                self.assertEqual(r.returncode,0,r.stderr)
                self.assertIn('docker compose -f docker-compose.full.yml --profile ollama up -d --no-deps ollama',r.stdout.decode())
                settings=(self.root/'.env').read_text()
                self.assertIn('OLLAMA_INSTALLED=true',settings)
                self.assertIn('OLLAMA_EXTERNAL_URL=http://ollama:11434',settings)

    def test_installer_ollama_menu_resolves_existing_fullstack(self):
        import shutil
        scripts=self.root/'scripts';(scripts/'lib').mkdir(parents=True)
        for relative in ['install.sh','lib/runtime-context.sh']:
            shutil.copyfile(PROJECT/'scripts'/relative,scripts/relative)
        (self.root/'.env').write_text('UMZUG_INSTALL_MODE=vollstack\nOLLAMA_USE_GPU=false\n')
        (self.root/'docker-compose.full.yml').write_text('services: {}\n')
        r=subprocess.run([BASH,str(scripts/'install.sh')],input=b'4\n2\n\ny\n',capture_output=True,env={**os.environ,'TERM':'xterm'},timeout=10)
        self.assertEqual(r.returncode,0,r.stderr)
        self.assertIn('docker compose -f docker-compose.full.yml --profile ollama up -d --no-deps ollama',r.stdout.decode())
        self.assertIn('OLLAMA_EXTERNAL_URL=http://ollama:11434',(self.root/'.env').read_text())

class CleanupLanguageTests(unittest.TestCase):
    def test_cli_uses_requested_language_and_preserves_directories(self):
        with tempfile.TemporaryDirectory() as root:
            for language,expected in [('de','Reguläre Backups'),('en','Normal backups')]:
                r=subprocess.run([sys.executable,str(PROJECT/'scripts/lib/backup_maintenance.py'),root,'--language',language],capture_output=True,env={**os.environ,'PYTHONIOENCODING':'utf-8'})
                self.assertEqual(r.returncode,0,r.stderr)
                self.assertIn(expected,r.stdout.decode())
