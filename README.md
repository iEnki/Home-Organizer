# Home Organizer & Moving Planner PWA

Self-hosted Progressive Web App for planning a move and managing a household after the move.

Demo: https://umzug.enkination.de/  
Demo login: `demo@demo.com` / `Demo1234`

## Documentation

- [Deutsch](README.de.md)
- [English](README.en.md)

## Short Description

The app combines two working modes in one installable PWA:

- **Moving Planner** for packing lists, QR-coded boxes, tasks, appointments, budgets, renovation planning and moving calculators.
- **Home Organizer** for inventory, documents, invoices, contracts, insurance, supplies, shopping lists, cookbook recipes, devices, tasks, projects, household members, budgets, books and knowledge management.

Recent versions add bilingual UI support for German and English (UK), localized PWA manifests, a global AI assistant, improved push reminders, invoice and document intelligence, a cookbook with web/video recipe import, recipe-aware shopping lists and stock handover, household-level settings and many Home Organizer modules.

## Highlights

- AI-assisted cookbook for manual recipes, web pages and video sources.
- Local parser service for metadata, subtitles, audio extraction and transcription; temporary media files are cleaned up automatically.
- Saved recipes and shopping-list entries are translated on demand and cached per locale.
- Recipe ingredients can be transferred to the shopping list; completed grocery items can be added to supplies.
- Global Home Organizer search includes cookbook recipes.

## Tech Stack

React 18, Tailwind CSS, Supabase, PostgreSQL, Supabase Edge Functions, Docker, Web Push, OpenAI API and optional Ollama.

## Quick Start

```bash
git clone https://github.com/iEnki/Home-Organizer.git
cd Home-Organizer
chmod +x scripts/manage.sh
./scripts/manage.sh
```

After installation, run `database_setup_complete.sql` in the Supabase SQL editor, create the first user account and set up the first household.

For the full installation guide, use the language-specific documentation above.
