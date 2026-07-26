# Moving Planner & Home Organizer

A self-hosted Progressive Web App for move planning, household organisation, finances, documents and shared management.

[Deutsche Version](README.de.md)

Demo: <https://umzug.enkination.de/><br>
Demo login: `demo@demo.com` / `Demo1234`

## Overview

The application combines two workspaces:

- **Moving Planner** for planning, completing and closing a move.
- **Home Organizer** for ongoing household management.

The app is responsive and installable as a PWA. The core stack is fully self-hostable; optional OpenAI, book and medicine lookups, browser OCR, and web/video recipe imports require outbound internet access. Supabase provides authentication, PostgreSQL, storage, realtime and Edge Functions. AI features use OpenAI or Ollama according to the household configuration.

## Features

### Moving Planner

- Dashboard with tasks, appointments and progress
- Packing lists with rooms, categories, photos, QR codes and AI support
- To-do lists with priorities, due dates and moving phases
- Budget, partial payments and cost comparison
- Calendar, contacts, documents and timeline
- Renovation and material planning
- Calculators for paint, wallpaper, flooring, insulation, boxes, volume and transport
- PDF and calendar exports
- Move-completion workflow that transfers packed items to Home inventory and archives moving data

### Home Organizer

- Household dashboard with shortcuts and global search
- One shared household per user with multiple members, invitations and separated data scopes
- Inventory with locations, photos, QR codes and search
- Supplies, minimum quantities and shopping-list handover
- Shopping list with quick capture, AI categorisation, recipe ingredients and configurable reminders
- Medicine cabinet with stock, expiry dates, documents and leaflets
- Device management with location, inventory links, documents and maintenance
- Household tasks, projects, residents and activity history

### Budget, Invoices and Documents

- Household and private accounts
- Budgets, categories, limits, savings goals, cash-flow preview and recurring entries
- Saved filter views, bulk editing and budget-entry archiving
- Cost splitting and household settlement
- Invoice scanner with PDF/image upload, image optimisation, OCR, line-item analysis and review
- Links between invoices, budget entries and original documents
- Document archive with AI analysis and knowledge entries
- Contracts, insurance, deadlines and reminders

### Vehicle Module

- Multiple vehicles with master data, mileage history and photo galleries
- Cover image, gallery view and central document links
- Fuel entries with **full**, **partial** and **unknown** tank status
- Full-tank consumption calculation including intermediate refuelling
- Automatic, duplicate-safe import of fuel receipts from the budget
- Review inbox for receipts that cannot be assigned safely
- Costs, services, tyres, tasks, parts, documents and reminders
- AI analysis of service invoices, garage receipts and inspection reports
- Structured service line items with categories, prices and confidence
- TCO, cost per kilometre, consumption and vehicle comparison
- Charts plus filtered CSV and PDF exports

### Cookbook, Books and Knowledge

- Manual recipes and queued imports from web pages or video sources
- Local parser for metadata, subtitles, audio and transcription
- Import status and history, review, duplicate warnings, translation and quality checks
- Recipe images, nutrition and costs
- Meal planning, cooking mode and cooking logs
- Ingredient handover to shopping lists and supplies
- Book management with ISBN, cover and duplicate detection
- Household knowledge from manual entries and document analysis

### Platform Features

- German and English (UK) UI
- Dark and light themes
- Responsive desktop and mobile navigation
- Customisable favourites in the mobile navigation
- Guided onboarding tours for core Home modules
- Installable PWA for iOS, Android and desktop
- Push notifications through Web Push and VAPID
- Global AI assistant with household context
- OpenAI or optional local Ollama with separate model choices for general AI, image analysis and cookbook workflows
- Household RLS for shared data
- Role model with `admin` for household settings and `member` for shared use

## Technology

| Area | Technology |
| --- | --- |
| Frontend | React 18, Create React App, React Router |
| Styling and UI | Tailwind CSS, Framer Motion, Lucide |
| Charts and PDF | Chart.js, React PDF Renderer |
| Backend | Supabase, PostgreSQL, Auth, Storage, Realtime |
| Server logic | Supabase Edge Functions with Deno |
| Local services | Document OCR with FastAPI/Uvicorn; recipe processing with Flask/Gunicorn, yt-dlp and faster-whisper |
| Internationalisation | i18next, German and English (UK) |
| Operations | Docker, Docker Compose, Nginx |

## Requirements

- Linux server, preferably Ubuntu 22.04 or Debian 12
- Docker 24 or newer
- Docker Compose 2.20 or newer
- Git, curl and OpenSSL
- Node.js 16 or newer for the installer and key generation; Node.js 20 recommended
- At least 2 CPU cores, 4 GB RAM and 20 GB storage
- At least 8 GB RAM recommended for local Ollama
- Domain and HTTPS for production, push and secure authentication

Node.js 20 is also recommended for local frontend development.

## Installation

### Management Script

```bash
git clone https://github.com/iEnki/Home-Organizer.git
cd Home-Organizer
chmod +x scripts/manage_en.sh
./scripts/manage_en.sh
```

Choose **Installation** in the menu:

| Mode | Includes |
| --- | --- |
| Fullstack | App, Supabase, storage, Edge Functions, OCR and recipe services |
| App-only | React app connected to an existing Supabase installation |

The script also manages updates, backups, restore, SMTP, Ollama, URL/port configuration, status and logs.

Alternatively:

```bash
chmod +x scripts/install.sh
./scripts/install.sh
```

Generated `.env` and `CREDENTIALS.txt` files contain secrets and must never be published or committed.

## Database

The fullstack installer offers to apply the bundled baseline schema during installation. This manual step is only required when schema setup was skipped, the database was not ready, or app-only mode is used:

```bash
docker exec -i supabase-db psql -U postgres -d postgres < database_setup_complete.sql
```

You can also run the file in the Supabase Studio SQL editor. The schema contains tables, indexes, triggers, RPCs, storage configuration and RLS policies.

For existing installations, create a backup first and then use the dated migrations or the management-script update flow. The bundled schema is the baseline for fresh installations.

> **Known schema gap:** The current frontend references a few areas that are not yet fully consolidated into `database_setup_complete.sql`: books/lending history, cooking logs, saved calculator scenarios and budget month-close tables. `scripts/migration_2026_05_23_home_rezept_kochprotokolle.sql` adds cooking logs; complete fresh-install migrations for the other areas are currently absent from the repository. Before a production rebuild, back up the existing database and verify these tables against the target installation.

## Local Development

```bash
cp env.example umzugshelfer-pwa/.env
cd umzugshelfer-pwa
npm install
npm start
```

The app runs at <http://localhost:3000> by default.

Important checks:

```bash
npm test -- --watchAll=false
npm run i18n:check
npm run build
```

## Configuration

### Frontend

Minimum configuration:

```env
REACT_APP_SUPABASE_URL=https://supa.example.com
REACT_APP_SUPABASE_ANON_KEY=<anon-key>
REACT_APP_PASSWORD_RESET_REDIRECT_URL=https://app.example.com/update-password
REACT_APP_VAPID_PUBLIC_KEY=<vapid-public-key>
```

Never expose a service-role key in the frontend.

The current production Dockerfile does not pass the reset variable as a build argument; Docker builds therefore use `<App-Origin>/update-password` automatically. The variable applies to local builds.

### AI and Document Analysis

The household configuration selects OpenAI or Ollama. Household admins manage providers, API keys and models in the profile; keys are protected through column-level security and read server-side by Edge Functions. General AI, image analysis and cookbook workflows may use separate models. Ollama thinking behaviour can be controlled separately for cookbook processing.

Existing installations need the following idempotent migration for the current model-selection support:

```bash
docker exec -i supabase-db psql -U postgres -d postgres < scripts/hotfix_2026_06_18_ki_model_selection.sql
```

Fullstack deployments also configure:

```env
DOCUMENT_OCR_URL=http://document-ocr-service:8091
DOCUMENT_OCR_INTERNAL_TOKEN=<random-secret>
RECIPE_PARSER_URL=http://recipe-source-parser:8090
RECIPE_PARSER_INTERNAL_TOKEN=<random-secret>
```

These internal services must not be exposed publicly without protection.

Ollama can be configured through the management menu or started directly:

```bash
docker compose -f docker-compose.full.yml --profile ollama up -d
docker exec ollama ollama pull llama3.2
```

The current Compose profile sets `gpus: all` and therefore requires a working NVIDIA container runtime. Remove that entry or provide a separate CPU profile for CPU-only operation.

### Push Notifications

The installer generates VAPID keys. To enable push:

1. Open the app over HTTPS.
2. Enable push in the profile.
3. Accept the browser permission.

iOS requires an installed PWA and at least iOS 16.4.

Manual test pushes work after VAPID activation. Scheduled reminders additionally require a recurring `check-reminders` invocation through `pg_cron`/`pg_net` or an external scheduler; the installer does not currently create this schedule.

### SMTP and Invitations

For email confirmation, password reset and household invitations:

```env
SMTP_ADMIN_EMAIL=no-reply@example.com
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=<user>
SMTP_PASS=<password>
SMTP_SENDER_NAME=Home Organizer
```

Use `scripts/manage_en.sh` to maintain this configuration. Confirmation, password reset and household invitations currently use Supabase Auth/GoTrue and its SMTP settings. `RESEND_API_KEY` is reserved in the Compose setup but is not used by the current invitation flow.

## Updates and Backups

Recommended:

```bash
./scripts/manage_en.sh
```

Create a fullstack backup before schema or version updates. The management script stores database, storage and configuration backups under `backups/`.

Manual app rebuild:

```bash
git pull
docker compose -f docker-compose.full.yml build --no-cache umzugsplaner-app
docker compose -f docker-compose.full.yml up -d --force-recreate umzugsplaner-app
```

When publishing Supabase/Kong through a custom domain, the outermost reverse
proxy must allow at least 210 seconds for AI image-analysis requests
(`proxy_read_timeout`, `proxy_send_timeout`, `send_timeout`). After changes to
`docker-compose.full.yml`, recreate the Functions container with
`--force-recreate`. `scripts/manage_en.sh` performs and verifies both steps
automatically.

## Project Structure

```text
Home-Organizer/
|-- scripts/                     Installation, updates and SQL migrations
|-- services/
|   |-- document-ocr-service/    Local PDF/image OCR
|   `-- recipe-source-parser/    Web/video recipe processing
|-- supabase/functions/          Edge Functions for AI, documents, imports, push and invitations
|-- umzugshelfer-pwa/            React PWA
|   |-- public/                  PWA files and assets
|   `-- src/                     Components, hooks, i18n and utilities
|-- database_setup_complete.sql  Complete schema for fresh installations
|-- docker-compose.yml           App-only deployment
|-- docker-compose.full.yml      Complete stack
|-- env.example                  App-only example
`-- .env.full.example            Fullstack example
```

## Troubleshooting

```bash
docker compose -f docker-compose.full.yml ps
docker compose -f docker-compose.full.yml logs -f umzugsplaner-app
docker compose -f docker-compose.full.yml logs -f functions
docker compose -f docker-compose.full.yml logs -f db
docker compose -f docker-compose.full.yml logs -f document-ocr-service
docker compose -f docker-compose.full.yml logs -f recipe-source-parser
```

Common causes:

- **Outdated UI:** Rebuild the app and clear the browser/PWA cache.
- **AI or OCR failure:** Check provider configuration, Edge Function logs and internal service tokens.
- **Vision stops after exactly 60/90 seconds:** Raise the outer reverse-proxy timeout to at least 210 seconds.
- **Push failure:** Check HTTPS, permission, VAPID values and `send-push`.
- **Missing email:** Check SMTP/Resend configuration and auth logs.
- **Empty modules or 401/403:** Check household membership, RLS and the database version.
- **Supabase 502:** Inspect Kong, REST, Functions and target-service logs; a browser CORS message can merely be a consequence of the gateway error.

## Security

- Keep `.env`, `CREDENTIALS.txt`, database dumps and storage backups private.
- Only use the public anon key in the browser.
- Protect service-role, SMTP, VAPID private and internal service keys.
- Publish production deployments over HTTPS only.
- Create tested backups before updates.

## License

[PolyForm Noncommercial License 1.0.0](LICENSE). Free for noncommercial use: private households, charitable organizations, educational institutions and public bodies may run and modify this software. Commercial use — including reselling it, offering it as a paid service, or using it inside a for-profit company — is not permitted without a separate license. For commercial licensing, please open an issue.

This is source-available, not open source in the OSI sense.

Versions released before this change remain available under the MIT license, which cannot be revoked retroactively.
