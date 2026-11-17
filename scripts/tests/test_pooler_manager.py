"""Pooler bootstrap wiring plus actual Elixir behavioral contract when available."""
import json
from pathlib import Path
import re
import shutil
import subprocess
import unittest
from test_runtime_context import BASH

ROOT = Path(__file__).resolve().parents[2]
ELIXIR = shutil.which('elixir')


class PoolerManagerTests(unittest.TestCase):
    def test_compose_repairs_before_loading_existing_encrypted_tenant(self):
        compose=(ROOT/'docker-compose.full.yml').read_text(encoding='utf-8')
        pooler=compose.split('  supavisor:\n',1)[1].split('\n  #',1)[0]
        self.assertIn('./scripts/lib/pooler-manager.exs:/etc/pooler/manager-credentials.exs:ro,z',pooler)
        command=json.loads(re.search(r'^    command: (\[.*\])$',pooler,re.M).group(1))[2]
        self.assertLess(command.index('/app/bin/migrate'),command.index('UmzugPoolerManager.sync!()'))
        self.assertLess(command.index('UmzugPoolerManager.sync!()'),command.index('cat /etc/pooler/pooler.exs'))
        self.assertLess(command.index('UmzugPoolerManager.sync!()'),command.index('&& /app/bin/server'))
        self.assertIn('&& /app/bin/supavisor eval',command)
        # The shell sees only the code/path, never a host-expanded secret.
        self.assertNotIn('${POSTGRES_PASSWORD}',command)
        result=subprocess.run([BASH,'-n','-c',command.replace('$$','$')],capture_output=True,timeout=10)
        self.assertEqual(result.returncode,0,result.stderr)

    @unittest.skipUnless(ELIXIR, 'Elixir is required; run pooler_manager_contract.exs in Linux acceptance')
    def test_elixir_behavioral_contract(self):
        result=subprocess.run([ELIXIR,str(ROOT/'scripts/tests/pooler_manager_contract.exs')],capture_output=True,timeout=45)
        self.assertEqual(result.returncode,0,result.stdout.decode(errors='replace')+result.stderr.decode(errors='replace'))


if __name__=='__main__': unittest.main()
