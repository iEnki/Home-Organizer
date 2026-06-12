# Home Organizer & Moving Planner

Self-hosted Progressive Web App for organising a move and managing everyday household life.

[Deutsch](README.de.md) | [English](README.en.md)

Demo: <https://umzug.enkination.de/><br>
Demo login: `demo@demo.com` / `Demo1234`

## What It Includes

- **Moving Planner:** tasks, packing lists with QR codes, calendar, contacts, documents, budgets, renovation planning, calculators and exports.
- **Home Organizer:** inventory, supplies, shopping lists, medicine cabinet, devices, vehicle management, household tasks, projects and activity history.
- **Finance and documents:** household budgets, accounts, savings goals, invoice scanning, OCR, document archive, contracts and insurance.
- **Knowledge and food:** cookbook, meal planning, web/video recipe import, shopping-list handover, books and a household knowledge base.
- **Vehicle cockpit:** fuel, costs, services, tyres, documents, reminders, vehicle photos, statistics, CSV/PDF export and AI-assisted service-document analysis.
- **Shared platform:** multiple households, invitations, role-based data access, German and English (UK), push notifications, dark/light themes and an optional AI assistant.

## Technology

React 18, Tailwind CSS, Supabase/PostgreSQL, Supabase Edge Functions, Docker Compose, Chart.js, Framer Motion, Web Push, OpenAI and optional Ollama.

The fullstack deployment also includes local services for document OCR and recipe-source processing.

## Quick Start

```bash
git clone https://github.com/iEnki/Home-Organizer.git
cd Home-Organizer
chmod +x scripts/manage.sh
./scripts/manage.sh
```

Choose installation mode in the menu:

- **Fullstack:** app, Supabase, storage, Edge Functions, OCR and recipe services.
- **App-only:** frontend connected to an existing Supabase project.

For a fresh database, apply [`database_setup_complete.sql`](database_setup_complete.sql). Never commit the generated `.env` or `CREDENTIALS.txt`.

## Documentation

- [German installation and feature guide](README.de.md)
- [English installation and feature guide](README.en.md)
- [Frontend development guide](umzugshelfer-pwa/README.md)
- [Extended installation notes](INSTALL.md)

## License

MIT, see [`umzugshelfer-pwa/LICENSE`](umzugshelfer-pwa/LICENSE).
