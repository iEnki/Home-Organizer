# Moving Planner & Home Organizer

A self-hosted Progressive Web App for move planning, household organisation, finances, documents and shared management.

[Deutsche Version](README.de.md)

Demo: <https://umzug.enkination.de/><br>
Demo login: `demo@demo.com` / `Demo1234`

## Overview

The application combines two workspaces:

- **Moving Planner** for planning, completing and closing a move.
- **Home Organizer** for ongoing household management.

The app is responsive, installable as a PWA and fully self-hostable. Supabase provides authentication, PostgreSQL, storage, realtime and Edge Functions. AI features use OpenAI or Ollama according to the household configuration.

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

### Home Organizer

- Household dashboard with shortcuts and global search
- Multiple households, members, invitations and separated data scopes
- Inventory with locations, photos, QR codes and search
- Supplies, minimum quantities and shopping-list handover
- Shopping list with quick capture, AI categorisation and recipe ingredients
- Medicine cabinet with stock, expiry dates, documents and leaflets
- Device management with location, inventory links, documents and maintenance
- Household tasks, projects, residents and activity history

### Budget, Invoices and Documents

- Household and private accounts
- Budgets, categories, limits, savings goals and recurring entries
- Cost splitting and household settlement
- Invoice scanner with PDF/image upload, OCR, line-item analysis and review
- Links between invoices, budget entries and original documents
- Document archive with AI analysis and knowledge entries
- Contracts, insurance, deadlines and reminders

### Vehicle Module

- Multiple vehicles with master data, mileage history and photo galleries
- Cover image, gallery view and central document links
- Fuel entries with **full**, **partial** and **unknown** tank status
- Full-tank consumption calculation including intermediate refuelling
- Automatic detection of fuel receipts from the budget
- Review inbox for receipts that cannot be assigned safely
- Costs, services, tyres, tasks, parts, documents and reminders
- AI analysis of service invoices, garage receipts and inspection reports
- Structured service line items with categories, prices and confidence
- TCO, cost per kilometre, consumption and vehicle comparison
- Charts plus filtered CSV and PDF exports

### Cookbook, Books and Knowledge

- Manual recipes and imports from web pages or video sources
- Local parser for metadata, subtitles, audio and transcription
- Review, translation, quality checks, nutrition and costs
- Meal planning, cooking mode and cooking logs
- Ingredient handover to shopping lists and supplies
- Book management with ISBN, cover and duplicate detection
- Household knowledge from manual entries and document analysis

### Platform Features

- German and English (UK) UI
- Dark and light themes
- Responsive desktop and mobile navigation
- Installable PWA for iOS, Android and desktop
- Push notifications through Web Push and VAPID
- Global AI assistant with household context
- OpenAI or optional local Ollama
- Household RLS for shared data

## Technology

| Area | Technology |
| --- | --- |
| Frontend | React 18, Create React App, React Router |
| Styling and UI | Tailwind CSS, Framer Motion, Lucide |
| Charts and PDF | Chart.js, React PDF Renderer |
| Backend | Supabase, PostgreSQL, Auth, Storage, Realtime |
| Server logic | Supabase Edge Functions with Deno |
| Local services | FastAPI-based document OCR and recipe processing |
| Internationalisation | i18next, German and English (UK) |
| Operations | Docker, Docker Compose, Nginx |

## Requirements

- Linux server, preferably Ubuntu 22.04 or Debian 12
- Docker 24 or newer
- Docker Compose 2.20 or newer
- At least 2 CPU cores, 4 GB RAM and 20 GB storage
- At least 8 GB RAM recommended for local Ollama
- Domain and HTTPS for production, push and secure authentication

Node.js 20 is only needed for local frontend development and helper scripts.

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

For a fresh installation, apply the complete schema:

```bash
docker exec -i supabase-db psql -U postgres -d postgres < database_setup_complete.sql
```

You can also run the file in the Supabase Studio SQL editor. The complete schema contains tables, indexes, triggers, RPCs, storage configuration and RLS policies.

For existing installations, create a backup first and then use the dated migrations or the management-script update flow. The complete schema is intended for fresh installations.

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

### AI and Document Analysis

The household configuration selects OpenAI or Ollama. API keys are used through the intended profile settings and server-side functions.

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

### Push Notifications

The installer generates VAPID keys. To enable push:

1. Open the app over HTTPS.
2. Enable push in the profile.
3. Accept the browser permission.

iOS requires an installed PWA and at least iOS 16.4.

### SMTP and Invitations

For email confirmation, password reset and household invitations:

```env
SMTP_ADMIN_EMAIL=no-reply@example.com
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=<user>
SMTP_PASS=<password>
SMTP_SENDER_NAME=Home Organizer
RESEND_API_KEY=
```

Use `scripts/manage_en.sh` to maintain this configuration.

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

## Project Structure

```text
Home-Organizer/
|-- scripts/                     Installation, updates and SQL migrations
|-- services/
|   |-- document-ocr-service/    Local PDF/image OCR
|   `-- recipe-source-parser/    Web/video recipe processing
|-- supabase/functions/          Edge Functions
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

MIT, see [`umzugshelfer-pwa/LICENSE`](umzugshelfer-pwa/LICENSE).
