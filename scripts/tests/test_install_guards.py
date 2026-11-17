"""Local installer regression checks; service operations are simulated."""
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

PROJECT=Path(__file__).resolve().parents[2]
BASH=os.environ.get('BASH_BIN') or (r'C:\Program Files\Git\bin\bash.exe' if os.name=='nt' else shutil.which('bash'))
def function(filename,name):
    s=(PROJECT/'scripts'/filename).read_text(encoding='utf-8')
    start=s.index(name+'() {');end=s.index('\n}',start)+2
    return s[start:end]

@unittest.skipUnless(BASH and Path(BASH).exists(),'Bash required')
class InstallGuardTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory(prefix='home-install-',dir=os.environ.get('UMZUG_TEST_TEMP_ROOT'))
        self.root=Path(self.temp.name)
        shutil.copytree(PROJECT/'scripts/templates',self.root/'scripts/templates')
        self.helper=(PROJECT/'scripts/lib/runtime-context.sh').as_posix()
        (self.root/'.env').write_text('SITE_URL=http://old.test\nAPP_URL=http://old.test\nAPP_PORT=3000\nREACT_APP_SUPABASE_URL=http://api.test\nSMTP_ADMIN_EMAIL=test@example.test\n',encoding='utf-8')

    def tearDown(self):self.temp.cleanup()

    def run_bash(self,code,input_text='',**extra):
        env=os.environ.copy();env.update(extra)
        return subprocess.run([BASH,'-c','set -e\ncd "$1"\nsource "$2"\n'+code,'test',self.root.as_posix(),self.helper],input=input_text.encode(),capture_output=True,env=env,timeout=15)

    def test_bundled_files_match_manifest(self):
        folder=self.root/'scripts/templates/supabase'
        manifest=json.loads((folder/'SOURCES.json').read_text(encoding='utf-8'))
        for item in manifest['files']:
            self.assertEqual(hashlib.sha256((folder/item['path']).read_bytes()).hexdigest(),item['sha256'])

    def test_prepare_works_without_network_and_preserves_existing_kong(self):
        (self.root/'volumes/api').mkdir(parents=True)
        (self.root/'volumes/api/kong.yml').write_text('custom-kong')
        r=self.run_bash('curl() { exit 91; }; umzug_prepare_supabase_files "$PWD"')
        self.assertEqual(r.returncode,0,r.stderr)
        self.assertEqual((self.root/'volumes/api/kong.yml').read_text(),'custom-kong')
        self.assertTrue((self.root/'volumes/db/roles.sql').exists())

    def test_missing_versioned_template_stops_installation(self):
        (self.root/'scripts/templates/supabase/volumes/api/kong.yml').unlink()
        r=self.run_bash('curl() { exit 91; }; umzug_prepare_supabase_files "$PWD"')
        self.assertNotEqual(r.returncode,0)
        self.assertFalse((self.root/'volumes/api/kong.yml').exists())

    def test_fullstack_preparation_is_offline_complete_and_repeatable(self):
        env_before=(self.root/'.env').read_bytes()
        code='curl() { exit 91; }; docker() { exit 92; }; umzug_prepare_fullstack_files "$PWD"'
        for _ in range(2):
            result=self.run_bash(code)
            self.assertEqual(result.returncode,0,result.stderr)
        self.assertEqual((self.root/'.env').read_bytes(),env_before)
        self.assertEqual((self.root/'volumes/api/kong-entrypoint.sh').read_bytes(),
                         (self.root/'scripts/templates/kong-entrypoint.sh').read_bytes())
        self.assertTrue((self.root/'volumes/pooler/pooler.exs').is_file())
        self.assertTrue((self.root/'volumes/storage').is_dir())
        self.assertTrue((self.root/'volumes/functions').is_dir())
        result=self.run_bash('bash -n volumes/api/kong-entrypoint.sh')
        self.assertEqual(result.returncode,0,result.stderr)
        if os.name!='nt':
            self.assertEqual((self.root/'volumes/api/kong-entrypoint.sh').stat().st_mode & 0o777,0o755)

    def test_manual_preparation_preserves_custom_gateway_and_pooler(self):
        for name in ['api/kong-entrypoint.sh','api/kong.yml','pooler/pooler.exs']:
            target=self.root/'volumes'/name
            target.parent.mkdir(parents=True,exist_ok=True)
            target.write_text('custom '+name,encoding='utf-8')
        result=self.run_bash('umzug_prepare_fullstack_files "$PWD"')
        self.assertEqual(result.returncode,0,result.stderr)
        for name in ['api/kong-entrypoint.sh','api/kong.yml','pooler/pooler.exs']:
            self.assertEqual((self.root/'volumes'/name).read_text(),'custom '+name)

    def test_missing_gateway_template_prevents_successful_preparation(self):
        (self.root/'scripts/templates/kong-entrypoint.sh').unlink()
        result=self.run_bash('umzug_prepare_fullstack_files "$PWD"; echo should-not-continue')
        self.assertNotEqual(result.returncode,0)
        self.assertNotIn(b'should-not-continue',result.stdout)
        self.assertFalse((self.root/'volumes/api/kong-entrypoint.sh').exists())

    def test_documented_start_does_not_import_schema_after_failed_readiness(self):
        import re
        doc=(PROJECT/'INSTALL.md').read_text(encoding='utf-8')
        section=doc.split('### Schritt 5 — Bauen, starten und Schema einrichten',1)[1].split('## 4.',1)[0]
        code=re.search(r"bash <<'BASH'\n(.*?)\nBASH",section,re.S).group(1)
        # Run the documented ordering with simulated services; no real Docker.
        code=code.replace('source scripts/lib/runtime-context.sh','umzug_start_stack() { :; }; umzug_wait_fullstack_ready() { return 23; }; docker() { echo called >> docker.log; }')
        result=self.run_bash(code)
        self.assertEqual(result.returncode,23,result.stderr)
        self.assertFalse((self.root/'docker.log').exists())

    def readiness(self,storage='healthy',column='t',kong='0'):
        return self.run_bash(r'''
docker() {
 if [[ "$1" == inspect ]]; then echo "$TEST_STORAGE";
 elif [[ " $* " == *' psql '* ]]; then echo "$TEST_COLUMN";
 else return "$TEST_KONG"; fi
}
umzug_wait_fullstack_ready
''',UMZUG_READINESS_RETRIES='1',TEST_STORAGE=storage,TEST_COLUMN=column,TEST_KONG=kong)

    def test_readiness_requires_storage_health(self):self.assertNotEqual(self.readiness(storage='starting').returncode,0)
    def test_readiness_requires_migrated_bucket_column(self):self.assertNotEqual(self.readiness(column='f').returncode,0)
    def test_readiness_requires_kong(self):self.assertNotEqual(self.readiness(kong='1').returncode,0)
    def test_completed_stack_passes(self):self.assertEqual(self.readiness().returncode,0)

    def test_key_generator_adds_unique_internal_ocr_token(self):
        a=json.loads(subprocess.check_output(['node',str(PROJECT/'scripts/generate-keys.js')]))
        b=json.loads(subprocess.check_output(['node',str(PROJECT/'scripts/generate-keys.js')]))
        self.assertRegex(a['DOCUMENT_OCR_INTERNAL_TOKEN'],r'^[0-9a-f]{64}$')
        self.assertNotEqual(a['DOCUMENT_OCR_INTERNAL_TOKEN'],b['DOCUMENT_OCR_INTERNAL_TOKEN'])
        self.assertNotEqual(a['DOCUMENT_OCR_INTERNAL_TOKEN'],a['RECIPE_PARSER_INTERNAL_TOKEN'])

    def test_token_backfill_preserves_existing_values_in_both_languages(self):
        for script in ['manage.sh','manage_en.sh']:
            (self.root/'.env').write_text('DOCUMENT_OCR_INTERNAL_TOKEN=keep-ocr\nRECIPE_PARSER_INTERNAL_TOKEN=keep-recipe\nBASG_API_TOKEN=keep-basg\n',encoding='utf-8')
            code='\n'.join(function(script,n) for n in ['env_get','env_set','ensure_recipe_parser_env'])+'\nsuccess() { :; }; ensure_recipe_parser_env; ensure_recipe_parser_env'
            r=self.run_bash(code)
            self.assertEqual(r.returncode,0,r.stderr)
            text=(self.root/'.env').read_text()
            for key,value in [('DOCUMENT_OCR_INTERNAL_TOKEN','keep-ocr'),('RECIPE_PARSER_INTERNAL_TOKEN','keep-recipe'),('BASG_API_TOKEN','keep-basg')]:
                self.assertEqual(text.count(key+'='),1); self.assertIn(key+'='+value,text)

    def test_missing_ocr_token_is_added_once(self):
        code='\n'.join(function('manage.sh',n) for n in ['env_get','env_set','ensure_recipe_parser_env'])+'\nsuccess() { :; }; ensure_recipe_parser_env; ensure_recipe_parser_env'
        r=self.run_bash(code)
        self.assertEqual(r.returncode,0,r.stderr)
        text=(self.root/'.env').read_text()
        self.assertEqual(text.count('DOCUMENT_OCR_INTERNAL_TOKEN='),1)
        self.assertRegex(text,r'DOCUMENT_OCR_INTERNAL_TOKEN=[0-9a-f]{64}')
        self.assertIn('BASG_API_TOKEN=\n',text)

    def test_url_change_recreates_auth_in_both_languages(self):
        for script in ['manage.sh','manage_en.sh']:
            (self.root/'.env').write_text('SITE_URL=http://old.test\nAPP_URL=http://old.test\nAPP_PORT=3000\nREACT_APP_SUPABASE_URL=http://api.test\nSMTP_ADMIN_EMAIL=test@example.test\n',encoding='utf-8')
            code='\n'.join(function(script,n) for n in ['env_get','env_set','modus_config'])+r'''
for name in header warn success dim info weiter print_url_role_warnings; do eval "$name() { :; }"; done
env_prompt() { if [[ "$1" == SITE_URL || "$1" == APP_URL ]]; then echo http://new.test; else env_get "$1"; fi; }
mit_spinner() { shift; "$@"; }
docker() { printf '%s\n' "$*" >> docker.log; }
IS_VOLLSTACK=true
COMPOSE_FILE=docker-compose.full.yml
NC='' CYAN='' BOLD='' DIM=''
modus_config
'''
            r=self.run_bash(code,'1\ny\n')
            self.assertEqual(r.returncode,0,r.stderr.decode(errors='replace'))
            self.assertIn('up -d --force-recreate auth mail-templates',(self.root/'docker.log').read_text())
            (self.root/'docker.log').unlink()

if __name__=='__main__':unittest.main()
