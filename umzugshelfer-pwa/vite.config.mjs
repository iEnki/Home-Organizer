import { defineConfig, loadEnv, transformWithOxc } from 'vite';
import react from '@vitejs/plugin-react';
import legacy from '@vitejs/plugin-legacy';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import settings from './scripts/build-settings.cjs';
const require = createRequire(import.meta.url);
const pkg = require('./package.json');
const baseline = require('./config/browser-baseline.json');
const root = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, root, '');
  return {
    root,
    // No implicit VITE_* or REACT_APP_* expansion: allow only reviewed values above.
    envPrefix: [],
    define: settings.publicDefines(env),
    plugins: [
      {
        name: 'existing-jsx-in-js',
        enforce: 'pre',
        async transform(code, id) {
          if (!/\/src\/.*\.js$/.test(id)) return null;
          return transformWithOxc(code, id, {
            lang: 'jsx', jsx: { runtime: 'automatic', development: mode !== 'production' },
          });
        },
      },
      react(),
      legacy({ targets: [...pkg.browserslist.production, ...baseline.compatibilityFloor] }),
      {
        name: 'html-line-endings',
        transformIndexHtml: {
          order: 'post',
          handler: (html) => html.replace(/\r\n?/g, '\n'),
        },
      },
    ],
    // Existing source deliberately keeps JSX in .js; avoid renaming every component.
    optimizeDeps: { rolldownOptions: { moduleTypes: { '.js': 'jsx' } } },
    server: {
      host: env.HOST || 'localhost',
      port: Number(env.PORT || 3000),
      strictPort: true,
      open: env.BROWSER !== 'none' && env.BROWSER !== 'false',
    },
    preview: { host: 'localhost', port: 3000, strictPort: true },
    build: {
      outDir: 'build',
      emptyOutDir: true,
      assetsDir: 'static',
      sourcemap: env.GENERATE_SOURCEMAP !== 'false',
      manifest: true,
    },
  };
});
