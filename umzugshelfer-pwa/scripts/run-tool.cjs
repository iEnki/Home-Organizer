const { supportedNode } = require('./build-settings.cjs');
if (!supportedNode()) {
  console.error('Node.js 22.22+ (22 LTS) or 24.11+ is required for local frontend builds/tests. Docker supplies its own build runtime.');
  process.exit(1);
}
const command = process.argv[2];
const args = process.argv.slice(3);
if (command === 'eject') {
  console.log('The toolchain is already configurable: vite.config.mjs, jest.config.cjs, babel.config.cjs and eslint.config.mjs. No eject step is needed.');
} else if (command === 'test') {
  // Match Jest's CLI initialization when invoking its programmatic API.
  process.env.NODE_ENV = process.env.NODE_ENV || 'test';
  require('jest').run(args).catch(error => { console.error(error); process.exitCode = 1; });
} else {
  const { spawnSync } = require('node:child_process');
  if (command === 'build') {
    const lint = spawnSync(process.execPath, [require('node:path').join(require.resolve('eslint/package.json'), '../bin/eslint.js'), 'src'], { stdio: 'inherit' });
    if (lint.status !== 0) process.exit(lint.status || 1);
  }
  const vite = require('node:path').join(require.resolve('vite/package.json'), '../bin/vite.js');
  const commands = { start: [], build: ['build'], preview: ['preview'] };
  if (!(command in commands)) { console.error('Unknown tool command.'); process.exit(2); }
  const result = spawnSync(process.execPath, [vite, ...commands[command], ...args], { stdio: 'inherit' });
  process.exitCode = result.status ?? 1;
}
