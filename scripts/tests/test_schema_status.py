"""Schema import status: psql exit codes map to success or failure, never "with warnings"."""
from pathlib import Path
import re
import subprocess
import unittest
from test_runtime_context import BASH, PROJECT

CALL = 'run_sql_with_fallback "database_setup_complete.sql" || SQL_RC=$?'


def status_block(script):
    text = (PROJECT / "scripts" / script).read_text(encoding="utf-8")
    call = text.index(CALL)
    start = text.rindex("\n", 0, text.rindex("SQL_RC=0", 0, call)) + 1
    branch = text.index("if [[ $SQL_RC -eq 0 ]]; then", call)
    indent = text[text.rindex("\n", 0, branch) + 1:branch]
    end = text.index("\n" + indent + "fi\n", branch) + len(indent) + 4
    return text[start:end].replace("local SQL_RC=0", "SQL_RC=0")


@unittest.skipUnless(BASH and Path(BASH).exists(), "Bash required")
class SchemaStatusTests(unittest.TestCase):
    def run_block(self, script, psql_code):
        setup = (
            'warn() { echo "WARN:$*"; }; success() { echo "SUCCESS:$*"; }\n'
            'run_sql_with_fallback() { return "$1_CODE"; }\n'
        ).replace('"$1_CODE"', str(psql_code))
        result = subprocess.run(
            [BASH, "-c", "set -e\n" + setup + status_block(script) + '\necho "STATUS:$DB_SCHEMA_STATUS"'],
            capture_output=True, text=True, timeout=15,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        return result.stdout

    def test_success_and_every_psql_failure_code(self):
        for script in ("install.sh", "manage.sh", "manage_en.sh"):
            with self.subTest(script=script):
                out = self.run_block(script, 0)
                self.assertIn("STATUS:angewendet\n", out)
                self.assertIn("SUCCESS:", out)
                for code in (1, 2, 3):
                    out = self.run_block(script, code)
                    self.assertIn(f"STATUS:fehler (psql-Code {code})\n", out)
                    self.assertIn(f"psql-Code {code}", out.split("WARN:", 1)[1])
                    self.assertNotIn("SUCCESS:", out)

    def test_no_script_reports_warnings_status(self):
        for script in ("install.sh", "manage.sh", "manage_en.sh"):
            text = (PROJECT / "scripts" / script).read_text(encoding="utf-8")
            self.assertNotIn('DB_SCHEMA_STATUS="angewendet (mit Warnungen)"', text)
            self.assertIsNone(re.search(r"SQL_RC -eq 2", text))
            self.assertIn('run_sql_in_db_container "$1" 1', text)


if __name__ == "__main__":
    unittest.main()
