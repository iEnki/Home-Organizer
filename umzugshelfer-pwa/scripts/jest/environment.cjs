const { TestEnvironment } = require('jest-environment-jsdom');
// Jest 30 isolates jsdom from Node's web globals. Preserve the native Fetch API
// available to the accepted tests on Node 22/24; no network requests are mocked here.
const webGlobals = Object.fromEntries(
  ['fetch', 'Request', 'Response', 'Headers', 'TextEncoder', 'TextDecoder']
    .map(key => [key, globalThis[key]]),
);
module.exports = class AppTestEnvironment extends TestEnvironment {
  constructor(config, context) {
    super(config, context);
    Object.assign(this.global, webGlobals);
  }
};
