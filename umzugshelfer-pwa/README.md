# Frontend Development

React frontend for the Home Organizer & Moving Planner PWA.

For product features and self-hosting, see the repository-level [German](../README.de.md) or [English](../README.en.md) documentation.

## Stack

- React 19 with Vite 8
- React Router 8.5.1 (declarative BrowserRouter)
- Tailwind CSS
- Supabase JS 2.119.0
- OpenAI SDK 7.57.0 and Supabase CLI 3.1.0
- i18next 27 / react-i18next 18 with German and English (UK) locales
- Chart.js and `react-chartjs-2`
- Framer Motion
- React PDF renderer
- Jest and Testing Library

## Requirements

- Node.js 22.22+ (22 LTS) or 24.11+ for local frontend commands — Docker builds use Node 22 LTS
- npm
- A reachable Supabase installation with the current database schema and Edge Functions

## Environment

Create `umzugshelfer-pwa/.env`:

```env
REACT_APP_SUPABASE_URL=https://your-supabase.example.com
REACT_APP_SUPABASE_ANON_KEY=your-anon-key
REACT_APP_PASSWORD_RESET_REDIRECT_URL=http://localhost:3000/update-password
REACT_APP_VAPID_PUBLIC_KEY=your-vapid-public-key
REACT_APP_GLOBAL_ASSISTANT_ENABLED=true
GENERATE_SOURCEMAP=false
```

`REACT_APP_SUPABASE_URL` and `REACT_APP_SUPABASE_ANON_KEY` are required. Push notifications need the VAPID key. `REACT_APP_GLOBAL_ASSISTANT_ENABLED` is optional and defaults to enabled. Do not place service-role keys or AI-provider secrets in frontend environment files.

Both Compose variants and the Dockerfile forward the explicit password-reset URL. If it is empty, the application still falls back to its origin plus `/update-password`. The five public values above are explicitly allowlisted; arbitrary `REACT_APP_*`, `VITE_*` and server environment variables are not automatically bundled.

## Commands

```bash
npm ci
npm start
npm test
npm run i18n:check
npm run build
```

| Command | Purpose |
| --- | --- |
| `npm start` | Start the development server on `http://localhost:3000` |
| `npm test -- --watchAll=false` | Run the Jest suite once |
| `npm run i18n:check` | Compare locale keys and report untranslated UI literals |
| `npm run build` | Lint, then create the production build in `build/` |
| `npm run lint` | Check source independently of the bundler |
| `npm run test:build-config` | Verify public configuration and Node requirements |
| `npm run test:sdk` | Exercise actual SDKs against generated local HTTP fixtures |
| `npm run preview` | Serve the production build locally on port 3000 |

## Source Layout

```text
src/
|-- components/
|   |-- home/          Home Organizer modules
|   |-- layout/        Desktop and mobile application shell
|   |-- assistant/     Global assistant UI
|   `-- ui/            Shared UI primitives
|-- contexts/          Session, household, locale, theme and tour state
|-- hooks/             Reusable data and UI hooks
|-- i18n/locales/      German and English (UK) JSON resources
|-- utils/             Domain logic, statistics, imports and API helpers
|-- App.js             Routes and authenticated application shell
`-- supabaseClient.js  Browser Supabase client
```

Important domain areas include `components/home/kfz`, `components/home/budget`, `components/home/documents`, `components/home/geraete` and the recipe components under `components/home`.

Recent domain capabilities include saved and bulk-editable budget views, queued recipe imports with review/history, duplicate-safe vehicle fuel-receipt imports, configurable mobile navigation and separate household AI-model settings for chat, vision and cookbook processing.

## Backend Contract

The frontend expects:

- the schema from `../database_setup_complete.sql`;
- any dated migrations required by the deployed feature set (see the repository-level schema notes);
- household-scoped RLS policies;
- configured storage buckets and document links;
- the Edge Functions in `../supabase/functions`;
- local OCR and recipe services for the corresponding fullstack features.

The Edge Functions cover authenticated AI chat and vision, invoices and document OCR, KFZ service analysis, recipe import/finalisation, book and medicine lookups, invitations, account deletion, push delivery and scheduled reminder checks. Provider secrets and service-role credentials belong in the backend runtime only.

The core application can be self-hosted, but selected integrations require outbound access: OpenAI, OpenLibrary/Google Books, BASG medicine data, recipe source sites and browser-OCR CDN assets. Scheduled push reminders also require an external scheduler or `pg_cron`/`pg_net` call to `check-reminders`.

Apply schema changes to both the dated migration under `../scripts` and the complete schema when adding database functionality.

## Internationalisation

UI text belongs in:

```text
src/i18n/locales/de/
src/i18n/locales/en-GB/
```

Keep namespace keys synchronized and run `npm run i18n:check` before shipping. German text uses proper umlauts (`Ä`, `Ö`, `Ü`, `ä`, `ö`, `ü`) rather than ASCII substitutions.

## Testing Notes

- Keep calculation-heavy domain logic in `src/utils` and cover it with unit tests.
- Test household scoping and partial backend failures for data hooks.
- Check responsive views without horizontal overflow.
- Verify `prefers-reduced-motion` when adding animations.
- Run a production build after dependency, routing or environment changes.

## Production

The root Docker configuration builds this directory and serves `build/` through Nginx. Use the repository management scripts for deployment and updates rather than running the Vite development server in production.

## Toolchain compatibility

Vite uses the existing production Browserslist query through its legacy plugin,
including syntax transforms and usage-based polyfills for older supported browsers.
`config/browser-baseline.json` preserves the accepted engine floors even when
newer Browserslist data would otherwise drop an older browser.
The existing Tailwind 3 theme and styles remain unchanged; upgrading Tailwind 4
belongs to a separate visual regression step. Babel is used by the standalone
Jest and PDF checks; the legacy plugin retains its own compatible Babel chain.
TypeScript 6 remains explicit because the existing Edge Function regression
runner imports its classic compiler API. Motion and its exact matching internals
are updated together as described in the UI dependency section below.

`index.html` is now at the frontend root. Application components keep their `.js`
filenames, including JSX. `public/` assets, manifests and the handwritten push
service worker retain their paths. No new offline cache or service-worker
replacement is introduced. Device/PWA and authenticated backend acceptance remain
separate from local build tests.

`PORT`, `HOST`, `BROWSER=false`/`none` and `GENERATE_SOURCEMAP=false` are supported
for local tooling. The default development address remains localhost:3000.
The development and preview servers are not production servers. The existing
`eject` command now points to the configuration files, which are already editable.

Use targeted dependency changes and review `npm audit` results. Never apply
`npm audit fix --force` as a substitute for a tested migration. Remaining runtime,
CLI, export and styling dependencies are handled in their own migration steps.


## SDK migration checks

Supabase JS, OpenAI and the development CLI are pinned to reviewed versions.
`npm run test:sdk` runs Auth/login/refresh/logout, an old serialized test session,
household-scoped requests, storage, RPC, Edge Function errors and audio/text
requests against a temporary loopback server. The saved legacy-session fixture
was generated by Supabase JS 2.50.0; its signature is intentionally invalid and
it contains no real credential. An optional output path records request results.
No cloud account, API key, microphone or database is required for these tests.

Models, prompts and application payloads remain unchanged. Central chat/vision
calls retain the existing Edge proxy. The older speech assistants retain their
existing direct transcription flow with a user-provided key; no new provider or
key-storage behavior is introduced. Real microphone/device acceptance is separate.

The Supabase CLI is a development tool. Existing install/update scripts continue
to use their pinned Compose definitions and copy/deploy flow. The CLI 3 command
help documents hosted-project flags such as `--remote`; check `--help` for manual
CLI administration. SDK upgrades do not update the self-hosted service images,
schema or the separate Deno imports in Edge Functions. Actual compatibility with
that stack is accepted in the isolated Docker test environment.

### Router and translation compatibility

HOME-7 preserves the declarative BrowserRouter, all existing routes and the `ui_locale` preference. Router imports now come from `react-router`, as required by v8; no framework/SSR server is introduced. Local Node 22.22+ (or 24.11+) is required; Docker still provides Node 22 LTS.

`intl-pluralrules` supplies the required plural API for the existing iOS 11/12 browser targets. Intentional empty translations remain empty. `src/i18n/migration.test.js` checks language changes and metadata; `src/routerMigration.test.js` checks routes, query parameters, invitations and password redirects.

TypeScript 6.0.3 is the compatible classic compiler used by `scripts/test-push-edge.js`. TypeScript 7's native package no longer exposes the `transpileModule` compiler API required by that existing test, so it cannot be substituted without a separate tool migration. TypeScript remains development-only. The newer i18n packages require TypeScript 5 or later when installed.

The CommonJS Jest harness compiles Router 8's ESM and translates `import.meta` to file metadata only in tests. Production Vite output uses the original ESM.

### UI and export dependencies (HOME-8)

The active frontend keeps its existing routes, design and browser target union. UI packages are updated in separate recorded groups (Motion, icons, file selection/lightbox; calendar/date/charts; PDF/QR; CSS/test helpers). Motion's old internal 12.x overrides are removed so its exact internal dependencies match the installed version.

The document screens use `useSingleFileDropzone` to preserve the old all-or-nothing rejection of multiple files with Dropzone 20. File paste stays disabled. The hook exposes the existing root/input properties and drag-active state; upload and assignment calls are unchanged.

Tailwind stays on the latest compatible 3.x line (3.4.19); v4 would raise the browser floor and change the CSS migration scope. `web-vitals` stays on 3.5.2 because the optional existing reporter still exposes FID and the original get* callback API, which later majors remove. Reporting remains inactive unless a caller supplies a callback.

`npm run test:ui-exports` renders the actual packing-list, diary and vehicle PDF components with generated data and built-in fonts. It makes no provider calls. Set `UI_PDF_OUTPUT` to a private test directory only when PDFs should be retained. The existing frontend tests additionally verify calendar/ICS/date/QR output, every imported icon and single-file selection behavior. `scripts/fixtures/ui-library-contract.jsx` is a development regression fixture, never imported by the production application.

Both Compose configurations build `umzugshelfer-pwa/Dockerfile` with this package/lockfile. The historical root package files and root Dockerfile are not used by that installation flow and remain unchanged; use the documented frontend directory or installation/management scripts.


### Babel 8 compatibility review (HOME-18)

Babel 8 was tested with the existing CommonJS Jest runner and the actual PDF
components: all 338 tests passed and the three PDFs remained pixel-identical.
The migration is nevertheless deferred: Jest's current-node-syntax preset still
installs Babel 7-only syntax plugins. A normal installation produces conflicting
peer dependencies and an invalid npm dependency tree with a direct Babel 8 core.
A clean strict resolution reproduces the conflict; no force flags or widened
peer requirements are used to hide it.

The reviewed Babel 7 versions remain pinned (core 7.29.13, preset-env 7.29.14,
preset-react 7.29.7). Revisit Babel 8 when the upstream Jest syntax-preset chain
can be installed with valid dependencies. Browser targets, application startup,
production output and PDF behavior remain unchanged by this review.

### Jest helper dependencies (HOME-26)

Jest remains on 30.5.2 with the compatible Babel 7 harness. Temporary npm
`overrides` pin Glob 14.0.6 for the Jest reporters/config/runtime and
`test-exclude` paths, and Minimatch 11.0.8 consistently. These are development
helpers; application dependencies and browser targets are unchanged. Recheck
and remove the overrides when upstream ranges include the corrected releases.
Validate changes with a clean `npm ci --strict-peer-deps`, `npm ls --all`, the
full tests including coverage, export/SDK checks and both Vite outputs.

The remaining audit chain comes from `deepmerge` 4.3.1 in Jest's local config
merging. Its [upstream advisory](https://github.com/advisories/GHSA-gcqx-w48m-w2h4)
has no patched release as of 2026-11-16. Keep test configuration and presets
trusted; never run configuration supplied by untrusted users. This is a
documented development-only exception, not a statement that the package is
fixed or that all possible uses are safe. A force downgrade of Jest is not a
compatible correction. Review this exception when an upstream fix is available.
