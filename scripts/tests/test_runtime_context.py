"""Non-destructive installation-mode regression tests; all Docker calls are mocked."""
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

PROJECT = Path(__file__).resolve().parents[2]
BASH = os.environ.get("BASH_BIN") or (r"C:\Program Files\Git\bin\bash.exe" if os.name == "nt" else shutil.which("bash"))


@unittest.skipUnless(BASH and Path(BASH).exists(), "Bash is required")
class RuntimeContextTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="umzug-mode-", dir=os.environ.get("UMZUG_TEST_TEMP_ROOT"))
        self.root = Path(self.temporary.name)
        for name in ("docker-compose.yml", "docker-compose.full.yml"):
            (self.root / name).write_text("services: {}\n", encoding="utf-8")
        self.config("APP_PORT=3000\n")

    def tearDown(self):
        self.temporary.cleanup()

    def config(self, value):
        (self.root / ".env").write_text(value, encoding="utf-8")

    def resolve(self, *, input_text="", mode=None, label="", language="de"):
        env = os.environ.copy()
        env.pop("UMZUG_INSTALL_MODE", None)
        env.update(TEST_COMPOSE_LABEL=label, TEST_LOCALE=language)
        if mode is not None:
            env["UMZUG_INSTALL_MODE"] = mode
        command = '''
set -e
docker() { [[ "$1" == inspect ]] || return 1; printf '%s' "$TEST_COMPOSE_LABEL"; }
source "$1"
if umzug_resolve_install_context "$2" "$TEST_LOCALE"; then
  printf 'RESULT=%s|%s|%s\\n' "$COMPOSE_FILE" "$IS_VOLLSTACK" "$UMZUG_MODE_SOURCE"
else
  exit 1
fi
'''
        result = subprocess.run([BASH, "-c", command, "test", (PROJECT / "scripts/lib/runtime-context.sh").as_posix(), self.root.as_posix()], input=input_text.encode("utf-8"), capture_output=True, env=env, timeout=15)
        result.stdout = result.stdout.decode("utf-8", errors="replace")
        result.stderr = result.stderr.decode("utf-8", errors="replace")
        return result

    def test_app_only_does_not_choose_fullstack_when_both_templates_exist(self):
        self.config("APP_PORT=3011\nUMZUG_INSTALL_MODE=apponly\n")
        result = self.resolve()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("docker-compose.yml|false|configuration", result.stdout)

    def test_quoted_fullstack_mode(self):
        self.config('UMZUG_INSTALL_MODE="vollstack"\r\n')
        self.assertIn("docker-compose.full.yml|true", self.resolve().stdout)

    def test_explicit_environment_override_preserves_other_configuration(self):
        self.config("APP_PORT=3011\nUMZUG_INSTALL_MODE=vollstack\nCUSTOM_VALUE=preserve-me\n")
        result = self.resolve(mode="apponly")
        self.assertEqual(result.returncode, 0, result.stderr)
        value = (self.root / ".env").read_text()
        self.assertIn("CUSTOM_VALUE=preserve-me", value)
        self.assertIn("APP_PORT=3011", value)
        self.assertEqual(value.count("UMZUG_INSTALL_MODE="), 1)
        self.assertIn("UMZUG_INSTALL_MODE=apponly", value)

    def test_existing_app_container_label_is_authoritative(self):
        result = self.resolve(label="/opt/home/docker-compose.yml")
        self.assertIn("docker-compose.yml|false|container", result.stdout)
        self.assertIn("UMZUG_INSTALL_MODE=apponly", (self.root / ".env").read_text())

    def test_existing_fullstack_container_label(self):
        self.assertIn("docker-compose.full.yml|true|container", self.resolve(label="/opt/home/docker-compose.full.yml").stdout)

    def test_single_app_compose_file(self):
        (self.root / "docker-compose.full.yml").unlink()
        self.assertIn("docker-compose.yml|false|single-compose-file", self.resolve().stdout)

    def test_single_fullstack_compose_file(self):
        (self.root / "docker-compose.yml").unlink()
        self.assertIn("docker-compose.full.yml|true|single-compose-file", self.resolve().stdout)

    def test_ambiguous_installation_requires_choice_and_remembers_it(self):
        first = self.resolve(input_text="2\n")
        self.assertEqual(first.returncode, 0, first.stderr)
        self.assertIn("|false|selection", first.stdout)
        self.assertIn("|false|configuration", self.resolve().stdout)

    def test_ambiguous_english_installation(self):
        result = self.resolve(input_text="1\n", language="en")
        self.assertIn("Choose once", result.stderr)
        self.assertIn("|true|selection", result.stdout)

    def test_eof_does_not_silently_select_fullstack(self):
        before = (self.root / ".env").read_bytes()
        self.assertNotEqual(self.resolve().returncode, 0)
        self.assertEqual((self.root / ".env").read_bytes(), before)

    def test_cancel_does_not_change_configuration(self):
        before = (self.root / ".env").read_bytes()
        self.assertNotEqual(self.resolve(input_text="0\n").returncode, 0)
        self.assertEqual((self.root / ".env").read_bytes(), before)

    def test_fresh_install_has_no_implicit_fullstack(self):
        (self.root / ".env").unlink()
        result = self.resolve()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("|false|unconfigured", result.stdout)
        self.assertFalse((self.root / ".env").exists())

    def test_missing_selected_compose_file_fails(self):
        (self.root / "docker-compose.yml").unlink()
        result = self.resolve(mode="apponly")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("missing", result.stderr)

    def test_invalid_value_is_not_executed_as_shell(self):
        self.config("UMZUG_INSTALL_MODE=$(touch should-not-exist)\n")
        self.assertNotEqual(self.resolve().returncode, 0)
        self.assertFalse((self.root / "should-not-exist").exists())

    def test_repeated_resolution_is_idempotent(self):
        self.config("UMZUG_INSTALL_MODE=apponly\nAPP_PORT=3030\n")
        before = (self.root / ".env").read_bytes()
        for _ in range(2):
            self.assertEqual(self.resolve().returncode, 0)
        self.assertEqual((self.root / ".env").read_bytes(), before)

    def run_entrypoint(self, filename, input_text, **extra_env):
        scripts = self.root / "scripts"
        (scripts / "lib").mkdir(parents=True, exist_ok=True)
        for name in (filename, "manage.sh"):
            shutil.copyfile(PROJECT / "scripts" / name, scripts / name)
        shutil.copyfile(PROJECT / "scripts/lib/runtime-context.sh", scripts / "lib/runtime-context.sh")
        mockbin = self.root / "mockbin"
        mockbin.mkdir(exist_ok=True)
        docker = mockbin / "docker"
        docker.write_text('#!/usr/bin/env bash\nprintf "%s\\n" "$*" >> "$UMZUG_DOCKER_LOG"\n[[ "$1" == inspect ]] && exit 1\nif [[ "${UMZUG_MOCK_PULL_FAIL:-}" == 1 && " $* " == *" pull "* ]]; then exit 42; fi\nexit 0\n', encoding="utf-8", newline="\n")
        docker.chmod(0o755)
        npm = mockbin / "npm"
        npm.write_text('#!/usr/bin/env bash\nprintf "%s|%s\\n" "$PWD" "$*" > "$UMZUG_NPM_LOG"\nexit "${UMZUG_MOCK_NPM_EXIT:-0}"\n', encoding="utf-8", newline="\n")
        npm.chmod(0o755)
        frontend = self.root / "umzugshelfer-pwa"
        frontend.mkdir(exist_ok=True)
        (frontend / "package.json").write_text("{}", encoding="utf-8")
        if extra_env.get("UMZUG_MOCK_GIT_PULL_FAIL") == "1":
            (self.root / ".git").mkdir()
            git = mockbin / "git"
            git.write_text('#!/usr/bin/env bash\ncase "$1" in pull) exit 42 ;; rev-list) echo 0 ;; rev-parse) echo fixture-ref ;; log) echo fixture-commit ;; esac\n', encoding="utf-8", newline="\n")
            git.chmod(0o755)
        self.config("UMZUG_INSTALL_MODE=apponly\nAPP_PORT=3000\nSITE_URL=https://example.test\n")
        env = os.environ.copy()
        env.pop("UMZUG_INSTALL_MODE", None)
        env.update(TERM="xterm", UMZUG_DOCKER_LOG=(self.root / "docker.log").as_posix(), TEST_MOCK_BIN=mockbin.as_posix())
        env.update(UMZUG_NPM_LOG=(self.root / "npm.log").as_posix())
        env.update(extra_env)
        result = subprocess.run([BASH, "-c", 'mock_path="$TEST_MOCK_BIN"; if command -v cygpath >/dev/null 2>&1; then mock_path="$(cygpath -u "$mock_path")"; fi; export PATH="$mock_path:$PATH"; exec bash "$1" ${UMZUG_TEST_ARGUMENTS:-}', "test", (scripts / filename).as_posix()], input=input_text.encode("utf-8"), capture_output=True, env=env, timeout=15)
        result.stdout = result.stdout.decode("utf-8", errors="replace")
        result.stderr = result.stderr.decode("utf-8", errors="replace")
        log = (self.root / "docker.log").read_text() if (self.root / "docker.log").exists() else ""
        self.assertNotIn("docker-compose.full.yml", log)
        self.assertNotIn(" down", log)
        return result

    def test_documented_maintenance_command_uses_frontend_and_no_docker(self):
        result = self.run_entrypoint("manage.sh", "", UMZUG_TEST_ARGUMENTS="maintenance browserslist")
        self.assertEqual(result.returncode, 0, result.stderr)
        log = (self.root / "npm.log").read_text()
        self.assertIn("umzugshelfer-pwa|exec --yes --package=update-browserslist-db -- update-browserslist-db", log)
        self.assertFalse((self.root / "docker.log").exists())

    def test_english_maintenance_command_preserves_npm_failure(self):
        result = self.run_entrypoint("manage_en.sh", "", UMZUG_TEST_ARGUMENTS="maintenance browserslist", UMZUG_MOCK_NPM_EXIT="27")
        self.assertEqual(result.returncode, 27, result.stderr)
        self.assertFalse((self.root / "docker.log").exists())

    def test_unknown_maintenance_action_fails_without_running_npm(self):
        result = self.run_entrypoint("manage.sh", "", UMZUG_TEST_ARGUMENTS="maintenance unknown")
        self.assertEqual(result.returncode, 2, result.stderr)
        self.assertFalse((self.root / "npm.log").exists())

    def test_failed_image_pull_does_not_build_or_restart_services(self):
        result = self.run_entrypoint("update.sh", "4\ny\n\n0\n", UMZUG_MOCK_PULL_FAIL="1")
        self.assertNotEqual(result.returncode, 0, result.stderr)
        log = (self.root / "docker.log").read_text()
        self.assertIn("pull --ignore-buildable", log)
        self.assertNotIn(" build ", log)
        self.assertNotIn(" up ", log)
        self.assertIn("fehlgeschlagen", result.stdout)

    def test_failed_git_pull_does_not_build_or_restart_services(self):
        result = self.run_entrypoint("update.sh", "1\ny\n\n0\n", UMZUG_MOCK_GIT_PULL_FAIL="1")
        self.assertNotEqual(result.returncode, 0, result.stderr)
        log = (self.root / "docker.log").read_text() if (self.root / "docker.log").exists() else ""
        self.assertNotIn(" build ", log)
        self.assertNotIn(" up ", log)
        self.assertIn("git pull fehlgeschlagen", result.stdout)

    def test_enter_in_update_menu_does_not_start_an_update(self):
        result=self.run_entrypoint('update.sh','\n')
        self.assertEqual(result.returncode,0,result.stderr)
        log=(self.root/'docker.log').read_text() if (self.root/'docker.log').exists() else ''
        self.assertNotIn(' build ',log)
        self.assertNotIn(' up ',log)
        self.assertNotIn(' pull ',log)

    def test_existing_credentials_are_preserved_and_protected_on_entry(self):
        credentials=self.root/'CREDENTIALS.txt'
        for script in ['manage.sh','manage_en.sh','update.sh']:
            credentials.write_text('existing-credentials\n',encoding='utf-8')
            credentials.chmod(0o644)
            result=self.run_entrypoint(script,'0\n')
            self.assertEqual(result.returncode,0,result.stderr)
            self.assertEqual(credentials.read_text(),'existing-credentials\n')
            if os.name!='nt':
                self.assertEqual(credentials.stat().st_mode & 0o777,0o600)

    def test_german_management_entrypoint_preserves_app_only(self):
        result = self.run_entrypoint("manage.sh", "0\n")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("App-only", result.stdout)

    def test_english_management_entrypoint_preserves_app_only(self):
        result = self.run_entrypoint("manage_en.sh", "0\n")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("App-only", result.stdout)

    def test_legacy_update_wrapper_remains_usable(self):
        result = self.run_entrypoint("update.sh", "0\n")
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_installer_rebuild_can_be_cancelled_in_app_only_mode(self):
        result = self.run_entrypoint("install.sh", "3\nn\n")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("docker-compose.yml", result.stdout)

    def test_uninstaller_can_be_cancelled_without_touching_services(self):
        result = self.run_entrypoint("uninstall.sh", "6\n")
        self.assertEqual(result.returncode, 0, result.stderr)


if __name__ == "__main__":
    unittest.main(verbosity=2)
