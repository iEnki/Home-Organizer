# Umzugshelfer Home Organizer — Supabase Setup

SQL für den Supabase SQL Editor ausführen.
Setzt `supabase_setup.md` voraus (insbesondere `set_updated_at()` Funktion).

---

## 1. Neue Home Organizer Tabellen

```sql
-- ============================================================
-- HOME ORGANIZER: Neue Tabellen
-- Voraussetzung: supabase_setup.md wurde bereits ausgeführt
-- ============================================================

-- 1. home_orte: Oberste Standortebene
--    Beispiele: Wohnung, Keller, Garage, Dachboden
create table if not exists public.home_orte (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references auth.users(id) on delete cascade not null,
  name       text not null,
  typ        text default 'Wohnung',
  adresse    text,
  notizen    text,
  farbe      text,
  symbol     text,
  migriert_von_kiste_id uuid references public.pack_kisten(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_home_orte_user_id on public.home_orte(user_id);

drop trigger if exists set_home_orte_updated_at on public.home_orte;
create trigger set_home_orte_updated_at
  before update on public.home_orte
  for each row execute function public.set_updated_at();

alter table public.home_orte enable row level security;

drop policy if exists home_orte_crud_own on public.home_orte;
create policy home_orte_crud_own
  on public.home_orte for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);


-- 2. home_lagerorte: Sub-Standorte (Regal, Schrank, Lade, Kiste, Box)
--    Hierarchie via parent_id (Selbstreferenz)
create table if not exists public.home_lagerorte (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users(id) on delete cascade not null,
  ort_id      uuid references public.home_orte(id) on delete cascade not null,
  parent_id   uuid references public.home_lagerorte(id) on delete cascade,
  name        text not null,
  typ         text default 'Regal',
  beschreibung text,
  qr_code_wert text unique,
  foto_pfad   text,
  position    integer default 0,
  farbe       text,
  migriert_von_kiste_id uuid references public.pack_kisten(id) on delete set null,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

create index if not exists idx_home_lagerorte_user_id on public.home_lagerorte(user_id);
create index if not exists idx_home_lagerorte_ort_id on public.home_lagerorte(ort_id);
create index if not exists idx_home_lagerorte_parent_id on public.home_lagerorte(parent_id);

drop trigger if exists set_home_lagerorte_updated_at on public.home_lagerorte;
create trigger set_home_lagerorte_updated_at
  before update on public.home_lagerorte
  for each row execute function public.set_updated_at();

alter table public.home_lagerorte enable row level security;

drop policy if exists home_lagerorte_crud_own on public.home_lagerorte;
create policy home_lagerorte_crud_own
  on public.home_lagerorte for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);


-- 3. home_objekte: Inventarobjekte
--    Status: in_verwendung | eingelagert | verliehen | defekt | entsorgt
create table if not exists public.home_objekte (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid references auth.users(id) on delete cascade not null,
  lagerort_id         uuid references public.home_lagerorte(id) on delete set null,
  ort_id              uuid references public.home_orte(id) on delete set null,
  name                text not null,
  beschreibung        text,
  kategorie           text,
  status              text default 'in_verwendung',
  menge               integer default 1,
  tags                text[],
  fotos               text[],
  seriennummer        text,
  kaufdatum           date,
  kaufpreis           numeric(10,2),
  garantie_bis        date,
  zugriffshaeufigkeit text default 'selten',
  zuletzt_zugegriffen timestamptz,
  verliehen_an        text,
  verliehen_am        date,
  migriert_von_gegenstand_id uuid references public.pack_gegenstaende(id) on delete set null,
  created_at          timestamptz default now(),
  updated_at          timestamptz default now()
);

create index if not exists idx_home_objekte_user_id on public.home_objekte(user_id);
create index if not exists idx_home_objekte_lagerort_id on public.home_objekte(lagerort_id);
create index if not exists idx_home_objekte_ort_id on public.home_objekte(ort_id);
create index if not exists idx_home_objekte_status on public.home_objekte(status);
create index if not exists idx_home_objekte_tags on public.home_objekte using gin(tags);

drop trigger if exists set_home_objekte_updated_at on public.home_objekte;
create trigger set_home_objekte_updated_at
  before update on public.home_objekte
  for each row execute function public.set_updated_at();

alter table public.home_objekte enable row level security;

drop policy if exists home_objekte_crud_own on public.home_objekte;
create policy home_objekte_crud_own
  on public.home_objekte for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);


-- 4. home_vorraete: Haushaltsvorräte mit Mindestbestand
create table if not exists public.home_vorraete (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid references auth.users(id) on delete cascade not null,
  lagerort_id     uuid references public.home_lagerorte(id) on delete set null,
  name            text not null,
  kategorie       text default 'Haushalt',
  einheit         text default 'Stück',
  bestand         numeric(10,2) default 0,
  mindestmenge    numeric(10,2) default 1,
  ablaufdatum     date,
  notizen         text,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

create index if not exists idx_home_vorraete_user_id on public.home_vorraete(user_id);

drop trigger if exists set_home_vorraete_updated_at on public.home_vorraete;
create trigger set_home_vorraete_updated_at
  before update on public.home_vorraete
  for each row execute function public.set_updated_at();

alter table public.home_vorraete enable row level security;

drop policy if exists home_vorraete_crud_own on public.home_vorraete;
create policy home_vorraete_crud_own
  on public.home_vorraete for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);


-- 5. home_einkaufliste: Einkaufsliste (manuell + auto aus Vorräten)
create table if not exists public.home_einkaufliste (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users(id) on delete cascade not null,
  vorrat_id     uuid references public.home_vorraete(id) on delete set null,
  name          text not null,
  menge         numeric(10,2) default 1,
  einheit       text default 'Stück',
  kategorie     text,
  erledigt      boolean default false,
  erledigt_am   timestamptz,
  notizen       text,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

create index if not exists idx_home_einkaufliste_user_id on public.home_einkaufliste(user_id);
create index if not exists idx_home_einkaufliste_erledigt on public.home_einkaufliste(erledigt);

drop trigger if exists set_home_einkaufliste_updated_at on public.home_einkaufliste;
create trigger set_home_einkaufliste_updated_at
  before update on public.home_einkaufliste
  for each row execute function public.set_updated_at();

alter table public.home_einkaufliste enable row level security;

drop policy if exists home_einkaufliste_crud_own on public.home_einkaufliste;
create policy home_einkaufliste_crud_own
  on public.home_einkaufliste for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);


-- 6. home_geraete: Geräte- und Wartungsmanager
create table if not exists public.home_geraete (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid references auth.users(id) on delete cascade not null,
  lagerort_id       uuid references public.home_lagerorte(id) on delete set null,
  name              text not null,
  hersteller        text,
  modell            text,
  seriennummer      text,
  kaufdatum         date,
  kaufpreis         numeric(10,2),
  garantie_bis      date,
  naechste_wartung  date,
  wartungsintervall_monate integer,
  notizen           text,
  handbuch_pfad     text,
  foto_pfad         text,
  dokument_ids      uuid[],
  created_at        timestamptz default now(),
  updated_at        timestamptz default now()
);

create index if not exists idx_home_geraete_user_id on public.home_geraete(user_id);
create index if not exists idx_home_geraete_naechste_wartung on public.home_geraete(naechste_wartung);

drop trigger if exists set_home_geraete_updated_at on public.home_geraete;
create trigger set_home_geraete_updated_at
  before update on public.home_geraete
  for each row execute function public.set_updated_at();

alter table public.home_geraete enable row level security;

drop policy if exists home_geraete_crud_own on public.home_geraete;
create policy home_geraete_crud_own
  on public.home_geraete for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);


-- 7. home_wartungen: Wartungsprotokoll
create table if not exists public.home_wartungen (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users(id) on delete cascade not null,
  geraet_id     uuid references public.home_geraete(id) on delete cascade not null,
  datum         date not null default current_date,
  typ           text default 'Wartung',
  beschreibung  text,
  kosten        numeric(10,2),
  durchgefuehrt_von text,
  naechste_faelligkeit date,
  notizen       text,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

create index if not exists idx_home_wartungen_user_id on public.home_wartungen(user_id);
create index if not exists idx_home_wartungen_geraet_id on public.home_wartungen(geraet_id);

drop trigger if exists set_home_wartungen_updated_at on public.home_wartungen;
create trigger set_home_wartungen_updated_at
  before update on public.home_wartungen
  for each row execute function public.set_updated_at();

alter table public.home_wartungen enable row level security;

drop policy if exists home_wartungen_crud_own on public.home_wartungen;
create policy home_wartungen_crud_own
  on public.home_wartungen for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);


-- 8. home_projekte: Haushaltsprojekte
create table if not exists public.home_projekte (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users(id) on delete cascade not null,
  name          text not null,
  typ           text default 'Sonstiges',
  status        text default 'geplant',
  beschreibung  text,
  startdatum    date,
  zieldatum     date,
  budget        numeric(10,2),
  farbe         text,
  notizen       text,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

create index if not exists idx_home_projekte_user_id on public.home_projekte(user_id);

drop trigger if exists set_home_projekte_updated_at on public.home_projekte;
create trigger set_home_projekte_updated_at
  before update on public.home_projekte
  for each row execute function public.set_updated_at();

alter table public.home_projekte enable row level security;

drop policy if exists home_projekte_crud_own on public.home_projekte;
create policy home_projekte_crud_own
  on public.home_projekte for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
```

---

## 2. Bestehende Tabellen erweitern

```sql
-- todo_aufgaben: Modus + Projekt-Verknüpfung
alter table public.todo_aufgaben
  add column if not exists app_modus text default 'umzug';

alter table public.todo_aufgaben
  add column if not exists home_projekt_id uuid references public.home_projekte(id) on delete set null;

-- budget_posten: Modus + Projekt-Verknüpfung
alter table public.budget_posten
  add column if not exists app_modus text default 'umzug';

alter table public.budget_posten
  add column if not exists home_projekt_id uuid references public.home_projekte(id) on delete set null;

-- user_profile: App-Modus für Cross-Device-Sync
alter table public.user_profile
  add column if not exists app_modus text default 'umzug';
```

---

## 3. Storage Bucket für Home-Fotos

```sql
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'home-fotos',
  'home-fotos',
  false,
  10485760,
  array['image/jpeg','image/png','image/gif','image/webp']
)
on conflict (id) do nothing;

drop policy if exists storage_home_fotos_insert on storage.objects;
create policy storage_home_fotos_insert on storage.objects for insert
  with check (
    bucket_id = 'home-fotos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists storage_home_fotos_select on storage.objects;
create policy storage_home_fotos_select on storage.objects for select
  using (
    bucket_id = 'home-fotos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists storage_home_fotos_delete on storage.objects;
create policy storage_home_fotos_delete on storage.objects for delete
  using (
    bucket_id = 'home-fotos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
```

---

## 4. Phase 2 Erweiterungen

```sql
-- Dokumenten-Verknüpfung an home_geraete (Phase 2)
alter table public.home_geraete
  add column if not exists verknuepfte_dokument_ids uuid[] default '{}';
```

---

## 5. Phase 3 Erweiterungen

```sql
-- ============================================================
-- Phase 3: Verlauf, Wissensdatenbank, Cross-Device Sync
-- ============================================================

-- 1. home_verlauf: Aktivitätsprotokoll für alle Home-Aktionen
create table if not exists public.home_verlauf (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid references auth.users(id) on delete cascade not null,
  tabelle         text not null,           -- z.B. "home_objekte"
  datensatz_name  text not null,           -- Anzeigename des betroffenen Datensatzes
  aktion          text not null            -- "erstellt" | "geaendert" | "geloescht"
    check (aktion in ('erstellt', 'geaendert', 'geloescht')),
  created_at      timestamptz default now() not null
);

create index if not exists idx_home_verlauf_user_id on public.home_verlauf(user_id);
create index if not exists idx_home_verlauf_created_at on public.home_verlauf(created_at desc);

alter table public.home_verlauf enable row level security;

drop policy if exists home_verlauf_crud_own on public.home_verlauf;
create policy home_verlauf_crud_own
  on public.home_verlauf for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 2. home_wissen: Wissensdatenbank / Wiki-Einträge
create table if not exists public.home_wissen (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users(id) on delete cascade not null,
  titel       text not null,
  inhalt      text,
  kategorie   text default 'Notizen',
  tags        text[] default '{}',
  created_at  timestamptz default now() not null,
  updated_at  timestamptz default now() not null
);

create index if not exists idx_home_wissen_user_id on public.home_wissen(user_id);

drop trigger if exists set_home_wissen_updated_at on public.home_wissen;
create trigger set_home_wissen_updated_at
  before update on public.home_wissen
  for each row execute function public.set_updated_at();

alter table public.home_wissen enable row level security;

drop policy if exists home_wissen_crud_own on public.home_wissen;
create policy home_wissen_crud_own
  on public.home_wissen for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 3. Cross-Device Sync: app_modus in user_profile speichern
alter table public.user_profile
  add column if not exists app_modus text default 'umzug'
    check (app_modus in ('umzug', 'home'));
```

---

## 6. Feature-Paket: Wiederkehrende Zahlungen, KI-Assistent, Kalender

```sql
-- ============================================================
-- budget_posten: Wiederkehrende Zahlungen (HomeBudget Phase 4)
-- Ermöglicht: Checkbox "Wiederkehrend" + Intervall + Auto-Generierung
-- ============================================================
alter table public.budget_posten
  add column if not exists wiederholen    boolean default false,
  add column if not exists intervall      text    default null
    check (intervall is null or intervall in
      ('Täglich','Wöchentlich','Monatlich','Vierteljährlich','Jährlich')),
  add column if not exists naechstes_datum date   default null,
  add column if not exists serie_id        uuid   default null;

create index if not exists idx_budget_posten_wiederholen
  on public.budget_posten(user_id, wiederholen)
  where wiederholen = true;


-- ============================================================
-- user_profile: OpenAI API-Key für KI-Assistenten (UserProfile)
-- Falls die Spalte noch nicht existiert
-- ============================================================
alter table public.user_profile
  add column if not exists openai_api_key text default null;


-- ============================================================
-- todo_aufgaben: Index für Kalender-Filter nach app_modus
-- (KalenderUebersicht filtert Aufgaben nach app_modus)
-- ============================================================
create index if not exists idx_todo_aufgaben_app_modus_faelligkeit
  on public.todo_aufgaben(user_id, app_modus, faelligkeitsdatum)
  where erledigt = false and faelligkeitsdatum is not null;
```

---

## 7. Phase 5 – Haushaltsmitglieder (Bewohner)

```sql
-- ============================================================
-- HOME ORGANIZER: Haushaltsmitglieder
-- Ermöglicht es, Aufgaben und Budgetposten konkreten Personen
-- im Haushalt zuzuordnen.
-- ============================================================

-- Neue Tabelle: home_bewohner
CREATE TABLE IF NOT EXISTS public.home_bewohner (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  farbe      TEXT NOT NULL DEFAULT '#10B981',
  emoji      TEXT DEFAULT '👤',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.home_bewohner ENABLE ROW LEVEL SECURITY;

CREATE POLICY "home_bewohner_user_own" ON public.home_bewohner
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_home_bewohner_user_id ON public.home_bewohner(user_id);

-- Migration: bewohner_id in todo_aufgaben (Aufgaben zuweisen)
ALTER TABLE public.todo_aufgaben
  ADD COLUMN IF NOT EXISTS bewohner_id UUID REFERENCES public.home_bewohner(id) ON DELETE SET NULL;

-- Migration: bewohner_id in budget_posten (Ausgaben/Einnahmen zuweisen)
ALTER TABLE public.budget_posten
  ADD COLUMN IF NOT EXISTS bewohner_id UUID REFERENCES public.home_bewohner(id) ON DELETE SET NULL;
```

---

## 8. Schema neu laden

```sql
select pg_notify('pgrst', 'reload schema');
```
