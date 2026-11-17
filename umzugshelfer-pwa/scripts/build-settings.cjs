// Only reviewed public values may enter the browser bundle. Never expose .env wholesale.
const publicKeys = Object.freeze([
  'REACT_APP_SUPABASE_URL',
  'REACT_APP_SUPABASE_ANON_KEY',
  'REACT_APP_VAPID_PUBLIC_KEY',
  'REACT_APP_PASSWORD_RESET_REDIRECT_URL',
  'REACT_APP_GLOBAL_ASSISTANT_ENABLED',
]);
function publicDefines(env) {
  return Object.fromEntries(publicKeys.map(key => [
    `process.env.${key}`, env[key] === undefined ? 'undefined' : JSON.stringify(env[key]),
  ]));
}
function supportedNode(version = process.versions.node) {
  const [major, minor] = version.split('.').map(Number);
  return (major === 22 && minor >= 22) || (major === 24 && minor >= 11) || major > 24;
}
module.exports = { publicKeys, publicDefines, supportedNode };
