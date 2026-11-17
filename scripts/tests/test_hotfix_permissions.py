"""Hotfix UI/error propagation and optional real PostgreSQL permission contract."""
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest
from test_runtime_context import BASH, PROJECT
from test_install_guards import function

@unittest.skipUnless(BASH and Path(BASH).exists(), "Bash required")
class HotfixMenuTests(unittest.TestCase):
    def execute(self, language, sql_status=0, full=True, missing=False):
        script="manage.sh" if language=="de" else "manage_en.sh"
        with tempfile.TemporaryDirectory(prefix="home28-") as temporary:
            root=Path(temporary);(root/"scripts").mkdir()
            if not missing:
                (root/"scripts/hotfix_2026_07_29_fast_mutations.sql").write_text("DO $$ BEGIN END $$;",encoding="utf-8")
            source=function(script,"apply_fast_mutation_hotfix")
            setup='set -e\ncd "$1"\nIS_VOLLSTACK="$TEST_FULL"\nwarn() { echo "WARN:$*"; }; info() { echo "INFO:$*"; }; success() { echo "SUCCESS:$*"; }\nrun_sql_in_db_container() { echo "SQL:$*"; return "$TEST_SQL_RC"; }\n'
            env=os.environ.copy();env.update(TEST_FULL=str(full).lower(),TEST_SQL_RC=str(sql_status))
            return subprocess.run([BASH,"-c",setup+source+"\napply_fast_mutation_hotfix","fixture",root.as_posix()],env=env,capture_output=True,timeout=15)

    def test_both_menus_do_not_claim_all_indexes_are_active(self):
        for language in ["de","en"]:
            result=self.execute(language)
            self.assertEqual(result.returncode,0,result.stderr)
            self.assertIn(b"INFO:",result.stdout)
            self.assertNotIn(b"SUCCESS:",result.stdout)
            self.assertIn(b"SQL:",result.stdout)

    def test_real_sql_failure_is_not_masked(self):
        for language in ["de","en"]:
            result=self.execute(language,sql_status=3)
            self.assertNotEqual(result.returncode,0)
            self.assertNotIn(b"INFO:",result.stdout)

    def test_missing_hotfix_remains_an_error(self):
        for language in ["de","en"]:
            self.assertNotEqual(self.execute(language,missing=True).returncode,0)

    def test_app_only_never_runs_database_hotfix(self):
        for language in ["de","en"]:
            result=self.execute(language,full=False,missing=True)
            self.assertEqual(result.returncode,0,result.stderr)
            self.assertNotIn(b"SQL:",result.stdout)

class PostgreSQLPermissionContract(unittest.TestCase):
    @unittest.skipUnless(os.environ.get("HOME28_TEST_DATABASE") and shutil.which("psql"),"Optional disposable Supabase PostgreSQL database required")
    def test_real_mixed_owners(self):
        database=os.environ["HOME28_TEST_DATABASE"]
        self.assertRegex(database,r"^home28_[a-z0-9_]+$")
        result=subprocess.run(["psql","-X","-v","ON_ERROR_STOP=1","-U","supabase_admin","-d",database,"-f",str(PROJECT/"scripts/tests/hotfix_permissions.sql")],capture_output=True,timeout=60)
        self.assertEqual(result.returncode,0,result.stderr.decode(errors="replace"))
        self.assertIn(b"HOME28_PERMISSION_CONTRACT_PASSED",result.stdout)
        self.assertIn(b"UMZUG_INDEX_PERMISSION_SKIPPED",result.stderr)
        self.assertIn(b"UMZUG_INDEX_CONFLICT",result.stderr)
