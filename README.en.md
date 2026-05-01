# Moving Planner & Home Organizer PWA

A self-hosted Progressive Web App for moving, household management, documents, finances and shared organisation.

Demo: https://umzug.enkination.de/  
Demo login: `demo@demo.com` / `Demo1234`

## Contents

- [Overview](#overview)
- [New Features](#new-features)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Requirements](#requirements)
- [Installation](#installation)
- [Database Setup](#database-setup)
- [Configuration](#configuration)
- [Updates and Maintenance](#updates-and-maintenance)
- [Project Structure](#project-structure)
- [Troubleshooting](#troubleshooting)

## Overview

The app combines two workspaces:

- **Moving Planner** for planning, organising and completing a move.
- **Home Organizer** for everyday household management after the move.

It is installable as a PWA, works on desktop and mobile devices and can be fully self-hosted. Supabase provides auth, database, storage, realtime features and Edge Functions. AI features can use OpenAI or a local Ollama server.

## New Features

- German and English UI with language selection in the profile
- Localized PWA manifests for German and English (UK)
- Per-user locale settings with localized date and number formatting
- Global AI assistant with household context
- More reliable push reminders and reminder state handling
- Home budget with categories, limits, savings goals, recurring entries and settlement features
- Invoice analysis with line items, date synchronization and budget assignment
- Document archive with AI analysis, knowledge entries, contracts and insurance records
- Book library with ISBN lookup, cover lookup and duplicate detection
- Guided tours and onboarding for Home Organizer modules
- Household-level settings, invitations and multi-household support

## Features

### Moving Planner

- Dashboard with tasks, appointments and progress
- Packing list with QR codes, photos, rooms, categories and AI support
- To-do lists with priorities, due dates, phases and AI capture
- Budget tracker for expenses, categories and partial payments
- Calendar, contacts, documents and moving timeline
- Renovation and material planning
- Calculators for paint, wallpaper, flooring, insulation, boxes, volume and transport costs
- Cost comparison, scenarios and PDF/export features

### Home Organizer

- Dashboard with quick access and household overview
- Inventory with locations, QR codes, photos and search
- Supplies with minimum quantities, categories and shopping list integration
- Device management with maintenance planning
- Residents, household tasks, projects and activity history
- Finance manager with accounts, budgets, limits, goals, splits and statistics
- Invoices, documents, contracts and insurance records
- Knowledge base with manual and document-based entries
- Book library with search, import, covers and duplicate checks
- Global search across modules
- Step-by-step tours per module

### Cross-Cutting

- Multi-household support with invitations and separated data scopes
- Supabase Auth with password reset and optional email confirmation
- Push notifications for reminders, deadlines, supplies and maintenance
- Dark/light mode
- Installable PWA for iOS, Android and desktop
- OpenAI or Ollama as AI provider
- Docker deployment as app-only or fullstack setup

## Tech Stack

| Area | Technology |
| --- | --- |
| Frontend | React 18, Create React App, JavaScript |
| Styling | Tailwind CSS |
| Backend | Supabase, PostgreSQL, Auth, Storage, Edge Functions |
| Internationalization | i18next, react-i18next |
| Push | Web Push API, VAPID, Supabase Edge Functions |
| AI | OpenAI API, optional Ollama |
| Deployment | Docker, Docker Compose, Nginx |

## Requirements

| Component | Minimum |
| --- | --- |
| CPU | 2 cores |
| RAM | 4 GB, 8 GB recommended with Ollama |
| Storage | 20 GB |
| OS | Ubuntu 22.04, Debian 12 or newer |

Required software:

```bash
docker --version
docker compose version
node --version
openssl version
```

Recommended versions: Docker 24+, Docker Compose 2.20+, Node.js 20.

## Installation

### Recommended: Management Script

```bash
git clone https://github.com/iEnki/Home-Organizer.git
cd Home-Organizer
chmod +x scripts/manage_en.sh
./scripts/manage_en.sh
```

Choose **[1] Installation** in the menu. The English management script is the recommended installation path because it combines installation, updates, backups, SMTP, Ollama, configuration and logs in one tool.

The installation supports two modes:

| Mode | Description |
| --- | --- |
| Fullstack | Installs Supabase, database, Edge Functions and the app together via Docker |
| App-only | Installs only the React app and connects it to an existing Supabase instance |

The script generates keys, creates `.env`, configures VAPID and writes important credentials to `CREDENTIALS.txt`.

### Direct Installer

You can also start the installer directly:

```bash
chmod +x scripts/install.sh
./scripts/install.sh
```

Use `manage_en.sh` for later operations.

Important menu tasks:

- Installation and update
- Uninstall
- Backup and restore
- SMTP configuration
- Ollama configuration
- App URL, port and invitation link settings
- Status and logs
- Docker cleanup

### Local Development

```bash
cp env.example umzugshelfer-pwa/.env
cd umzugshelfer-pwa
npm install
npm start
```

The app runs at `http://localhost:3000`.

## Database Setup

After the first start, apply the database schema in Supabase.

### Supabase Studio

1. Open Studio, for example `http://localhost:8000`
2. Sign in with the credentials from `.env` or `CREDENTIALS.txt`
3. Open the SQL editor
4. Run the contents of `database_setup_complete.sql`

### Command Line

```bash
docker exec -i supabase-db psql -U postgres -d postgres < database_setup_complete.sql
```

## Configuration

### Push Notifications

Push requires VAPID keys. `install.sh`, `manage.sh` and `manage_en.sh` generate them automatically.

Enable push in the app:

1. Open the app over HTTPS
2. Open the profile
3. Enable push notifications
4. Confirm the browser permission prompt

iOS requires the installed PWA on the home screen and at least iOS 16.4.

### AI Provider

OpenAI:

- Add the API key in profile AI settings
- Requests are proxied server-side through Supabase Edge Functions

Ollama:

```bash
docker compose -f docker-compose.full.yml --profile ollama up -d
docker exec ollama ollama pull llama3.2
```

Then select the Ollama URL and model in the app.

### SMTP

For email confirmation, invitations and password reset:

```env
SMTP_ADMIN_EMAIL=no-reply@example.com
SMTP_HOST=smtp.mailgun.org
SMTP_PORT=587
SMTP_USER=postmaster@example.com
SMTP_PASS=your-smtp-password
SMTP_SENDER_NAME=Moving Planner
```

Restart the auth container afterwards:

```bash
docker compose -f docker-compose.full.yml restart supabase-auth
```

### Nginx Reverse Proxy

HTTPS is recommended for production:

```nginx
server {
    listen 443 ssl;
    server_name move.example.com;

    ssl_certificate     /etc/letsencrypt/live/move.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/move.example.com/privkey.pem;

    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## Updates and Maintenance

Recommended:

```bash
./scripts/manage_en.sh
```

Manual update:

```bash
git pull
docker compose -f docker-compose.full.yml build --no-cache umzugsplaner-app
docker compose -f docker-compose.full.yml up -d --force-recreate umzugsplaner-app
```

Update Browserslist data explicitly:

```bash
./scripts/manage_en.sh maintenance browserslist
```

This updates `caniuse-lite` and runs a frontend build afterwards.

## Project Structure

```text
umzughelfer/
├── scripts/                    # Installation, update, backup, maintenance
├── supabase/functions/          # Edge Functions
├── umzugshelfer-pwa/            # React PWA
│   ├── public/                  # Manifest, service worker, assets
│   └── src/
│       ├── components/          # App modules
│       ├── contexts/            # App, theme, locale and household contexts
│       ├── i18n/                # German and English translations
│       ├── hooks/               # Reusable React hooks
│       └── utils/               # Budget, AI, documents, push, formatting
├── database_setup_complete.sql  # Complete database schema
├── docker-compose.yml           # App-only setup
├── docker-compose.full.yml      # Fullstack setup
├── env.example                  # App-only example configuration
└── .env.full.example            # Fullstack example configuration
```

## Troubleshooting

View logs:

```bash
docker compose -f docker-compose.full.yml logs -f
docker compose -f docker-compose.full.yml logs -f supabase-db
docker compose -f docker-compose.full.yml logs -f supabase-auth
docker compose -f docker-compose.full.yml logs -f supabase-edge-functions
docker compose -f docker-compose.full.yml logs -f umzugsplaner-pwa-container
```

Common issues:

- **Push does not work:** Check HTTPS, browser permission, VAPID keys and Edge Function environment variables.
- **Emails are not sent:** Check SMTP values in `.env` and restart `supabase-auth`.
- **Supabase Studio is unavailable:** Check container status and `supabase-analytics` logs.
- **Ollama does not respond:** Test `docker exec ollama ollama list` and `curl http://localhost:11434/api/tags`.
- **The app still shows old content:** Rebuild the app container and clear the browser/PWA cache.

## License

MIT. See `umzugshelfer-pwa/LICENSE`.
