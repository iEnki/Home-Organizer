"""Real DE/EN menu control flow; Docker is simulated, no real services are touched."""
import os
import json
import re
import socket
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import subprocess
import tempfile
import unittest
from test_runtime_context import BASH, PROJECT
from test_install_guards import function


def service_healthcheck(service):
    compose = Path(os.environ.get("UMZUG_TEST_HEALTH_COMPOSE", PROJECT / "docker-compose.full.yml")).read_text(encoding="utf-8")
    block = re.search(r"^  " + re.escape(service) + r":\n(.*?)(?=^  [a-zA-Z_][^\n]*:|\Z)", compose, re.M | re.S)
    if not block:
        return None
    command = re.search(r"^      test: (\[.*\])$", block.group(1), re.M)
    if "    healthcheck:" not in block.group(1) or not command:
        return None
    return {"command": json.loads(command.group(1)), "block": block.group(1)}


@unittest.skipUnless(BASH and Path(BASH).exists(), "Bash required")
class ServiceUpdateTests(unittest.TestCase):
    def run_menu(self, language="de", choice=1, full=True, confirm="y", **extra):
        with tempfile.TemporaryDirectory(prefix="home24-") as temporary:
            root = Path(temporary)
            (root / ".env").write_text("GENERATED=preserve\n", encoding="utf-8")
            script = "manage.sh" if language == "de" else "manage_en.sh"
            source = function(script, "modus_update")
            setup = r'''
set -e
cd "$1"
source "$2"
IS_VOLLSTACK="$TEST_FULL"
COMPOSE_FILE=docker-compose.full.yml
[[ "$IS_VOLLSTACK" == true ]] || COMPOSE_FILE=docker-compose.yml
HAS_OLLAMA=false
GREEN= BOLD= NC= CYAN= DIM=
clear() { :; }
weiter() { :; }
header() { :; }
info() { :; }
warn() { echo "WARN:$*"; }
dim() { :; }
success() { echo "SUCCESS:$*"; }
env_get() { echo https://app.example.test; }
mit_spinner() { shift; "$@"; }
apply_fast_mutation_hotfix() { echo HOTFIX >> calls; }
deploy_edge_functions_to_volumes() { echo DEPLOY >> calls; DEPLOYED=1; }
ensure_fullstack_update_prereqs() { echo PREREQ >> calls; }
maybe_reload_kong_for_git_range() { :; }
reload_kong_if_needed() { :; }
restart_edge_functions() { echo FUNCTIONS >> calls; }
check_supabase_studio_access() { :; }
verify_edge_functions_running() { :; }
umzug_compose() {
  printf '%s\n' "$*" >> calls
  if [[ " $* " == *" config --services "* ]]; then
    [[ "${TEST_CONFIG_FAIL:-}" == 1 ]] && return 41
    if [[ "$TEST_FULL" != true ]]; then echo umzugsplaner-app; return 0; fi
    printf '%s\n' "${TEST_SERVICES:-umzugsplaner-app
recipe-source-parser
document-ocr-service
analytics
functions
kong
ollama}"
  fi
  if [[ " $* " == *" build "* && -n "${TEST_BUILD_FAIL:-}" && " $* " == *" $TEST_BUILD_FAIL "* ]]; then return 42; fi
  if [[ " $* " == *" pull "* && "${TEST_PULL_FAIL:-}" == 1 ]]; then return 43; fi
  if [[ " $* " == *" --wait "* && "${TEST_HEALTH_FAIL:-}" == 1 ]]; then return 44; fi
  if [[ " $* " == *" --wait "* && " $* " == *" analytics "* && "${TEST_CORE_HEALTH_FAIL:-}" == 1 ]]; then return 45; fi
  # Match Compose: without a healthcheck, a newly running crash-loop can pass.
  if [[ " $* " == *" --wait "* && -n "${TEST_CRASH_SERVICE:-}" && "${TEST_CRASH_HAS_HEALTHCHECK:-}" == true ]]; then
    echo "Container $TEST_CRASH_SERVICE exited with code 3" >&2
    return 3
  fi
  return 0
}
'''
            env = {**os.environ, "TEST_FULL": "true" if full else "false", **extra}
            if extra.get("TEST_CRASH_SERVICE"):
                env["TEST_CRASH_HAS_HEALTHCHECK"] = "true" if service_healthcheck(extra["TEST_CRASH_SERVICE"]) else "false"
            # No Git directory, so no pull confirmation occurs in these isolated menus.
            runner = root / "runner.sh"
            runner.write_text(setup + "\n" + source + "\nmodus_update\n", encoding="utf-8", newline="\n")
            result = subprocess.run([BASH, runner.as_posix(), root.as_posix(),
                                     (PROJECT / "scripts/lib/runtime-context.sh").as_posix()],
                                    input=(str(choice) + "\n" + confirm + "\n0\n").encode(),
                                    capture_output=True, env=env, timeout=15)
            self.assertNotIn(b"syntax error", result.stderr, result.stderr.decode(errors="replace"))
            calls = (root / "calls").read_text(encoding="utf-8").splitlines() if (root / "calls").exists() else []
            self.assertEqual((root / ".env").read_text(encoding="utf-8"), "GENERATED=preserve\n")
            self.assertFalse(any(" down" in c or " stop" in c or " rm " in c for c in calls))
            return result, calls

    def variants(self):
        return [(language, choice) for language in ["de", "en"] for choice in [1, 4, 5]]

    def test_all_updates_build_existing_local_images_before_any_restart(self):
        for language, choice in self.variants():
            with self.subTest(language=language, choice=choice):
                result, calls = self.run_menu(language, choice)
                self.assertEqual(result.returncode, 0, result.stderr.decode())
                builds = [c for c in calls if " build " in c]
                self.assertEqual(builds, ["-f docker-compose.full.yml build umzugsplaner-app recipe-source-parser document-ocr-service"])
                build = calls.index(builds[0])
                for index, call in enumerate(calls):
                    if " up " in call or call in ["PREREQ", "HOTFIX", "DEPLOY"]:
                        self.assertLess(build, index, calls)
                waits = [c for c in calls if " --wait " in c and " --no-deps " in c and "document-ocr-service" in c]
                self.assertEqual(len(waits), 1, calls)
                self.assertIn("--no-build --no-deps --wait --wait-timeout 180 recipe-source-parser document-ocr-service", waits[0])
                self.assertFalse(any("--no-cache" in c for c in builds))

    def test_each_image_build_failure_preserves_running_stack(self):
        for language, choice in self.variants():
            for service in ["umzugsplaner-app", "recipe-source-parser", "document-ocr-service"]:
                with self.subTest(language=language, choice=choice, service=service):
                    result, calls = self.run_menu(language, choice, TEST_BUILD_FAIL=service)
                    self.assertNotEqual(result.returncode, 0)
                    self.assertFalse(any(" up " in c or c in ["PREREQ", "HOTFIX", "DEPLOY", "FUNCTIONS"] for c in calls), calls)

    def test_pull_failure_prevents_build_and_preparation(self):
        for language in ["de", "en"]:
            result, calls = self.run_menu(language, 4, TEST_PULL_FAIL="1")
            self.assertNotEqual(result.returncode, 0)
            self.assertFalse(any(" build " in c or " up " in c or c == "PREREQ" for c in calls), calls)

    def test_health_failure_is_not_reported_as_completed(self):
        completions = ["Update abgeschlossen.", "Update complete.", "Docker-Images aktualisiert", "Docker images updated", "Server-Sync komplett abgeschlossen.", "Server sync complete."]
        for language, choice in self.variants():
            with self.subTest(language=language, choice=choice):
                result, _calls = self.run_menu(language, choice, TEST_HEALTH_FAIL="1")
                self.assertNotEqual(result.returncode, 0)
                output = result.stdout.decode()
                self.assertFalse(any("SUCCESS:" + text in output for text in completions), output)

    def test_app_only_builds_no_backend_images(self):
        for language in ["de", "en"]:
            for choice in [1, 4]:
                result, calls = self.run_menu(language, choice, full=False)
                self.assertEqual(result.returncode, 0, result.stderr.decode())
                self.assertIn("-f docker-compose.yml build umzugsplaner-app", calls)
                self.assertFalse(any("document-ocr-service" in c or "recipe-source-parser" in c for c in calls), calls)
            result, calls = self.run_menu(language, 5, full=False)
            self.assertNotEqual(result.returncode, 0)
            self.assertEqual(calls, [])

    def test_cancel_has_no_build_or_preparation_side_effect(self):
        for language, choice in self.variants():
            result, calls = self.run_menu(language, choice, confirm="n")
            self.assertEqual(result.returncode, 0, result.stderr.decode())
            self.assertEqual(calls, [])

    def test_invalid_compose_configuration_stops_before_build(self):
        for language, choice in self.variants():
            result, calls = self.run_menu(language, choice, TEST_CONFIG_FAIL="1")
            self.assertNotEqual(result.returncode, 0)
            self.assertFalse(any(" build " in c or " up " in c or c == "PREREQ" for c in calls))

    def test_legacy_compose_without_optional_services_is_supported(self):
        for language, choice in self.variants():
            result, calls = self.run_menu(language, choice, TEST_SERVICES="umzugsplaner-app\nfunctions\nkong")
            self.assertEqual(result.returncode, 0, result.stderr.decode())
            self.assertIn("-f docker-compose.full.yml build umzugsplaner-app", calls)
            self.assertFalse(any("recipe-source-parser" in c or "document-ocr-service" in c for c in calls), calls)

    def test_image_update_does_not_force_recreate_unchanged_stack(self):
        for language in ["de", "en"]:
            result, calls = self.run_menu(language, 4)
            self.assertEqual(result.returncode, 0, result.stderr.decode())
            core = next(c for c in calls if " up -d " in c and " analytics " in c)
            self.assertNotIn("--force-recreate", core)
            self.assertIn("--no-build", core)


    def test_image_update_does_not_complete_with_failed_core_readiness(self):
        for language in ["de", "en"]:
            result, calls = self.run_menu(language, 4, TEST_CORE_HEALTH_FAIL="1")
            self.assertNotEqual(result.returncode, 0)
            self.assertTrue(any(" --wait --wait-timeout 300 " in c and " analytics " in c for c in calls))
            self.assertNotIn("SUCCESS:Docker images updated", result.stdout.decode())
            self.assertNotIn("SUCCESS:Docker-Images aktualisiert", result.stdout.decode())

    def test_image_update_waits_for_recreated_gateway(self):
        for language in ["de", "en"]:
            result, calls = self.run_menu(language, 4)
            self.assertEqual(result.returncode, 0, result.stderr.decode())
            gateway = [call for call in calls if call.endswith(" kong") and " --force-recreate " in call]
            self.assertEqual(len(gateway), 1)
            self.assertIn("--wait --wait-timeout 300", gateway[0])

    def test_healthchecks_probe_real_http_readiness(self):
        class Handler(BaseHTTPRequestHandler):
            payload = b'{"status":"ok"}'
            status = 200
            def do_GET(self):
                self.send_response(self.status)
                self.end_headers()
                self.wfile.write(self.payload)
            def log_message(self, *_args):
                pass
        with ThreadingHTTPServer(("127.0.0.1", 0), Handler) as http:
            thread = threading.Thread(target=http.serve_forever, daemon=True)
            thread.start()
            try:
                for service, port in [("recipe-source-parser", 8090), ("document-ocr-service", 8091)]:
                    spec = service_healthcheck(service)
                    self.assertIsNotNone(spec, service + " has no actual Compose healthcheck")
                    self.assertEqual(spec["command"][:3], ["CMD", "python3", "-c"])
                    self.assertRegex(spec["block"], r"start_period: [1-9]\d*s")
                    original = "http://127.0.0.1:%d/health" % port
                    self.assertIn(original, spec["command"][3])
                    code = spec["command"][3].replace(original, "http://127.0.0.1:%d/health" % http.server_port)
                    for status, payload, passes in [(200, b'{"status":"ok"}', True), (503, b'{"status":"ok"}', False), (200, b'{"status":"starting"}', False), (200, b'not-json', False)]:
                        with self.subTest(service=service, status=status, payload=payload):
                            Handler.status, Handler.payload = status, payload
                            result = subprocess.run([sys.executable, "-c", code], capture_output=True, timeout=8)
                            self.assertEqual(result.returncode == 0, passes, result.stderr.decode())
            finally:
                http.shutdown()
                thread.join(timeout=3)

    def test_healthchecks_reject_process_that_exits_immediately(self):
        process = subprocess.Popen([sys.executable, "-c", "raise SystemExit(3)"], creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
        self.assertEqual(process.wait(timeout=5), 3)
        with socket.socket() as unused:
            unused.bind(("127.0.0.1", 0))
            port = unused.getsockname()[1]
        for service, original_port in [("recipe-source-parser", 8090), ("document-ocr-service", 8091)]:
            spec = service_healthcheck(service)
            self.assertIsNotNone(spec, service + " has no healthcheck")
            code = spec["command"][3].replace("http://127.0.0.1:%d/health" % original_port, "http://127.0.0.1:%d/health" % port)
            result = subprocess.run([sys.executable, "-c", code], capture_output=True, timeout=8)
            self.assertNotEqual(result.returncode, 0)

    def test_immediate_container_exit_is_not_reported_as_success(self):
        for language, choice in self.variants():
            for service in ["recipe-source-parser", "document-ocr-service"]:
                with self.subTest(language=language, choice=choice, service=service):
                    result, _calls = self.run_menu(language, choice, TEST_CRASH_SERVICE=service)
                    self.assertNotEqual(result.returncode, 0, result.stdout.decode())
                    self.assertIn(b"exited with code 3", result.stderr)
                    self.assertNotIn("SUCCESS:Update abgeschlossen.", result.stdout.decode())
                    self.assertNotIn("SUCCESS:Update complete.", result.stdout.decode())


if __name__ == "__main__":
    unittest.main()
