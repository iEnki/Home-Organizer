# Frontend Development

React frontend for the Home Organizer & Moving Planner PWA.

For product features and self-hosting, see the repository-level [German](../README.de.md) or [English](../README.en.md) documentation.

## Stack

- React 18 with Create React App
- React Router 6
- Tailwind CSS
- Supabase JS
- i18next with German and English (UK) locales
- Chart.js and `react-chartjs-2`
- Framer Motion
- React PDF renderer
- Jest and Testing Library

## Requirements

- Node.js 22 (LTS) recommended — matches the Docker build image
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

The production Dockerfile currently does not forward `REACT_APP_PASSWORD_RESET_REDIRECT_URL` as a build argument. Docker builds use the application origin plus `/update-password`; the explicit variable applies to local builds.

## Commands

```bash
npm install
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
| `npm run build` | Create the production build in `build/` |

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

The root Docker configuration builds this directory and serves `build/` through Nginx. Use the repository management scripts for deployment and updates rather than running the CRA development server in production.

## Known Build Warnings

`npm install` prints a long list of `npm warn deprecated` messages (`svgo`, `glob`, `inflight`, `abab`, `domexception`, `q`, `eslint@8`, various `@babel/plugin-proposal-*`, …). This is expected and not a defect:

- Every one of them is a **transitive** dependency pulled in by `react-scripts@5.0.1` (Create React App), which has had no release since April 2022. None are direct dependencies, so they cannot be upgraded individually — their versions are pinned inside the CRA dependency tree.
- They are **build-time only**. The Dockerfile is multi-stage and copies just `/app/build` into the Nginx image, so none of these packages are shipped to users.
- "Deprecated" means unmaintained, not vulnerable. Use `npm audit` to reason about actual vulnerabilities.

**Never run `npm audit fix --force` in this project.** npm reports the "fix" for `nth-check` as `react-scripts@0.0.0` — an empty placeholder package. The command would silently destroy the build. Prefer targeted upgrades of individual direct dependencies instead.

The remaining `npm audit` findings resolve to `react-scripts` (build tooling) and the `supabase` CLI (a devDependency, never bundled). The only real way to clear the warnings and the bulk of the audit findings is migrating off CRA to Vite — a separate, deliberate project.
