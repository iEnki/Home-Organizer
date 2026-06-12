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

- Node.js 20 recommended
- npm
- A reachable Supabase installation with the current database schema and Edge Functions

## Environment

Create `umzugshelfer-pwa/.env`:

```env
REACT_APP_SUPABASE_URL=https://your-supabase.example.com
REACT_APP_SUPABASE_ANON_KEY=your-anon-key
REACT_APP_PASSWORD_RESET_REDIRECT_URL=http://localhost:3000/update-password
REACT_APP_VAPID_PUBLIC_KEY=your-vapid-public-key
GENERATE_SOURCEMAP=false
```

`REACT_APP_SUPABASE_URL` and `REACT_APP_SUPABASE_ANON_KEY` are required. Push notifications need the VAPID key. Do not place service-role keys or AI-provider secrets in frontend environment files.

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

## Backend Contract

The frontend expects:

- the schema from `../database_setup_complete.sql`;
- household-scoped RLS policies;
- configured storage buckets and document links;
- the Edge Functions in `../supabase/functions`;
- local OCR and recipe services for the corresponding fullstack features.

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
