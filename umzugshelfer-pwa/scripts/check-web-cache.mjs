// Read-only acceptance check against the real Nginx app endpoint, not Vite preview.
import assert from 'node:assert/strict';
const argument = process.argv[2];
if (!argument) throw new Error('Usage: node scripts/check-web-cache.mjs http://127.0.0.1:3000');
const base = new URL(argument);
assert.ok(['http:', 'https:'].includes(base.protocol), 'HTTP(S) URL required');
const checks = [];
async function request(route, { status = 200, policy, method = 'HEAD', headers } = {}) {
  const response = await fetch(new URL(route, base), {
    method, headers, redirect: 'manual', signal: AbortSignal.timeout(10000),
  });
  assert.equal(response.status, status, `${method} ${route}`);
  const cache = response.headers.get('cache-control') || '';
  if (policy) assert.match(cache, policy, `Cache-Control for ${route}`);
  checks.push({ route, method, status: response.status, cacheControl: cache });
  return response;
}
const root = await request('/', { method: 'GET', policy: /\bno-cache\b/ });
const html = await root.text();
assert.match(root.headers.get('content-type') || '', /text\/html/);
assert.match(html, /id="root"/);
for (const route of ['/index.html', '/home/kfz', '/__home15_unknown_route']) {
  const response = await request(route, { method: 'GET', policy: /\bno-cache\b/ });
  assert.equal(await response.text(), html, `Same HTML entry for ${route}`);
}
const etag = root.headers.get('etag');
if (etag) await request('/index.html', {
  status: 304, policy: /\bno-cache\b/, headers: { 'If-None-Match': etag },
});
for (const route of ['/.vite', '/.vite/', '/.vite/manifest.json']) {
  await request(route, { status: 404, policy: /\bno-store\b/ });
}
await request('/service-worker.js', { policy: /\bno-store\b/ });
for (const route of ['/manifest.de.json', '/manifest.en-GB.json', '/logo192.png', '/Background/Heller_Modus.png']) {
  await request(route, { policy: /\bno-cache\b/ });
}
const scripts = [...html.matchAll(/(?:src|href|data-src)="(\/static\/[^"?#]+\.(?:js|css))[^"#]*"/g)].map(m => m[1]);
assert.ok(scripts.some(file => file.endsWith('.js')), 'Bundle entry missing');
assert.ok(scripts.some(file => file.endsWith('.css')), 'Stylesheet entry missing');
for (const route of new Set(scripts)) {
  const response = await request(route, { policy: /\bimmutable\b/ });
  const age = /\bmax-age=(\d+)/.exec(response.headers.get('cache-control'));
  assert.ok(age && Number(age[1]) >= 2592000, `Long-lived hashed bundle ${route}`);
}
await request('/static/__home15_missing_chunk.js', { status: 404, policy: /\bno-store\b/ });
console.log(JSON.stringify({ base: base.origin, passed: checks.length, checks }, null, 2));
