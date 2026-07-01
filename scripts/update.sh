#!/usr/bin/env bash
# Kompatibilitaets-Wrapper: Die Update-Logik liegt zentral in manage.sh.
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec bash "${SCRIPT_DIR}/manage.sh" update
