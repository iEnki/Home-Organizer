"""Read-only Studio diagnostics: real HTTP probe and DE/EN display contracts."""
import os
import re
import shutil
import socket
import subprocess
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from test_runtime_context import BASH, PROJECT
from test_install_guards import function

NODE = shutil.which("node")


class StudioHttpProbeTests(unittest.TestCase):
    @unittest.skipUnless(NODE, "Node required")
    def test_real_probe_returns_status_without_following_redirects(self):
        helper = function("lib/runtime-context.sh", "umzug_studio_http_status")
        code = re.search(r"node -e '([^']+)'", helper).group(1)
        class Handler(BaseHTTPRequestHandler):
            status = 200
            def do_GET(self):
                self.send_response(self.status)
                self.send_header("Location", "http://127.0.0.1:1/do-not-follow")
                self.end_headers()
            def log_message(self, *_): pass
        with ThreadingHTTPServer(("127.0.0.1", 0), Handler) as http:
            thread = threading.Thread(target=http.serve_forever, daemon=True)
            thread.start()
            try:
                local = code.replace("http://studio:3000", "http://127.0.0.1:" + str(http.server_port))
                for status in [200, 307, 308, 500]:
                    Handler.status = status
                    result = subprocess.run([NODE, "-e", local], capture_output=True, timeout=10)
                    self.assertEqual(result.returncode, 0, result.stderr)
                    self.assertEqual(result.stdout, str(status).encode())
            finally:
                http.shutdown()
                thread.join(timeout=3)
        with socket.socket() as unused:
            unused.bind(("127.0.0.1", 0))
            port = unused.getsockname()[1]
        local = code.replace("http://studio:3000", "http://127.0.0.1:" + str(port))
        result = subprocess.run([NODE, "-e", local], capture_output=True, timeout=10)
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(result.stdout, b"")

    @unittest.skipUnless(BASH and os.path.exists(BASH), "Bash required")
    def test_both_menus_report_internal_status_without_kong_http_tools(self):
        for language in ["manage.sh", "manage_en.sh"]:
            for status in ["200", "307", "308", "500", "unavailable"]:
                with self.subTest(language=language, status=status):
                    setup = '''
source "$1"
IS_VOLLSTACK=true
header() { :; }
warn() { echo "WARN:$*"; }
env_get() { :; }
docker() {
  if [[ "$1" == ps ]]; then printf '%s\\n' supabase-kong supabase-studio supabase-meta supabase-db supabase-edge-functions; return 0; fi
  [[ "$1 $2 $3 $4" == 'exec supabase-studio node -e' ]] || return 91
  [[ "$TEST_STATUS" != unavailable ]] || return 1
  printf '%s' "$TEST_STATUS"
}
'''
                    runner = setup + function(language, "check_supabase_studio_access") + "\ncheck_supabase_studio_access\n"
                    result = subprocess.run([BASH, "-c", runner, "test", (PROJECT / "scripts/lib/runtime-context.sh").as_posix()], capture_output=True, env={**os.environ, "TEST_STATUS": status}, timeout=10)
                    self.assertEqual(result.returncode, 0, result.stderr)
                    output = result.stdout.decode()
                    self.assertNotIn("no-http-client", output)
                    if status in ["200", "307", "308"]:
                        self.assertRegex(output, r"OK Studio .*\(HTTP " + status + r"\)")
                    else:
                        self.assertNotIn("OK Studio", output)
                        self.assertIn("WARN:", output)


if __name__ == "__main__":
    unittest.main()
