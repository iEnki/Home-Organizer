const { test } = require('node:test');
const assert = require('node:assert/strict');
const { publicDefines, publicKeys, supportedNode } = require('./build-settings.cjs');
test('only reviewed public configuration is serialized', () => {
  const env = {
    REACT_APP_SUPABASE_URL: 'https://api.example.test',
    REACT_APP_SUPABASE_ANON_KEY: 'public-test-key',
    REACT_APP_PASSWORD_RESET_REDIRECT_URL: 'https://app.example.test/update-password',
    REACT_APP_GLOBAL_ASSISTANT_ENABLED: 'false',
    REACT_APP_PRIVATE_TOKEN: 'PRIVATE_SENTINEL',
    VITE_SECRET: 'VITE_SENTINEL',
    SERVICE_ROLE_KEY: 'SERVICE_SENTINEL',
    POSTGRES_PASSWORD: 'DATABASE_SENTINEL',
  };
  const definitions = publicDefines(env);
  assert.equal(Object.keys(definitions).length, publicKeys.length);
  assert.equal(definitions['process.env.REACT_APP_PASSWORD_RESET_REDIRECT_URL'], JSON.stringify(env.REACT_APP_PASSWORD_RESET_REDIRECT_URL));
  assert.equal(definitions['process.env.REACT_APP_GLOBAL_ASSISTANT_ENABLED'], '"false"');
  assert.equal(definitions['process.env.REACT_APP_VAPID_PUBLIC_KEY'], 'undefined');
  assert.doesNotMatch(JSON.stringify(definitions), /PRIVATE_SENTINEL|VITE_SENTINEL|SERVICE_SENTINEL|DATABASE_SENTINEL/);
});
test('local tool runtime accepts LTS and rejects obsolete Node', () => {
  for (const version of ['22.22.0','24.11.0','24.22.1','26.0.0']) assert.equal(supportedNode(version), true, version);
  for (const version of ['16.20.0','18.20.0','20.19.0','22.17.0','22.18.0','22.21.9','23.0.0','24.10.0']) assert.equal(supportedNode(version), false, version);
});

test('accepted older browser engines remain in the production target union', () => {
  const baseline = require('../config/browser-baseline.json');
  const browserslist = require('browserslist');
  const pkg = require('../package.json');
  const result = browserslist([...pkg.browserslist.production, ...baseline.compatibilityFloor]);
  assert.ok(result.some(browser => /^ios_saf 11\./.test(browser)));
  assert.ok(result.includes('chrome 103'));
  assert.ok(result.includes('and_uc 15.5'));
});
