import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const build = path.join(root, 'build');
const html = await readFile(path.join(build, 'index.html'), 'utf8');
assert.doesNotMatch(html, /\r/, 'Built HTML must use LF on every build host');
assert.match(html, /type="module"/);
assert.match(html, /nomodule/);
assert.match(html, /manifest\.de\.json/);
assert.doesNotMatch(html, /%PUBLIC_URL%|\/src\/index\.js/);
for (const match of html.matchAll(/(?:src|href|data-src)="(\/static\/[^"?#]+)[^"]*"/g)) {
  assert.ok((await readFile(path.join(build, match[1]))).length > 0, match[1]);
}
let copied = 0;
async function verifyPublic(directory, relative = '') {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const name = path.join(relative, entry.name);
    if (entry.isDirectory()) await verifyPublic(path.join(directory, entry.name), name);
    else if (entry.isFile()) {
      assert.deepEqual(await readFile(path.join(build, name)), await readFile(path.join(directory, entry.name)), name);
      copied++;
    }
  }
}
await verifyPublic(path.join(root, 'public'));
const manifest = JSON.parse(await readFile(path.join(build, '.vite/manifest.json'), 'utf8'));
for (const entry of Object.values(manifest)) assert.ok((await readFile(path.join(build, entry.file))).length > 0, entry.file);
let javascript = 0;
async function verifyBundles(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const name = path.join(directory, entry.name);
    if (entry.isDirectory()) await verifyBundles(name);
    else if (entry.name.endsWith('.js')) {
      const text = await readFile(name, 'utf8');
      assert.doesNotMatch(text, /HOME5_(VITE|SERVICE|PREFIX)_PRIVATE_SENTINEL/, name);
      javascript++;
    }
  }
}
await verifyBundles(path.join(build, 'static'));
console.log(`Build contract passed: ${copied} public files byte-identical, ${javascript} JS bundles, modern + legacy entrypoints, valid local asset links and no private canaries.`);
