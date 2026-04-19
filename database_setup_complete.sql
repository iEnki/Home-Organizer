-- ============================================================
-- UMZUGSHELFER & HOME ORGANIZER Ã¢â‚¬â€ Komplettes Datenbank-Setup
-- Zuletzt aktualisiert: 2026-03-19
--
-- Einmalig im Supabase SQL Editor ausfÃƒÂ¼hren.
-- Das Skript ist idempotent (kann mehrfach ausgefÃƒÂ¼hrt werden).
--
-- ABSCHNITTE:
--   1. Extensions & Hilfsfunktionen
--   2. Kern-Tabellen (Umzugsmodus)
--   3. Storage Buckets (Umzugsmodus)
--   4. Materialkatalog
--   5. Home Organizer Tabellen
--   6. Tabellen-Erweiterungen (ALTER TABLE)
--   7. Storage Bucket (Home Fotos)
--   8. Push-Benachrichtigungen
--   9. Migrationen (fÃƒÂ¼r bestehende Installationen)
--  10. Multi-User Haushalt (Haushaltstabellen, RLS, Funktionen)
--  11. Schema neu laden
-- ============================================================


-- ============================================================
-- 1. EXTENSIONS & HILFSFUNKTIONEN
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Hilfsfunktion: updated_at automatisch setzen
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- Alias fÃƒÂ¼r KompatibilitÃƒÂ¤t mit ÃƒÂ¤lteren Trigger-Definitionen
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


-- ============================================================
-- 2. KERN-TABELLEN (UMZUGSMODUS)
-- ============================================================

-- Ã¢â€â‚¬Ã¢â€â‚¬ user_profile Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
CREATE TABLE IF NOT EXISTS public.user_profile (
  id               uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email            text,
  username         text,
  gesamtbudget     numeric(12,2) DEFAULT 0,
  openai_api_key   text,
  -- KI-Provider-Einstellungen (OpenAI oder eigener Ollama-Server)
  ki_provider      text DEFAULT 'openai',   -- 'openai' | 'ollama'
  ollama_base_url  text,                    -- z.B. http://192.168.1.100:11434
  ollama_model     text DEFAULT 'llama3.2', -- z.B. llama3.2, mistral, qwen2.5
  password_change_required boolean NOT NULL DEFAULT false,
  mobile_nav_config jsonb NOT NULL DEFAULT '{"home":["aufgaben","inventar","budget"],"umzug":["todos","packliste","budget"]}'::jsonb,
  created_at       timestamptz DEFAULT NOW(),
  updated_at       timestamptz DEFAULT NOW()
);

-- Neuen User automatisch anlegen
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.user_profile (id, email, username)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1))
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

DROP TRIGGER IF EXISTS set_user_profile_updated_at ON public.user_profile;
CREATE TRIGGER set_user_profile_updated_at
  BEFORE UPDATE ON public.user_profile
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Backfill fÃƒÂ¼r User die vor dem Trigger angelegt wurden
INSERT INTO public.user_profile (id, email, username)
SELECT u.id, u.email, split_part(u.email, '@', 1)
FROM auth.users u
WHERE NOT EXISTS (SELECT 1 FROM public.user_profile p WHERE p.id = u.id);

ALTER TABLE public.user_profile ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_profile_select_own ON public.user_profile;
CREATE POLICY user_profile_select_own ON public.user_profile FOR SELECT USING ((select auth.uid()) = id);

DROP POLICY IF EXISTS user_profile_insert_own ON public.user_profile;
CREATE POLICY user_profile_insert_own ON public.user_profile FOR INSERT WITH CHECK ((select auth.uid()) = id);

DROP POLICY IF EXISTS user_profile_update_own ON public.user_profile;
CREATE POLICY user_profile_update_own ON public.user_profile FOR UPDATE USING ((select auth.uid()) = id) WITH CHECK ((select auth.uid()) = id);

DROP POLICY IF EXISTS user_profile_delete_own ON public.user_profile;
CREATE POLICY user_profile_delete_own ON public.user_profile FOR DELETE USING ((select auth.uid()) = id);


-- Ã¢â€â‚¬Ã¢â€â‚¬ kontakte Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
CREATE TABLE IF NOT EXISTS public.kontakte (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name       text NOT NULL,
  typ        text,
  telefon    text,
  adresse    text,
  notiz      text,
  created_at timestamptz DEFAULT NOW(),
  updated_at timestamptz DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_kontakte_user_id ON public.kontakte(user_id);

DROP TRIGGER IF EXISTS set_kontakte_updated_at ON public.kontakte;
CREATE TRIGGER set_kontakte_updated_at
  BEFORE UPDATE ON public.kontakte
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.kontakte ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS kontakte_crud_own ON public.kontakte;
CREATE POLICY kontakte_crud_own ON public.kontakte FOR ALL
  USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);


-- Ã¢â€â‚¬Ã¢â€â‚¬ budget_posten Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
CREATE TABLE IF NOT EXISTS public.budget_posten (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  app_modus       text NOT NULL DEFAULT 'umzug',
  beschreibung    text NOT NULL,
  kategorie       text,
  betrag          numeric(12,2) NOT NULL,
  datum           date NOT NULL DEFAULT CURRENT_DATE,
  wiederholen     boolean DEFAULT false,
  intervall       text,
  naechstes_datum date,
  lieferdatum     date,
  created_at      timestamptz DEFAULT NOW(),
  updated_at      timestamptz DEFAULT NOW()
);

-- Migration: fehlende Spalten nachtrÃƒÂ¤glich ergÃƒÂ¤nzen (fÃƒÂ¼r bestehende Installationen)
ALTER TABLE public.budget_posten ADD COLUMN IF NOT EXISTS app_modus       text NOT NULL DEFAULT 'umzug';
ALTER TABLE public.budget_posten ADD COLUMN IF NOT EXISTS wiederholen     boolean DEFAULT false;
ALTER TABLE public.budget_posten ADD COLUMN IF NOT EXISTS intervall       text;
ALTER TABLE public.budget_posten ADD COLUMN IF NOT EXISTS naechstes_datum date;
ALTER TABLE public.budget_posten ADD COLUMN IF NOT EXISTS ursprung_template_id uuid REFERENCES public.budget_posten(id) ON DELETE SET NULL;
ALTER TABLE public.budget_posten ADD COLUMN IF NOT EXISTS ende_datum          date;
-- budget_scope (Phase 1: Haushalt vs. Privat)
-- HINWEIS: zahlungskonto_id (FK auf home_finanzkonten) wird NACH der Tabellenerstellung
-- in Abschnitt 5 ergaenzt (FK-Reihenfolge: home_finanzkonten muss zuerst existieren).
ALTER TABLE public.budget_posten
  ADD COLUMN IF NOT EXISTS budget_scope text NOT NULL DEFAULT 'haushalt'
    CHECK (budget_scope IN ('haushalt','privat'));

-- Unique Index fuer Idempotenz bei Recurring-Occurrences.
-- PostgreSQL behandelt NULL != NULL → Templates (ursprung_template_id IS NULL) kollidieren nicht.
CREATE UNIQUE INDEX IF NOT EXISTS idx_budget_posten_template_datum
  ON public.budget_posten (ursprung_template_id, datum);

CREATE INDEX IF NOT EXISTS idx_budget_posten_user_id ON public.budget_posten(user_id);
CREATE INDEX IF NOT EXISTS idx_budget_posten_datum   ON public.budget_posten(datum);

DROP TRIGGER IF EXISTS set_budget_posten_updated_at ON public.budget_posten;
CREATE TRIGGER set_budget_posten_updated_at
  BEFORE UPDATE ON public.budget_posten
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.budget_posten ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS budget_posten_crud_own ON public.budget_posten;
CREATE POLICY budget_posten_crud_own ON public.budget_posten FOR ALL
  USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);


-- Ã¢â€â‚¬Ã¢â€â‚¬ budget_teilzahlungen Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
CREATE TABLE IF NOT EXISTS public.budget_teilzahlungen (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  posten_id            uuid REFERENCES public.budget_posten(id) ON DELETE CASCADE NOT NULL,
  betrag_teilzahlung   numeric(12,2) NOT NULL,
  datum_teilzahlung    date NOT NULL DEFAULT CURRENT_DATE,
  notiz_teilzahlung    text,
  created_at           timestamptz DEFAULT NOW(),
  updated_at           timestamptz DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_budget_teilzahlungen_user_id   ON public.budget_teilzahlungen(user_id);
CREATE INDEX IF NOT EXISTS idx_budget_teilzahlungen_posten_id ON public.budget_teilzahlungen(posten_id);

DROP TRIGGER IF EXISTS set_budget_teilzahlungen_updated_at ON public.budget_teilzahlungen;
CREATE TRIGGER set_budget_teilzahlungen_updated_at
  BEFORE UPDATE ON public.budget_teilzahlungen
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.budget_teilzahlungen ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS budget_teilzahlungen_crud_own ON public.budget_teilzahlungen;
CREATE POLICY budget_teilzahlungen_crud_own ON public.budget_teilzahlungen FOR ALL
  USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);


-- Ã¢â€â‚¬Ã¢â€â‚¬ todo_aufgaben Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
CREATE TABLE IF NOT EXISTS public.todo_aufgaben (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  app_modus                text NOT NULL DEFAULT 'umzug',
  beschreibung             text NOT NULL,
  kategorie                text NOT NULL,
  prioritaet               text DEFAULT 'Mittel',
  erledigt                 boolean DEFAULT FALSE,
  faelligkeitsdatum        timestamptz,
  erinnerungs_datum        timestamptz,
  anhaenge                 text[],
  wiederholung_typ         text,
  wiederholung_intervall   integer,
  budget_posten_id         uuid REFERENCES public.budget_posten(id) ON DELETE SET NULL,
  home_projekt_id          uuid,
  angehaengte_dokument_ids uuid[],
  created_at               timestamptz DEFAULT NOW(),
  updated_at               timestamptz DEFAULT NOW()
);

-- Migration: fehlende Spalten nachtrÃƒÂ¤glich ergÃƒÂ¤nzen (fÃƒÂ¼r bestehende Installationen)
ALTER TABLE public.todo_aufgaben ADD COLUMN IF NOT EXISTS app_modus       text NOT NULL DEFAULT 'umzug';
ALTER TABLE public.todo_aufgaben ADD COLUMN IF NOT EXISTS home_projekt_id uuid;

CREATE INDEX IF NOT EXISTS idx_todo_aufgaben_user_id         ON public.todo_aufgaben(user_id);
CREATE INDEX IF NOT EXISTS idx_todo_aufgaben_budget_posten_id ON public.todo_aufgaben(budget_posten_id);
CREATE INDEX IF NOT EXISTS idx_todo_aufgaben_faelligkeit     ON public.todo_aufgaben(faelligkeitsdatum);

DROP TRIGGER IF EXISTS set_todo_aufgaben_updated_at ON public.todo_aufgaben;
CREATE TRIGGER set_todo_aufgaben_updated_at
  BEFORE UPDATE ON public.todo_aufgaben
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.todo_aufgaben ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS todo_aufgaben_crud_own ON public.todo_aufgaben;
CREATE POLICY todo_aufgaben_crud_own ON public.todo_aufgaben FOR ALL
  USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);


-- Ã¢â€â‚¬Ã¢â€â‚¬ todo_vorlagen Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
-- user_id nullable: NULL = globale Vorlage, gesetzt = persÃƒÂ¶nliche Vorlage
CREATE TABLE IF NOT EXISTS public.todo_vorlagen (
  id                              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                         uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  beschreibung                    text NOT NULL,
  kategorie                       text,
  prioritaet                      text DEFAULT 'Mittel',
  faelligkeitsdatum_offset_tage   integer,
  standard_anhaenge_text          text,
  standard_wiederholung_typ       text DEFAULT 'Keine',
  standard_wiederholung_intervall integer DEFAULT 1,
  sortier_reihenfolge             integer DEFAULT 0,
  created_at                      timestamptz DEFAULT NOW()
);

-- Globale Vorlagen zurÃƒÂ¼cksetzen (persÃƒÂ¶nliche bleiben erhalten)
DELETE FROM public.todo_vorlagen WHERE user_id IS NULL;

INSERT INTO public.todo_vorlagen (beschreibung, kategorie, prioritaet, faelligkeitsdatum_offset_tage, standard_anhaenge_text, sortier_reihenfolge) VALUES
('Mietvertrag alte Wohnung kÃƒÂ¼ndigen (Standard: 3 Monate Frist)', 'VertrÃƒÂ¤ge', 'Hoch', 90, NULL, 10),
('Nachsendeauftrag bei der Post einrichten (ca. 2 Wochen vorher)', 'Organisation', 'Hoch', 14, NULL, 20),
('Strom, Gas, Wasser ummelden (ca. 1 Woche vorher)', 'Versorger', 'Hoch', 7, NULL, 30),
('Internet- und Telefonanschluss ummelden/kÃƒÂ¼ndigen (ca. 4 Wochen vorher)', 'Versorger', 'Hoch', 28, NULL, 40),
('Termin fÃƒÂ¼r WohnungsÃƒÂ¼bergabe (alte Wohnung) vereinbaren', 'Wohnung', 'Hoch', 21, NULL, 50),
('Umzugshelfer organisieren', 'Umzugstag', 'Mittel', 30, NULL, 60),
('Umzugskartons besorgen und packen beginnen', 'Umzugstag', 'Mittel', 45, NULL, 70),
('SperrmÃƒÂ¼ll anmelden (falls benÃƒÂ¶tigt)', 'Ausmisten', 'Mittel', 21, NULL, 80),
('Umzugsurlaub beim Arbeitgeber einreichen', 'Organisation', 'Hoch', 60, 'Gesetzlicher Anspruch prÃƒÂ¼fen, schriftlich einreichen', 100),
('Kindergarten/Schule am neuen Wohnort anmelden', 'Organisation', 'Hoch', 90, 'Unterlagen: Geburtsurkunde, Meldezettel', 110),
('Haustierbetreuung fÃƒÂ¼r den Umzugstag organisieren', 'Organisation', 'Mittel', 14, 'Freunde fragen oder professionelle Betreuung buchen', 120),
('AdressÃƒÂ¤nderung bei Banken und Versicherungen bekannt geben', 'Organisation', 'Hoch', 7, 'Online-Portale oder Formulare nutzen', 130),
('AdressÃƒÂ¤nderung bei Online-Shops und Abonnements aktualisieren', 'Organisation', 'Mittel', 5, 'Wichtige Lieferdienste prÃƒÂ¼fen (Amazon, Zalando etc.)', 140),
('Termin fÃƒÂ¼r SperrmÃƒÂ¼llabholung vereinbaren (falls benÃƒÂ¶tigt)', 'Ausmisten', 'Mittel', 21, 'Details bei der Gemeinde/Stadt erfragen', 150),
('Wichtige Dokumente scannen und digital sichern', 'Dokumente', 'Mittel', 30, 'Cloud-Speicher oder externe Festplatte nutzen', 160),
('SchÃƒÂ¶nheitsreparaturen in alter Wohnung durchfÃƒÂ¼hren (falls vertraglich vereinbart)', 'Wohnung', 'Mittel', 14, 'Malerarbeiten, LÃƒÂ¶cher schlieÃƒÅ¸en etc.', 200),
('ZÃƒÂ¤hlerstÃƒÂ¤nde (Strom, Gas, Wasser) in alter Wohnung ablesen und protokollieren', 'Wohnung', 'Hoch', 0, 'Protokoll mit Vermieter/Nachmieter, Fotos machen', 210),
('ÃƒÅ“bergabeprotokoll fÃƒÂ¼r alte Wohnung vorbereiten/prÃƒÂ¼fen', 'Wohnung', 'Hoch', 3, 'MÃƒÂ¤ngelliste, Zustand der RÃƒÂ¤ume', 220),
('SchlÃƒÂ¼ssel fÃƒÂ¼r neue Wohnung ÃƒÂ¼bernehmen und ÃƒÅ“bergabeprotokoll erstellen', 'Wohnung', 'Hoch', 0, 'Zustand prÃƒÂ¼fen, MÃƒÂ¤ngel dokumentieren, ZÃƒÂ¤hlerstÃƒÂ¤nde neue Wohnung', 230),
('Namensschilder an Klingel und Briefkasten (neue Wohnung) anbringen', 'Wohnung', 'Niedrig', -1, 'Nach Einzug erledigen', 240),
('Reinigung der neuen Wohnung vor Einzug organisieren/durchfÃƒÂ¼hren', 'Wohnung', 'Mittel', 2, 'Grundreinigung, Fenster putzen', 250),
('Packmaterial besorgen (Kartons, Klebeband, Polstermaterial)', 'Umzugstag', 'Hoch', 45, 'Auch an Werkzeug, MÃƒÂ¼llsÃƒÂ¤cke denken', 300),
('Systematisches Packen beginnen (Raum fÃƒÂ¼r Raum)', 'Umzugstag', 'Mittel', 30, 'Kartons beschriften (Inhalt, Zielraum)', 310),
('Erste-Hilfe-Koffer fÃƒÂ¼r den Umzugstag packen', 'Umzugstag', 'Mittel', 7, 'Pflaster, Desinfektionsmittel, Schmerzmittel', 320),
('Verpflegung fÃƒÂ¼r Umzugshelfer planen und einkaufen', 'Umzugstag', 'Mittel', 3, 'GetrÃƒÂ¤nke, Snacks, ggf. Mittagessen', 330),
('Parkverbotszone fÃƒÂ¼r Umzugswagen beantragen (falls nÃƒÂ¶tig)', 'Umzugstag', 'Hoch', 21, 'Bei der zustÃƒÂ¤ndigen BehÃƒÂ¶rde', 340),
('Transportmittel fÃƒÂ¼r Haustiere und Pflanzen organisieren', 'Umzugstag', 'Mittel', 7, 'Sichere Transportboxen, ggf. spezielles Fahrzeug', 350),
('Budget fÃƒÂ¼r Umzugskosten erstellen und verfolgen', 'Finanzen', 'Hoch', 60, 'Alle erwarteten Ausgaben auflisten', 400),
('Kaution fÃƒÂ¼r neue Wohnung ÃƒÂ¼berweisen', 'Finanzen', 'Hoch', 30, 'Zahlungsfrist beachten', 410),
('DauerauftrÃƒÂ¤ge fÃƒÂ¼r Miete etc. anpassen', 'Finanzen', 'Hoch', 5, 'Alte DauerauftrÃƒÂ¤ge kÃƒÂ¼ndigen, neue einrichten', 420),
('Wohnsitz ummelden (innerhalb der Frist)', 'BehÃƒÂ¶rde', 'Hoch', -3, 'Nach Einzug, Fristen beachten (oft 3 Tage bis 2 Wochen)', 500),
('KFZ ummelden (falls anderer Zulassungsbezirk)', 'BehÃƒÂ¶rde', 'Mittel', -7, 'Unterlagen: Fahrzeugpapiere, eVB-Nummer, Ausweis', 510),
('Neuen Hausarzt/Zahnarzt suchen (falls nÃƒÂ¶tig)', 'Gesundheit', 'Niedrig', -30, 'Nach Einzug, Empfehlungen einholen', 520),
('VorrÃƒÂ¤te aufbrauchen (KÃƒÂ¼hlschrank, Gefriertruhe)', 'Sonstiges', 'Mittel', 14, 'Reduziert Packaufwand und Lebensmittelverschwendung', 600),
('Nachbarn ÃƒÂ¼ber Auszug/Einzug informieren', 'Sonstiges', 'Niedrig', 3, 'Gute Geste, ggf. um VerstÃƒÂ¤ndnis fÃƒÂ¼r LÃƒÂ¤rm bitten', 610),
('Werkzeugkiste fÃƒÂ¼r MÃƒÂ¶belmontage/-demontage vorbereiten', 'Umzugstag', 'Mittel', 7, 'Akkuschrauber, Schraubenzieher, Hammer etc.', 620),
('Wichtige Telefonnummern und Adressen griffbereit halten', 'Organisation', 'Hoch', 1, 'Umzugsfirma, Helfer, neue/alte Vermieter', 630),
('Kinder wÃƒÂ¤hrend des Umzugs betreuen lassen oder beschÃƒÂ¤ftigen', 'Organisation', 'Hoch', 0, 'Sicherheit und Stressreduktion fÃƒÂ¼r Kinder', 640);

ALTER TABLE public.todo_vorlagen ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS todo_vorlagen_read ON public.todo_vorlagen;
CREATE POLICY todo_vorlagen_read ON public.todo_vorlagen FOR SELECT TO authenticated
  USING (user_id IS NULL OR (select auth.uid()) = user_id);

DROP POLICY IF EXISTS todo_vorlagen_insert ON public.todo_vorlagen;
CREATE POLICY todo_vorlagen_insert ON public.todo_vorlagen FOR INSERT TO authenticated
  WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS todo_vorlagen_delete ON public.todo_vorlagen;
CREATE POLICY todo_vorlagen_delete ON public.todo_vorlagen FOR DELETE TO authenticated
  USING ((select auth.uid()) = user_id);


-- Ã¢â€â‚¬Ã¢â€â‚¬ pack_kisten Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
CREATE TABLE IF NOT EXISTS public.pack_kisten (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name         text NOT NULL,
  raum_neu     text,
  qr_code_wert text UNIQUE,
  foto_pfad    text,
  status_kiste text DEFAULT 'Geplant',
  notizen      text,
  created_at   timestamptz DEFAULT NOW(),
  updated_at   timestamptz DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pack_kisten_user_id ON public.pack_kisten(user_id);

DROP TRIGGER IF EXISTS set_pack_kisten_updated_at ON public.pack_kisten;
CREATE TRIGGER set_pack_kisten_updated_at
  BEFORE UPDATE ON public.pack_kisten
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.pack_kisten ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pack_kisten_crud_own ON public.pack_kisten;
CREATE POLICY pack_kisten_crud_own ON public.pack_kisten FOR ALL
  USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);


-- Ã¢â€â‚¬Ã¢â€â‚¬ pack_gegenstaende Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
CREATE TABLE IF NOT EXISTS public.pack_gegenstaende (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  beschreibung text NOT NULL,
  menge        integer DEFAULT 1,
  kategorie    text,
  ausgepakt_am timestamptz,
  created_at   timestamptz DEFAULT NOW(),
  updated_at   timestamptz DEFAULT NOW()
);

-- Idempotente Migration fuer Bestandsinstallationen
ALTER TABLE public.pack_gegenstaende
  ADD COLUMN IF NOT EXISTS ausgepakt_am timestamptz;

-- Legacy: kisten_id Ã¢â€ â€™ kiste_id migrieren und FK setzen
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'pack_gegenstaende' AND column_name = 'kiste_id'
  ) THEN
    ALTER TABLE public.pack_gegenstaende ADD COLUMN kiste_id uuid;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'pack_gegenstaende' AND column_name = 'kisten_id'
  ) THEN
    EXECUTE 'UPDATE public.pack_gegenstaende SET kiste_id = COALESCE(kiste_id, kisten_id) WHERE kisten_id IS NOT NULL';
    EXECUTE 'ALTER TABLE public.pack_gegenstaende DROP CONSTRAINT IF EXISTS pack_gegenstaende_kisten_id_fkey';
    EXECUTE 'ALTER TABLE public.pack_gegenstaende DROP COLUMN IF EXISTS kisten_id CASCADE';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'pack_gegenstaende_kiste_id_fkey'
  ) THEN
    EXECUTE 'ALTER TABLE public.pack_gegenstaende ADD CONSTRAINT pack_gegenstaende_kiste_id_fkey FOREIGN KEY (kiste_id) REFERENCES public.pack_kisten(id) ON DELETE CASCADE';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.pack_gegenstaende WHERE kiste_id IS NULL) THEN
    EXECUTE 'ALTER TABLE public.pack_gegenstaende ALTER COLUMN kiste_id SET NOT NULL';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_pack_gegenstaende_user_id  ON public.pack_gegenstaende(user_id);
CREATE INDEX IF NOT EXISTS idx_pack_gegenstaende_kiste_id ON public.pack_gegenstaende(kiste_id);

DROP TRIGGER IF EXISTS set_pack_gegenstaende_updated_at ON public.pack_gegenstaende;
CREATE TRIGGER set_pack_gegenstaende_updated_at
  BEFORE UPDATE ON public.pack_gegenstaende
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.pack_gegenstaende ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pack_gegenstaende_crud_own ON public.pack_gegenstaende;
CREATE POLICY pack_gegenstaende_crud_own ON public.pack_gegenstaende FOR ALL
  USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);


-- Ã¢â€â‚¬Ã¢â€â‚¬ dokumente Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
CREATE TABLE IF NOT EXISTS public.dokumente (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  dateiname        text NOT NULL,
  datei_typ        text,
  storage_pfad     text NOT NULL UNIQUE,
  beschreibung     text,
  groesse_kb       integer,
  todo_aufgabe_id  uuid REFERENCES public.todo_aufgaben(id) ON DELETE SET NULL,
  erstellt_am      timestamptz DEFAULT NOW(),
  updated_at       timestamptz DEFAULT NOW()
);

ALTER TABLE public.dokumente ADD COLUMN IF NOT EXISTS kategorie text;

CREATE INDEX IF NOT EXISTS idx_dokumente_user_id         ON public.dokumente(user_id);
CREATE INDEX IF NOT EXISTS idx_dokumente_todo_aufgabe_id ON public.dokumente(todo_aufgabe_id);
CREATE INDEX IF NOT EXISTS idx_dokumente_kategorie       ON public.dokumente(kategorie);

DROP TRIGGER IF EXISTS set_dokumente_updated_at ON public.dokumente;
CREATE TRIGGER set_dokumente_updated_at
  BEFORE UPDATE ON public.dokumente
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.dokumente ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS dokumente_crud_own ON public.dokumente;
CREATE POLICY dokumente_crud_own ON public.dokumente FOR ALL
  USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);


-- Ã¢â€â‚¬Ã¢â€â‚¬ renovierungs_posten Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
CREATE TABLE IF NOT EXISTS public.renovierungs_posten (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  beschreibung      text NOT NULL,
  raum              text,
  kategorie         text,
  menge_einheit     text,
  geschaetzter_preis numeric(12,2),
  baumarkt_link     text,
  status            text DEFAULT 'Geplant',
  created_at        timestamptz DEFAULT NOW(),
  updated_at        timestamptz DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_renovierungs_posten_user_id ON public.renovierungs_posten(user_id);

DROP TRIGGER IF EXISTS set_renovierungs_posten_updated_at ON public.renovierungs_posten;
CREATE TRIGGER set_renovierungs_posten_updated_at
  BEFORE UPDATE ON public.renovierungs_posten
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.renovierungs_posten ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS renovierungs_posten_crud_own ON public.renovierungs_posten;
CREATE POLICY renovierungs_posten_crud_own ON public.renovierungs_posten FOR ALL
  USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);


-- ============================================================
-- 3. STORAGE BUCKETS (UMZUGSMODUS)
-- ============================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('user-dokumente', 'user-dokumente', FALSE, 52428800, NULL),
  ('kisten-fotos',   'kisten-fotos',   TRUE,  10485760, ARRAY['image/jpeg','image/png','image/gif','image/webp'])
ON CONFLICT (id) DO NOTHING;

ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS storage_user_dokumente_insert ON storage.objects;
CREATE POLICY storage_user_dokumente_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'user-dokumente' AND (select auth.uid())::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS storage_user_dokumente_select ON storage.objects;
CREATE POLICY storage_user_dokumente_select ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'user-dokumente' AND (select auth.uid())::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS storage_user_dokumente_delete ON storage.objects;
CREATE POLICY storage_user_dokumente_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'user-dokumente' AND (select auth.uid())::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS storage_kisten_fotos_insert ON storage.objects;
CREATE POLICY storage_kisten_fotos_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'kisten-fotos' AND (select auth.uid())::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS storage_kisten_fotos_select ON storage.objects;
CREATE POLICY storage_kisten_fotos_select ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'kisten-fotos' AND (select auth.uid())::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS storage_kisten_fotos_delete ON storage.objects;
CREATE POLICY storage_kisten_fotos_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'kisten-fotos' AND (select auth.uid())::text = (storage.foldername(name))[1]);


-- ============================================================
-- 4. MATERIALKATALOG
-- ============================================================

CREATE TABLE IF NOT EXISTS public.materialien (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text NOT NULL,
  kategorie    text NOT NULL,
  einheit      text,
  standardpreis numeric(10,2),
  erstellt_am  timestamptz DEFAULT NOW()
);

-- Bestehende Daten lÃƒÂ¶schen, um Duplikate zu vermeiden
DELETE FROM public.materialien;

INSERT INTO public.materialien (name, kategorie, einheit, standardpreis) VALUES
('Dispersionsfarbe weiÃƒÅ¸ (Innen)', 'Maler- & Tapezierbedarf', 'L', 24.99),
('Tiefgrund 5 L', 'Maler- & Tapezierbedarf', 'Kanister', 18.00),
('Malerrolle (18 cm)', 'Maler- & Tapezierbedarf', 'StÃƒÂ¼ck', 3.00),
('Farbwanne', 'Maler- & Tapezierbedarf', 'StÃƒÂ¼ck', 4.00),
('Malerkreppband (50 m)', 'Maler- & Tapezierbedarf', 'Rolle', 5.00),
('Schleifpapier (KÃƒÂ¶rnung 120)', 'Maler- & Tapezierbedarf', 'Blatt', 0.50),
('Pinselset (3 StÃƒÂ¼ck)', 'Maler- & Tapezierbedarf', 'Set', 8.00),
('Spachtelmasse (innen) 5 kg', 'Maler- & Tapezierbedarf', 'Sack', 12.00),
('Acryl-Dichtmasse 310 ml', 'Maler- & Tapezierbedarf', 'Kartusche', 4.00),
('Feinputz 25 kg', 'Maler- & Tapezierbedarf', 'Sack', 15.00),
('Buntlack (Kunstharz, farbig) 0,75 L', 'Maler- & Tapezierbedarf', 'Dose', 15.00),
('Lackfarbe weiÃƒÅ¸ (Holz/Metall) 1 L', 'Maler- & Tapezierbedarf', 'Dose', 12.00),
('Fassadenfarbe weiÃƒÅ¸ (AuÃƒÅ¸en) 10 L', 'Maler- & Tapezierbedarf', 'Eimer', 60.00),
('Tapetenrolle (Vliestapete) 10 mÃ‚Â²', 'Maler- & Tapezierbedarf', 'Rolle', 10.00),
('Tapetenkleister 500 g', 'Maler- & Tapezierbedarf', 'Packung', 5.00),
('TapezierbÃƒÂ¼rste', 'Maler- & Tapezierbedarf', 'StÃƒÂ¼ck', 7.00),
('Quast (DeckenbÃƒÂ¼rste)', 'Maler- & Tapezierbedarf', 'StÃƒÂ¼ck', 8.00),
('Farbkratzer (Schaber)', 'Maler- & Tapezierbedarf', 'StÃƒÂ¼ck', 5.00),
('Abstreifgitter (fÃƒÂ¼r Farbeimer)', 'Maler- & Tapezierbedarf', 'StÃƒÂ¼ck', 2.00),
('Teleskop-VerlÃƒÂ¤ngerungsstange', 'Maler- & Tapezierbedarf', 'StÃƒÂ¼ck', 15.00),
('Abdeckpapier (Rolle 50 m)', 'Maler- & Tapezierbedarf', 'Rolle', 10.00),
('Abdeckfolie mit Klebeband (maskierend)', 'Maler- & Tapezierbedarf', 'Rolle', 5.00),
('Maleroverall (Einweg)', 'Maler- & Tapezierbedarf', 'StÃƒÂ¼ck', 5.00),
('Abbeizer (Lackentferner) 1 L', 'Maler- & Tapezierbedarf', 'L', 15.00),
('Pinselreiniger (LÃƒÂ¶sungsmittel) 1 L', 'Maler- & Tapezierbedarf', 'L', 8.00),
('Holzlasur (farblos) 5 L', 'Maler- & Tapezierbedarf', 'L', 30.00),
('TapetenlÃƒÂ¶ser 500 ml', 'Maler- & Tapezierbedarf', 'ml', 6.00),
('Stachelwalze (Tapetenperforierer)', 'Maler- & Tapezierbedarf', 'StÃƒÂ¼ck', 15.00),
('Nahtroller (Tapeten-Andruckrolle)', 'Maler- & Tapezierbedarf', 'StÃƒÂ¼ck', 6.00),
('Tapeziertisch (klappbar)', 'Maler- & Tapezierbedarf', 'StÃƒÂ¼ck', 50.00),
('Zement (Portland) 25 kg', 'Maurer & Putz', 'Sack', 5.00),
('Mauerziegel (Standard)', 'Maurer & Putz', 'StÃƒÂ¼ck', 0.80),
('Kalkputz (innen) 25 kg', 'Maurer & Putz', 'Sack', 10.00),
('EstrichmÃƒÂ¶rtel 25 kg', 'Maurer & Putz', 'Sack', 6.00),
('Beton C25/30 (Transportbeton) 1 mÃ‚Â³', 'Maurer & Putz', 'mÃ‚Â³', 120.00),
('MauermÃƒÂ¶rtel 25 kg', 'Maurer & Putz', 'Sack', 4.00),
('Kalksandstein (Format NF)', 'Maurer & Putz', 'StÃƒÂ¼ck', 2.50),
('WDVS-DÃƒÂ¤mmplatte 1 mÃ‚Â²', 'Maurer & Putz', 'StÃƒÂ¼ck', 20.00),
('DÃƒÂ¤mmwolle (Mineralwolle) 1 mÃ‚Â²', 'Maurer & Putz', 'mÃ‚Â²', 3.50),
('Perlit-Leichtbeton 25 kg', 'Maurer & Putz', 'Sack', 8.00),
('Bausand (Betonsand) 25 kg', 'Maurer & Putz', 'Sack', 3.00),
('Kies (Betonkies) 1 t', 'Maurer & Putz', 't', 30.00),
('Betonstahl (Bewehrungsstab) 6 m', 'Maurer & Putz', 'StÃƒÂ¼ck', 10.00),
('Bewehrungsmatte (Stahlgitter)', 'Maurer & Putz', 'StÃƒÂ¼ck', 50.00),
('Bitumenbahn (Abdichtung) 10 mÃ‚Â²', 'Maurer & Putz', 'Rolle', 30.00),
('Dachziegel 1 mÃ‚Â²', 'Maurer & Putz', 'mÃ‚Â²', 25.00),
('Bauschaum (PU-Montageschaum) 750 ml', 'Maurer & Putz', 'Dose', 8.00),
('Trockenbeton (Fertigbeton) 40 kg', 'Maurer & Putz', 'Sack', 8.00),
('Porenbeton-Stein (Ytong) 625 Ãƒâ€” 240 Ãƒâ€” 200 mm', 'Maurer & Putz', 'StÃƒÂ¼ck', 5.00),
('SchamottmÃƒÂ¶rtel (feuerfest) 5 kg', 'Maurer & Putz', 'Eimer', 10.00),
('Schamottstein 230 Ãƒâ€” 114 Ãƒâ€” 64 mm', 'Maurer & Putz', 'StÃƒÂ¼ck', 3.00),
('Betonsturz (Fertigteil) 1,0 m', 'Maurer & Putz', 'StÃƒÂ¼ck', 15.00),
('Putzprofil (Eckschiene)', 'Maurer & Putz', 'StÃƒÂ¼ck', 3.00),
('Baugips (Gipspulver) 5 kg', 'Maurer & Putz', 'Sack', 5.00),
('DichtschlÃƒÂ¤mme (Kellerabdichtung) 5 kg', 'Maurer & Putz', 'Eimer', 20.00),
('Dickbeschichtung (KMB) 10 kg', 'Maurer & Putz', 'Eimer', 30.00),
('StahltrÃƒÂ¤ger (HEA 100) pro lfm', 'Maurer & Putz', 'm', 50.00),
('Porenbetonkleber 25 kg', 'Maurer & Putz', 'Sack', 10.00),
('PerimeterdÃƒÂ¤mmung (XPS-Platte) 1 mÃ‚Â²', 'Maurer & Putz', 'StÃƒÂ¼ck', 15.00),
('TrittschalldÃƒÂ¤mmung (EPS) 1 mÃ‚Â²', 'Maurer & Putz', 'mÃ‚Â²', 5.00),
('Fertigparkett (Buche) 1 mÃ‚Â²', 'Holz & Boden', 'mÃ‚Â²', 60.00),
('Laminat 1 mÃ‚Â²', 'Holz & Boden', 'mÃ‚Â²', 20.00),
('OSB-Platte 250Ãƒâ€”125 cm', 'Holz & Boden', 'Platte', 12.00),
('MDF-Platte 122Ãƒâ€”61 cm', 'Holz & Boden', 'Platte', 8.00),
('Spanplatte 250Ãƒâ€”125 cm', 'Holz & Boden', 'Platte', 10.00),
('Dachlatte 4 Ãƒâ€” 6 cm (Konstruktionsholz)', 'Holz & Boden', 'StÃƒÂ¼ck', 2.00),
('Balken, Fichte 10 Ãƒâ€” 10 cm', 'Holz & Boden', 'lfm', 15.00),
('Parkettleim 5 kg', 'Holz & Boden', 'Beutel', 25.00),
('TrittschalldÃƒÂ¤mm-Unterlage 1 mÃ‚Â²', 'Holz & Boden', 'mÃ‚Â²', 1.50),
('Sockelleiste Buche 2,4 m', 'Holz & Boden', 'StÃƒÂ¼ck', 3.50),
('Massivholzdielen (Eiche) 1 mÃ‚Â²', 'Holz & Boden', 'mÃ‚Â²', 80.00),
('Vinylboden (Designbelag) 1 mÃ‚Â²', 'Holz & Boden', 'mÃ‚Â²', 30.00),
('Teppichboden (Auslegware) 1 mÃ‚Â²', 'Holz & Boden', 'mÃ‚Â²', 20.00),
('Bodenfliesen (Keramik) 1 mÃ‚Â²', 'Holz & Boden', 'mÃ‚Â²', 25.00),
('Wandfliesen (weiÃƒÅ¸) 1 mÃ‚Â²', 'Holz & Boden', 'mÃ‚Â²', 15.00),
('Fliesenkleber 25 kg', 'Holz & Boden', 'Sack', 10.00),
('FugenmÃƒÂ¶rtel 5 kg', 'Holz & Boden', 'Beutel', 8.00),
('Fliesenkreuze (Abstandhalter) 100 Stk', 'Holz & Boden', 'Pack', 3.00),
('Sockelfliese 30 cm', 'Holz & Boden', 'StÃƒÂ¼ck', 2.00),
('PVC-Bodenbelag (Rolle) 1 mÃ‚Â²', 'Holz & Boden', 'mÃ‚Â²', 10.00),
('Natursteinfliese (Granit) 1 mÃ‚Â²', 'Holz & Boden', 'mÃ‚Â²', 60.00),
('Holzleim (Ponal) 1 kg', 'Holz & Boden', 'Flasche', 10.00),
('Leimholzplatte (Fichte) 200Ãƒâ€”60Ãƒâ€”2 cm', 'Holz & Boden', 'StÃƒÂ¼ck', 50.00),
('Siebdruckplatte (Birkensperrholz) 21 mm', 'Holz & Boden', 'Platte', 70.00),
('Sperrholzplatte 4 mm 122Ãƒâ€”244 cm', 'Holz & Boden', 'Platte', 15.00),
('Terrassendiele (WPC) pro lfm', 'Holz & Boden', 'm', 5.00),
('KVH Kantholz 60Ãƒâ€”60 mm', 'Holz & Boden', 'lfm', 5.00),
('Parkettlack (Versiegelung) 1 L', 'Holz & Boden', 'L', 20.00),
('Korkboden 1 mÃ‚Â²', 'Holz & Boden', 'mÃ‚Â²', 40.00),
('Teppichfliesen 1 mÃ‚Â²', 'Holz & Boden', 'mÃ‚Â²', 30.00),
('Spanplattenschrauben 4Ãƒâ€”30 mm', 'Schrauben, DÃƒÂ¼bel & Befestigung', 'StÃƒÂ¼ck', 0.05),
('UniversaldÃƒÂ¼bel 8Ãƒâ€”50 mm', 'Schrauben, DÃƒÂ¼bel & Befestigung', 'StÃƒÂ¼ck', 0.10),
('Holzschrauben 6Ãƒâ€”60 mm', 'Schrauben, DÃƒÂ¼bel & Befestigung', 'StÃƒÂ¼ck', 0.08),
('Blechschrauben 4Ãƒâ€”20 mm', 'Schrauben, DÃƒÂ¼bel & Befestigung', 'StÃƒÂ¼ck', 0.07),
('NageldÃƒÂ¼bel 10Ãƒâ€”100 mm', 'Schrauben, DÃƒÂ¼bel & Befestigung', 'StÃƒÂ¼ck', 0.15),
('Schraubenset 200 Stk (Sortiment)', 'Schrauben, DÃƒÂ¼bel & Befestigung', 'Set', 15.00),
('Hakenanker 8Ãƒâ€”120 mm', 'Schrauben, DÃƒÂ¼bel & Befestigung', 'StÃƒÂ¼ck', 0.45),
('Rohrschelle (fÃƒÂ¼r SanitÃƒÂ¤r) 1/2Ã¢â‚¬Â³', 'Schrauben, DÃƒÂ¼bel & Befestigung', 'StÃƒÂ¼ck', 0.20),
('DÃƒÂ¼belbox (Sortiment)', 'Schrauben, DÃƒÂ¼bel & Befestigung', 'Packung', 20.00),
('Holznagel 5Ãƒâ€”50 mm (Stahlstift)', 'Schrauben, DÃƒÂ¼bel & Befestigung', 'StÃƒÂ¼ck', 0.03),
('Betonschraube 7,5Ãƒâ€”80 mm', 'Schrauben, DÃƒÂ¼bel & Befestigung', 'StÃƒÂ¼ck', 0.50),
('Schwerlastanker M10', 'Schrauben, DÃƒÂ¼bel & Befestigung', 'StÃƒÂ¼ck', 2.00),
('Gewindestange M8 (1 m)', 'Schrauben, DÃƒÂ¼bel & Befestigung', 'StÃƒÂ¼ck', 2.00),
('Sechskantmutter M8', 'Schrauben, DÃƒÂ¼bel & Befestigung', 'StÃƒÂ¼ck', 0.05),
('Unterlegscheibe M8', 'Schrauben, DÃƒÂ¼bel & Befestigung', 'StÃƒÂ¼ck', 0.02),
('Stahlnagel 100 mm', 'Schrauben, DÃƒÂ¼bel & Befestigung', 'StÃƒÂ¼ck', 0.05),
('Stahlnagel (gehÃƒÂ¤rtet) 30 mm', 'Schrauben, DÃƒÂ¼bel & Befestigung', 'StÃƒÂ¼ck', 0.10),
('Maschinenschraube M6Ãƒâ€”40 (mit Mutter)', 'Schrauben, DÃƒÂ¼bel & Befestigung', 'StÃƒÂ¼ck', 0.20),
('HolzdÃƒÂ¼bel 8Ãƒâ€”40 mm (Holzverbinder)', 'Schrauben, DÃƒÂ¼bel & Befestigung', 'StÃƒÂ¼ck', 0.05),
('Kabelbinder 300 mm', 'Schrauben, DÃƒÂ¼bel & Befestigung', 'StÃƒÂ¼ck', 0.10),
('Winkelverbinder (Metallwinkel)', 'Schrauben, DÃƒÂ¼bel & Befestigung', 'StÃƒÂ¼ck', 1.00),
('Lochband (Lochstreifen) 1 m', 'Schrauben, DÃƒÂ¼bel & Befestigung', 'm', 2.00),
('Bindedraht (1 kg Rolle)', 'Schrauben, DÃƒÂ¼bel & Befestigung', 'Rolle', 5.00),
('Blindnieten 4Ãƒâ€”20 mm (Popnieten)', 'Schrauben, DÃƒÂ¼bel & Befestigung', 'StÃƒÂ¼ck', 0.05),
('Nagelschellen (Kabelclips) 20 Stk', 'Schrauben, DÃƒÂ¼bel & Befestigung', 'Pack', 2.00),
('Tellerkopfschrauben 6Ãƒâ€”140 mm', 'Schrauben, DÃƒÂ¼bel & Befestigung', 'StÃƒÂ¼ck', 0.50),
('HohlraumdÃƒÂ¼bel M6', 'Schrauben, DÃƒÂ¼bel & Befestigung', 'StÃƒÂ¼ck', 0.50),
('InjektionsmÃƒÂ¶rtel (Vinylester) 300 ml', 'Schrauben, DÃƒÂ¼bel & Befestigung', 'Kartusche', 15.00),
('Gewindestange M12 (1 m)', 'Schrauben, DÃƒÂ¼bel & Befestigung', 'StÃƒÂ¼ck', 5.00),
('Sechskantmutter M12', 'Schrauben, DÃƒÂ¼bel & Befestigung', 'StÃƒÂ¼ck', 0.10),
('Unterlegscheibe M12', 'Schrauben, DÃƒÂ¼bel & Befestigung', 'StÃƒÂ¼ck', 0.05),
('Holzschrauben 8Ãƒâ€”120 mm', 'Schrauben, DÃƒÂ¼bel & Befestigung', 'StÃƒÂ¼ck', 0.20),
('Spanplattenschrauben 4Ãƒâ€”50 mm', 'Schrauben, DÃƒÂ¼bel & Befestigung', 'StÃƒÂ¼ck', 0.08),
('Spanplattenschrauben 5Ãƒâ€”80 mm', 'Schrauben, DÃƒÂ¼bel & Befestigung', 'StÃƒÂ¼ck', 0.10),
('NageldÃƒÂ¼bel 6Ãƒâ€”60 mm', 'Schrauben, DÃƒÂ¼bel & Befestigung', 'StÃƒÂ¼ck', 0.10),
('Drahtseil (Stahl) 1 m', 'Schrauben, DÃƒÂ¼bel & Befestigung', 'm', 2.00),
('Karabinerhaken (Stahl) 8 mm', 'Schrauben, DÃƒÂ¼bel & Befestigung', 'StÃƒÂ¼ck', 2.00),
('Akku-Bohrschrauber (18 V)', 'Werkzeuge & Verbrauchsmaterial', 'StÃƒÂ¼ck', 80.00),
('Bohrerset (10 tlg.)', 'Werkzeuge & Verbrauchsmaterial', 'Set', 15.00),
('Wasserwaage 60 cm', 'Werkzeuge & Verbrauchsmaterial', 'StÃƒÂ¼ck', 10.00),
('Cuttermesser', 'Werkzeuge & Verbrauchsmaterial', 'StÃƒÂ¼ck', 3.00),
('Zollstock 2 m', 'Werkzeuge & Verbrauchsmaterial', 'StÃƒÂ¼ck', 5.00),
('Hand-Schraubendreher-Set', 'Werkzeuge & Verbrauchsmaterial', 'Set', 10.00),
('Elektroklebeband (Isolierband) schwarz', 'Werkzeuge & Verbrauchsmaterial', 'Rolle', 2.00),
('Eimer 10 L (Baueimer)', 'Werkzeuge & Verbrauchsmaterial', 'StÃƒÂ¼ck', 4.00),
('Hammer (Schlosserhammer)', 'Werkzeuge & Verbrauchsmaterial', 'StÃƒÂ¼ck', 10.00),
('HandsÃƒÂ¤ge (Fuchsschwanz)', 'Werkzeuge & Verbrauchsmaterial', 'StÃƒÂ¼ck', 12.00),
('MetallsÃƒÂ¤ge (BÃƒÂ¼gelsÃƒÂ¤ge)', 'Werkzeuge & Verbrauchsmaterial', 'StÃƒÂ¼ck', 15.00),
('Feilen-Set (Metall/Holz)', 'Werkzeuge & Verbrauchsmaterial', 'Set', 10.00),
('Kombizange', 'Werkzeuge & Verbrauchsmaterial', 'StÃƒÂ¼ck', 8.00),
('Seitenschneider', 'Werkzeuge & Verbrauchsmaterial', 'StÃƒÂ¼ck', 7.00),
('SchraubenschlÃƒÂ¼ssel-Set', 'Werkzeuge & Verbrauchsmaterial', 'Set', 20.00),
('Ratschen-/SteckschlÃƒÂ¼sselsatz', 'Werkzeuge & Verbrauchsmaterial', 'Set', 30.00),
('InbusschlÃƒÂ¼ssel-Set', 'Werkzeuge & Verbrauchsmaterial', 'Set', 5.00),
('StichsÃƒÂ¤ge (elektrisch)', 'Werkzeuge & Verbrauchsmaterial', 'StÃƒÂ¼ck', 50.00),
('HandkreissÃƒÂ¤ge', 'Werkzeuge & Verbrauchsmaterial', 'StÃƒÂ¼ck', 100.00),
('Winkelschleifer (Flex)', 'Werkzeuge & Verbrauchsmaterial', 'StÃƒÂ¼ck', 60.00),
('Bohrhammer (SDS)', 'Werkzeuge & Verbrauchsmaterial', 'StÃƒÂ¼ck', 150.00),
('Multitool (Oszillationswerkzeug)', 'Werkzeuge & Verbrauchsmaterial', 'StÃƒÂ¼ck', 80.00),
('Exzenterschleifer', 'Werkzeuge & Verbrauchsmaterial', 'StÃƒÂ¼ck', 50.00),
('Deltaschleifer', 'Werkzeuge & Verbrauchsmaterial', 'StÃƒÂ¼ck', 30.00),
('HeiÃƒÅ¸luftpistole', 'Werkzeuge & Verbrauchsmaterial', 'StÃƒÂ¼ck', 40.00),
('Tacker (Handtacker)', 'Werkzeuge & Verbrauchsmaterial', 'StÃƒÂ¼ck', 15.00),
('HeiÃƒÅ¸klebepistole', 'Werkzeuge & Verbrauchsmaterial', 'StÃƒÂ¼ck', 10.00),
('Kabeltrommel (VerlÃƒÂ¤ngerung) 25 m', 'Werkzeuge & Verbrauchsmaterial', 'StÃƒÂ¼ck', 25.00),
('Stehleiter (zweiteilig) 2 m', 'Werkzeuge & Verbrauchsmaterial', 'StÃƒÂ¼ck', 50.00),
('KlappgerÃƒÂ¼st (klein, fahrbar)', 'Werkzeuge & Verbrauchsmaterial', 'StÃƒÂ¼ck', 200.00),
('Schubkarre (Baustellenschubkarre)', 'Werkzeuge & Verbrauchsmaterial', 'StÃƒÂ¼ck', 80.00),
('Maurerkelle (Kelle)', 'Werkzeuge & Verbrauchsmaterial', 'StÃƒÂ¼ck', 8.00),
('Bit-Set (Schrauberbits) 20 tlg.', 'Werkzeuge & Verbrauchsmaterial', 'Set', 10.00),
('MaÃƒÅ¸band (RollbandmaÃƒÅ¸) 5 m', 'Werkzeuge & Verbrauchsmaterial', 'StÃƒÂ¼ck', 8.00),
('Laser-Entfernungsmesser', 'Werkzeuge & Verbrauchsmaterial', 'StÃƒÂ¼ck', 50.00),
('Tapeten-DampfablÃƒÂ¶ser (Elektro)', 'Werkzeuge & Verbrauchsmaterial', 'StÃƒÂ¼ck', 30.00),
('Nass-/Trockensauger (Bau-Staubsauger)', 'Werkzeuge & Verbrauchsmaterial', 'StÃƒÂ¼ck', 100.00),
('Laminatschneider (Hebel)', 'Werkzeuge & Verbrauchsmaterial', 'StÃƒÂ¼ck', 40.00),
('Fliesenschneider (manuell)', 'Werkzeuge & Verbrauchsmaterial', 'StÃƒÂ¼ck', 50.00),
('Abbruchhammer (StemmgerÃƒÂ¤t)', 'Werkzeuge & Verbrauchsmaterial', 'StÃƒÂ¼ck', 200.00),
('Rotationslaser (NivelliergerÃƒÂ¤t)', 'Werkzeuge & Verbrauchsmaterial', 'StÃƒÂ¼ck', 300.00),
('BohrstÃƒÂ¤nder (fÃƒÂ¼r Bohrmaschine)', 'Werkzeuge & Verbrauchsmaterial', 'StÃƒÂ¼ck', 150.00),
('TischkreissÃƒÂ¤ge', 'Werkzeuge & Verbrauchsmaterial', 'StÃƒÂ¼ck', 250.00),
('KettensÃƒÂ¤ge (Elektro)', 'Werkzeuge & Verbrauchsmaterial', 'StÃƒÂ¼ck', 100.00),
('FarbsprÃƒÂ¼hsystem (Elektro)', 'Werkzeuge & Verbrauchsmaterial', 'StÃƒÂ¼ck', 100.00),
('Kernbohrer-Set (Bohrkronen)', 'Werkzeuge & Verbrauchsmaterial', 'Set', 50.00),
('BaugerÃƒÂ¼st (ModulgerÃƒÂ¼st)', 'Werkzeuge & Verbrauchsmaterial', 'StÃƒÂ¼ck', 1000.00),
('Betonmischer (mobil)', 'Werkzeuge & Verbrauchsmaterial', 'StÃƒÂ¼ck', 300.00),
('RÃƒÂ¼hrgerÃƒÂ¤t (MÃƒÂ¶rtelmischer)', 'Werkzeuge & Verbrauchsmaterial', 'StÃƒÂ¼ck', 80.00),
('Leitungssucher (OrtungsgerÃƒÂ¤t)', 'Werkzeuge & Verbrauchsmaterial', 'StÃƒÂ¼ck', 30.00),
('Druckluft-Kompressor 50 L', 'Werkzeuge & Verbrauchsmaterial', 'StÃƒÂ¼ck', 200.00),
('Lackierpistole (Druckluft)', 'Werkzeuge & Verbrauchsmaterial', 'StÃƒÂ¼ck', 40.00),
('Werkstattwagen (Werkzeugwagen)', 'Werkzeuge & Verbrauchsmaterial', 'StÃƒÂ¼ck', 200.00),
('SchweiÃƒÅ¸gerÃƒÂ¤t (Elektrode)', 'Werkzeuge & Verbrauchsmaterial', 'StÃƒÂ¼ck', 300.00),
('WC-Keramik (Stand-WC)', 'SanitÃƒÂ¤r & Installation', 'StÃƒÂ¼ck', 150.00),
('Waschbecken (Keramik)', 'SanitÃƒÂ¤r & Installation', 'StÃƒÂ¼ck', 80.00),
('Duscharmatur (Mischbatterie)', 'SanitÃƒÂ¤r & Installation', 'StÃƒÂ¼ck', 100.00),
('Eckventil 1/2Ã¢â‚¬Â³', 'SanitÃƒÂ¤r & Installation', 'StÃƒÂ¼ck', 5.00),
('HT-Rohr (Abwasserrohr) DN 110', 'SanitÃƒÂ¤r & Installation', 'm', 3.00),
('Siphon (Geruchsverschluss)', 'SanitÃƒÂ¤r & Installation', 'StÃƒÂ¼ck', 8.00),
('Teflon-Dichtband', 'SanitÃƒÂ¤r & Installation', 'Rolle', 1.00),
('Gummidichtung (O-Ring)', 'SanitÃƒÂ¤r & Installation', 'StÃƒÂ¼ck', 0.50),
('Silikon-Dichtmasse (SanitÃƒÂ¤r) 310 ml', 'SanitÃƒÂ¤r & Installation', 'Kartusche', 6.00),
('Montagekleber 290 ml', 'SanitÃƒÂ¤r & Installation', 'Tube', 6.00),
('Badewanne (Acryl)', 'SanitÃƒÂ¤r & Installation', 'StÃƒÂ¼ck', 300.00),
('Duschwanne 90Ãƒâ€”90 cm', 'SanitÃƒÂ¤r & Installation', 'StÃƒÂ¼ck', 100.00),
('Duschkabine (Glas, komplett)', 'SanitÃƒÂ¤r & Installation', 'StÃƒÂ¼ck', 250.00),
('WC-Sitz (Deckel)', 'SanitÃƒÂ¤r & Installation', 'StÃƒÂ¼ck', 30.00),
('Waschtischarmatur', 'SanitÃƒÂ¤r & Installation', 'StÃƒÂ¼ck', 60.00),
('KÃƒÂ¼chenarmatur (Einhebel)', 'SanitÃƒÂ¤r & Installation', 'StÃƒÂ¼ck', 80.00),
('Brause-Set (Duschkopf + Schlauch)', 'SanitÃƒÂ¤r & Installation', 'Set', 30.00),
('Waschmaschinenhahn', 'SanitÃƒÂ¤r & Installation', 'StÃƒÂ¼ck', 15.00),
('HT-Rohr DN 50', 'SanitÃƒÂ¤r & Installation', 'm', 2.00),
('Kupferrohr 15 mm', 'SanitÃƒÂ¤r & Installation', 'm', 8.00),
('Pressfitting 15 mm (Kupplung)', 'SanitÃƒÂ¤r & Installation', 'StÃƒÂ¼ck', 5.00),
('AblaufverlÃƒÂ¤ngerung (Siphonrohr)', 'SanitÃƒÂ¤r & Installation', 'StÃƒÂ¼ck', 5.00),
('WC-Anschlussset (Flexrohr)', 'SanitÃƒÂ¤r & Installation', 'Set', 15.00),
('Untertischboiler 5 L (Elektro)', 'SanitÃƒÂ¤r & Installation', 'StÃƒÂ¼ck', 100.00),
('Durchlauferhitzer 18 kW', 'SanitÃƒÂ¤r & Installation', 'StÃƒÂ¼ck', 250.00),
('Bodenablauf (Dusche) mit Geruchsstopp', 'SanitÃƒÂ¤r & Installation', 'StÃƒÂ¼ck', 20.00),
('Ablaufgarnitur (Waschbecken)', 'SanitÃƒÂ¤r & Installation', 'StÃƒÂ¼ck', 10.00),
('Flexschlauch 3/8Ã¢â‚¬Â³ (Anschluss)', 'SanitÃƒÂ¤r & Installation', 'StÃƒÂ¼ck', 5.00),
('Aufputz-SpÃƒÂ¼lkasten (WC)', 'SanitÃƒÂ¤r & Installation', 'StÃƒÂ¼ck', 50.00),
('Hebeanlage (Abwasserpumpe)', 'SanitÃƒÂ¤r & Installation', 'StÃƒÂ¼ck', 300.00),
('Kupferkabel (Litze) 1,5 mmÃ‚Â², 100 m', 'Elektro & Beleuchtung', 'Rolle', 50.00),
('Steckdose (Unterputz)', 'Elektro & Beleuchtung', 'StÃƒÂ¼ck', 3.00),
('Lichtschalter (Wechselschalter)', 'Elektro & Beleuchtung', 'StÃƒÂ¼ck', 3.00),
('FI-Schutzschalter 30 mA', 'Elektro & Beleuchtung', 'StÃƒÂ¼ck', 30.00),
('Leitungsschutzschalter 16 A', 'Elektro & Beleuchtung', 'StÃƒÂ¼ck', 2.00),
('Deckenleuchte (Fassung+Schirm)', 'Elektro & Beleuchtung', 'StÃƒÂ¼ck', 25.00),
('LED-Lampe E27 (GlÃƒÂ¼hbirne)', 'Elektro & Beleuchtung', 'StÃƒÂ¼ck', 5.00),
('VerlÃƒÂ¤ngerungskabel 10 m', 'Elektro & Beleuchtung', 'StÃƒÂ¼ck', 15.00),
('Kabelverbinder (LÃƒÂ¼sterklemme)', 'Elektro & Beleuchtung', 'StÃƒÂ¼ck', 0.10),
('Unterputzdose (GerÃƒÂ¤tedose)', 'Elektro & Beleuchtung', 'StÃƒÂ¼ck', 2.00),
('Installationskabel NYM-J 3Ãƒâ€”1,5Ã‚Â² (50 m)', 'Elektro & Beleuchtung', 'Rolle', 25.00),
('Kabelkanal 20Ãƒâ€”20 mm (2 m)', 'Elektro & Beleuchtung', 'StÃƒÂ¼ck', 5.00),
('Abzweigdose (Aufputz)', 'Elektro & Beleuchtung', 'StÃƒÂ¼ck', 3.00),
('Nagelschellen 20 Stk (Kabelschellen)', 'Elektro & Beleuchtung', 'Pack', 2.00),
('Netzwerkdose CAT6 (LAN)', 'Elektro & Beleuchtung', 'StÃƒÂ¼ck', 10.00),
('Netzwerkkabel CAT6 20 m', 'Elektro & Beleuchtung', 'StÃƒÂ¼ck', 15.00),
('Koaxialkabel (TV) 10 m', 'Elektro & Beleuchtung', 'StÃƒÂ¼ck', 10.00),
('Bewegungsmelder (Innen)', 'Elektro & Beleuchtung', 'StÃƒÂ¼ck', 20.00),
('Rauchmelder (Batterie)', 'Elektro & Beleuchtung', 'StÃƒÂ¼ck', 10.00),
('TÃƒÂ¼rklingel (Gong)', 'Elektro & Beleuchtung', 'StÃƒÂ¼ck', 15.00),
('Multimeter (Digital)', 'Elektro & Beleuchtung', 'StÃƒÂ¼ck', 20.00),
('Sicherungskasten (Unterverteilung)', 'Elektro & Beleuchtung', 'StÃƒÂ¼ck', 50.00),
('Dimmer-Schalter (Unterputz)', 'Elektro & Beleuchtung', 'StÃƒÂ¼ck', 15.00),
('Steckdosenleiste 6-fach', 'Elektro & Beleuchtung', 'StÃƒÂ¼ck', 10.00),
('Antennendose (TV/Sat)', 'Elektro & Beleuchtung', 'StÃƒÂ¼ck', 5.00),
('LED-Baustrahler (Arbeitslampe)', 'Elektro & Beleuchtung', 'StÃƒÂ¼ck', 30.00),
('Leitungssucher (OrtungsgerÃƒÂ¤t)', 'Elektro & Beleuchtung', 'StÃƒÂ¼ck', 30.00),
('ÃƒÅ“berspannungsschutz (Zwischenstecker)', 'Elektro & Beleuchtung', 'StÃƒÂ¼ck', 15.00),
('Zeitschaltuhr (Steckdose)', 'Elektro & Beleuchtung', 'StÃƒÂ¼ck', 10.00),
('SpannungsprÃƒÂ¼fer (PrÃƒÂ¼fschraubendreher)', 'Elektro & Beleuchtung', 'StÃƒÂ¼ck', 5.00),
('Umzugskarton (Standard)', 'Umzugs- & Verpackungsmaterial', 'StÃƒÂ¼ck', 3.00),
('Luftpolsterfolie', 'Umzugs- & Verpackungsmaterial', 'm', 3.00),
('Packseide (Seidenpapier)', 'Umzugs- & Verpackungsmaterial', 'kg', 3.00),
('Klebeband (Packband) 50 m', 'Umzugs- & Verpackungsmaterial', 'Rolle', 5.00),
('Umzugsdecke (Polsterdecke)', 'Umzugs- & Verpackungsmaterial', 'StÃƒÂ¼ck', 10.00),
('MÃƒÂ¶belroller (Rollbrett)', 'Umzugs- & Verpackungsmaterial', 'StÃƒÂ¼ck', 15.00),
('Zurrgurt (Spanngurt)', 'Umzugs- & Verpackungsmaterial', 'StÃƒÂ¼ck', 8.00),
('Halteverbot-Schild', 'Umzugs- & Verpackungsmaterial', 'StÃƒÂ¼ck', 20.00),
('Sackkarre', 'Umzugs- & Verpackungsmaterial', 'StÃƒÂ¼ck', 40.00),
('Werkzeugkoffer (leer)', 'Umzugs- & Verpackungsmaterial', 'StÃƒÂ¼ck', 50.00),
('Kleiderkarton (mit Stange)', 'Umzugs- & Verpackungsmaterial', 'StÃƒÂ¼ck', 14.00),
('MatratzenhÃƒÂ¼lle (Schutzfolie)', 'Umzugs- & Verpackungsmaterial', 'StÃƒÂ¼ck', 8.00),
('Stretchfolie (Wickelfolie)', 'Umzugs- & Verpackungsmaterial', 'Rolle', 15.00),
('MÃƒÂ¶bel-Schutzfolie (SofaÃƒÂ¼berzug)', 'Umzugs- & Verpackungsmaterial', 'StÃƒÂ¼ck', 10.00),
('MÃƒÂ¶belgleiter (Gleiter-Set) 4 Stk', 'Umzugs- & Verpackungsmaterial', 'Set', 5.00),
('Tragegurte (MÃƒÂ¶belgurte) 2 Stk', 'Umzugs- & Verpackungsmaterial', 'Set', 20.00),
('Seil (Polypropylen) 10 m', 'Umzugs- & Verpackungsmaterial', 'StÃƒÂ¼ck', 5.00),
('Kantenschutzecken (Schaum) 8 Stk', 'Umzugs- & Verpackungsmaterial', 'Pack', 5.00),
('Klappbox (Kunststoffkiste) 60 L', 'Umzugs- & Verpackungsmaterial', 'StÃƒÂ¼ck', 20.00),
('Treppensackkarre (Treppensteiger)', 'Umzugs- & Verpackungsmaterial', 'StÃƒÂ¼ck', 120.00),
('MÃƒÂ¼llsÃƒÂ¤cke 120 L (10 Stk)', 'Sonstiges & Verbrauch', 'Packung', 8.00),
('Putzlappen (Baumwolle) 10 Stk', 'Sonstiges & Verbrauch', 'Packung', 5.00),
('SchwammtÃƒÂ¼cher (Reinigung) 5 Stk', 'Sonstiges & Verbrauch', 'Packung', 2.00),
('Bodenabdeckfolie (PE) 5 m', 'Sonstiges & Verbrauch', 'Rolle', 10.00),
('Baustellenradio', 'Sonstiges & Verbrauch', 'StÃƒÂ¼ck', 40.00),
('Breitklebeband (Gaffa)', 'Sonstiges & Verbrauch', 'Rolle', 4.00),
('Baustellenlampe (Warnleuchte)', 'Sonstiges & Verbrauch', 'StÃƒÂ¼ck', 30.00),
('WD-40 Spray (KriechÃƒÂ¶l) 250 ml', 'Sonstiges & Verbrauch', 'Dose', 5.00),
('Stromgenerator (Benzin)', 'Sonstiges & Verbrauch', 'StÃƒÂ¼ck', 400.00),
('Handfeger & Kehrschaufel (Set)', 'Sonstiges & Verbrauch', 'Set', 8.00),
('Schaufel (Spitzschaufel)', 'Sonstiges & Verbrauch', 'StÃƒÂ¼ck', 15.00),
('Besen (StraÃƒÅ¸enbesen)', 'Sonstiges & Verbrauch', 'StÃƒÂ¼ck', 15.00),
('Schuttsack (Bauabfallsack)', 'Sonstiges & Verbrauch', 'StÃƒÂ¼ck', 2.00),
('SprÃƒÂ¼hkleber 400 ml', 'Sonstiges & Verbrauch', 'Dose', 8.00),
('Bautrockner (Luftentfeuchter)', 'Sonstiges & Verbrauch', 'StÃƒÂ¼ck', 300.00),
('Bauventilator (TrocknerlÃƒÂ¼fter)', 'Sonstiges & Verbrauch', 'StÃƒÂ¼ck', 100.00),
('Big-Bag Abfallsack (1 mÃ‚Â³)', 'Sonstiges & Verbrauch', 'StÃƒÂ¼ck', 30.00),
('Markierspray (fluoreszierend) 500 ml', 'Sonstiges & Verbrauch', 'Dose', 10.00),
('Feinsteinzeug-Reiniger 5 L', 'Baustellenreiniger & Pflege', 'L', 20.00),
('Glasreiniger 1 L', 'Baustellenreiniger & Pflege', 'L', 3.00),
('Allzweckreiniger 1 L', 'Baustellenreiniger & Pflege', 'L', 4.00),
('Desinfektionsmittel 1 L', 'Baustellenreiniger & Pflege', 'L', 8.00),
('Fugenreiniger (Gel) 500 ml', 'Baustellenreiniger & Pflege', 'ml', 10.00),
('Bodenreiniger (Wischpflege)', 'Baustellenreiniger & Pflege', 'L', 5.00),
('Handreiniger (Paste) 500 ml', 'Baustellenreiniger & Pflege', 'Dose', 6.00),
('Mikrofaser-Tuch', 'Baustellenreiniger & Pflege', 'StÃƒÂ¼ck', 1.00),
('Stahlwolle (Reinigungspad) 200 g', 'Baustellenreiniger & Pflege', 'g', 2.00),
('WC-Reiniger 1 L', 'Baustellenreiniger & Pflege', 'L', 3.00),
('Zementschleier-Entferner 1 L', 'Baustellenreiniger & Pflege', 'L', 10.00),
('Schimmelentferner 500 ml', 'Baustellenreiniger & Pflege', 'ml', 12.00),
('Parkettpflege-Ãƒâ€“l 1 L', 'Baustellenreiniger & Pflege', 'L', 15.00),
('Stein-ImprÃƒÂ¤gnierung 1 L', 'Baustellenreiniger & Pflege', 'L', 20.00),
('Backofenreiniger', 'Baustellenreiniger & Pflege', 'StÃƒÂ¼ck', 5.00),
('Rohrreiniger (chemisch) 1 L', 'Baustellenreiniger & Pflege', 'L', 5.00),
('Entkalker 1 L', 'Baustellenreiniger & Pflege', 'L', 4.00),
('Teppichreiniger (Shampoo) 1 L', 'Baustellenreiniger & Pflege', 'L', 10.00),
('Klebstoffentferner 200 ml', 'Baustellenreiniger & Pflege', 'ml', 8.00),
('Grundreiniger (Bauschmutz) 1 L', 'Baustellenreiniger & Pflege', 'L', 10.00),
('Gipskartonplatte (12,5 mm) 2000Ãƒâ€”1250 mm', 'Trockenbau & DÃƒÂ¤mmung', 'StÃƒÂ¼ck', 10.00),
('UW-Profil 50 mm (4 m)', 'Trockenbau & DÃƒÂ¤mmung', 'StÃƒÂ¼ck', 5.00),
('CW-Profil 50 mm (4 m)', 'Trockenbau & DÃƒÂ¤mmung', 'StÃƒÂ¼ck', 6.00),
('Schnellbauschrauben 25 mm (500 Stk)', 'Trockenbau & DÃƒÂ¤mmung', 'Pack', 15.00),
('Fugenband (Gipskarton) 25 m', 'Trockenbau & DÃƒÂ¤mmung', 'Rolle', 5.00),
('Fugenspachtel (Gipskarton) 5 kg', 'Trockenbau & DÃƒÂ¤mmung', 'Beutel', 10.00),
('Trennwand-DÃƒÂ¤mmung (Mineralwolle) 1 mÃ‚Â²', 'Trockenbau & DÃƒÂ¤mmung', 'mÃ‚Â²', 5.00),
('Dampfsperrfolie 20 mÃ‚Â²', 'Trockenbau & DÃƒÂ¤mmung', 'Rolle', 20.00),
('Kantenschutzprofil (Alu) 2,5 m', 'Trockenbau & DÃƒÂ¤mmung', 'StÃƒÂ¼ck', 2.00),
('DirektabhÃƒÂ¤nger (DeckentrÃƒÂ¤ger)', 'Trockenbau & DÃƒÂ¤mmung', 'StÃƒÂ¼ck', 0.50),
('InnentÃƒÂ¼r (inkl. Zarge)', 'Fenster & TÃƒÂ¼ren', 'StÃƒÂ¼ck', 300.00),
('HaustÃƒÂ¼r (wÃƒÂ¤rmegedÃƒÂ¤mmt)', 'Fenster & TÃƒÂ¼ren', 'StÃƒÂ¼ck', 1000.00),
('Fenster (Kunststoff, 1Ãƒâ€”1 m)', 'Fenster & TÃƒÂ¼ren', 'StÃƒÂ¼ck', 500.00),
('BalkontÃƒÂ¼r 90Ãƒâ€”200 cm', 'Fenster & TÃƒÂ¼ren', 'StÃƒÂ¼ck', 700.00),
('TÃƒÂ¼rdrÃƒÂ¼cker-Garnitur (InnentÃƒÂ¼rgriff)', 'Fenster & TÃƒÂ¼ren', 'Set', 25.00),
('TÃƒÂ¼rzarge (Ersatz) 88Ãƒâ€”200 cm', 'Fenster & TÃƒÂ¼ren', 'StÃƒÂ¼ck', 100.00),
('Einsteckschloss (ZimmertÃƒÂ¼r)', 'Fenster & TÃƒÂ¼ren', 'StÃƒÂ¼ck', 15.00),
('SchlieÃƒÅ¸zylinder (Profil, 30/30)', 'Fenster & TÃƒÂ¼ren', 'StÃƒÂ¼ck', 30.00),
('TÃƒÂ¼rschwelle (ÃƒÅ“bergangsschiene)', 'Fenster & TÃƒÂ¼ren', 'StÃƒÂ¼ck', 20.00),
('Fensterbank innen (PVC) 1,0 m', 'Fenster & TÃƒÂ¼ren', 'StÃƒÂ¼ck', 20.00),
('Fensterbank auÃƒÅ¸en (Alu) 1,0 m', 'Fenster & TÃƒÂ¼ren', 'StÃƒÂ¼ck', 40.00),
('Rollladen (Fensterladen) 1 mÃ‚Â²', 'Fenster & TÃƒÂ¼ren', 'StÃƒÂ¼ck', 150.00),
('Dachfenster 78Ãƒâ€”98 cm (Schwingfenster)', 'Fenster & TÃƒÂ¼ren', 'StÃƒÂ¼ck', 500.00),
('TÃƒÂ¼rstopper', 'Fenster & TÃƒÂ¼ren', 'StÃƒÂ¼ck', 5.00),
('TÃƒÂ¼rschlieÃƒÅ¸er (TÃƒÂ¼rheber)', 'Fenster & TÃƒÂ¼ren', 'StÃƒÂ¼ck', 80.00),
('HeizkÃƒÂ¶rper (Plattenbau, MittelgrÃƒÂ¶ÃƒÅ¸e)', 'Heizung & Klima', 'StÃƒÂ¼ck', 200.00),
('Thermostatventil (HeizkÃƒÂ¶rper)', 'Heizung & Klima', 'StÃƒÂ¼ck', 20.00),
('HeizkÃƒÂ¶rper-Befestigung (Wandhalter-Set)', 'Heizung & Klima', 'Set', 10.00),
('UmwÃƒÂ¤lzpumpe (Heizung)', 'Heizung & Klima', 'StÃƒÂ¼ck', 150.00),
('Gas-Brennwerttherme', 'Heizung & Klima', 'StÃƒÂ¼ck', 3000.00),
('KlimagerÃƒÂ¤t (Split-Anlage)', 'Heizung & Klima', 'StÃƒÂ¼ck', 1000.00),
('BadheizkÃƒÂ¶rper (HandtuchwÃƒÂ¤rmer)', 'Heizung & Klima', 'StÃƒÂ¼ck', 150.00),
('FuÃƒÅ¸bodenheizungsrohr 100 m', 'Heizung & Klima', 'Rolle', 100.00),
('Kaminofen (Holzofen) freistehend', 'Heizung & Klima', 'StÃƒÂ¼ck', 800.00),
('AusdehnungsgefÃƒÂ¤ÃƒÅ¸ 25 L (Heizung)', 'Heizung & Klima', 'StÃƒÂ¼ck', 100.00),
('Solarthermie-Paneel (Modul)', 'Heizung & Klima', 'StÃƒÂ¼ck', 1000.00),
('HeizlÃƒÂ¼fter (Elektro, mobil)', 'Heizung & Klima', 'StÃƒÂ¼ck', 30.00),
('Schutzhelm (Bauhelm)', 'Arbeitsschutz & Sicherheit', 'StÃƒÂ¼ck', 20.00),
('Schutzbrille (Klarglas)', 'Arbeitsschutz & Sicherheit', 'StÃƒÂ¼ck', 6.00),
('Atemschutzmaske (FFP3)', 'Arbeitsschutz & Sicherheit', 'StÃƒÂ¼ck', 7.00),
('GehÃƒÂ¶rschutz (KapselgehÃƒÂ¶rschutz)', 'Arbeitsschutz & Sicherheit', 'Paar', 10.00),
('Arbeitshandschuhe (PVC-beschichtet)', 'Arbeitsschutz & Sicherheit', 'Paar', 4.00),
('Sicherheitsschuhe (S3)', 'Arbeitsschutz & Sicherheit', 'Paar', 60.00),
('Warnweste (hi-vis)', 'Arbeitsschutz & Sicherheit', 'StÃƒÂ¼ck', 5.00),
('FeuerlÃƒÂ¶scher 6 kg (ABC)', 'Arbeitsschutz & Sicherheit', 'StÃƒÂ¼ck', 50.00),
('Erste-Hilfe-Kasten (DIN 13164)', 'Arbeitsschutz & Sicherheit', 'StÃƒÂ¼ck', 20.00),
('Auffanggurt (Sicherheitsgurt)', 'Arbeitsschutz & Sicherheit', 'StÃƒÂ¼ck', 100.00),
('Absperrband (Warnband) 50 m', 'Arbeitsschutz & Sicherheit', 'Rolle', 3.00),
('Gartenzaun-Holzelement 1 m', 'AuÃƒÅ¸enbereich & Garten', 'StÃƒÂ¼ck', 30.00),
('Maschendrahtzaun 1,5 m (10 m Rolle)', 'AuÃƒÅ¸enbereich & Garten', 'Rolle', 50.00),
('Zaunpfosten (Metall) 1,5 m', 'AuÃƒÅ¸enbereich & Garten', 'StÃƒÂ¼ck', 20.00),
('Gartentor (Metall) 100 cm', 'AuÃƒÅ¸enbereich & Garten', 'StÃƒÂ¼ck', 150.00),
('Terrassenplatte (Beton) 50Ãƒâ€”50 cm', 'AuÃƒÅ¸enbereich & Garten', 'StÃƒÂ¼ck', 5.00),
('Pflasterstein (Beton) 10Ãƒâ€”20 cm', 'AuÃƒÅ¸enbereich & Garten', 'StÃƒÂ¼ck', 0.50),
('Randstein (Beetkante) 100 cm', 'AuÃƒÅ¸enbereich & Garten', 'StÃƒÂ¼ck', 10.00),
('Zierkies 25 kg', 'AuÃƒÅ¸enbereich & Garten', 'Sack', 6.00),
('Gehwegplatte 30Ãƒâ€”30 cm', 'AuÃƒÅ¸enbereich & Garten', 'StÃƒÂ¼ck', 2.00),
('Rasengitterstein (Beton) 40Ãƒâ€”40 cm', 'AuÃƒÅ¸enbereich & Garten', 'StÃƒÂ¼ck', 5.00),
('Regentonne 200 L', 'AuÃƒÅ¸enbereich & Garten', 'StÃƒÂ¼ck', 40.00),
('Gartenschlauch 20 m', 'AuÃƒÅ¸enbereich & Garten', 'StÃƒÂ¼ck', 25.00),
('Rasensprenger (Sprinkler)', 'AuÃƒÅ¸enbereich & Garten', 'StÃƒÂ¼ck', 15.00),
('AuÃƒÅ¸enleuchte (Wandlampe)', 'AuÃƒÅ¸enbereich & Garten', 'StÃƒÂ¼ck', 30.00),
('Bewegungsmelder (AuÃƒÅ¸en)', 'AuÃƒÅ¸enbereich & Garten', 'StÃƒÂ¼ck', 25.00),
('AuÃƒÅ¸ensteckdose (Garten) Dual', 'AuÃƒÅ¸enbereich & Garten', 'StÃƒÂ¼ck', 20.00),
('Teichfolie 4 mÃ‚Â²', 'AuÃƒÅ¸enbereich & Garten', 'mÃ‚Â²', 40.00),
('Gartenhacke (Handhacke)', 'AuÃƒÅ¸enbereich & Garten', 'StÃƒÂ¼ck', 15.00),
('Spaten (GÃƒÂ¤rtnerspaten)', 'AuÃƒÅ¸enbereich & Garten', 'StÃƒÂ¼ck', 20.00),
('Heckenschere (manuell)', 'AuÃƒÅ¸enbereich & Garten', 'StÃƒÂ¼ck', 25.00);

ALTER TABLE public.materialien ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS materialien_read ON public.materialien;
CREATE POLICY materialien_read ON public.materialien FOR SELECT TO authenticated USING (TRUE);

CREATE INDEX IF NOT EXISTS idx_materialien_kategorie ON public.materialien(kategorie);
CREATE INDEX IF NOT EXISTS idx_materialien_name      ON public.materialien(name);


-- ============================================================
-- 5. HOME ORGANIZER TABELLEN
-- ============================================================

-- Ã¢â€â‚¬Ã¢â€â‚¬ home_projekte (vor todo_aufgaben FK) Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
CREATE TABLE IF NOT EXISTS public.home_projekte (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name         text NOT NULL,
  typ          text DEFAULT 'Sonstiges',
  status       text DEFAULT 'geplant',
  beschreibung text,
  startdatum   date,
  zieldatum    date,
  deadline     date,
  budget       numeric(10,2),
  farbe        text,
  notizen      text,
  created_at   timestamptz DEFAULT NOW(),
  updated_at   timestamptz DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_home_projekte_user_id ON public.home_projekte(user_id);

DROP TRIGGER IF EXISTS set_home_projekte_updated_at ON public.home_projekte;
CREATE TRIGGER set_home_projekte_updated_at
  BEFORE UPDATE ON public.home_projekte
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.home_projekte ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS home_projekte_crud_own ON public.home_projekte;
CREATE POLICY home_projekte_crud_own ON public.home_projekte FOR ALL
  USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);


-- Ã¢â€â‚¬Ã¢â€â‚¬ home_orte Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
CREATE TABLE IF NOT EXISTS public.home_orte (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name                   text NOT NULL,
  typ                    text DEFAULT 'Wohnung',
  adresse                text,
  notizen                text,
  farbe                  text,
  symbol                 text,
  migriert_von_kiste_id  uuid REFERENCES public.pack_kisten(id) ON DELETE SET NULL,
  created_at             timestamptz DEFAULT NOW(),
  updated_at             timestamptz DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_home_orte_user_id ON public.home_orte(user_id);

DROP TRIGGER IF EXISTS set_home_orte_updated_at ON public.home_orte;
CREATE TRIGGER set_home_orte_updated_at
  BEFORE UPDATE ON public.home_orte
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.home_orte ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS home_orte_crud_own ON public.home_orte;
CREATE POLICY home_orte_crud_own ON public.home_orte FOR ALL
  USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);


-- Ã¢â€â‚¬Ã¢â€â‚¬ home_lagerorte Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
CREATE TABLE IF NOT EXISTS public.home_lagerorte (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  ort_id                uuid REFERENCES public.home_orte(id) ON DELETE CASCADE NOT NULL,
  parent_id             uuid REFERENCES public.home_lagerorte(id) ON DELETE CASCADE,
  name                  text NOT NULL,
  typ                   text DEFAULT 'Regal',
  beschreibung          text,
  qr_code_wert          text UNIQUE,
  foto_pfad             text,
  position              integer DEFAULT 0,
  farbe                 text,
  migriert_von_kiste_id uuid REFERENCES public.pack_kisten(id) ON DELETE SET NULL,
  created_at            timestamptz DEFAULT NOW(),
  updated_at            timestamptz DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_home_lagerorte_user_id   ON public.home_lagerorte(user_id);
CREATE INDEX IF NOT EXISTS idx_home_lagerorte_ort_id    ON public.home_lagerorte(ort_id);
CREATE INDEX IF NOT EXISTS idx_home_lagerorte_parent_id ON public.home_lagerorte(parent_id);

DROP TRIGGER IF EXISTS set_home_lagerorte_updated_at ON public.home_lagerorte;
CREATE TRIGGER set_home_lagerorte_updated_at
  BEFORE UPDATE ON public.home_lagerorte
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.home_lagerorte ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS home_lagerorte_crud_own ON public.home_lagerorte;
CREATE POLICY home_lagerorte_crud_own ON public.home_lagerorte FOR ALL
  USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);


-- Ã¢â€â‚¬Ã¢â€â‚¬ home_objekte Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
CREATE TABLE IF NOT EXISTS public.home_objekte (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                     uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  lagerort_id                 uuid REFERENCES public.home_lagerorte(id) ON DELETE SET NULL,
  ort_id                      uuid REFERENCES public.home_orte(id) ON DELETE SET NULL,
  name                        text NOT NULL,
  beschreibung                text,
  kategorie                   text,
  status                      text DEFAULT 'in_verwendung',
  menge                       integer DEFAULT 1,
  tags                        text[],
  fotos                       text[],
  seriennummer                text,
  kaufdatum                   date,
  kaufpreis                   numeric(10,2),
  garantie_bis                date,
  zugriffshaeufigkeit         text DEFAULT 'selten',
  zuletzt_zugegriffen         timestamptz,
  verliehen_an                text,
  verliehen_am                date,
  migriert_von_gegenstand_id  uuid REFERENCES public.pack_gegenstaende(id) ON DELETE SET NULL,
  created_at                  timestamptz DEFAULT NOW(),
  updated_at                  timestamptz DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_home_objekte_user_id     ON public.home_objekte(user_id);
CREATE INDEX IF NOT EXISTS idx_home_objekte_lagerort_id ON public.home_objekte(lagerort_id);
CREATE INDEX IF NOT EXISTS idx_home_objekte_ort_id      ON public.home_objekte(ort_id);
CREATE INDEX IF NOT EXISTS idx_home_objekte_status      ON public.home_objekte(status);
CREATE INDEX IF NOT EXISTS idx_home_objekte_tags        ON public.home_objekte USING gin(tags);

DROP TRIGGER IF EXISTS set_home_objekte_updated_at ON public.home_objekte;
CREATE TRIGGER set_home_objekte_updated_at
  BEFORE UPDATE ON public.home_objekte
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.home_objekte ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS home_objekte_crud_own ON public.home_objekte;
CREATE POLICY home_objekte_crud_own ON public.home_objekte FOR ALL
  USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);


-- Ã¢â€â‚¬Ã¢â€â‚¬ home_vorraete Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
CREATE TABLE IF NOT EXISTS public.home_vorraete (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  lagerort_id   uuid REFERENCES public.home_lagerorte(id) ON DELETE SET NULL,
  name          text NOT NULL,
  kategorie     text DEFAULT 'Haushalt',
  einheit       text DEFAULT 'StÃƒÂ¼ck',
  bestand       numeric(10,2) DEFAULT 0,
  mindestmenge  numeric(10,2) DEFAULT 1,
  ablaufdatum   date,
  notizen       text,
  created_at    timestamptz DEFAULT NOW(),
  updated_at    timestamptz DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_home_vorraete_user_id ON public.home_vorraete(user_id);

DROP TRIGGER IF EXISTS set_home_vorraete_updated_at ON public.home_vorraete;
CREATE TRIGGER set_home_vorraete_updated_at
  BEFORE UPDATE ON public.home_vorraete
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.home_vorraete ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS home_vorraete_crud_own ON public.home_vorraete;
CREATE POLICY home_vorraete_crud_own ON public.home_vorraete FOR ALL
  USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);


-- Ã¢â€â‚¬Ã¢â€â‚¬ home_einkaufliste Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
CREATE TABLE IF NOT EXISTS public.home_einkaufliste (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  vorrat_id   uuid REFERENCES public.home_vorraete(id) ON DELETE SET NULL,
  name        text NOT NULL,
  original_text text,
  normalized_name text,
  menge       numeric(10,2) DEFAULT 1,
  einheit     text DEFAULT 'StÃƒÂ¼ck',
  kategorie   text,
  hauptkategorie text,
  unterkategorie text,
  confidence  numeric(4,3),
  review_noetig boolean NOT NULL DEFAULT false,
  quelle      text NOT NULL DEFAULT 'manuell'
    CHECK (quelle IN ('manuell','ki','vorrat')),
  erledigt    boolean DEFAULT FALSE,
  erledigt_am timestamptz,
  notizen     text,
  created_at  timestamptz DEFAULT NOW(),
  updated_at  timestamptz DEFAULT NOW()
);

ALTER TABLE public.home_einkaufliste ADD COLUMN IF NOT EXISTS original_text text;
ALTER TABLE public.home_einkaufliste ADD COLUMN IF NOT EXISTS normalized_name text;
ALTER TABLE public.home_einkaufliste ADD COLUMN IF NOT EXISTS hauptkategorie text;
ALTER TABLE public.home_einkaufliste ADD COLUMN IF NOT EXISTS unterkategorie text;
ALTER TABLE public.home_einkaufliste ADD COLUMN IF NOT EXISTS confidence numeric(4,3);
ALTER TABLE public.home_einkaufliste ADD COLUMN IF NOT EXISTS review_noetig boolean NOT NULL DEFAULT false;
ALTER TABLE public.home_einkaufliste ADD COLUMN IF NOT EXISTS quelle text NOT NULL DEFAULT 'manuell';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.check_constraints
    WHERE constraint_name = 'home_einkaufliste_quelle_check'
  ) THEN
    ALTER TABLE public.home_einkaufliste
      ADD CONSTRAINT home_einkaufliste_quelle_check
      CHECK (quelle IN ('manuell','ki','vorrat'));
  END IF;
END $$;

UPDATE public.home_einkaufliste
SET
  original_text = COALESCE(original_text, name),
  normalized_name = COALESCE(normalized_name, name),
  hauptkategorie = COALESCE(
    hauptkategorie,
    CASE
      WHEN kategorie = 'Lebensmittel' THEN 'Lebensmittel'
      WHEN kategorie = 'Haushalt' THEN 'Haushalt'
      WHEN kategorie = 'Hygiene' THEN 'Drogerie'
      WHEN kategorie = 'Reinigung' THEN 'Haushalt'
      WHEN kategorie = 'Technik' THEN 'Elektronik'
      ELSE 'Sonstiges'
    END
  ),
  unterkategorie = COALESCE(
    unterkategorie,
    CASE
      WHEN kategorie = 'Reinigung' THEN 'Reinigung'
      ELSE unterkategorie
    END
  ),
  confidence = COALESCE(
    confidence,
    CASE
      WHEN kategorie IN ('Lebensmittel','Haushalt') THEN 0.90
      WHEN kategorie IN ('Hygiene','Reinigung','Technik') THEN 0.82
      ELSE 0.45
    END
  ),
  review_noetig = CASE
    WHEN review_noetig IS TRUE THEN true
    WHEN kategorie IN ('Lebensmittel','Haushalt','Hygiene','Reinigung','Technik') THEN false
    ELSE true
  END,
  quelle = COALESCE(NULLIF(quelle, ''), 'manuell'),
  kategorie = COALESCE(
    hauptkategorie,
    CASE
      WHEN kategorie = 'Lebensmittel' THEN 'Lebensmittel'
      WHEN kategorie = 'Haushalt' THEN 'Haushalt'
      WHEN kategorie = 'Hygiene' THEN 'Drogerie'
      WHEN kategorie = 'Reinigung' THEN 'Haushalt'
      WHEN kategorie = 'Technik' THEN 'Elektronik'
      ELSE 'Sonstiges'
    END
  );

CREATE INDEX IF NOT EXISTS idx_home_einkaufliste_user_id  ON public.home_einkaufliste(user_id);
CREATE INDEX IF NOT EXISTS idx_home_einkaufliste_erledigt ON public.home_einkaufliste(erledigt);
CREATE INDEX IF NOT EXISTS idx_home_einkaufliste_normalized_name ON public.home_einkaufliste(normalized_name);
CREATE INDEX IF NOT EXISTS idx_home_einkaufliste_hauptkategorie ON public.home_einkaufliste(hauptkategorie);
CREATE INDEX IF NOT EXISTS idx_home_einkaufliste_review_noetig ON public.home_einkaufliste(review_noetig);

DROP TRIGGER IF EXISTS set_home_einkaufliste_updated_at ON public.home_einkaufliste;
CREATE TRIGGER set_home_einkaufliste_updated_at
  BEFORE UPDATE ON public.home_einkaufliste
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.home_einkaufliste ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS home_einkaufliste_crud_own ON public.home_einkaufliste;
CREATE POLICY home_einkaufliste_crud_own ON public.home_einkaufliste FOR ALL
  USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);


-- Ã¢â€â‚¬Ã¢â€â‚¬ home_einkauf_korrekturen Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
CREATE TABLE IF NOT EXISTS public.home_einkauf_korrekturen (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  created_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  normalized_name    text NOT NULL,
  bevorzugter_name   text,
  hauptkategorie     text NOT NULL,
  unterkategorie     text,
  standard_einheit   text,
  created_at         timestamptz DEFAULT NOW(),
  updated_at         timestamptz DEFAULT NOW(),
  UNIQUE (user_id, normalized_name)
);

CREATE INDEX IF NOT EXISTS idx_home_einkauf_korrekturen_user_id
  ON public.home_einkauf_korrekturen(user_id);

DROP TRIGGER IF EXISTS set_home_einkauf_korrekturen_updated_at ON public.home_einkauf_korrekturen;
CREATE TRIGGER set_home_einkauf_korrekturen_updated_at
  BEFORE UPDATE ON public.home_einkauf_korrekturen
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.home_einkauf_korrekturen ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS home_einkauf_korrekturen_crud_own ON public.home_einkauf_korrekturen;
CREATE POLICY home_einkauf_korrekturen_crud_own ON public.home_einkauf_korrekturen FOR ALL
  USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);


-- Ã¢â€â‚¬Ã¢â€â‚¬ home_geraete Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
CREATE TABLE IF NOT EXISTS public.home_geraete (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  lagerort_id              uuid REFERENCES public.home_lagerorte(id) ON DELETE SET NULL,
  name                     text NOT NULL,
  hersteller               text,
  modell                   text,
  seriennummer             text,
  kaufdatum                date,
  kaufpreis                numeric(10,2),
  garantie_bis             date,
  gewaehrleistung_bis      date,
  naechste_wartung         date,
  wartungsintervall_monate integer,
  notizen                  text,
  handbuch_pfad            text,
  foto_pfad                text,
  dokument_ids             uuid[],
  verknuepfte_dokument_ids uuid[] DEFAULT '{}',
  created_at               timestamptz DEFAULT NOW(),
  updated_at               timestamptz DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_home_geraete_user_id          ON public.home_geraete(user_id);
CREATE INDEX IF NOT EXISTS idx_home_geraete_naechste_wartung ON public.home_geraete(naechste_wartung);

DROP TRIGGER IF EXISTS set_home_geraete_updated_at ON public.home_geraete;
CREATE TRIGGER set_home_geraete_updated_at
  BEFORE UPDATE ON public.home_geraete
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.home_geraete ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS home_geraete_crud_own ON public.home_geraete;
CREATE POLICY home_geraete_crud_own ON public.home_geraete FOR ALL
  USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);


-- Ã¢â€â‚¬Ã¢â€â‚¬ home_wartungen Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
CREATE TABLE IF NOT EXISTS public.home_wartungen (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  geraet_id            uuid REFERENCES public.home_geraete(id) ON DELETE CASCADE NOT NULL,
  datum                date NOT NULL DEFAULT CURRENT_DATE,
  typ                  text DEFAULT 'Wartung',
  beschreibung         text,
  kosten               numeric(10,2),
  durchgefuehrt_von    text,
  naechste_faelligkeit date,
  notizen              text,
  created_at           timestamptz DEFAULT NOW(),
  updated_at           timestamptz DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_home_wartungen_user_id   ON public.home_wartungen(user_id);
CREATE INDEX IF NOT EXISTS idx_home_wartungen_geraet_id ON public.home_wartungen(geraet_id);

DROP TRIGGER IF EXISTS set_home_wartungen_updated_at ON public.home_wartungen;
CREATE TRIGGER set_home_wartungen_updated_at
  BEFORE UPDATE ON public.home_wartungen
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.home_wartungen ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS home_wartungen_crud_own ON public.home_wartungen;
CREATE POLICY home_wartungen_crud_own ON public.home_wartungen FOR ALL
  USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);


-- Ã¢â€â‚¬Ã¢â€â‚¬ home_bewohner Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
CREATE TABLE IF NOT EXISTS public.home_bewohner (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  linked_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  name       text NOT NULL,
  farbe      text NOT NULL DEFAULT '#10B981',
  emoji      text DEFAULT U&'\D83D\DC64',
  created_at timestamptz DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_home_bewohner_user_id ON public.home_bewohner(user_id);
CREATE INDEX IF NOT EXISTS idx_home_bewohner_linked_user_id ON public.home_bewohner(linked_user_id);

ALTER TABLE public.home_bewohner ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS home_bewohner_user_own ON public.home_bewohner;
CREATE POLICY home_bewohner_user_own ON public.home_bewohner FOR ALL
  USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);


-- Ã¢â€â‚¬Ã¢â€â‚¬ home_budget_limits Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
CREATE TABLE IF NOT EXISTS public.home_budget_limits (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kategorie  text NOT NULL,
  limit_euro numeric(10,2) NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT NOW(),
  UNIQUE(user_id, kategorie)
);

ALTER TABLE public.home_budget_limits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS home_budget_limits_own ON public.home_budget_limits;
CREATE POLICY home_budget_limits_own ON public.home_budget_limits FOR ALL
  USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);

CREATE INDEX IF NOT EXISTS idx_home_budget_limits_user ON public.home_budget_limits(user_id);


-- Ã¢â€â‚¬Ã¢â€â‚¬ home_sparziele Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
CREATE TABLE IF NOT EXISTS public.home_sparziele (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name             text NOT NULL,
  ziel_betrag      numeric(10,2) NOT NULL,
  aktueller_betrag numeric(10,2) NOT NULL DEFAULT 0,
  zieldatum        date,
  farbe            text DEFAULT '#10B981',
  emoji            text DEFAULT 'Ã°Å¸Å½Â¯',
  created_at       timestamptz DEFAULT NOW(),
  updated_at       timestamptz DEFAULT NOW()
);

ALTER TABLE public.home_sparziele ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS home_sparziele_own ON public.home_sparziele;
CREATE POLICY home_sparziele_own ON public.home_sparziele FOR ALL
  USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);

CREATE INDEX IF NOT EXISTS idx_home_sparziele_user ON public.home_sparziele(user_id);

DROP TRIGGER IF EXISTS set_home_sparziele_updated_at ON public.home_sparziele;
CREATE TRIGGER set_home_sparziele_updated_at
  BEFORE UPDATE ON public.home_sparziele
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- home_budget_views (persoenliche Budget-Ansichten pro Haushalt)
CREATE TABLE IF NOT EXISTS public.home_budget_views (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  household_id uuid NOT NULL,
  name         text NOT NULL,
  is_default   boolean NOT NULL DEFAULT false,
  filters      jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT NOW(),
  updated_at   timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_home_budget_views_household_id
  ON public.home_budget_views(household_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_home_budget_views_user_household_name_unique
  ON public.home_budget_views(user_id, household_id, lower(name));
CREATE UNIQUE INDEX IF NOT EXISTS idx_home_budget_views_user_household_default_unique
  ON public.home_budget_views(user_id, household_id)
  WHERE is_default = true;

DROP TRIGGER IF EXISTS set_home_budget_views_updated_at ON public.home_budget_views;
CREATE TRIGGER set_home_budget_views_updated_at
  BEFORE UPDATE ON public.home_budget_views
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.home_budget_views ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS home_budget_views_own ON public.home_budget_views;
CREATE POLICY home_budget_views_own ON public.home_budget_views FOR ALL
  USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);


-- home_budget_view_state (aktueller Budget-Filterzustand pro User + Haushalt)
CREATE TABLE IF NOT EXISTS public.home_budget_view_state (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  household_id   uuid NOT NULL,
  active_view_id uuid REFERENCES public.home_budget_views(id) ON DELETE SET NULL,
  current_state  jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at     timestamptz NOT NULL DEFAULT NOW(),
  updated_at     timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, household_id)
);

CREATE INDEX IF NOT EXISTS idx_home_budget_view_state_household_id
  ON public.home_budget_view_state(household_id);
CREATE INDEX IF NOT EXISTS idx_home_budget_view_state_active_view_id
  ON public.home_budget_view_state(active_view_id);

DROP TRIGGER IF EXISTS set_home_budget_view_state_updated_at ON public.home_budget_view_state;
CREATE TRIGGER set_home_budget_view_state_updated_at
  BEFORE UPDATE ON public.home_budget_view_state
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.home_budget_view_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS home_budget_view_state_own ON public.home_budget_view_state;
CREATE POLICY home_budget_view_state_own ON public.home_budget_view_state FOR ALL
  USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);


-- home_finanzkonten (muss vor den Shared-Table-DO-Bloecken stehen)
CREATE TABLE IF NOT EXISTS public.home_finanzkonten (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id         uuid,
  user_id              uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by_user_id   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  name                 text NOT NULL,
  konto_typ            text NOT NULL DEFAULT 'haushaltskonto'
    CHECK (konto_typ IN ('haushaltskonto','privatkonto','kreditkarte','paypal','bar','sparkonto')),
  inhaber_typ          text NOT NULL DEFAULT 'household'
    CHECK (inhaber_typ IN ('household','bewohner')),
  inhaber_bewohner_id  uuid REFERENCES public.home_bewohner(id) ON DELETE SET NULL,
  aktiv                boolean NOT NULL DEFAULT true,
  farbe                text DEFAULT '#10B981',
  sortierung           int DEFAULT 0,
  created_at           timestamptz DEFAULT NOW(),
  updated_at           timestamptz DEFAULT NOW()
);

-- Supabase Linter: in bestehenden Instanzen kann aus älteren Migrationen
-- zusätzlich idx_home_finanzkonten_household_id existieren. Der ist identisch
-- zu idx_home_finanzkonten_household und wird deshalb hier defensiv entfernt.
DROP INDEX IF EXISTS public.idx_home_finanzkonten_household_id;

CREATE INDEX IF NOT EXISTS idx_home_finanzkonten_household
  ON public.home_finanzkonten(household_id);
CREATE INDEX IF NOT EXISTS idx_home_finanzkonten_inhaber
  ON public.home_finanzkonten(inhaber_bewohner_id);
CREATE INDEX IF NOT EXISTS idx_home_finanzkonten_aktiv
  ON public.home_finanzkonten(household_id, aktiv, sortierung);

DROP TRIGGER IF EXISTS set_home_finanzkonten_updated_at ON public.home_finanzkonten;
CREATE TRIGGER set_home_finanzkonten_updated_at
  BEFORE UPDATE ON public.home_finanzkonten
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.home_finanzkonten ENABLE ROW LEVEL SECURITY;

-- Initiale eigene RLS; wird durch den Shared-Table-DO-Block weiter unten
-- mit household_member_access ueberschrieben
DROP POLICY IF EXISTS home_finanzkonten_crud_own ON public.home_finanzkonten;
CREATE POLICY home_finanzkonten_crud_own ON public.home_finanzkonten FOR ALL
  USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);

-- zahlungskonto_id FK auf budget_posten (hier, NACH home_finanzkonten)
ALTER TABLE public.budget_posten
  ADD COLUMN IF NOT EXISTS zahlungskonto_id uuid
    REFERENCES public.home_finanzkonten(id) ON DELETE SET NULL;


-- Ã¢â€â‚¬Ã¢â€â‚¬ home_verlauf Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
CREATE TABLE IF NOT EXISTS public.home_verlauf (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tabelle       text NOT NULL,
  datensatz_name text,
  aktion        text NOT NULL,
  created_at    timestamptz DEFAULT now()
);

ALTER TABLE public.home_verlauf ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS home_verlauf_own ON public.home_verlauf;
CREATE POLICY home_verlauf_own ON public.home_verlauf FOR ALL
  USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);

CREATE INDEX IF NOT EXISTS idx_home_verlauf_user ON public.home_verlauf(user_id);
CREATE INDEX IF NOT EXISTS idx_home_verlauf_created ON public.home_verlauf(created_at DESC);


-- Ã¢â€â‚¬Ã¢â€â‚¬ home_wissen Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
CREATE TABLE IF NOT EXISTS public.home_wissen (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  titel      text NOT NULL,
  inhalt     text,
  kategorie  text,
  tags       text[],
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.home_wissen ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS home_wissen_own ON public.home_wissen;
CREATE POLICY home_wissen_own ON public.home_wissen FOR ALL
  USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);

CREATE INDEX IF NOT EXISTS idx_home_wissen_user ON public.home_wissen(user_id);

DROP TRIGGER IF EXISTS set_home_wissen_updated_at ON public.home_wissen;
CREATE TRIGGER set_home_wissen_updated_at
  BEFORE UPDATE ON public.home_wissen
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- Ã¢â€â‚¬Ã¢â€â‚¬ haushaltsaufgaben Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
CREATE TABLE IF NOT EXISTS public.haushaltsaufgaben (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name                   text NOT NULL,
  kategorie              text DEFAULT 'Sonstiges',
  beschreibung           text,
  intervall_tage         integer,
  letzte_erledigung      date,
  naechste_faelligkeit   date,
  zugewiesen_an          uuid REFERENCES public.home_bewohner(id) ON DELETE SET NULL,
  erledigt               boolean DEFAULT FALSE,
  prioritaet             text DEFAULT 'Mittel',
  created_at             timestamptz DEFAULT NOW(),
  updated_at             timestamptz DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_haushaltsaufgaben_user_id ON public.haushaltsaufgaben(user_id);

DROP TRIGGER IF EXISTS set_haushaltsaufgaben_updated_at ON public.haushaltsaufgaben;
CREATE TRIGGER set_haushaltsaufgaben_updated_at
  BEFORE UPDATE ON public.haushaltsaufgaben
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.haushaltsaufgaben ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS haushaltsaufgaben_crud_own ON public.haushaltsaufgaben;
CREATE POLICY haushaltsaufgaben_crud_own ON public.haushaltsaufgaben FOR ALL
  USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);


-- Ã¢â€â‚¬Ã¢â€â‚¬ vorraete (Alias-Tabelle fÃƒÂ¼r check-reminders) Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
-- Wird von der check-reminders Edge Function verwendet.
-- Spiegelt home_vorraete mit konsistenten Spaltennamen.
CREATE TABLE IF NOT EXISTS public.vorraete (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name          text NOT NULL,
  kategorie     text DEFAULT 'Haushalt',
  einheit       text DEFAULT 'StÃƒÂ¼ck',
  menge         numeric(10,2) DEFAULT 0,
  mindest_menge numeric(10,2) DEFAULT 1,
  ablaufdatum   date,
  notizen       text,
  created_at    timestamptz DEFAULT NOW(),
  updated_at    timestamptz DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vorraete_user_id ON public.vorraete(user_id);

DROP TRIGGER IF EXISTS set_vorraete_updated_at ON public.vorraete;
CREATE TRIGGER set_vorraete_updated_at
  BEFORE UPDATE ON public.vorraete
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.vorraete ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS vorraete_crud_own ON public.vorraete;
CREATE POLICY vorraete_crud_own ON public.vorraete FOR ALL
  USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);


-- Ã¢â€â‚¬Ã¢â€â‚¬ projekte (Alias fÃƒÂ¼r check-reminders) Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
CREATE TABLE IF NOT EXISTS public.projekte (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name        text NOT NULL,
  status      text DEFAULT 'geplant',
  beschreibung text,
  deadline    date,
  budget      numeric(10,2),
  created_at  timestamptz DEFAULT NOW(),
  updated_at  timestamptz DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_projekte_user_id ON public.projekte(user_id);

DROP TRIGGER IF EXISTS set_projekte_updated_at ON public.projekte;
CREATE TRIGGER set_projekte_updated_at
  BEFORE UPDATE ON public.projekte
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.projekte ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS projekte_crud_own ON public.projekte;
CREATE POLICY projekte_crud_own ON public.projekte FOR ALL
  USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);


-- Ã¢â€â‚¬Ã¢â€â‚¬ geraete (Alias fÃƒÂ¼r check-reminders) Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
CREATE TABLE IF NOT EXISTS public.geraete (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name             text NOT NULL,
  naechste_wartung date,
  created_at       timestamptz DEFAULT NOW(),
  updated_at       timestamptz DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_geraete_user_id ON public.geraete(user_id);

ALTER TABLE public.geraete ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS geraete_crud_own ON public.geraete;
CREATE POLICY geraete_crud_own ON public.geraete FOR ALL
  USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);


-- ============================================================
-- 6. TABELLEN-ERWEITERUNGEN (ALTER TABLE)
-- ============================================================

-- todo_aufgaben: App-Modus + Home-Projekt + Bewohner
ALTER TABLE public.todo_aufgaben
  ADD COLUMN IF NOT EXISTS app_modus       text DEFAULT 'umzug';
ALTER TABLE public.todo_aufgaben
  ADD COLUMN IF NOT EXISTS home_projekt_id uuid REFERENCES public.home_projekte(id) ON DELETE SET NULL;
ALTER TABLE public.todo_aufgaben
  ADD COLUMN IF NOT EXISTS bewohner_id     uuid REFERENCES public.home_bewohner(id) ON DELETE SET NULL;

-- budget_posten: App-Modus + Typ + Home-Projekt + Bewohner
ALTER TABLE public.budget_posten
  ADD COLUMN IF NOT EXISTS app_modus       text DEFAULT 'umzug';
ALTER TABLE public.budget_posten
  ADD COLUMN IF NOT EXISTS typ             text NOT NULL DEFAULT 'ausgabe';
ALTER TABLE public.budget_posten
  ADD COLUMN IF NOT EXISTS home_projekt_id uuid REFERENCES public.home_projekte(id) ON DELETE SET NULL;
ALTER TABLE public.budget_posten
  ADD COLUMN IF NOT EXISTS bewohner_id     uuid REFERENCES public.home_bewohner(id) ON DELETE SET NULL;

-- Check-Constraint fÃƒÂ¼r budget_posten.typ
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_name = 'budget_posten_typ_check'
  ) THEN
    ALTER TABLE public.budget_posten
      ADD CONSTRAINT budget_posten_typ_check CHECK (typ IN ('ausgabe', 'einnahme'));
  END IF;
END $$;

-- home_objekte: Bewohner-Zuordnung
ALTER TABLE public.home_objekte
  ADD COLUMN IF NOT EXISTS bewohner_id uuid REFERENCES public.home_bewohner(id) ON DELETE SET NULL;

-- user_profile: App-Modus fÃƒÂ¼r gerÃƒÂ¤teÃƒÂ¼bergreifende Synchronisation
ALTER TABLE public.user_profile
  ADD COLUMN IF NOT EXISTS app_modus text DEFAULT 'umzug';

-- user_profile: Einkaufsliste Push-Reminder
ALTER TABLE public.user_profile
  ADD COLUMN IF NOT EXISTS einkauf_reminder_aktiv        boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS einkauf_reminder_zeit         text,
  ADD COLUMN IF NOT EXISTS einkauf_reminder_letzter_versand date;

-- user_profile: Umzugsplaner dauerhaft deaktivieren
ALTER TABLE public.user_profile
  ADD COLUMN IF NOT EXISTS umzug_deaktiviert boolean DEFAULT false;


-- ============================================================
-- 7. STORAGE BUCKET (HOME FOTOS)
-- ============================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'home-fotos', 'home-fotos', FALSE, 10485760,
  ARRAY['image/jpeg','image/png','image/gif','image/webp']
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS storage_home_fotos_insert ON storage.objects;
CREATE POLICY storage_home_fotos_insert ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'home-fotos'
    AND (select auth.uid())::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS storage_home_fotos_select ON storage.objects;
CREATE POLICY storage_home_fotos_select ON storage.objects FOR SELECT
  USING (
    bucket_id = 'home-fotos'
    AND (select auth.uid())::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS storage_home_fotos_delete ON storage.objects;
CREATE POLICY storage_home_fotos_delete ON storage.objects FOR DELETE
  USING (
    bucket_id = 'home-fotos'
    AND (select auth.uid())::text = (storage.foldername(name))[1]
  );


-- ============================================================
-- 8. PUSH-BENACHRICHTIGUNGEN
-- ============================================================

-- Speichert Web-Push-Subscriptions pro Nutzer und GerÃƒÂ¤t
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id         uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    uuid        REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  endpoint   text        NOT NULL,
  p256dh     text        NOT NULL,
  auth       text        NOT NULL,
  created_at timestamptz DEFAULT NOW(),
  updated_at timestamptz DEFAULT NOW(),
  UNIQUE(user_id, endpoint)
);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Eigene Subscriptions verwalten" ON public.push_subscriptions;
CREATE POLICY "Eigene Subscriptions verwalten"
  ON public.push_subscriptions FOR ALL
  USING ((select auth.uid()) = user_id);

-- Alte Subscriptions automatisch bereinigen (> 90 Tage)
CREATE OR REPLACE FUNCTION public.bereinige_alte_subscriptions()
RETURNS void LANGUAGE sql
SET search_path = ''
AS $$
  DELETE FROM public.push_subscriptions
  WHERE COALESCE(updated_at, created_at) < NOW() - INTERVAL '90 days';
$$;


-- ============================================================
-- 9. MIGRATIONEN (fÃƒÂ¼r bestehende Installationen)
-- Neue Installationen kÃƒÂ¶nnen diesen Block ignorieren.
-- Er ist idempotent und schadet nicht.
-- ============================================================

-- KI-Provider-Felder hinzufÃƒÂ¼gen (falls noch nicht vorhanden)
ALTER TABLE public.user_profile ADD COLUMN IF NOT EXISTS ki_provider     text DEFAULT 'openai';
ALTER TABLE public.user_profile ADD COLUMN IF NOT EXISTS ollama_base_url text;
ALTER TABLE public.user_profile ADD COLUMN IF NOT EXISTS ollama_model    text DEFAULT 'llama3.2';
ALTER TABLE public.user_profile ADD COLUMN IF NOT EXISTS password_change_required boolean NOT NULL DEFAULT false;

ALTER TABLE public.push_subscriptions
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT NOW();

UPDATE public.push_subscriptions
SET updated_at = COALESCE(updated_at, created_at, NOW())
WHERE updated_at IS NULL;

-- Mobile Navigation-Konfiguration (robuste 4-Schritte-Sequenz)
ALTER TABLE public.user_profile
  ADD COLUMN IF NOT EXISTS mobile_nav_config jsonb;
UPDATE public.user_profile
  SET mobile_nav_config = '{"home":["aufgaben","inventar","budget"],"umzug":["todos","packliste","budget"]}'::jsonb
  WHERE mobile_nav_config IS NULL;
ALTER TABLE public.user_profile
  ALTER COLUMN mobile_nav_config
  SET DEFAULT '{"home":["aufgaben","inventar","budget"],"umzug":["todos","packliste","budget"]}'::jsonb;
ALTER TABLE public.user_profile
  ALTER COLUMN mobile_nav_config SET NOT NULL;

-- Tour-Status (Tour-System 2.0): NULL = noch kein Eintrag (Migrations-Erkennungssignal)
ALTER TABLE public.user_profile
  ADD COLUMN IF NOT EXISTS tour_state jsonb;

-- Migration: persÃƒÂ¶nliche To-Do-Vorlagen (user_id nullable)
ALTER TABLE public.todo_vorlagen
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

-- RLS fÃƒÂ¼r todo_vorlagen aktualisieren
DROP POLICY IF EXISTS todo_vorlagen_read ON public.todo_vorlagen;
CREATE POLICY todo_vorlagen_read ON public.todo_vorlagen FOR SELECT TO authenticated
  USING (user_id IS NULL OR (select auth.uid()) = user_id);

DROP POLICY IF EXISTS todo_vorlagen_insert ON public.todo_vorlagen;
CREATE POLICY todo_vorlagen_insert ON public.todo_vorlagen FOR INSERT TO authenticated
  WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS todo_vorlagen_delete ON public.todo_vorlagen;
CREATE POLICY todo_vorlagen_delete ON public.todo_vorlagen FOR DELETE TO authenticated
  USING ((select auth.uid()) = user_id);

-- Migration: home_vorraete Spalten auf Originalnamen zurÃƒÂ¼cksetzen (menge Ã¢â€ â€™ bestand, mindest_menge Ã¢â€ â€™ mindestmenge)
-- Stellt KompatibilitÃƒÂ¤t mit dem Frontend sicher
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'home_vorraete' AND column_name = 'menge') THEN
    ALTER TABLE public.home_vorraete RENAME COLUMN menge TO bestand;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'home_vorraete' AND column_name = 'mindest_menge') THEN
    ALTER TABLE public.home_vorraete RENAME COLUMN mindest_menge TO mindestmenge;
  END IF;
  -- Fehlende Spalten ergÃƒÂ¤nzen falls noch nicht vorhanden
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = 'home_vorraete' AND column_name = 'bestand') THEN
    ALTER TABLE public.home_vorraete ADD COLUMN bestand numeric(10,2) DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = 'home_vorraete' AND column_name = 'mindestmenge') THEN
    ALTER TABLE public.home_vorraete ADD COLUMN mindestmenge numeric(10,2) DEFAULT 1;
  END IF;
END $$;

-- home_projekte: deadline-Spalte sicherstellen
ALTER TABLE public.home_projekte
  ADD COLUMN IF NOT EXISTS deadline date;

-- home_geraete: Gewährleistung-Spalte sicherstellen
ALTER TABLE public.home_geraete
  ADD COLUMN IF NOT EXISTS gewaehrleistung_bis date;

-- home_geraete: Kategorie-Spalte
ALTER TABLE public.home_geraete
  ADD COLUMN IF NOT EXISTS kategorie text;


-- ============================================================
-- 10. SCHEMA NEU LADEN
-- ============================================================

-- pg_cron Setup (einmalig manuell ausfÃƒÂ¼hren nach pg_cron-Aktivierung):
-- Database Ã¢â€ â€™ Extensions Ã¢â€ â€™ cron Ã¢â€ â€™ Enable (Schema: pg_catalog)
--
-- SELECT cron.schedule(
--   'check-reminders',
--   '*/30 * * * *',
--   $$
--     SELECT net.http_post(
--       url     := 'https://DEINE-SUPABASE-URL/functions/v1/check-reminders',
--       headers := jsonb_build_object(
--         'Content-Type',  'application/json',
--         'Authorization', 'Bearer DEIN-SERVICE-ROLE-KEY'
--       ),
--       body    := '{}'::jsonb
--     )
--   $$
-- );

-- Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â
-- Migration: RLS Performance & Security Fixes
-- Kann auch einzeln im Supabase SQL Editor auf bestehenden Instanzen ausgefÃƒÂ¼hrt werden
-- Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â

-- Fix 1: Funktionen mit fixem search_path absichern (Security: function_search_path_mutable)
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.user_profile (id, email, username)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1))
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.bereinige_alte_subscriptions()
RETURNS void LANGUAGE sql
SET search_path = ''
AS $$
  DELETE FROM public.push_subscriptions
  WHERE COALESCE(updated_at, created_at) < NOW() - INTERVAL '90 days';
$$;

-- Fix 2: RLS Policies neu erstellen mit (select auth.uid()) (Performance: auth_rls_initplan)
-- user_profile
DROP POLICY IF EXISTS user_profile_select_own ON public.user_profile;
DROP POLICY IF EXISTS user_profile_insert_own ON public.user_profile;
DROP POLICY IF EXISTS user_profile_update_own ON public.user_profile;
DROP POLICY IF EXISTS user_profile_delete_own ON public.user_profile;
CREATE POLICY user_profile_select_own ON public.user_profile FOR SELECT USING ((select auth.uid()) = id);
CREATE POLICY user_profile_insert_own ON public.user_profile FOR INSERT WITH CHECK ((select auth.uid()) = id);
CREATE POLICY user_profile_update_own ON public.user_profile FOR UPDATE USING ((select auth.uid()) = id) WITH CHECK ((select auth.uid()) = id);
CREATE POLICY user_profile_delete_own ON public.user_profile FOR DELETE USING ((select auth.uid()) = id);

-- kontakte
DROP POLICY IF EXISTS kontakte_crud_own ON public.kontakte;
CREATE POLICY kontakte_crud_own ON public.kontakte FOR ALL USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);

-- budget_posten
DROP POLICY IF EXISTS budget_posten_crud_own ON public.budget_posten;
CREATE POLICY budget_posten_crud_own ON public.budget_posten FOR ALL USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);

-- budget_teilzahlungen
DROP POLICY IF EXISTS budget_teilzahlungen_crud_own ON public.budget_teilzahlungen;
CREATE POLICY budget_teilzahlungen_crud_own ON public.budget_teilzahlungen FOR ALL USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);

-- todo_aufgaben
DROP POLICY IF EXISTS todo_aufgaben_crud_own ON public.todo_aufgaben;
CREATE POLICY todo_aufgaben_crud_own ON public.todo_aufgaben FOR ALL USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);

-- todo_vorlagen
DROP POLICY IF EXISTS todo_vorlagen_read ON public.todo_vorlagen;
DROP POLICY IF EXISTS todo_vorlagen_insert ON public.todo_vorlagen;
DROP POLICY IF EXISTS todo_vorlagen_delete ON public.todo_vorlagen;
CREATE POLICY todo_vorlagen_read ON public.todo_vorlagen FOR SELECT TO authenticated USING (user_id IS NULL OR (select auth.uid()) = user_id);
CREATE POLICY todo_vorlagen_insert ON public.todo_vorlagen FOR INSERT TO authenticated WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY todo_vorlagen_delete ON public.todo_vorlagen FOR DELETE TO authenticated USING ((select auth.uid()) = user_id);

-- pack_kisten
DROP POLICY IF EXISTS pack_kisten_crud_own ON public.pack_kisten;
CREATE POLICY pack_kisten_crud_own ON public.pack_kisten FOR ALL USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);

-- pack_gegenstaende
DROP POLICY IF EXISTS pack_gegenstaende_crud_own ON public.pack_gegenstaende;
CREATE POLICY pack_gegenstaende_crud_own ON public.pack_gegenstaende FOR ALL USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);

-- dokumente
DROP POLICY IF EXISTS dokumente_crud_own ON public.dokumente;
CREATE POLICY dokumente_crud_own ON public.dokumente FOR ALL USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);

-- renovierungs_posten
DROP POLICY IF EXISTS renovierungs_posten_crud_own ON public.renovierungs_posten;
CREATE POLICY renovierungs_posten_crud_own ON public.renovierungs_posten FOR ALL USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);

-- home_projekte
DROP POLICY IF EXISTS home_projekte_crud_own ON public.home_projekte;
CREATE POLICY home_projekte_crud_own ON public.home_projekte FOR ALL USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);

-- home_orte
DROP POLICY IF EXISTS home_orte_crud_own ON public.home_orte;
CREATE POLICY home_orte_crud_own ON public.home_orte FOR ALL USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);

-- home_lagerorte
DROP POLICY IF EXISTS home_lagerorte_crud_own ON public.home_lagerorte;
CREATE POLICY home_lagerorte_crud_own ON public.home_lagerorte FOR ALL USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);

-- home_objekte
DROP POLICY IF EXISTS home_objekte_crud_own ON public.home_objekte;
CREATE POLICY home_objekte_crud_own ON public.home_objekte FOR ALL USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);

-- home_vorraete
DROP POLICY IF EXISTS home_vorraete_crud_own ON public.home_vorraete;
CREATE POLICY home_vorraete_crud_own ON public.home_vorraete FOR ALL USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);

-- home_einkaufliste
DROP POLICY IF EXISTS home_einkaufliste_crud_own ON public.home_einkaufliste;
CREATE POLICY home_einkaufliste_crud_own ON public.home_einkaufliste FOR ALL USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);

-- home_geraete
DROP POLICY IF EXISTS home_geraete_crud_own ON public.home_geraete;
CREATE POLICY home_geraete_crud_own ON public.home_geraete FOR ALL USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);

-- home_wartungen
DROP POLICY IF EXISTS home_wartungen_crud_own ON public.home_wartungen;
CREATE POLICY home_wartungen_crud_own ON public.home_wartungen FOR ALL USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);

-- home_bewohner
DROP POLICY IF EXISTS home_bewohner_user_own ON public.home_bewohner;
CREATE POLICY home_bewohner_user_own ON public.home_bewohner FOR ALL USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);

-- home_budget_limits
DROP POLICY IF EXISTS home_budget_limits_own ON public.home_budget_limits;
CREATE POLICY home_budget_limits_own ON public.home_budget_limits FOR ALL USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);

-- home_sparziele
DROP POLICY IF EXISTS home_sparziele_own ON public.home_sparziele;
CREATE POLICY home_sparziele_own ON public.home_sparziele FOR ALL USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);

-- home_verlauf
DROP POLICY IF EXISTS home_verlauf_own ON public.home_verlauf;
CREATE POLICY home_verlauf_own ON public.home_verlauf FOR ALL USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);

-- home_wissen
DROP POLICY IF EXISTS home_wissen_own ON public.home_wissen;
CREATE POLICY home_wissen_own ON public.home_wissen FOR ALL USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);

-- haushaltsaufgaben
DROP POLICY IF EXISTS haushaltsaufgaben_crud_own ON public.haushaltsaufgaben;
CREATE POLICY haushaltsaufgaben_crud_own ON public.haushaltsaufgaben FOR ALL USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);

-- vorraete
DROP POLICY IF EXISTS vorraete_crud_own ON public.vorraete;
CREATE POLICY vorraete_crud_own ON public.vorraete FOR ALL USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);

-- projekte
DROP POLICY IF EXISTS projekte_crud_own ON public.projekte;
CREATE POLICY projekte_crud_own ON public.projekte FOR ALL USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);

-- geraete
DROP POLICY IF EXISTS geraete_crud_own ON public.geraete;
CREATE POLICY geraete_crud_own ON public.geraete FOR ALL USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);

-- push_subscriptions
DROP POLICY IF EXISTS "Eigene Subscriptions verwalten" ON public.push_subscriptions;
CREATE POLICY "Eigene Subscriptions verwalten" ON public.push_subscriptions FOR ALL USING ((select auth.uid()) = user_id);

SELECT pg_notify('pgrst', 'reload schema');

-- ============================================================
-- 16. GLOBALER ASSISTENT (UI-KONFIG, THREADS, RECEIPTS)
-- Persoenliche Threads, UI-Layout und nachvollziehbare Aktionen.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.assistant_ui_config (
  user_id         uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  enabled         boolean NOT NULL DEFAULT true,
  is_open         boolean NOT NULL DEFAULT false,
  is_minimized    boolean NOT NULL DEFAULT false,
  mobile_x        integer,
  mobile_y        integer,
  desktop_anchor  text NOT NULL DEFAULT 'right'
                  CHECK (desktop_anchor IN ('left','right')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS set_assistant_ui_config_updated_at ON public.assistant_ui_config;
CREATE TRIGGER set_assistant_ui_config_updated_at
  BEFORE UPDATE ON public.assistant_ui_config
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.assistant_ui_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS assistant_ui_config_own ON public.assistant_ui_config;
CREATE POLICY assistant_ui_config_own ON public.assistant_ui_config
  FOR ALL
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

CREATE TABLE IF NOT EXISTS public.ai_chat_threads (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  household_id  uuid REFERENCES public.households(id) ON DELETE SET NULL,
  title         text NOT NULL DEFAULT 'Neuer Chat',
  context_route text,
  metadata      jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_chat_threads_user_id
  ON public.ai_chat_threads(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_chat_threads_household_id
  ON public.ai_chat_threads(household_id);

DROP TRIGGER IF EXISTS set_ai_chat_threads_updated_at ON public.ai_chat_threads;
CREATE TRIGGER set_ai_chat_threads_updated_at
  BEFORE UPDATE ON public.ai_chat_threads
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.ai_chat_threads ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ai_chat_threads_own ON public.ai_chat_threads;
CREATE POLICY ai_chat_threads_own ON public.ai_chat_threads
  FOR ALL
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

CREATE TABLE IF NOT EXISTS public.ai_chat_messages (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id  uuid NOT NULL REFERENCES public.ai_chat_threads(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role       text NOT NULL CHECK (role IN ('user','assistant','system')),
  content    text NOT NULL,
  payload    jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_chat_messages_thread_id
  ON public.ai_chat_messages(thread_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_ai_chat_messages_user_id
  ON public.ai_chat_messages(user_id, created_at DESC);

ALTER TABLE public.ai_chat_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ai_chat_messages_own ON public.ai_chat_messages;
CREATE POLICY ai_chat_messages_own ON public.ai_chat_messages
  FOR ALL
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

CREATE TABLE IF NOT EXISTS public.ai_action_receipts (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id        uuid REFERENCES public.ai_chat_threads(id) ON DELETE CASCADE,
  user_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  household_id     uuid REFERENCES public.households(id) ON DELETE SET NULL,
  domain           text,
  action_kind      text NOT NULL DEFAULT 'create',
  target_table     text,
  target_record_id uuid,
  summary          text,
  request_payload  jsonb NOT NULL DEFAULT '{}'::jsonb,
  result_payload   jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_action_receipts_user_id
  ON public.ai_action_receipts(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_action_receipts_thread_id
  ON public.ai_action_receipts(thread_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_action_receipts_target
  ON public.ai_action_receipts(target_table, target_record_id);

DROP TRIGGER IF EXISTS set_ai_action_receipts_updated_at ON public.ai_action_receipts;
CREATE TRIGGER set_ai_action_receipts_updated_at
  BEFORE UPDATE ON public.ai_action_receipts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.ai_action_receipts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ai_action_receipts_own ON public.ai_action_receipts;
CREATE POLICY ai_action_receipts_own ON public.ai_action_receipts
  FOR ALL
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

SELECT pg_notify('pgrst', 'reload schema');

-- Phase-C-Vorab-Prereqs: Haushalts-Tabellen/Funktionen muessen vor dem Ledger-Block existieren.
CREATE TABLE IF NOT EXISTS public.households (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL DEFAULT 'Mein Haushalt',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS set_households_updated_at ON public.households;
CREATE TRIGGER set_households_updated_at
  BEFORE UPDATE ON public.households
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.household_members (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role         text NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  joined_at    timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE(user_id),
  UNIQUE(household_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_household_members_household_id ON public.household_members(household_id);
CREATE INDEX IF NOT EXISTS idx_household_members_user_id ON public.household_members(user_id);

CREATE OR REPLACE FUNCTION public.get_current_household_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT hm.household_id
  FROM public.household_members hm
  WHERE hm.user_id = (SELECT auth.uid())
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.is_household_member(p_household_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.household_members hm
    WHERE hm.household_id = p_household_id
      AND hm.user_id = (SELECT auth.uid())
  );
$$;

-- ============================================================
-- 15. PHASE C: OPEN-ITEM-LEDGER / MONATSABSCHLUSS / REMINDER
-- ============================================================

CREATE TABLE IF NOT EXISTS public.budget_ledger_state (
  household_id      uuid PRIMARY KEY REFERENCES public.households(id) ON DELETE CASCADE,
  migration_status  text NOT NULL DEFAULT 'pending'
    CHECK (migration_status IN ('pending', 'ok', 'blocked')),
  migration_error   text,
  stale_from_month  date,
  updated_at        timestamptz NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS set_budget_ledger_state_updated_at ON public.budget_ledger_state;
CREATE TRIGGER set_budget_ledger_state_updated_at
  BEFORE UPDATE ON public.budget_ledger_state
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.budget_ledger_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS budget_ledger_state_household ON public.budget_ledger_state;
CREATE POLICY budget_ledger_state_household ON public.budget_ledger_state FOR ALL
  USING (public.is_household_member(household_id))
  WITH CHECK (public.is_household_member(household_id));

CREATE TABLE IF NOT EXISTS public.budget_month_closes (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id        uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  month               date NOT NULL,
  opening_total_cents bigint NOT NULL DEFAULT 0,
  created_total_cents bigint NOT NULL DEFAULT 0,
  settled_total_cents bigint NOT NULL DEFAULT 0,
  closing_total_cents bigint NOT NULL DEFAULT 0,
  is_stale            boolean NOT NULL DEFAULT false,
  calculated_at       timestamptz NOT NULL DEFAULT NOW(),
  created_at          timestamptz NOT NULL DEFAULT NOW(),
  updated_at          timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE (household_id, month)
);

CREATE INDEX IF NOT EXISTS idx_budget_month_closes_household_month
  ON public.budget_month_closes(household_id, month DESC);
CREATE INDEX IF NOT EXISTS idx_budget_month_closes_stale
  ON public.budget_month_closes(household_id, is_stale, month DESC);

DROP TRIGGER IF EXISTS set_budget_month_closes_updated_at ON public.budget_month_closes;
CREATE TRIGGER set_budget_month_closes_updated_at
  BEFORE UPDATE ON public.budget_month_closes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.budget_month_closes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS budget_month_closes_household ON public.budget_month_closes;
CREATE POLICY budget_month_closes_household ON public.budget_month_closes FOR ALL
  USING (public.is_household_member(household_id))
  WITH CHECK (public.is_household_member(household_id));

CREATE TABLE IF NOT EXISTS public.budget_month_close_members (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  month_close_id         uuid NOT NULL REFERENCES public.budget_month_closes(id) ON DELETE CASCADE,
  household_id           uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  member_id              uuid NOT NULL REFERENCES public.home_bewohner(id) ON DELETE CASCADE,
  opening_balance_cents  bigint NOT NULL DEFAULT 0,
  created_in_month_cents bigint NOT NULL DEFAULT 0,
  settled_in_month_cents bigint NOT NULL DEFAULT 0,
  closing_balance_cents  bigint NOT NULL DEFAULT 0,
  created_at             timestamptz NOT NULL DEFAULT NOW(),
  updated_at             timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE (month_close_id, member_id)
);

CREATE INDEX IF NOT EXISTS idx_budget_month_close_members_close
  ON public.budget_month_close_members(month_close_id);
CREATE INDEX IF NOT EXISTS idx_budget_month_close_members_household
  ON public.budget_month_close_members(household_id, member_id);

DROP TRIGGER IF EXISTS set_budget_month_close_members_updated_at ON public.budget_month_close_members;
CREATE TRIGGER set_budget_month_close_members_updated_at
  BEFORE UPDATE ON public.budget_month_close_members
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.budget_month_close_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS budget_month_close_members_household ON public.budget_month_close_members;
CREATE POLICY budget_month_close_members_household ON public.budget_month_close_members FOR ALL
  USING (public.is_household_member(household_id))
  WITH CHECK (public.is_household_member(household_id));

ALTER TABLE public.user_profile
  ADD COLUMN IF NOT EXISTS cospend_reminder_letzter_versand date;

CREATE OR REPLACE FUNCTION public.can_access_household_budget(p_household_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    COALESCE((SELECT auth.role()) = 'service_role', false)
    OR public.is_household_member(p_household_id);
$$;

CREATE OR REPLACE FUNCTION public.budget_month_start(p_date date)
RETURNS date LANGUAGE sql IMMUTABLE
SET search_path = ''
AS $$
  SELECT date_trunc('month', p_date::timestamp)::date;
$$;

CREATE OR REPLACE FUNCTION public.ensure_budget_ledger_state(p_household_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.budget_ledger_state (household_id)
  VALUES (p_household_id)
  ON CONFLICT (household_id) DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_budget_months_stale_from(
  p_household_id uuid,
  p_from_date date
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_month date;
BEGIN
  IF p_household_id IS NULL OR p_from_date IS NULL THEN
    RETURN;
  END IF;

  v_month := public.budget_month_start(p_from_date);
  PERFORM public.ensure_budget_ledger_state(p_household_id);

  UPDATE public.budget_ledger_state
  SET stale_from_month = CASE
    WHEN stale_from_month IS NULL THEN v_month
    ELSE LEAST(stale_from_month, v_month)
  END
  WHERE household_id = p_household_id;

  UPDATE public.budget_month_closes
  SET is_stale = true
  WHERE household_id = p_household_id
    AND month >= v_month;
END;
$$;

CREATE OR REPLACE FUNCTION public.has_budget_split_allocations(p_budget_posten_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.budget_split_groups bsg
    JOIN public.budget_split_shares bss ON bss.split_group_id = bsg.id
    JOIN public.budget_settlement_allocations bsa ON bsa.split_share_id = bss.id
    WHERE bsg.budget_posten_id = p_budget_posten_id
  );
$$;

CREATE OR REPLACE FUNCTION public.guard_budget_posten_split_history()
RETURNS trigger LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF public.has_budget_split_allocations(OLD.id) THEN
      RAISE EXCEPTION 'Dieser Budget-Posten hat bereits allokierte Ausgleiche und kann nicht geloescht werden.';
    END IF;
    RETURN OLD;
  END IF;

  IF public.has_budget_split_allocations(OLD.id) THEN
    IF NEW.betrag IS DISTINCT FROM OLD.betrag
       OR COALESCE(NEW.typ, 'ausgabe') IS DISTINCT FROM COALESCE(OLD.typ, 'ausgabe')
       OR COALESCE(NEW.wiederholen, false) IS DISTINCT FROM COALESCE(OLD.wiederholen, false)
       OR NEW.ursprung_template_id IS DISTINCT FROM OLD.ursprung_template_id THEN
      RAISE EXCEPTION 'Dieser Budget-Posten hat bereits allokierte Ausgleiche. Split-relevante Aenderungen sind gesperrt.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_budget_posten_split_history_trigger ON public.budget_posten;
CREATE TRIGGER guard_budget_posten_split_history_trigger
  BEFORE UPDATE OR DELETE ON public.budget_posten
  FOR EACH ROW EXECUTE FUNCTION public.guard_budget_posten_split_history();

CREATE OR REPLACE FUNCTION public.guard_budget_split_group_history()
RETURNS trigger LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_has_allocations boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM public.budget_split_shares bss
    JOIN public.budget_settlement_allocations bsa ON bsa.split_share_id = bss.id
    WHERE bss.split_group_id = COALESCE(NEW.id, OLD.id)
  )
  INTO v_has_allocations;

  IF NOT COALESCE(v_has_allocations, false) THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Diese Kostenaufteilung hat bereits allokierte Ausgleiche und kann nicht geloescht werden.';
  END IF;

  IF NEW.budget_posten_id IS DISTINCT FROM OLD.budget_posten_id
     OR NEW.payer_member_id IS DISTINCT FROM OLD.payer_member_id
     OR COALESCE(NEW.split_mode, 'equal') IS DISTINCT FROM COALESCE(OLD.split_mode, 'equal')
     OR NEW.payer_share_input IS DISTINCT FROM OLD.payer_share_input THEN
    RAISE EXCEPTION 'Diese Kostenaufteilung hat bereits allokierte Ausgleiche und kann nicht geaendert werden.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_budget_split_group_history_trigger ON public.budget_split_groups;
CREATE TRIGGER guard_budget_split_group_history_trigger
  BEFORE UPDATE OR DELETE ON public.budget_split_groups
  FOR EACH ROW EXECUTE FUNCTION public.guard_budget_split_group_history();

CREATE OR REPLACE FUNCTION public.guard_budget_split_share_history()
RETURNS trigger LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_has_allocations boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM public.budget_settlement_allocations bsa
    WHERE bsa.split_share_id = COALESCE(NEW.id, OLD.id)
  )
  INTO v_has_allocations;

  IF NOT COALESCE(v_has_allocations, false) THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Dieser Split-Anteil hat bereits allokierte Ausgleiche und kann nicht geloescht werden.';
  END IF;

  IF NEW.member_id IS DISTINCT FROM OLD.member_id
     OR NEW.amount_owed IS DISTINCT FROM OLD.amount_owed
     OR COALESCE(NEW.share_type, 'equal') IS DISTINCT FROM COALESCE(OLD.share_type, 'equal')
     OR NEW.share_input IS DISTINCT FROM OLD.share_input THEN
    RAISE EXCEPTION 'Dieser Split-Anteil hat bereits allokierte Ausgleiche und kann nicht geaendert werden.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_budget_split_share_history_trigger ON public.budget_split_shares;
CREATE TRIGGER guard_budget_split_share_history_trigger
  BEFORE UPDATE OR DELETE ON public.budget_split_shares
  FOR EACH ROW EXECUTE FUNCTION public.guard_budget_split_share_history();

CREATE OR REPLACE FUNCTION public.mark_budget_posten_stale_trigger()
RETURNS trigger LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_household_id uuid;
  v_date date;
BEGIN
  v_household_id := COALESCE(NEW.household_id, OLD.household_id);

  IF TG_OP = 'INSERT' THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.budget_split_groups bsg
    WHERE bsg.budget_posten_id = COALESCE(NEW.id, OLD.id)
  ) THEN
    v_date := CASE
      WHEN TG_OP = 'DELETE' THEN OLD.datum
      WHEN NEW.datum IS DISTINCT FROM OLD.datum THEN LEAST(OLD.datum, NEW.datum)
      ELSE COALESCE(NEW.datum, OLD.datum)
    END;
    PERFORM public.mark_budget_months_stale_from(v_household_id, v_date);
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS mark_budget_posten_stale_trigger ON public.budget_posten;
CREATE TRIGGER mark_budget_posten_stale_trigger
  AFTER INSERT OR UPDATE OR DELETE ON public.budget_posten
  FOR EACH ROW EXECUTE FUNCTION public.mark_budget_posten_stale_trigger();

CREATE OR REPLACE FUNCTION public.mark_budget_split_group_stale_trigger()
RETURNS trigger LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_budget_posten_id uuid;
  v_household_id uuid;
  v_date date;
BEGIN
  v_budget_posten_id := COALESCE(NEW.budget_posten_id, OLD.budget_posten_id);
  v_household_id := COALESCE(NEW.household_id, OLD.household_id);

  SELECT datum
  INTO v_date
  FROM public.budget_posten
  WHERE id = v_budget_posten_id;

  PERFORM public.mark_budget_months_stale_from(v_household_id, v_date);
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS mark_budget_split_group_stale_trigger ON public.budget_split_groups;
CREATE TRIGGER mark_budget_split_group_stale_trigger
  AFTER INSERT OR UPDATE OR DELETE ON public.budget_split_groups
  FOR EACH ROW EXECUTE FUNCTION public.mark_budget_split_group_stale_trigger();

CREATE OR REPLACE FUNCTION public.mark_budget_split_share_stale_trigger()
RETURNS trigger LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_group_id uuid;
  v_household_id uuid;
  v_date date;
BEGIN
  v_group_id := COALESCE(NEW.split_group_id, OLD.split_group_id);
  v_household_id := COALESCE(NEW.household_id, OLD.household_id);

  SELECT bp.datum
  INTO v_date
  FROM public.budget_split_groups bsg
  JOIN public.budget_posten bp ON bp.id = bsg.budget_posten_id
  WHERE bsg.id = v_group_id;

  PERFORM public.mark_budget_months_stale_from(v_household_id, v_date);
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS mark_budget_split_share_stale_trigger ON public.budget_split_shares;
CREATE TRIGGER mark_budget_split_share_stale_trigger
  AFTER INSERT OR UPDATE OR DELETE ON public.budget_split_shares
  FOR EACH ROW EXECUTE FUNCTION public.mark_budget_split_share_stale_trigger();

CREATE OR REPLACE FUNCTION public.mark_budget_settlement_stale_trigger()
RETURNS trigger LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  PERFORM public.mark_budget_months_stale_from(
    COALESCE(NEW.household_id, OLD.household_id),
    COALESCE(NEW.date, OLD.date)
  );
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS mark_budget_settlement_stale_trigger ON public.budget_settlements;
CREATE TRIGGER mark_budget_settlement_stale_trigger
  AFTER INSERT OR UPDATE OR DELETE ON public.budget_settlements
  FOR EACH ROW EXECUTE FUNCTION public.mark_budget_settlement_stale_trigger();

CREATE OR REPLACE FUNCTION public.mark_budget_allocation_stale_trigger()
RETURNS trigger LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_household_id uuid;
  v_date date;
BEGIN
  SELECT bs.household_id, bs.date
  INTO v_household_id, v_date
  FROM public.budget_settlements bs
  WHERE bs.id = COALESCE(NEW.settlement_id, OLD.settlement_id);

  PERFORM public.mark_budget_months_stale_from(v_household_id, v_date);
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS mark_budget_allocation_stale_trigger ON public.budget_settlement_allocations;
CREATE TRIGGER mark_budget_allocation_stale_trigger
  AFTER INSERT OR UPDATE OR DELETE ON public.budget_settlement_allocations
  FOR EACH ROW EXECUTE FUNCTION public.mark_budget_allocation_stale_trigger();

CREATE OR REPLACE FUNCTION public.backfill_budget_settlement_allocations(p_household_id uuid)
RETURNS TABLE (
  household_id uuid,
  migration_status text,
  migration_error text,
  processed_settlements integer,
  created_allocations integer
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_state text;
  v_error text;
  v_processed integer := 0;
  v_created integer := 0;
  v_remaining_cents bigint;
  v_allocate_cents bigint;
  v_first_date date;
  v_settlement record;
  v_share record;
BEGIN
  IF p_household_id IS NULL THEN
    RAISE EXCEPTION 'Haushalt fehlt.';
  END IF;

  IF NOT public.can_access_household_budget(p_household_id) THEN
    RAISE EXCEPTION 'Keine Berechtigung fuer diesen Haushalt.';
  END IF;

  PERFORM public.ensure_budget_ledger_state(p_household_id);

  SELECT bls.migration_status, bls.migration_error
  INTO v_state, v_error
  FROM public.budget_ledger_state bls
  WHERE bls.household_id = p_household_id;

  IF v_state = 'ok' THEN
    RETURN QUERY SELECT p_household_id, v_state, v_error, 0, 0;
    RETURN;
  END IF;

  FOR v_settlement IN
    SELECT
      bs.id,
      bs.date,
      bs.amount,
      bs.from_member_id,
      bs.to_member_id,
      COALESCE((
        SELECT SUM(ROUND(bsa.amount * 100))::bigint
        FROM public.budget_settlement_allocations bsa
        WHERE bsa.settlement_id = bs.id
      ), 0) AS allocated_cents
    FROM public.budget_settlements bs
    WHERE bs.household_id = p_household_id
    ORDER BY bs.date ASC, bs.created_at ASC, bs.id ASC
  LOOP
    v_processed := v_processed + 1;
    v_remaining_cents := ROUND(v_settlement.amount * 100)::bigint - COALESCE(v_settlement.allocated_cents, 0);

    IF v_remaining_cents <= 0 THEN
      CONTINUE;
    END IF;

    IF v_first_date IS NULL OR v_settlement.date < v_first_date THEN
      v_first_date := v_settlement.date;
    END IF;

    FOR v_share IN
      SELECT
        bss.id AS split_share_id,
        GREATEST(
          ROUND(bss.amount_owed * 100)::bigint - COALESCE((
            SELECT SUM(ROUND(existing.amount * 100))::bigint
            FROM public.budget_settlement_allocations existing
            WHERE existing.split_share_id = bss.id
          ), 0),
          0
        ) AS open_cents
      FROM public.budget_split_shares bss
      JOIN public.budget_split_groups bsg ON bsg.id = bss.split_group_id
      JOIN public.budget_posten bp ON bp.id = bsg.budget_posten_id
      WHERE bsg.household_id = p_household_id
        AND bss.member_id = v_settlement.from_member_id
        AND bsg.payer_member_id = v_settlement.to_member_id
        AND COALESCE(bp.wiederholen, false) = false
        AND bp.datum <= v_settlement.date
      ORDER BY bp.datum ASC, bss.id ASC
    LOOP
      EXIT WHEN v_remaining_cents <= 0;
      EXIT WHEN COALESCE(v_share.open_cents, 0) <= 0;

      v_allocate_cents := LEAST(v_remaining_cents, v_share.open_cents);
      IF v_allocate_cents <= 0 THEN
        CONTINUE;
      END IF;

      INSERT INTO public.budget_settlement_allocations (
        settlement_id,
        split_share_id,
        household_id,
        amount
      )
      VALUES (
        v_settlement.id,
        v_share.split_share_id,
        p_household_id,
        v_allocate_cents / 100.0
      );

      v_created := v_created + 1;
      v_remaining_cents := v_remaining_cents - v_allocate_cents;
    END LOOP;

    IF v_remaining_cents > 0 THEN
      v_error := format(
        'Settlement %s konnte nicht vollstaendig migriert werden (%s Cent offen).',
        v_settlement.id,
        v_remaining_cents
      );

      UPDATE public.budget_ledger_state bls
      SET migration_status = 'blocked',
          migration_error = v_error
      WHERE bls.household_id = p_household_id;

      RETURN QUERY SELECT p_household_id, 'blocked', v_error, v_processed, v_created;
      RETURN;
    END IF;
  END LOOP;

  UPDATE public.budget_ledger_state bls
  SET migration_status = 'ok',
      migration_error = NULL
  WHERE bls.household_id = p_household_id;

  IF v_first_date IS NOT NULL THEN
    PERFORM public.mark_budget_months_stale_from(p_household_id, v_first_date);
  END IF;

  RETURN QUERY SELECT p_household_id, 'ok', NULL::text, v_processed, v_created;
END;
$$;

CREATE OR REPLACE FUNCTION public.assert_budget_ledger_ready(p_household_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_state text;
  v_error text;
BEGIN
  PERFORM 1
  FROM public.backfill_budget_settlement_allocations(p_household_id);

  SELECT migration_status, migration_error
  INTO v_state, v_error
  FROM public.budget_ledger_state
  WHERE household_id = p_household_id;

  IF v_state = 'blocked' THEN
    RAISE EXCEPTION '%', COALESCE(v_error, 'Die Open-Item-Migration ist blockiert.');
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_budget_open_split_ledger(
  p_household_id uuid,
  p_as_of_date date DEFAULT CURRENT_DATE
)
RETURNS TABLE (
  share_id uuid,
  split_group_id uuid,
  budget_posten_id uuid,
  from_member_id uuid,
  to_member_id uuid,
  origin_date date,
  beschreibung text,
  amount_owed_cents bigint,
  allocated_cents bigint,
  open_amount_cents bigint,
  age_days integer
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_household_id IS NULL THEN
    RAISE EXCEPTION 'Haushalt fehlt.';
  END IF;

  IF NOT public.can_access_household_budget(p_household_id) THEN
    RAISE EXCEPTION 'Keine Berechtigung fuer diesen Haushalt.';
  END IF;

  PERFORM public.assert_budget_ledger_ready(p_household_id);

  RETURN QUERY
  WITH allocation_totals AS (
    SELECT
      bsa.split_share_id,
      SUM(ROUND(bsa.amount * 100))::bigint AS allocated_cents
    FROM public.budget_settlement_allocations bsa
    JOIN public.budget_settlements bs ON bs.id = bsa.settlement_id
    WHERE bs.household_id = p_household_id
      AND bs.date <= p_as_of_date
    GROUP BY bsa.split_share_id
  )
  SELECT
    bss.id AS share_id,
    bsg.id AS split_group_id,
    bp.id AS budget_posten_id,
    bss.member_id AS from_member_id,
    bsg.payer_member_id AS to_member_id,
    bp.datum AS origin_date,
    bp.beschreibung,
    ROUND(bss.amount_owed * 100)::bigint AS amount_owed_cents,
    COALESCE(at.allocated_cents, 0) AS allocated_cents,
    GREATEST(ROUND(bss.amount_owed * 100)::bigint - COALESCE(at.allocated_cents, 0), 0) AS open_amount_cents,
    GREATEST((p_as_of_date - bp.datum)::int, 0) AS age_days
  FROM public.budget_split_shares bss
  JOIN public.budget_split_groups bsg ON bsg.id = bss.split_group_id
  JOIN public.budget_posten bp ON bp.id = bsg.budget_posten_id
  LEFT JOIN allocation_totals at ON at.split_share_id = bss.id
  WHERE bsg.household_id = p_household_id
    AND bp.datum IS NOT NULL
    AND bp.datum <= p_as_of_date
    AND COALESCE(bp.wiederholen, false) = false
    AND GREATEST(ROUND(bss.amount_owed * 100)::bigint - COALESCE(at.allocated_cents, 0), 0) > 0
  ORDER BY bp.datum ASC, bss.id ASC;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_budget_settlement_with_allocations(
  p_household_id uuid,
  p_from_member_id uuid,
  p_to_member_id uuid,
  p_amount numeric,
  p_date date,
  p_note text DEFAULT NULL
)
RETURNS TABLE (
  settlement_id uuid,
  household_id uuid,
  from_member_id uuid,
  to_member_id uuid,
  amount numeric,
  date date,
  note text
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_amount numeric(12,2);
  v_remaining_cents bigint;
  v_open_pair_cents bigint := 0;
  v_allocate_cents bigint;
  v_settlement_id uuid;
  v_share record;
BEGIN
  IF p_household_id IS NULL THEN
    RAISE EXCEPTION 'Haushalt fehlt.';
  END IF;

  IF NOT public.can_access_household_budget(p_household_id) THEN
    RAISE EXCEPTION 'Keine Berechtigung fuer diesen Haushalt.';
  END IF;

  IF p_from_member_id IS NULL OR p_to_member_id IS NULL OR p_from_member_id = p_to_member_id THEN
    RAISE EXCEPTION 'Ungueltige Settlement-Paarung.';
  END IF;

  v_amount := ROUND(COALESCE(p_amount, 0)::numeric, 2);
  IF v_amount <= 0 THEN
    RAISE EXCEPTION 'Der Settlement-Betrag muss groesser als 0 sein.';
  END IF;

  PERFORM public.assert_budget_ledger_ready(p_household_id);

  FOR v_share IN
    SELECT *
    FROM public.get_budget_open_split_ledger(p_household_id, COALESCE(p_date, CURRENT_DATE)) AS ledger
    WHERE ledger.from_member_id = p_from_member_id
      AND ledger.to_member_id = p_to_member_id
    ORDER BY ledger.origin_date ASC, ledger.share_id ASC
  LOOP
    v_open_pair_cents := v_open_pair_cents + v_share.open_amount_cents;
  END LOOP;

  v_remaining_cents := ROUND(v_amount * 100)::bigint;
  IF v_open_pair_cents <= 0 THEN
    RAISE EXCEPTION 'Fuer dieses Paar besteht kein offener Ausgleich.';
  END IF;
  IF v_remaining_cents > v_open_pair_cents THEN
    RAISE EXCEPTION 'Der Betrag uebersteigt den offenen Ausgleich fuer dieses Paar.';
  END IF;

  INSERT INTO public.budget_settlements (
    household_id,
    from_member_id,
    to_member_id,
    amount,
    date,
    note
  )
  VALUES (
    p_household_id,
    p_from_member_id,
    p_to_member_id,
    v_amount,
    COALESCE(p_date, CURRENT_DATE),
    NULLIF(BTRIM(p_note), '')
  )
  RETURNING id INTO v_settlement_id;

  FOR v_share IN
    SELECT *
    FROM public.get_budget_open_split_ledger(p_household_id, COALESCE(p_date, CURRENT_DATE)) AS ledger
    WHERE ledger.from_member_id = p_from_member_id
      AND ledger.to_member_id = p_to_member_id
    ORDER BY ledger.origin_date ASC, ledger.share_id ASC
  LOOP
    EXIT WHEN v_remaining_cents <= 0;
    v_allocate_cents := LEAST(v_remaining_cents, v_share.open_amount_cents);
    IF v_allocate_cents <= 0 THEN
      CONTINUE;
    END IF;

    INSERT INTO public.budget_settlement_allocations (
      settlement_id,
      split_share_id,
      household_id,
      amount
    )
    VALUES (
      v_settlement_id,
      v_share.share_id,
      p_household_id,
      v_allocate_cents / 100.0
    );

    v_remaining_cents := v_remaining_cents - v_allocate_cents;
  END LOOP;

  IF v_remaining_cents > 0 THEN
    RAISE EXCEPTION 'Settlement konnte nicht vollstaendig alloziert werden.';
  END IF;

  RETURN QUERY
  SELECT
    bs.id,
    bs.household_id,
    bs.from_member_id,
    bs.to_member_id,
    bs.amount,
    bs.date,
    bs.note
  FROM public.budget_settlements bs
  WHERE bs.id = v_settlement_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_budget_settlement_for_split_share(
  p_household_id uuid,
  p_split_share_id uuid,
  p_amount numeric DEFAULT NULL,
  p_date date DEFAULT NULL,
  p_note text DEFAULT NULL
)
RETURNS TABLE (
  settlement_id uuid,
  household_id uuid,
  from_member_id uuid,
  to_member_id uuid,
  split_share_id uuid,
  amount numeric,
  date date,
  note text
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_ledger_row record;
  v_amount numeric(12,2);
  v_settlement_id uuid;
BEGIN
  IF p_household_id IS NULL THEN
    RAISE EXCEPTION 'Haushalt fehlt.';
  END IF;

  IF p_split_share_id IS NULL THEN
    RAISE EXCEPTION 'Split-Share fehlt.';
  END IF;

  IF NOT public.can_access_household_budget(p_household_id) THEN
    RAISE EXCEPTION 'Keine Berechtigung fuer diesen Haushalt.';
  END IF;

  PERFORM public.assert_budget_ledger_ready(p_household_id);

  SELECT *
  INTO v_ledger_row
  FROM public.get_budget_open_split_ledger(p_household_id, COALESCE(p_date, CURRENT_DATE)) AS ledger
  WHERE ledger.share_id = p_split_share_id
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Fuer diesen Posten besteht kein offener Ausgleich mehr.';
  END IF;

  v_amount := ROUND(
    COALESCE(p_amount, v_ledger_row.open_amount_cents / 100.0)::numeric,
    2
  );

  IF v_amount <= 0 THEN
    RAISE EXCEPTION 'Der Settlement-Betrag muss groesser als 0 sein.';
  END IF;

  IF ROUND(v_amount * 100)::bigint > v_ledger_row.open_amount_cents THEN
    RAISE EXCEPTION 'Der Betrag uebersteigt den offenen Ausgleich fuer diesen Posten.';
  END IF;

  INSERT INTO public.budget_settlements (
    household_id,
    from_member_id,
    to_member_id,
    amount,
    date,
    note
  )
  VALUES (
    p_household_id,
    v_ledger_row.from_member_id,
    v_ledger_row.to_member_id,
    v_amount,
    COALESCE(p_date, CURRENT_DATE),
    NULLIF(BTRIM(p_note), '')
  )
  RETURNING id INTO v_settlement_id;

  INSERT INTO public.budget_settlement_allocations (
    settlement_id,
    split_share_id,
    household_id,
    amount
  )
  VALUES (
    v_settlement_id,
    v_ledger_row.share_id,
    p_household_id,
    v_amount
  );

  RETURN QUERY
  SELECT
    bs.id,
    bs.household_id,
    bs.from_member_id,
    bs.to_member_id,
    v_ledger_row.share_id,
    bs.amount,
    bs.date,
    bs.note
  FROM public.budget_settlements bs
  WHERE bs.id = v_settlement_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_budget_settlement(p_settlement_id uuid)
RETURNS TABLE (
  settlement_id uuid,
  household_id uuid,
  date date
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_settlement public.budget_settlements%ROWTYPE;
BEGIN
  SELECT *
  INTO v_settlement
  FROM public.budget_settlements bs
  WHERE bs.id = p_settlement_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Settlement nicht gefunden.';
  END IF;

  IF NOT public.can_access_household_budget(v_settlement.household_id) THEN
    RAISE EXCEPTION 'Keine Berechtigung fuer dieses Settlement.';
  END IF;

  PERFORM public.assert_budget_ledger_ready(v_settlement.household_id);

  DELETE FROM public.budget_settlements
  WHERE id = p_settlement_id;

  RETURN QUERY
  SELECT v_settlement.id, v_settlement.household_id, v_settlement.date;
END;
$$;

CREATE OR REPLACE FUNCTION public.close_budget_month(
  p_household_id uuid,
  p_month date
)
RETURNS TABLE (
  month_close_id uuid,
  household_id uuid,
  month date,
  opening_total_cents bigint,
  created_total_cents bigint,
  settled_total_cents bigint,
  closing_total_cents bigint,
  is_stale boolean,
  calculated_at timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_month date;
  v_month_end date;
  v_prev_day date;
  v_close_id uuid;
BEGIN
  IF p_household_id IS NULL OR p_month IS NULL THEN
    RAISE EXCEPTION 'Haushalt und Monat sind erforderlich.';
  END IF;

  IF NOT public.can_access_household_budget(p_household_id) THEN
    RAISE EXCEPTION 'Keine Berechtigung fuer diesen Haushalt.';
  END IF;

  PERFORM public.assert_budget_ledger_ready(p_household_id);

  v_month := public.budget_month_start(p_month);
  v_month_end := (v_month + INTERVAL '1 month - 1 day')::date;
  v_prev_day := (v_month - INTERVAL '1 day')::date;

  INSERT INTO public.budget_month_closes (
    household_id,
    month,
    calculated_at,
    is_stale
  )
  VALUES (
    p_household_id,
    v_month,
    NOW(),
    false
  )
  ON CONFLICT ON CONSTRAINT budget_month_closes_household_id_month_key DO UPDATE
  SET calculated_at = NOW(),
      is_stale = false,
      updated_at = NOW()
  RETURNING id INTO v_close_id;

  DELETE FROM public.budget_month_close_members
  WHERE public.budget_month_close_members.month_close_id = v_close_id;

  INSERT INTO public.budget_month_close_members (
    month_close_id,
    household_id,
    member_id,
    opening_balance_cents,
    created_in_month_cents,
    settled_in_month_cents,
    closing_balance_cents
  )
  WITH member_base AS (
    SELECT hb.id AS member_id
    FROM public.home_bewohner hb
    WHERE hb.household_id = p_household_id
  ),
  opening_rows AS (
    SELECT from_member_id AS member_id, -SUM(open_amount_cents)::bigint AS delta
    FROM public.get_budget_open_split_ledger(p_household_id, v_prev_day)
    GROUP BY from_member_id
    UNION ALL
    SELECT to_member_id AS member_id, SUM(open_amount_cents)::bigint AS delta
    FROM public.get_budget_open_split_ledger(p_household_id, v_prev_day)
    GROUP BY to_member_id
  ),
  created_rows AS (
    SELECT bss.member_id AS member_id, -SUM(ROUND(bss.amount_owed * 100))::bigint AS delta
    FROM public.budget_split_shares bss
    JOIN public.budget_split_groups bsg ON bsg.id = bss.split_group_id
    JOIN public.budget_posten bp ON bp.id = bsg.budget_posten_id
    WHERE bsg.household_id = p_household_id
      AND COALESCE(bp.wiederholen, false) = false
      AND bp.datum >= v_month
      AND bp.datum <= v_month_end
    GROUP BY bss.member_id
    UNION ALL
    SELECT bsg.payer_member_id AS member_id, SUM(ROUND(bss.amount_owed * 100))::bigint AS delta
    FROM public.budget_split_shares bss
    JOIN public.budget_split_groups bsg ON bsg.id = bss.split_group_id
    JOIN public.budget_posten bp ON bp.id = bsg.budget_posten_id
    WHERE bsg.household_id = p_household_id
      AND COALESCE(bp.wiederholen, false) = false
      AND bp.datum >= v_month
      AND bp.datum <= v_month_end
    GROUP BY bsg.payer_member_id
  ),
  settled_rows AS (
    SELECT bs.from_member_id AS member_id, SUM(ROUND(bsa.amount * 100))::bigint AS delta
    FROM public.budget_settlement_allocations bsa
    JOIN public.budget_settlements bs ON bs.id = bsa.settlement_id
    WHERE bs.household_id = p_household_id
      AND bs.date >= v_month
      AND bs.date <= v_month_end
    GROUP BY bs.from_member_id
    UNION ALL
    SELECT bs.to_member_id AS member_id, -SUM(ROUND(bsa.amount * 100))::bigint AS delta
    FROM public.budget_settlement_allocations bsa
    JOIN public.budget_settlements bs ON bs.id = bsa.settlement_id
    WHERE bs.household_id = p_household_id
      AND bs.date >= v_month
      AND bs.date <= v_month_end
    GROUP BY bs.to_member_id
  ),
  closing_rows AS (
    SELECT from_member_id AS member_id, -SUM(open_amount_cents)::bigint AS delta
    FROM public.get_budget_open_split_ledger(p_household_id, v_month_end)
    GROUP BY from_member_id
    UNION ALL
    SELECT to_member_id AS member_id, SUM(open_amount_cents)::bigint AS delta
    FROM public.get_budget_open_split_ledger(p_household_id, v_month_end)
    GROUP BY to_member_id
  )
  SELECT
    v_close_id,
    p_household_id,
    mb.member_id,
    COALESCE((SELECT SUM(delta) FROM opening_rows o WHERE o.member_id = mb.member_id), 0),
    COALESCE((SELECT SUM(delta) FROM created_rows c WHERE c.member_id = mb.member_id), 0),
    COALESCE((SELECT SUM(delta) FROM settled_rows s WHERE s.member_id = mb.member_id), 0),
    COALESCE((SELECT SUM(delta) FROM closing_rows c WHERE c.member_id = mb.member_id), 0)
  FROM member_base mb;

  UPDATE public.budget_month_closes
  SET
    opening_total_cents = COALESCE((
      SELECT SUM(GREATEST(-opening_balance_cents, 0))::bigint
      FROM public.budget_month_close_members bmcm
      WHERE bmcm.month_close_id = v_close_id
    ), 0),
    created_total_cents = COALESCE((
      SELECT SUM(GREATEST(created_in_month_cents, 0))::bigint
      FROM public.budget_month_close_members bmcm
      WHERE bmcm.month_close_id = v_close_id
    ), 0),
    settled_total_cents = COALESCE((
      SELECT SUM(GREATEST(settled_in_month_cents, 0))::bigint
      FROM public.budget_month_close_members bmcm
      WHERE bmcm.month_close_id = v_close_id
    ), 0),
    closing_total_cents = COALESCE((
      SELECT SUM(GREATEST(-closing_balance_cents, 0))::bigint
      FROM public.budget_month_close_members bmcm
      WHERE bmcm.month_close_id = v_close_id
    ), 0),
    is_stale = false,
    calculated_at = NOW()
  WHERE id = v_close_id;

  UPDATE public.budget_ledger_state bls
  SET stale_from_month = CASE
    WHEN bls.stale_from_month IS NULL THEN NULL
    WHEN bls.stale_from_month > v_month THEN bls.stale_from_month
    ELSE (v_month + INTERVAL '1 month')::date
  END
  WHERE bls.household_id = p_household_id;

  RETURN QUERY
  SELECT
    bmc.id,
    bmc.household_id,
    bmc.month,
    bmc.opening_total_cents,
    bmc.created_total_cents,
    bmc.settled_total_cents,
    bmc.closing_total_cents,
    bmc.is_stale,
    bmc.calculated_at
  FROM public.budget_month_closes bmc
  WHERE bmc.id = v_close_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.backfill_budget_settlement_allocations(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_budget_open_split_ledger(uuid, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_budget_settlement_with_allocations(uuid, uuid, uuid, numeric, date, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_budget_settlement_for_split_share(uuid, uuid, numeric, date, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.delete_budget_settlement(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.close_budget_month(uuid, date) TO authenticated, service_role;

SELECT pg_notify('pgrst', 'reload schema');


-- Ã¢â€â‚¬Ã¢â€â‚¬ Avatar-Support Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
ALTER TABLE public.user_profile
  ADD COLUMN IF NOT EXISTS avatar_url text;

-- Ãƒâ€“ffentlicher Bucket fÃƒÂ¼r Profilbilder
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', TRUE)
ON CONFLICT (id) DO NOTHING;

-- RLS: Nur eigener User darf hochladen / ÃƒÂ¼berschreiben
DROP POLICY IF EXISTS avatars_upload ON storage.objects;
CREATE POLICY avatars_upload ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'avatars' AND (select auth.uid())::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS avatars_update ON storage.objects;
CREATE POLICY avatars_update ON storage.objects FOR UPDATE
  USING (bucket_id = 'avatars' AND (select auth.uid())::text = (storage.foldername(name))[1]);

-- RLS: Ãƒâ€“ffentliches Lesen (fÃƒÂ¼r <img src>)
DROP POLICY IF EXISTS avatars_public_read ON storage.objects;
CREATE POLICY avatars_public_read ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

-- ============================================================
-- 10. MULTI-USER HAUSHALT
-- Haushaltstabellen, Helfer-Funktionen, RLS und Datenmigration.
-- Basiert auf haushalt_multiuser_setup.sql (vollstÃƒÂ¤ndig integriert).
-- ============================================================

-- Ã¢â€â‚¬Ã¢â€â‚¬ Kern-Tabellen Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

CREATE TABLE IF NOT EXISTS public.households (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL DEFAULT 'Mein Haushalt',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS set_households_updated_at ON public.households;
CREATE TRIGGER set_households_updated_at
  BEFORE UPDATE ON public.households
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.household_members (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role         text NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  joined_at    timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE(user_id),
  UNIQUE(household_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_household_members_household_id ON public.household_members(household_id);
CREATE INDEX IF NOT EXISTS idx_household_members_user_id      ON public.household_members(user_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'home_budget_views_household_id_fkey'
      AND conrelid = 'public.home_budget_views'::regclass
  ) THEN
    ALTER TABLE public.home_budget_views
      ADD CONSTRAINT home_budget_views_household_id_fkey
      FOREIGN KEY (household_id) REFERENCES public.households(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'home_budget_view_state_household_id_fkey'
      AND conrelid = 'public.home_budget_view_state'::regclass
  ) THEN
    ALTER TABLE public.home_budget_view_state
      ADD CONSTRAINT home_budget_view_state_household_id_fkey
      FOREIGN KEY (household_id) REFERENCES public.households(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Genau ein Admin pro Haushalt
CREATE UNIQUE INDEX IF NOT EXISTS idx_household_one_admin
  ON public.household_members(household_id)
  WHERE role = 'admin';

-- Storage-Policies jetzt auf Haushaltszugriff erweitern
DROP POLICY IF EXISTS storage_user_dokumente_select ON storage.objects;
CREATE POLICY storage_user_dokumente_select ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'user-dokumente'
    AND (
      (select auth.uid())::text = (storage.foldername(name))[1]
      OR EXISTS (
        SELECT 1
        FROM public.household_members hm1
        JOIN public.household_members hm2 ON hm1.household_id = hm2.household_id
        WHERE hm1.user_id = (select auth.uid())
          AND hm2.user_id::text = (storage.foldername(name))[1]
      )
    )
  );

DROP POLICY IF EXISTS storage_user_dokumente_delete ON storage.objects;
CREATE POLICY storage_user_dokumente_delete ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'user-dokumente'
    AND (
      (select auth.uid())::text = (storage.foldername(name))[1]
      OR EXISTS (
        SELECT 1
        FROM public.household_members hm1
        JOIN public.household_members hm2 ON hm1.household_id = hm2.household_id
        WHERE hm1.user_id = (select auth.uid())
          AND hm2.user_id::text = (storage.foldername(name))[1]
      )
    )
  );

CREATE TABLE IF NOT EXISTS public.household_settings (
  household_id                  uuid PRIMARY KEY REFERENCES public.households(id) ON DELETE CASCADE,
  app_modus                     text NOT NULL DEFAULT 'umzug',
  umzug_deaktiviert             boolean NOT NULL DEFAULT false,
  ki_provider                   text NOT NULL DEFAULT 'openai',
  openai_api_key                text,
  ollama_base_url               text,
  ollama_model                  text DEFAULT 'llama3.2',
  einkauf_reminder_default_zeit text,
  bildanalyse_modus             text DEFAULT 'chatgpt_vision',
  llamacloud_api_key            text,
  bildanalyse_openai_api_key    text,
  updated_at                    timestamptz NOT NULL DEFAULT NOW(),
  updated_by                    uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

DROP TRIGGER IF EXISTS set_household_settings_updated_at ON public.household_settings;
CREATE TRIGGER set_household_settings_updated_at
  BEFORE UPDATE ON public.household_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.household_invites (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  email        text NOT NULL,
  token_hash   text NOT NULL UNIQUE,
  invited_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT NOW(),
  expires_at   timestamptz NOT NULL,
  accepted_at  timestamptz,
  revoked_at   timestamptz
);

CREATE INDEX IF NOT EXISTS idx_household_invites_household ON public.household_invites(household_id);
CREATE INDEX IF NOT EXISTS idx_household_invites_email    ON public.household_invites(LOWER(email));
CREATE INDEX IF NOT EXISTS idx_household_invites_active   ON public.household_invites(expires_at, accepted_at, revoked_at);

-- Ã¢â€â‚¬Ã¢â€â‚¬ Helfer-Funktionen Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

CREATE OR REPLACE FUNCTION public.get_current_household_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT hm.household_id
  FROM public.household_members hm
  WHERE hm.user_id = (SELECT auth.uid())
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.is_household_member(p_household_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.household_members hm
    WHERE hm.household_id = p_household_id
      AND hm.user_id = (SELECT auth.uid())
  );
$$;

CREATE OR REPLACE FUNCTION public.is_household_admin(p_household_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.household_members hm
    WHERE hm.household_id = p_household_id
      AND hm.user_id = (SELECT auth.uid())
      AND hm.role = 'admin'
  );
$$;

CREATE OR REPLACE FUNCTION public.get_household_context()
RETURNS TABLE (
  household_id      uuid,
  household_name    text,
  role              text,
  is_admin          boolean,
  app_modus         text,
  umzug_deaktiviert boolean
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    hm.household_id,
    h.name AS household_name,
    hm.role,
    (hm.role = 'admin') AS is_admin,
    COALESCE(hs.app_modus, 'umzug') AS app_modus,
    COALESCE(hs.umzug_deaktiviert, false) AS umzug_deaktiviert
  FROM public.household_members hm
  JOIN public.households h ON h.id = hm.household_id
  LEFT JOIN public.household_settings hs ON hs.household_id = hm.household_id
  WHERE hm.user_id = (SELECT auth.uid())
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.get_household_members_overview()
RETURNS TABLE (
  user_id        uuid,
  role           text,
  joined_at      timestamptz,
  display_name   text,
  email          text,
  avatar_url     text,
  is_current_user boolean
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  WITH ctx AS (
    SELECT hm.household_id, (SELECT auth.uid()) AS current_user_id
    FROM public.household_members hm
    WHERE hm.user_id = (SELECT auth.uid())
    LIMIT 1
  )
  SELECT
    hm.user_id,
    hm.role,
    hm.joined_at,
    COALESCE(
      NULLIF(BTRIM(up.username), ''),
      NULLIF(BTRIM(u.raw_user_meta_data->>'full_name'), ''),
      NULLIF(BTRIM(hb.name), ''),
      split_part(COALESCE(u.email, ''), '@', 1),
      'Mitglied'
    ) AS display_name,
    LOWER(u.email) AS email,
    up.avatar_url,
    (hm.user_id = ctx.current_user_id) AS is_current_user
  FROM ctx
  JOIN public.household_members hm ON hm.household_id = ctx.household_id
  LEFT JOIN auth.users u ON u.id = hm.user_id
  LEFT JOIN public.user_profile up ON up.id = hm.user_id
  LEFT JOIN public.home_bewohner hb
    ON hb.household_id = hm.household_id
   AND hb.linked_user_id = hm.user_id
  ORDER BY
    CASE WHEN hm.role = 'admin' THEN 0 ELSE 1 END,
    hm.joined_at ASC;
$$;

CREATE OR REPLACE FUNCTION public.create_household(p_name text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid;
  v_household_id uuid;
  v_name text;
  v_profile record;
BEGIN
  v_uid := (SELECT auth.uid());
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Nicht authentifiziert.'; END IF;

  SELECT hm.household_id INTO v_household_id
  FROM public.household_members hm WHERE hm.user_id = v_uid LIMIT 1;
  IF v_household_id IS NOT NULL THEN RETURN v_household_id; END IF;

  v_name := COALESCE(NULLIF(BTRIM(p_name), ''), 'Mein Haushalt');

  INSERT INTO public.households (name, created_by) VALUES (v_name, v_uid)
  RETURNING id INTO v_household_id;

  INSERT INTO public.household_members (household_id, user_id, role)
  VALUES (v_household_id, v_uid, 'admin');

  SELECT up.app_modus, up.umzug_deaktiviert, up.ki_provider,
         up.openai_api_key, up.ollama_base_url, up.ollama_model
  INTO v_profile FROM public.user_profile up WHERE up.id = v_uid;

  INSERT INTO public.household_settings (
    household_id, app_modus, umzug_deaktiviert, ki_provider,
    openai_api_key, ollama_base_url, ollama_model, updated_by
  ) VALUES (
    v_household_id,
    COALESCE(v_profile.app_modus, 'umzug'),
    COALESCE(v_profile.umzug_deaktiviert, false),
    COALESCE(v_profile.ki_provider, 'openai'),
    v_profile.openai_api_key, v_profile.ollama_base_url,
    COALESCE(v_profile.ollama_model, 'llama3.2'), v_uid
  ) ON CONFLICT (household_id) DO NOTHING;

  RETURN v_household_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_household_invite(
  p_email text,
  p_expires_in interval DEFAULT INTERVAL '7 days'
)
RETURNS TABLE (invite_id uuid, invite_token text, invite_url text)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid; v_household_id uuid; v_email text; v_token text; v_hash text;
BEGIN
  v_uid := (SELECT auth.uid());
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Nicht authentifiziert.'; END IF;

  v_household_id := public.get_current_household_id();
  IF v_household_id IS NULL OR NOT public.is_household_admin(v_household_id) THEN
    RAISE EXCEPTION 'Nur Admin kann Einladungen erstellen.';
  END IF;

  v_email := LOWER(BTRIM(p_email));
  IF v_email IS NULL OR v_email = '' THEN RAISE EXCEPTION 'E-Mail ist erforderlich.'; END IF;

  IF to_regprocedure('extensions.gen_random_bytes(integer)') IS NOT NULL THEN
    v_token := ENCODE(extensions.gen_random_bytes(24), 'hex');
  ELSIF to_regprocedure('public.gen_random_bytes(integer)') IS NOT NULL THEN
    v_token := ENCODE(public.gen_random_bytes(24), 'hex');
  ELSE
    RAISE EXCEPTION 'pgcrypto gen_random_bytes nicht gefunden.';
  END IF;

  v_hash := md5(v_token);

  INSERT INTO public.household_invites (household_id, email, token_hash, invited_by, expires_at)
  VALUES (v_household_id, v_email, v_hash, v_uid, NOW() + p_expires_in)
  RETURNING id INTO invite_id;

  invite_token := v_token;
  invite_url := '/join-household?token=' || v_token;
  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.accept_household_invite(p_token text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid; v_email text; v_hash text; v_invite record;
  v_invite_first_login_required boolean;
BEGIN
  v_uid := (SELECT auth.uid());
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Nicht authentifiziert.'; END IF;

  IF EXISTS (SELECT 1 FROM public.household_members hm WHERE hm.user_id = v_uid) THEN
    RAISE EXCEPTION 'Dieser Benutzer ist bereits einem Haushalt zugeordnet.';
  END IF;

  SELECT LOWER(u.email),
         COALESCE((u.raw_user_meta_data->>'invite_first_login_required') = 'true', false)
  INTO v_email, v_invite_first_login_required
  FROM auth.users u WHERE u.id = v_uid;

  IF v_email IS NULL THEN RAISE EXCEPTION 'Konnte Benutzer-E-Mail nicht bestimmen.'; END IF;

  v_hash := md5(BTRIM(p_token));

  SELECT * INTO v_invite FROM public.household_invites hi
  WHERE hi.token_hash = v_hash
    AND hi.revoked_at IS NULL AND hi.accepted_at IS NULL
    AND hi.expires_at > NOW()
  LIMIT 1;

  IF v_invite.id IS NULL THEN RAISE EXCEPTION 'Einladung ungÃƒÂ¼ltig oder abgelaufen.'; END IF;
  IF LOWER(v_invite.email) <> v_email THEN
    RAISE EXCEPTION 'Einladung ist an eine andere E-Mail-Adresse gebunden.';
  END IF;

  INSERT INTO public.household_members (household_id, user_id, role)
  VALUES (v_invite.household_id, v_uid, 'member');

  UPDATE public.household_invites SET accepted_at = NOW() WHERE id = v_invite.id;

  INSERT INTO public.household_settings (household_id) VALUES (v_invite.household_id)
  ON CONFLICT (household_id) DO NOTHING;

  IF COALESCE(v_invite_first_login_required, false) THEN
    INSERT INTO public.user_profile (id, password_change_required)
    VALUES (v_uid, true)
    ON CONFLICT (id) DO UPDATE SET password_change_required = true;
  END IF;

  RETURN v_invite.household_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.transfer_household_admin(p_new_admin_user_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid; v_household_id uuid;
BEGIN
  v_uid := (SELECT auth.uid());
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Nicht authentifiziert.'; END IF;

  v_household_id := public.get_current_household_id();
  IF v_household_id IS NULL OR NOT public.is_household_admin(v_household_id) THEN
    RAISE EXCEPTION 'Nur Admin kann die Rolle ÃƒÂ¼bertragen.';
  END IF;
  IF p_new_admin_user_id = v_uid THEN
    RAISE EXCEPTION 'Neuer Admin muss ein anderes Mitglied sein.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.household_members hm
    WHERE hm.household_id = v_household_id AND hm.user_id = p_new_admin_user_id
  ) THEN
    RAISE EXCEPTION 'Zielbenutzer ist kein Mitglied dieses Haushalts.';
  END IF;

  UPDATE public.household_members
  SET role = CASE
    WHEN user_id = p_new_admin_user_id THEN 'admin'
    WHEN user_id = v_uid              THEN 'member'
    ELSE role
  END
  WHERE household_id = v_household_id AND user_id IN (p_new_admin_user_id, v_uid);

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.leave_household()
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid; v_household_id uuid;
BEGIN
  v_uid := (SELECT auth.uid());
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Nicht authentifiziert.'; END IF;

  v_household_id := public.get_current_household_id();
  IF v_household_id IS NULL THEN RETURN true; END IF;

  IF public.is_household_admin(v_household_id) THEN
    RAISE EXCEPTION 'Admin kann den Haushalt nicht verlassen. Erst Admin ÃƒÂ¼bertragen oder Haushalt lÃƒÂ¶schen.';
  END IF;

  DELETE FROM public.household_members
  WHERE household_id = v_household_id AND user_id = v_uid;

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_household()
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_household_id uuid;
BEGIN
  v_household_id := public.get_current_household_id();
  IF v_household_id IS NULL OR NOT public.is_household_admin(v_household_id) THEN
    RAISE EXCEPTION 'Nur Admin darf den Haushalt lÃƒÂ¶schen.';
  END IF;
  DELETE FROM public.households WHERE id = v_household_id;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.remove_household_member(p_user_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_household_id uuid;
BEGIN
  SELECT household_id INTO v_household_id
  FROM public.household_members
  WHERE user_id = (SELECT auth.uid()) AND role = 'admin';

  IF v_household_id IS NULL THEN
    RAISE EXCEPTION 'Nur Admins kÃƒÂ¶nnen Mitglieder entfernen.';
  END IF;
  IF p_user_id = (SELECT auth.uid()) THEN
    RAISE EXCEPTION 'Du kannst dich nicht selbst entfernen.';
  END IF;

  DELETE FROM public.household_members
  WHERE user_id = p_user_id AND household_id = v_household_id;

  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_household_app_mode(
  p_app_modus text,
  p_umzug_deaktiviert boolean DEFAULT NULL
)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_household_id uuid;
BEGIN
  v_household_id := public.get_current_household_id();
  IF v_household_id IS NULL OR NOT public.is_household_admin(v_household_id) THEN
    RAISE EXCEPTION 'Nur Admin darf globale Haushaltseinstellungen ÃƒÂ¤ndern.';
  END IF;

  INSERT INTO public.household_settings (household_id, app_modus, umzug_deaktiviert, updated_by)
  VALUES (v_household_id, COALESCE(NULLIF(BTRIM(p_app_modus), ''), 'umzug'),
          COALESCE(p_umzug_deaktiviert, false), (SELECT auth.uid()))
  ON CONFLICT (household_id) DO UPDATE
  SET app_modus = EXCLUDED.app_modus,
      umzug_deaktiviert = COALESCE(p_umzug_deaktiviert, public.household_settings.umzug_deaktiviert),
      updated_by = (SELECT auth.uid()),
      updated_at = NOW();

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_household_ki_settings(
  p_ki_provider text,
  p_openai_api_key text,
  p_ollama_base_url text,
  p_ollama_model text
)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_household_id uuid;
BEGIN
  v_household_id := public.get_current_household_id();
  IF v_household_id IS NULL OR NOT public.is_household_admin(v_household_id) THEN
    RAISE EXCEPTION 'Nur Admin darf KI-Einstellungen ÃƒÂ¤ndern.';
  END IF;

  INSERT INTO public.household_settings (
    household_id, ki_provider, openai_api_key, ollama_base_url, ollama_model, updated_by
  ) VALUES (
    v_household_id,
    COALESCE(NULLIF(BTRIM(p_ki_provider), ''), 'openai'),
    NULLIF(BTRIM(p_openai_api_key), ''),
    NULLIF(BTRIM(p_ollama_base_url), ''),
    COALESCE(NULLIF(BTRIM(p_ollama_model), ''), 'llama3.2'),
    (SELECT auth.uid())
  )
  ON CONFLICT (household_id) DO UPDATE
  SET ki_provider     = EXCLUDED.ki_provider,
      openai_api_key  = EXCLUDED.openai_api_key,
      ollama_base_url = EXCLUDED.ollama_base_url,
      ollama_model    = EXCLUDED.ollama_model,
      updated_by      = (SELECT auth.uid()),
      updated_at      = NOW();

  RETURN true;
END;
$$;

-- Ã¢â€â‚¬Ã¢â€â‚¬ Datenmigration fÃƒÂ¼r bestehende Installationen Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

-- ── Legacy-Migration: haushalt_mitglieder → household_members ─────────────────
-- Nur ausführen wenn Legacy-Tabellen existieren (bestehende Installationen).
-- Stellt sicher dass alle Mitglieder im selben household_id-Bucket landen und
-- push-reminders korrekt an alle Haushaltsmitglieder senden kann.
DO $$
DECLARE
  v_legacy_vorhanden boolean;
BEGIN
  SELECT (
    EXISTS (SELECT 1 FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = 'haushalt_mitglieder')
    AND
    EXISTS (SELECT 1 FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = 'haushalte')
  ) INTO v_legacy_vorhanden;

  IF NOT v_legacy_vorhanden THEN
    RAISE NOTICE 'Legacy-Tabellen nicht vorhanden – Migration übersprungen.';
    RETURN;
  END IF;

  DROP TABLE IF EXISTS tmp_falsch_haushalte;
  CREATE TEMP TABLE tmp_falsch_haushalte ON COMMIT DROP AS
  SELECT DISTINCT hm_new.user_id, hm_new.household_id AS falscher_haushalt
  FROM public.household_members hm_new
  JOIN public.haushalt_mitglieder hm_old ON hm_old.user_id = hm_new.user_id
  WHERE hm_new.household_id IS DISTINCT FROM hm_old.haushalt_id;

  -- 1. households mit gleicher UUID wie haushalte anlegen (IDs bleiben identisch)
  INSERT INTO public.households (id, name, created_by, created_at)
  SELECT id, name, admin_id, created_at FROM public.haushalte
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.household_settings (household_id)
  SELECT id FROM public.households ON CONFLICT (household_id) DO NOTHING;

  -- 2. Falsch zugeordnete Mitglieder + isolierte Auto-Create-Haushalte löschen
  DELETE FROM public.household_members
  WHERE user_id IN (SELECT user_id FROM tmp_falsch_haushalte);

  DELETE FROM public.household_settings
  WHERE household_id IN (SELECT falscher_haushalt FROM tmp_falsch_haushalte);

  DELETE FROM public.households
  WHERE id IN (SELECT falscher_haushalt FROM tmp_falsch_haushalte)
    AND id NOT IN (SELECT DISTINCT household_id FROM public.household_members);

  -- 3. Mitglieder korrekt eintragen (haushalt_mitglieder → household_members)
  INSERT INTO public.household_members (household_id, user_id, role, joined_at)
  SELECT
    hm_old.haushalt_id,
    hm_old.user_id,
    CASE WHEN hm_old.rolle = 'admin' THEN 'admin' ELSE 'member' END,
    COALESCE(hm_old.created_at, NOW())
  FROM public.haushalt_mitglieder hm_old
  WHERE hm_old.user_id NOT IN (SELECT user_id FROM public.household_members)
  ON CONFLICT (user_id) DO NOTHING;

  -- 4. Sync-Trigger für zukünftige haushalt_mitglieder-Einträge
  EXECUTE $func$
    CREATE OR REPLACE FUNCTION public.sync_haushalt_mitglieder_insert()
    RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
    AS $inner$
    BEGIN
      INSERT INTO public.households (id, name, created_by)
      SELECT NEW.haushalt_id, h.name, h.admin_id
      FROM public.haushalte h WHERE h.id = NEW.haushalt_id
      ON CONFLICT (id) DO NOTHING;

      INSERT INTO public.household_members (household_id, user_id, role)
      VALUES (NEW.haushalt_id, NEW.user_id,
              CASE WHEN NEW.rolle = 'admin' THEN 'admin' ELSE 'member' END)
      ON CONFLICT (user_id) DO NOTHING;

      INSERT INTO public.household_settings (household_id)
      VALUES (NEW.haushalt_id) ON CONFLICT (household_id) DO NOTHING;

      RETURN NEW;
    END;
    $inner$
  $func$;

  DROP TRIGGER IF EXISTS sync_haushalt_mitglieder_trigger ON public.haushalt_mitglieder;
  CREATE TRIGGER sync_haushalt_mitglieder_trigger
    AFTER INSERT ON public.haushalt_mitglieder
    FOR EACH ROW EXECUTE FUNCTION public.sync_haushalt_mitglieder_insert();

  RAISE NOTICE 'Legacy-Migration: household_members korrekt synchronisiert.';
END;
$$;

-- Pro bestehendem User Haushalt + Admin-Mitglied sicherstellen
WITH missing_users AS (
  SELECT
    u.id AS user_id,
    COALESCE(NULLIF(BTRIM(up.username), ''), split_part(COALESCE(u.email, 'haushalt'), '@', 1)) AS display_name
  FROM auth.users u
  LEFT JOIN public.household_members hm ON hm.user_id = u.id
  LEFT JOIN public.user_profile up ON up.id = u.id
  WHERE hm.user_id IS NULL
),
created_households AS (
  INSERT INTO public.households (name, created_by)
  SELECT 'Haushalt von ' || display_name, user_id
  FROM missing_users
  RETURNING id, created_by
)
INSERT INTO public.household_members (household_id, user_id, role)
SELECT ch.id, ch.created_by, 'admin'
FROM created_households ch;

-- Settings fÃƒÂ¼r bestehende Haushalte aus Admin-Profil befÃƒÂ¼llen
INSERT INTO public.household_settings (
  household_id, app_modus, umzug_deaktiviert,
  ki_provider, openai_api_key, ollama_base_url, ollama_model, updated_by
)
SELECT
  hm.household_id,
  COALESCE(up.app_modus, 'umzug'),
  COALESCE(up.umzug_deaktiviert, false),
  COALESCE(up.ki_provider, 'openai'),
  up.openai_api_key, up.ollama_base_url,
  COALESCE(up.ollama_model, 'llama3.2'),
  hm.user_id
FROM public.household_members hm
LEFT JOIN public.user_profile up ON up.id = hm.user_id
WHERE hm.role = 'admin'
ON CONFLICT (household_id) DO NOTHING;

-- Shared-Tabellen auf household_id migrieren
DO $$
DECLARE
  shared_tables text[] := ARRAY[
    'kontakte','budget_posten','budget_teilzahlungen','todo_aufgaben',
    'pack_kisten','pack_gegenstaende','dokumente','renovierungs_posten',
    'home_projekte','home_orte','home_lagerorte','home_objekte',
    'home_vorraete','home_einkaufliste','home_einkauf_korrekturen','home_geraete','home_wartungen',
    'home_bewohner','home_budget_limits','home_sparziele','home_finanzkonten',
    'home_verlauf','home_wissen','haushaltsaufgaben','vorraete','projekte','geraete'
  ];
  t text; fk record; pol record;
BEGIN
  FOREACH t IN ARRAY shared_tables
  LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables
               WHERE table_schema = 'public' AND table_name = t) THEN

      EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS household_id uuid', t);
      EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS created_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL', t);
      EXECUTE format('UPDATE public.%I SET created_by_user_id = user_id WHERE created_by_user_id IS NULL', t);
      EXECUTE format(
        'UPDATE public.%I tbl SET household_id = hm.household_id
         FROM public.household_members hm
         WHERE tbl.household_id IS NULL AND tbl.user_id = hm.user_id', t);
      EXECUTE format(
        'UPDATE public.%I tbl SET household_id = hm.household_id
         FROM public.household_members hm
         WHERE tbl.household_id IS NULL AND tbl.created_by_user_id = hm.user_id', t);
      EXECUTE format(
        'UPDATE public.%I SET household_id = (SELECT id FROM public.households ORDER BY created_at ASC LIMIT 1)
         WHERE household_id IS NULL', t);

      -- user_id FK auf ON DELETE SET NULL umstellen
      FOR fk IN
        SELECT con.conname FROM pg_constraint con
        JOIN pg_class rel ON rel.oid = con.conrelid
        JOIN pg_namespace ns ON ns.oid = rel.relnamespace
        JOIN pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
        WHERE ns.nspname = 'public' AND rel.relname = t AND con.contype = 'f' AND att.attname = 'user_id'
      LOOP
        EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT IF EXISTS %I', t, fk.conname);
      END LOOP;

      EXECUTE format('ALTER TABLE public.%I ALTER COLUMN user_id DROP NOT NULL', t);
      BEGIN
        EXECUTE format(
          'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL',
          t, t || '_user_id_setnull_fkey');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END;

      -- household_id NOT NULL + FK
      EXECUTE format('ALTER TABLE public.%I ALTER COLUMN household_id SET NOT NULL', t);
      FOR fk IN
        SELECT con.conname FROM pg_constraint con
        JOIN pg_class rel ON rel.oid = con.conrelid
        JOIN pg_namespace ns ON ns.oid = rel.relnamespace
        JOIN pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
        WHERE ns.nspname = 'public' AND rel.relname = t AND con.contype = 'f' AND att.attname = 'household_id'
      LOOP
        EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT IF EXISTS %I', t, fk.conname);
      END LOOP;
      EXECUTE format(
        'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (household_id) REFERENCES public.households(id) ON DELETE CASCADE',
        t, t || '_household_id_fkey');
      EXECUTE format(
        'CREATE INDEX IF NOT EXISTS %I ON public.%I(household_id)',
        'idx_' || t || '_household_id', t);

      -- Alte user_id-Policies ersetzen durch household_member_access
      FOR pol IN
        SELECT policyname FROM pg_policies
        WHERE schemaname = 'public' AND tablename = t
      LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, t);
      END LOOP;

      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
      EXECUTE format(
        'CREATE POLICY household_member_access ON public.%I
         FOR ALL TO authenticated
         USING (public.is_household_member(household_id))
         WITH CHECK (public.is_household_member(household_id))', t);
    END IF;
  END LOOP;
END $$;

CREATE INDEX IF NOT EXISTS idx_budget_posten_scope
  ON public.budget_posten(household_id, budget_scope, datum);
CREATE INDEX IF NOT EXISTS idx_budget_posten_bewohner_scope
  ON public.budget_posten(household_id, bewohner_id, budget_scope, datum);

-- home_geraete: Kategorie-Index (household_id + kategorie) nach household_id-Migration
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'home_geraete'
      AND column_name = 'household_id'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_home_geraete_kategorie
      ON public.home_geraete (household_id, kategorie);
  END IF;
END $$;

-- home_bewohner: Haushaltsmitglieder spiegeln + eindeutige Verknuepfung
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'home_bewohner'
  ) THEN
    ALTER TABLE public.home_bewohner
      ADD COLUMN IF NOT EXISTS linked_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

    CREATE INDEX IF NOT EXISTS idx_home_bewohner_linked_user_id
      ON public.home_bewohner(linked_user_id);

    DELETE FROM public.home_bewohner hb
    USING (
      SELECT id
      FROM (
        SELECT
          id,
          ROW_NUMBER() OVER (
            PARTITION BY household_id, linked_user_id
            ORDER BY created_at ASC, id ASC
          ) AS rn
        FROM public.home_bewohner
        WHERE linked_user_id IS NOT NULL
      ) ranked
      WHERE ranked.rn > 1
    ) duplicates
    WHERE hb.id = duplicates.id;

    CREATE UNIQUE INDEX IF NOT EXISTS idx_home_bewohner_household_linked_user_unique
      ON public.home_bewohner(household_id, linked_user_id)
      WHERE linked_user_id IS NOT NULL;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.get_bewohner_overview()
RETURNS TABLE (
  id uuid,
  name text,
  farbe text,
  emoji text,
  linked_user_id uuid,
  is_household_member boolean,
  is_admin boolean,
  is_current_user boolean,
  display_name text,
  email text,
  avatar_url text,
  created_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  WITH ctx AS (
    SELECT
      hm.household_id,
      (SELECT auth.uid()) AS current_user_id
    FROM public.household_members hm
    WHERE hm.user_id = (SELECT auth.uid())
    LIMIT 1
  )
  SELECT
    hb.id,
    hb.name,
    COALESCE(NULLIF(BTRIM(hb.farbe), ''), '#10B981') AS farbe,
    COALESCE(NULLIF(BTRIM(hb.emoji), ''), U&'\D83D\DC64') AS emoji,
    hb.linked_user_id,
    (hm.user_id IS NOT NULL) AS is_household_member,
    (hm.role = 'admin') AS is_admin,
    (hb.linked_user_id = ctx.current_user_id) AS is_current_user,
    COALESCE(
      NULLIF(BTRIM(up.username), ''),
      NULLIF(BTRIM(u.raw_user_meta_data->>'full_name'), ''),
      NULLIF(BTRIM(hb.name), ''),
      split_part(COALESCE(u.email, ''), '@', 1),
      'Bewohner'
    ) AS display_name,
    CASE WHEN hm.user_id IS NOT NULL THEN LOWER(u.email) ELSE NULL END AS email,
    CASE WHEN hm.user_id IS NOT NULL THEN up.avatar_url ELSE NULL END AS avatar_url,
    hb.created_at
  FROM ctx
  JOIN public.home_bewohner hb ON hb.household_id = ctx.household_id
  LEFT JOIN public.household_members hm
    ON hm.household_id = hb.household_id
   AND hm.user_id = hb.linked_user_id
  LEFT JOIN auth.users u ON u.id = hm.user_id
  LEFT JOIN public.user_profile up ON up.id = hm.user_id
  ORDER BY
    CASE
      WHEN hm.role = 'admin' THEN 0
      WHEN hm.user_id IS NOT NULL THEN 1
      ELSE 2
    END,
    hb.created_at ASC;
$$;

CREATE OR REPLACE FUNCTION public.sync_household_member_to_bewohner()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_display_name text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.home_bewohner hb
    WHERE hb.household_id = OLD.household_id
      AND hb.linked_user_id = OLD.user_id;
    RETURN OLD;
  END IF;

  SELECT
    COALESCE(
      NULLIF(BTRIM(up.username), ''),
      NULLIF(BTRIM(u.raw_user_meta_data->>'full_name'), ''),
      NULLIF(BTRIM(hb_existing.name), ''),
      split_part(COALESCE(u.email, ''), '@', 1),
      'Mitglied'
    )
  INTO v_display_name
  FROM auth.users u
  LEFT JOIN public.user_profile up ON up.id = u.id
  LEFT JOIN LATERAL (
    SELECT hb2.name
    FROM public.home_bewohner hb2
    WHERE hb2.household_id = NEW.household_id
      AND (
        hb2.linked_user_id = NEW.user_id
        OR (hb2.user_id = NEW.user_id AND hb2.linked_user_id IS NULL)
      )
    ORDER BY
      CASE WHEN hb2.linked_user_id = NEW.user_id THEN 0 ELSE 1 END,
      hb2.created_at ASC,
      hb2.id ASC
    LIMIT 1
  ) hb_existing ON true
  WHERE u.id = NEW.user_id;

  UPDATE public.home_bewohner hb
  SET linked_user_id = NEW.user_id,
      user_id = NEW.user_id,
      name = COALESCE(NULLIF(BTRIM(hb.name), ''), v_display_name)
  WHERE hb.id = (
    SELECT hb2.id
    FROM public.home_bewohner hb2
    WHERE hb2.household_id = NEW.household_id
      AND hb2.user_id = NEW.user_id
      AND hb2.linked_user_id IS NULL
    ORDER BY hb2.created_at ASC
    LIMIT 1
  )
    AND NOT EXISTS (
      SELECT 1
      FROM public.home_bewohner existing
      WHERE existing.household_id = NEW.household_id
        AND existing.linked_user_id = NEW.user_id
    );

  INSERT INTO public.home_bewohner (
    household_id, user_id, linked_user_id, name, farbe, emoji, created_by_user_id
  )
  VALUES (
    NEW.household_id,
    NEW.user_id,
    NEW.user_id,
    COALESCE(v_display_name, 'Mitglied'),
    '#10B981',
    U&'\D83D\DC64',
    NEW.user_id
  )
  ON CONFLICT (household_id, linked_user_id) WHERE linked_user_id IS NOT NULL
  DO UPDATE
  SET user_id = EXCLUDED.user_id,
      name = EXCLUDED.name;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_household_member_to_bewohner_trigger ON public.household_members;
CREATE TRIGGER sync_household_member_to_bewohner_trigger
  AFTER INSERT OR DELETE ON public.household_members
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_household_member_to_bewohner();

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'home_bewohner'
  ) THEN
    WITH first_match AS (
      SELECT DISTINCT ON (hm.household_id, hm.user_id)
        hb.id,
        hm.user_id AS linked_user_id
      FROM public.household_members hm
      JOIN public.home_bewohner hb
        ON hb.household_id = hm.household_id
       AND hb.user_id = hm.user_id
       AND hb.linked_user_id IS NULL
      WHERE NOT EXISTS (
        SELECT 1
        FROM public.home_bewohner existing
        WHERE existing.household_id = hm.household_id
          AND existing.linked_user_id = hm.user_id
      )
      ORDER BY hm.household_id, hm.user_id, hb.created_at ASC, hb.id
    )
    UPDATE public.home_bewohner hb
    SET linked_user_id = fm.linked_user_id
    FROM first_match fm
    WHERE hb.id = fm.id;

    INSERT INTO public.home_bewohner (
      household_id, user_id, linked_user_id, name, farbe, emoji, created_by_user_id
    )
    SELECT
      hm.household_id,
      hm.user_id,
      hm.user_id,
      COALESCE(
        NULLIF(BTRIM(up.username), ''),
        NULLIF(BTRIM(u.raw_user_meta_data->>'full_name'), ''),
        NULLIF(BTRIM(hb_existing.name), ''),
        split_part(COALESCE(u.email, ''), '@', 1),
        'Mitglied'
      ) AS name,
      '#10B981' AS farbe,
      U&'\D83D\DC64' AS emoji,
      hm.user_id AS created_by_user_id
    FROM public.household_members hm
    LEFT JOIN auth.users u ON u.id = hm.user_id
    LEFT JOIN public.user_profile up ON up.id = hm.user_id
    LEFT JOIN LATERAL (
      SELECT hb2.name
      FROM public.home_bewohner hb2
      WHERE hb2.household_id = hm.household_id
        AND (
          hb2.linked_user_id = hm.user_id
          OR (hb2.user_id = hm.user_id AND hb2.linked_user_id IS NULL)
        )
      ORDER BY
        CASE WHEN hb2.linked_user_id = hm.user_id THEN 0 ELSE 1 END,
        hb2.created_at ASC,
        hb2.id ASC
      LIMIT 1
    ) hb_existing ON true
    LEFT JOIN public.home_bewohner hb
      ON hb.household_id = hm.household_id
     AND hb.linked_user_id = hm.user_id
    WHERE hb.id IS NULL
    ON CONFLICT (household_id, linked_user_id) WHERE linked_user_id IS NOT NULL DO NOTHING;
  END IF;
END $$;
-- home_budget_limits: Unique-Constraint von user_id Ã¢â€ â€™ household_id
DO $$
BEGIN
  ALTER TABLE public.home_budget_limits
    DROP CONSTRAINT IF EXISTS home_budget_limits_user_id_kategorie_key;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'home_budget_limits_household_id_kategorie_key'
      AND conrelid = 'public.home_budget_limits'::regclass
  ) THEN
    BEGIN
      ALTER TABLE public.home_budget_limits
        ADD CONSTRAINT home_budget_limits_household_id_kategorie_key
        UNIQUE (household_id, kategorie);
    EXCEPTION WHEN duplicate_table THEN
      DROP INDEX IF EXISTS public.home_budget_limits_household_id_kategorie_key;
      ALTER TABLE public.home_budget_limits
        ADD CONSTRAINT home_budget_limits_household_id_kategorie_key
        UNIQUE (household_id, kategorie);
    END;
  END IF;
END $$;

-- home_einkauf_korrekturen: Unique-Constraint von user_id -> household_id
DO $$
BEGIN
  ALTER TABLE public.home_einkauf_korrekturen
    DROP CONSTRAINT IF EXISTS home_einkauf_korrekturen_user_id_normalized_name_key;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'home_einkauf_korrekturen_household_id_normalized_name_key'
      AND conrelid = 'public.home_einkauf_korrekturen'::regclass
  ) THEN
    BEGIN
      ALTER TABLE public.home_einkauf_korrekturen
        ADD CONSTRAINT home_einkauf_korrekturen_household_id_normalized_name_key
        UNIQUE (household_id, normalized_name);
    EXCEPTION WHEN duplicate_table THEN
      DROP INDEX IF EXISTS public.home_einkauf_korrekturen_household_id_normalized_name_key;
      ALTER TABLE public.home_einkauf_korrekturen
        ADD CONSTRAINT home_einkauf_korrekturen_household_id_normalized_name_key
        UNIQUE (household_id, normalized_name);
    END;
  END IF;
END $$;

-- Ã¢â€â‚¬Ã¢â€â‚¬ Insert/Update-Helfer fÃƒÂ¼r alte Frontend-Payloads Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

CREATE OR REPLACE FUNCTION public.set_household_scope_defaults()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.household_id IS NULL THEN
    NEW.household_id := public.get_current_household_id();
  END IF;
  IF NEW.created_by_user_id IS NULL THEN
    NEW.created_by_user_id := (SELECT auth.uid());
  END IF;
  IF NEW.user_id IS NULL THEN
    NEW.user_id := (SELECT auth.uid());
  END IF;
  RETURN NEW;
END;
$$;

DO $$
DECLARE
  shared_tables text[] := ARRAY[
    'kontakte','budget_posten','budget_teilzahlungen','todo_aufgaben',
    'pack_kisten','pack_gegenstaende','dokumente','renovierungs_posten',
    'home_projekte','home_orte','home_lagerorte','home_objekte',
    'home_vorraete','home_einkaufliste','home_einkauf_korrekturen','home_geraete','home_wartungen',
    'home_bewohner','home_budget_limits','home_sparziele','home_finanzkonten',
    'home_verlauf','home_wissen','haushaltsaufgaben','vorraete','projekte','geraete'
  ];
  t text;
BEGIN
  FOREACH t IN ARRAY shared_tables
  LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables
               WHERE table_schema = 'public' AND table_name = t) THEN
      EXECUTE format('DROP TRIGGER IF EXISTS set_household_scope_defaults_trigger ON public.%I', t);
      EXECUTE format(
        'CREATE TRIGGER set_household_scope_defaults_trigger
         BEFORE INSERT OR UPDATE ON public.%I
         FOR EACH ROW EXECUTE FUNCTION public.set_household_scope_defaults()', t);
    END IF;
  END LOOP;
END $$;

-- Ã¢â€â‚¬Ã¢â€â‚¬ RLS fÃƒÂ¼r Haushalts-Verwaltungstabellen Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
-- Performance-optimiert: keine doppelten permissiven Policies.

ALTER TABLE public.households       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.household_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.household_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.household_invites ENABLE ROW LEVEL SECURITY;

-- households
DROP POLICY IF EXISTS household_member_read_household  ON public.households;
DROP POLICY IF EXISTS household_admin_update_household ON public.households;
DROP POLICY IF EXISTS household_admin_delete_household ON public.households;

CREATE POLICY household_member_read_household ON public.households
  FOR SELECT TO authenticated USING (public.is_household_member(id));

CREATE POLICY household_admin_update_household ON public.households
  FOR UPDATE TO authenticated
  USING (public.is_household_admin(id)) WITH CHECK (public.is_household_admin(id));

CREATE POLICY household_admin_delete_household ON public.households
  FOR DELETE TO authenticated USING (public.is_household_admin(id));

-- household_members
-- FIX multiple_permissive_policies:
--   Nur EINE permissive SELECT-Policy Ã¢â€ â€™ household_member_read_members (FOR SELECT)
--   Admin-DML als separate INSERT/UPDATE/DELETE-Policies (kein FOR ALL).
DROP POLICY IF EXISTS household_member_read_members  ON public.household_members;
DROP POLICY IF EXISTS household_admin_manage_members ON public.household_members;
DROP POLICY IF EXISTS household_admin_insert_members ON public.household_members;
DROP POLICY IF EXISTS household_admin_update_members ON public.household_members;
DROP POLICY IF EXISTS household_admin_delete_members ON public.household_members;

CREATE POLICY household_member_read_members ON public.household_members
  FOR SELECT TO authenticated
  USING (public.is_household_member(household_id));

CREATE POLICY household_admin_insert_members ON public.household_members
  FOR INSERT TO authenticated
  WITH CHECK (public.is_household_admin(household_id));

CREATE POLICY household_admin_update_members ON public.household_members
  FOR UPDATE TO authenticated
  USING (public.is_household_admin(household_id))
  WITH CHECK (public.is_household_admin(household_id));

CREATE POLICY household_admin_delete_members ON public.household_members
  FOR DELETE TO authenticated
  USING (public.is_household_admin(household_id));

-- household_settings
-- FIX multiple_permissive_policies:
--   FOR ALL erzeugt doppeltes SELECT Ã¢â€ â€™ aufgeteilt in SELECT + INSERT/UPDATE/DELETE.
DROP POLICY IF EXISTS household_admin_read_settings    ON public.household_settings;
DROP POLICY IF EXISTS household_admin_manage_settings  ON public.household_settings;
DROP POLICY IF EXISTS household_member_read_settings   ON public.household_settings;
DROP POLICY IF EXISTS household_admin_insert_settings  ON public.household_settings;
DROP POLICY IF EXISTS household_admin_update_settings  ON public.household_settings;
DROP POLICY IF EXISTS household_admin_delete_settings  ON public.household_settings;

CREATE POLICY household_member_read_settings ON public.household_settings
  FOR SELECT TO authenticated
  USING (public.is_household_member(household_id));

CREATE POLICY household_admin_insert_settings ON public.household_settings
  FOR INSERT TO authenticated
  WITH CHECK (public.is_household_admin(household_id));

CREATE POLICY household_admin_update_settings ON public.household_settings
  FOR UPDATE TO authenticated
  USING (public.is_household_admin(household_id))
  WITH CHECK (public.is_household_admin(household_id));

CREATE POLICY household_admin_delete_settings ON public.household_settings
  FOR DELETE TO authenticated
  USING (public.is_household_admin(household_id));

-- household_invites
DROP POLICY IF EXISTS household_admin_manage_invites ON public.household_invites;
CREATE POLICY household_admin_manage_invites ON public.household_invites
  FOR ALL TO authenticated
  USING (public.is_household_admin(household_id))
  WITH CHECK (public.is_household_admin(household_id));

-- Ã¢â€â‚¬Ã¢â€â‚¬ Sync: Admin user_profile Ã¢â€ â€™ household_settings Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

CREATE OR REPLACE FUNCTION public.sync_user_profile_to_household_settings()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_household_id uuid;
  v_is_admin boolean;
BEGIN
  SELECT hm.household_id, (hm.role = 'admin')
  INTO v_household_id, v_is_admin
  FROM public.household_members hm
  WHERE hm.user_id = NEW.id
  LIMIT 1;

  IF v_household_id IS NULL OR NOT COALESCE(v_is_admin, false) THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.household_settings (
    household_id, app_modus, umzug_deaktiviert, ki_provider,
    openai_api_key, ollama_base_url, ollama_model, updated_by
  ) VALUES (
    v_household_id,
    COALESCE(NEW.app_modus, 'umzug'),
    COALESCE(NEW.umzug_deaktiviert, false),
    COALESCE(NEW.ki_provider, 'openai'),
    NEW.openai_api_key, NEW.ollama_base_url,
    COALESCE(NEW.ollama_model, 'llama3.2'), NEW.id
  )
  ON CONFLICT (household_id) DO UPDATE
  SET app_modus         = EXCLUDED.app_modus,
      umzug_deaktiviert = EXCLUDED.umzug_deaktiviert,
      ki_provider       = EXCLUDED.ki_provider,
      openai_api_key    = EXCLUDED.openai_api_key,
      ollama_base_url   = EXCLUDED.ollama_base_url,
      ollama_model      = EXCLUDED.ollama_model,
      updated_by        = NEW.id,
      updated_at        = NOW();

  RETURN NEW;
END;
$$;

ALTER TABLE public.user_profile
  ADD COLUMN IF NOT EXISTS password_change_required boolean NOT NULL DEFAULT false;

DROP TRIGGER IF EXISTS sync_user_profile_to_household_settings_trigger ON public.user_profile;
CREATE TRIGGER sync_user_profile_to_household_settings_trigger
  AFTER INSERT OR UPDATE OF app_modus, umzug_deaktiviert, ki_provider, openai_api_key, ollama_base_url, ollama_model
  ON public.user_profile
  FOR EACH ROW EXECUTE FUNCTION public.sync_user_profile_to_household_settings();

-- ============================================================
-- 11. SCHEMA NEU LADEN
-- ============================================================

-- Bildanalyse-Einstellungen (Migration fuer bestehende Installationen)
ALTER TABLE public.household_settings
  ADD COLUMN IF NOT EXISTS bildanalyse_modus text DEFAULT 'chatgpt_vision';
ALTER TABLE public.household_settings
  ADD COLUMN IF NOT EXISTS llamacloud_api_key text;
ALTER TABLE public.household_settings
  ADD COLUMN IF NOT EXISTS llamacloud_key_set boolean
  GENERATED ALWAYS AS (llamacloud_api_key IS NOT NULL) STORED;

-- Column-Level Security: llamacloud_api_key nie an Browser ausliefern
-- Nur ueber SECURITY DEFINER RPC schreib- und ueber ki-vision Edge Function lesbar
REVOKE SELECT (llamacloud_api_key) ON TABLE public.household_settings FROM anon, authenticated;
REVOKE UPDATE (llamacloud_api_key) ON TABLE public.household_settings FROM anon, authenticated;

-- bildanalyse_openai_api_key: eigener OpenAI-Key fuer Bildanalyse (unabhaengig von KI-Einstellungen)
ALTER TABLE public.household_settings
  ADD COLUMN IF NOT EXISTS bildanalyse_openai_api_key text;
ALTER TABLE public.household_settings
  ADD COLUMN IF NOT EXISTS bildanalyse_openai_key_set boolean
  GENERATED ALWAYS AS (bildanalyse_openai_api_key IS NOT NULL) STORED;

REVOKE SELECT (bildanalyse_openai_api_key) ON TABLE public.household_settings FROM anon, authenticated;
REVOKE UPDATE (bildanalyse_openai_api_key) ON TABLE public.household_settings FROM anon, authenticated;

-- openai_api_key: Column-Level Security (wie bildanalyse_openai_api_key)
REVOKE SELECT (openai_api_key) ON TABLE public.household_settings FROM anon, authenticated;
REVOKE UPDATE (openai_api_key) ON TABLE public.household_settings FROM anon, authenticated;

-- ollama_vision_model: separates Vision-Modell fuer Ollama-Bildanalyse
ALTER TABLE public.household_settings
  ADD COLUMN IF NOT EXISTS ollama_vision_model text;

-- RPC: Bildanalyse-Einstellungen setzen (Admin-only)
-- DROP alte Versionen explizit (CREATE OR REPLACE ersetzt nur gleiche Signatur)
DROP FUNCTION IF EXISTS public.set_household_bildanalyse_settings(text, text, text);
DROP FUNCTION IF EXISTS public.set_household_bildanalyse_settings(text, text);
CREATE OR REPLACE FUNCTION public.set_household_bildanalyse_settings(
  p_modus                      text,
  p_bildanalyse_openai_api_key text DEFAULT NULL,
  p_ollama_vision_model        text DEFAULT NULL
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_household_id uuid;
BEGIN
  SELECT household_id INTO v_household_id
  FROM public.household_members
  WHERE user_id = auth.uid() AND role = 'admin'
  LIMIT 1;

  IF v_household_id IS NULL THEN
    RAISE EXCEPTION 'Nur Admin darf Bildanalyse-Einstellungen aendern.';
  END IF;

  INSERT INTO public.household_settings (household_id, bildanalyse_modus, bildanalyse_openai_api_key, ollama_vision_model)
  VALUES (v_household_id, p_modus, p_bildanalyse_openai_api_key, p_ollama_vision_model)
  ON CONFLICT (household_id) DO UPDATE
  SET bildanalyse_modus              = EXCLUDED.bildanalyse_modus,
      bildanalyse_openai_api_key     = CASE
        WHEN p_bildanalyse_openai_api_key IS NULL THEN public.household_settings.bildanalyse_openai_api_key
        WHEN p_bildanalyse_openai_api_key = ''    THEN NULL
        ELSE p_bildanalyse_openai_api_key
      END,
      ollama_vision_model            = COALESCE(p_ollama_vision_model, public.household_settings.ollama_vision_model),
      updated_at                     = NOW();
END;
$$;

-- RPC: KI-Status fuer Nicht-Admin-Mitglieder
-- SECURITY DEFINER liest openai_api_key intern, gibt nur Booleans zurueck.
CREATE OR REPLACE FUNCTION public.get_household_ki_status()
RETURNS TABLE (
  ki_provider             text,
  ki_konfiguriert         boolean,
  bildanalyse_modus       text,
  bildanalyse_key_gesetzt boolean
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  WITH hh AS (
    SELECT public.get_current_household_id() AS household_id
  )
  SELECT
    COALESCE(hs.ki_provider,    'openai')                                     AS ki_provider,
    COALESCE(
      hs.openai_api_key IS NOT NULL OR hs.ollama_base_url IS NOT NULL,
      false
    )                                                                          AS ki_konfiguriert,
    COALESCE(hs.bildanalyse_modus, 'chatgpt_vision')                          AS bildanalyse_modus,
    COALESCE(hs.bildanalyse_openai_key_set, false)                            AS bildanalyse_key_gesetzt
  FROM hh
  LEFT JOIN public.household_settings hs ON hs.household_id = hh.household_id;
$$;

-- ============================================================
-- 12. RECHNUNGSSCAN-PIPELINE SCHEMA
-- ============================================================
-- Idempotent — kann mehrfach ausgefuehrt werden.
-- Integriert aus scripts/migration_rechnung_schema.sql
-- Reihenfolge:
--   12a) dokumente: neue Spalten
--   12b) home_wissen: neue Spalten
--   12c) rechnungen (neue Tabelle)
--   12d) rechnungs_positionen (neue Tabelle)
--   12e) dokument_links (neue Tabelle)
--   12f) home_wissen.rechnung_id FK nachziehen
--   12g) RLS dokumente aktualisieren (rueckwaertskompatibel)
--   12h) RLS home_wissen aktualisieren (rueckwaertskompatibel)
-- ============================================================


-- ── 12a. dokumente: neue Spalten ──────────────────────────────

ALTER TABLE public.dokumente
  ADD COLUMN IF NOT EXISTS dokument_typ      text,
  ADD COLUMN IF NOT EXISTS tags              text[] DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS meta              jsonb  DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS extrahierter_text text;

CREATE INDEX IF NOT EXISTS idx_dokumente_household_typ
  ON public.dokumente (household_id, dokument_typ);

CREATE INDEX IF NOT EXISTS idx_dokumente_tags_gin
  ON public.dokumente USING gin (tags);

CREATE INDEX IF NOT EXISTS idx_dokumente_household_id
  ON public.dokumente (household_id);


-- ── 12b. home_wissen: neue Spalten ───────────────────────────

ALTER TABLE public.home_wissen
  ADD COLUMN IF NOT EXISTS dokument_id uuid REFERENCES public.dokumente(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS rechnung_id uuid, -- FK zu rechnungen wird in 12f nachgezogen
  ADD COLUMN IF NOT EXISTS summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS analysis_confidence numeric(4,3);

CREATE INDEX IF NOT EXISTS idx_home_wissen_household_id
  ON public.home_wissen (household_id);

CREATE INDEX IF NOT EXISTS idx_home_wissen_dokument_id
  ON public.home_wissen (dokument_id);


-- ── 12c. rechnungen (neu) ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.rechnungen (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id      uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  dokument_id       uuid NOT NULL REFERENCES public.dokumente(id)  ON DELETE CASCADE,

  lieferant_name    text,
  rechnungsnummer   text,
  rechnungsdatum    date,
  leistungsdatum    date,
  faellig_am        date,

  waehrung          text DEFAULT 'EUR',
  netto             numeric(12,2),
  ust               numeric(12,2),
  brutto            numeric(12,2),

  zahlungsziel_text text,
  confidence        numeric(4,3),
  extraktion        jsonb DEFAULT '{}'::jsonb,
  raw_text          text,

  created_at        timestamptz DEFAULT now(),
  updated_at        timestamptz DEFAULT now(),

  UNIQUE (household_id, dokument_id)
);

DROP TRIGGER IF EXISTS set_rechnungen_updated_at ON public.rechnungen;
CREATE TRIGGER set_rechnungen_updated_at
  BEFORE UPDATE ON public.rechnungen
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_rechnungen_household_datum
  ON public.rechnungen (household_id, rechnungsdatum DESC);

CREATE INDEX IF NOT EXISTS idx_rechnungen_lieferant
  ON public.rechnungen (household_id, lieferant_name);

ALTER TABLE public.rechnungen ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rechnungen_household ON public.rechnungen;
CREATE POLICY rechnungen_household ON public.rechnungen FOR ALL
  USING (household_id = public.get_current_household_id())
  WITH CHECK (household_id = public.get_current_household_id());


-- ── 12d. rechnungs_positionen (neu) ──────────────────────────

CREATE TABLE IF NOT EXISTS public.rechnungs_positionen (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id  uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  rechnung_id   uuid NOT NULL REFERENCES public.rechnungen(id) ON DELETE CASCADE,

  pos_nr        int,
  beschreibung  text,
  menge         numeric(12,3),
  einheit       text,
  einzelpreis   numeric(12,2),
  gesamtpreis   numeric(12,2),
  ust_satz      numeric(5,2),

  klassifikation jsonb DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_rechnungs_positionen_rechnung
  ON public.rechnungs_positionen (rechnung_id);

ALTER TABLE public.rechnungs_positionen ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rechnungs_positionen_household ON public.rechnungs_positionen;
CREATE POLICY rechnungs_positionen_household ON public.rechnungs_positionen FOR ALL
  USING (household_id = public.get_current_household_id())
  WITH CHECK (household_id = public.get_current_household_id());


-- ── 12e. dokument_links (neu) ─────────────────────────────────

CREATE TABLE IF NOT EXISTS public.dokument_links (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  dokument_id  uuid NOT NULL REFERENCES public.dokumente(id)  ON DELETE CASCADE,

  -- z.B. 'rechnung' | 'budget_posten' | 'home_wissen' | 'home_geraet' | 'home_wartung'
  entity_type  text NOT NULL,
  entity_id    uuid NOT NULL,
  role         text NOT NULL DEFAULT 'attachment',

  created_at   timestamptz DEFAULT now(),

  UNIQUE (household_id, dokument_id, entity_type, entity_id, role)
);

CREATE INDEX IF NOT EXISTS idx_dokument_links_entity
  ON public.dokument_links (household_id, entity_type, entity_id);

CREATE INDEX IF NOT EXISTS idx_dokument_links_dokument
  ON public.dokument_links (household_id, dokument_id);

ALTER TABLE public.dokument_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS dokument_links_household ON public.dokument_links;
CREATE POLICY dokument_links_household ON public.dokument_links FOR ALL
  USING (household_id = public.get_current_household_id())
  WITH CHECK (household_id = public.get_current_household_id());


-- ── 12f. home_wissen.rechnung_id FK nachziehen ────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'home_wissen_rechnung_id_fkey'
      AND table_name = 'home_wissen'
  ) THEN
    ALTER TABLE public.home_wissen
      ADD CONSTRAINT home_wissen_rechnung_id_fkey
      FOREIGN KEY (rechnung_id) REFERENCES public.rechnungen(id) ON DELETE SET NULL;
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_home_wissen_rechnung_id
  ON public.home_wissen (rechnung_id);


-- ── 12g. RLS dokumente — rueckwaertskompatible Policy ─────────
-- Ersetzt household_member_access (schlaegt fehl bei household_id IS NULL).
-- Erlaubt: user_id match (Altdaten ohne household_id) ODER household_id match.

ALTER TABLE public.dokumente ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS household_member_access ON public.dokumente;
DROP POLICY IF EXISTS dokumente_crud_own      ON public.dokumente;
DROP POLICY IF EXISTS dokumente_household     ON public.dokumente;

CREATE POLICY dokumente_household ON public.dokumente FOR ALL
  USING (
    (SELECT auth.uid()) = user_id
    OR (
      household_id IS NOT NULL
      AND household_id = public.get_current_household_id()
    )
  )
  WITH CHECK (
    (SELECT auth.uid()) = user_id
    OR (
      household_id IS NOT NULL
      AND household_id = public.get_current_household_id()
    )
  );


-- ── 12h. RLS home_wissen — rueckwaertskompatible Policy ───────

ALTER TABLE public.home_wissen ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS household_member_access ON public.home_wissen;
DROP POLICY IF EXISTS home_wissen_own         ON public.home_wissen;
DROP POLICY IF EXISTS home_wissen_household   ON public.home_wissen;

CREATE POLICY home_wissen_household ON public.home_wissen FOR ALL
  USING (
    (SELECT auth.uid()) = user_id
    OR (
      household_id IS NOT NULL
      AND household_id = public.get_current_household_id()
    )
  )
  WITH CHECK (
    (SELECT auth.uid()) = user_id
    OR (
      household_id IS NOT NULL
      AND household_id = public.get_current_household_id()
    )
  );


SELECT pg_notify('pgrst', 'reload schema');


-- ============================================================
-- 13. MULTISCANNER — UNIVERSELLE DOKUMENTEN-PIPELINE
-- Idempotent — kann mehrfach ausgefuehrt werden.
--   13a) Tabelle: vertraege
--   13b) Tabelle: versicherungs_polizzen
--   13c) Ergaenzungen: home_wissen (herkunft)
--   13d) Ergaenzungen: dokumente (datei_hash, FTS)
--   13e) Duplikat-Bereinigung (home_wissen, dokument_links)
--   13f) UNIQUE-Index home_wissen(dokument_id)
--   13g) Lock-Funktion: claim_doc_processing
-- ============================================================

CREATE TABLE IF NOT EXISTS public.vertraege (
  id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id               uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  dokument_id                uuid NOT NULL REFERENCES public.dokumente(id) ON DELETE CASCADE,
  partner                    text,
  vertragstitel              text,
  start_date                 date,
  end_date                   date,
  kuendigungsfrist_raw       text,
  kuendigungsfrist_tage      integer,
  kuendigbar_ab              date,
  review_required            boolean DEFAULT false,
  reviewed_at                timestamptz,
  classification_confidence  numeric(4,3) CHECK (classification_confidence BETWEEN 0 AND 1),
  extraction_confidence      numeric(4,3) CHECK (extraction_confidence BETWEEN 0 AND 1),
  extraktion                 jsonb DEFAULT '{}'::jsonb,
  created_at                 timestamptz DEFAULT now(),
  updated_at                 timestamptz DEFAULT now(),
  UNIQUE (household_id, dokument_id)
);
DROP TRIGGER IF EXISTS set_vertraege_updated_at ON public.vertraege;
CREATE TRIGGER set_vertraege_updated_at BEFORE UPDATE ON public.vertraege
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX IF NOT EXISTS idx_vertraege_household     ON public.vertraege (household_id);
CREATE INDEX IF NOT EXISTS idx_vertraege_end_date      ON public.vertraege (household_id, end_date);
CREATE INDEX IF NOT EXISTS idx_vertraege_kuendigbar_ab ON public.vertraege (household_id, kuendigbar_ab);
DROP POLICY IF EXISTS vertraege_household ON public.vertraege;
ALTER TABLE public.vertraege ENABLE ROW LEVEL SECURITY;
CREATE POLICY vertraege_household ON public.vertraege FOR ALL
  USING (household_id = public.get_current_household_id())
  WITH CHECK (household_id = public.get_current_household_id());

CREATE TABLE IF NOT EXISTS public.versicherungs_polizzen (
  id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id               uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  dokument_id                uuid NOT NULL REFERENCES public.dokumente(id) ON DELETE CASCADE,
  versicherer                text,
  polizzen_nummer            text,
  versicherungsart           text,
  deckung                    text,
  praemie                    numeric(12,2),
  praemien_intervall         text DEFAULT 'jaehrlich'
    CHECK (praemien_intervall IN ('monatlich','vierteljaehrlich','halbjaehrlich','jaehrlich')),
  naechste_faelligkeit       date,
  waehrung                   text DEFAULT 'EUR',
  start_date                 date,
  end_date                   date,
  review_required            boolean DEFAULT false,
  reviewed_at                timestamptz,
  classification_confidence  numeric(4,3) CHECK (classification_confidence BETWEEN 0 AND 1),
  extraction_confidence      numeric(4,3) CHECK (extraction_confidence BETWEEN 0 AND 1),
  extraktion                 jsonb DEFAULT '{}'::jsonb,
  created_at                 timestamptz DEFAULT now(),
  updated_at                 timestamptz DEFAULT now(),
  UNIQUE (household_id, dokument_id)
);
DROP TRIGGER IF EXISTS set_polizzen_updated_at ON public.versicherungs_polizzen;
CREATE TRIGGER set_polizzen_updated_at BEFORE UPDATE ON public.versicherungs_polizzen
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX IF NOT EXISTS idx_polizzen_end_date         ON public.versicherungs_polizzen (household_id, end_date);
CREATE INDEX IF NOT EXISTS idx_polizzen_versicherungsart ON public.versicherungs_polizzen (household_id, versicherungsart);
DROP POLICY IF EXISTS polizzen_household ON public.versicherungs_polizzen;
ALTER TABLE public.versicherungs_polizzen ENABLE ROW LEVEL SECURITY;
CREATE POLICY polizzen_household ON public.versicherungs_polizzen FOR ALL
  USING (household_id = public.get_current_household_id())
  WITH CHECK (household_id = public.get_current_household_id());

ALTER TABLE public.home_wissen
  ADD COLUMN IF NOT EXISTS herkunft text DEFAULT 'manuell'
    CHECK (herkunft IN ('manuell','auto_stub','auto_full','auto_low_confidence'));

ALTER TABLE public.dokumente
  ADD COLUMN IF NOT EXISTS datei_hash text;
CREATE INDEX IF NOT EXISTS idx_dokumente_datei_hash ON public.dokumente (household_id, datei_hash);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='dokumente' AND column_name='fts'
  ) THEN
    ALTER TABLE public.dokumente
      ADD COLUMN fts tsvector
      GENERATED ALWAYS AS (
        to_tsvector('german', coalesce(dateiname,'') || ' ' || coalesce(beschreibung,''))
      ) STORED;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS dokumente_fts_gin ON public.dokumente USING gin (fts);

DELETE FROM public.home_wissen
  WHERE id IN (
    SELECT id FROM (
      SELECT id,
             row_number() OVER (
               PARTITION BY dokument_id
               ORDER BY
                 CASE WHEN herkunft = 'manuell' THEN 0 ELSE 1 END,
                 created_at DESC,
                 id DESC
             ) AS rn
      FROM public.home_wissen
      WHERE dokument_id IS NOT NULL
    ) sub
    WHERE rn > 1
  );

DELETE FROM public.dokument_links
  WHERE id IN (
    SELECT id FROM (
      SELECT id,
             row_number() OVER (
               PARTITION BY household_id, dokument_id, entity_type, entity_id, role
               ORDER BY id DESC
             ) AS rn
      FROM public.dokument_links
    ) sub
    WHERE rn > 1
  );

CREATE UNIQUE INDEX IF NOT EXISTS home_wissen_dokument_id_uniq
  ON public.home_wissen (dokument_id);

CREATE OR REPLACE FUNCTION public.claim_doc_processing(
  p_dokument_id  uuid,
  p_level        text,
  p_household_id uuid,
  p_force        boolean DEFAULT false
) RETURNS text LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_proc    jsonb;
  v_hh_id   uuid;
  v_status  text;
  v_expires timestamptz;
BEGIN
  SELECT meta->'processing', household_id INTO v_proc, v_hh_id
    FROM public.dokumente WHERE id = p_dokument_id FOR UPDATE;
  IF NOT FOUND THEN RETURN 'not_found'; END IF;
  IF v_hh_id IS DISTINCT FROM p_household_id THEN RETURN 'forbidden'; END IF;
  v_status  := v_proc->>'status';
  v_expires := (v_proc->>'expires_at')::timestamptz;
  IF v_status = 'processing' AND (v_expires IS NULL OR v_expires > now()) THEN RETURN 'busy'; END IF;
  IF v_status = 'done' AND NOT p_force THEN RETURN 'already_done'; END IF;
  UPDATE public.dokumente
    SET meta = jsonb_set(
      coalesce(meta, '{}'::jsonb), '{processing}',
      jsonb_build_object(
        'status', 'processing', 'level', p_level,
        'started_at', now()::text,
        'expires_at', (now() + interval '30 minutes')::text
      )
    )
  WHERE id = p_dokument_id;
  RETURN 'claimed';
END;
$$;

REVOKE ALL ON FUNCTION public.claim_doc_processing(uuid, text, uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_doc_processing(uuid, text, uuid, boolean) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_doc_processing(uuid, text, uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_doc_processing(uuid, text, uuid, boolean) TO service_role;

CREATE OR REPLACE FUNCTION public.sync_invoice_date(
  p_rechnung_id uuid,
  p_neues_datum date
)
RETURNS TABLE (
  dokument_id uuid,
  rechnung_id uuid,
  wissen_id uuid,
  budget_posten_ids uuid[]
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid;
  v_household_id uuid;
  v_dokument_id uuid;
  v_wissen_id uuid;
  v_budget_ids uuid[] := '{}'::uuid[];
BEGIN
  v_uid := (SELECT auth.uid());
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Nicht authentifiziert.';
  END IF;

  SELECT r.household_id, r.dokument_id
  INTO v_household_id, v_dokument_id
  FROM public.rechnungen r
  WHERE r.id = p_rechnung_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Rechnung nicht gefunden.';
  END IF;

  IF v_household_id IS DISTINCT FROM public.get_current_household_id() THEN
    RAISE EXCEPTION 'Keine Berechtigung fuer diese Rechnung.';
  END IF;

  UPDATE public.rechnungen r
  SET rechnungsdatum = p_neues_datum
  WHERE r.id = p_rechnung_id;

  WITH updated_budget AS (
    UPDATE public.budget_posten bp
    SET datum = p_neues_datum
    WHERE bp.id IN (
      SELECT dl.entity_id
      FROM public.dokument_links dl
      WHERE dl.household_id = v_household_id
        AND dl.dokument_id = v_dokument_id
        AND dl.entity_type = 'budget_posten'
    )
      AND COALESCE(bp.wiederholen, false) = false
      AND bp.ursprung_template_id IS NULL
    RETURNING bp.id
  )
  SELECT COALESCE(array_agg(ub.id), '{}'::uuid[])
  INTO v_budget_ids
  FROM updated_budget ub;

  SELECT hw.id
  INTO v_wissen_id
  FROM public.home_wissen hw
  WHERE hw.rechnung_id = p_rechnung_id
  ORDER BY hw.updated_at DESC NULLS LAST, hw.created_at DESC, hw.id DESC
  LIMIT 1;

  IF v_wissen_id IS NULL THEN
    SELECT hw.id
    INTO v_wissen_id
    FROM public.home_wissen hw
    WHERE hw.dokument_id = v_dokument_id
    ORDER BY hw.updated_at DESC NULLS LAST, hw.created_at DESC, hw.id DESC
    LIMIT 1;
  END IF;

  RETURN QUERY
  SELECT
    v_dokument_id,
    p_rechnung_id,
    v_wissen_id,
    v_budget_ids;
END;
$$;

-- ============================================================
-- 14. KOSTENAUFTEILUNG / COSPEND-MVP
-- ============================================================

CREATE TABLE IF NOT EXISTS public.budget_split_groups (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  budget_posten_id uuid NOT NULL REFERENCES public.budget_posten(id) ON DELETE CASCADE,
  household_id     uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  payer_member_id  uuid NOT NULL REFERENCES public.home_bewohner(id) ON DELETE RESTRICT,
  split_mode       text NOT NULL DEFAULT 'equal'
    CHECK (split_mode IN ('equal','fixed','percent','custom')),
  split_origin     text NOT NULL DEFAULT 'manual_occurrence'
    CHECK (split_origin IN ('template_default','inherited_occurrence','manual_occurrence')),
  source_template_id uuid REFERENCES public.budget_posten(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_budget_split_groups_budget_posten_unique
  ON public.budget_split_groups (budget_posten_id);
CREATE INDEX IF NOT EXISTS idx_budget_split_groups_household
  ON public.budget_split_groups (household_id);
CREATE INDEX IF NOT EXISTS idx_budget_split_groups_payer
  ON public.budget_split_groups (payer_member_id);

CREATE TABLE IF NOT EXISTS public.budget_split_shares (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  split_group_id uuid NOT NULL REFERENCES public.budget_split_groups(id) ON DELETE CASCADE,
  household_id   uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  member_id      uuid NOT NULL REFERENCES public.home_bewohner(id) ON DELETE RESTRICT,
  amount_owed    numeric(12,2) NOT NULL CHECK (amount_owed > 0),
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_budget_split_shares_group_member_unique
  ON public.budget_split_shares (split_group_id, member_id);
CREATE INDEX IF NOT EXISTS idx_budget_split_shares_household
  ON public.budget_split_shares (household_id);
CREATE INDEX IF NOT EXISTS idx_budget_split_shares_member
  ON public.budget_split_shares (member_id);
CREATE INDEX IF NOT EXISTS idx_budget_split_shares_group
  ON public.budget_split_shares (split_group_id);

CREATE TABLE IF NOT EXISTS public.budget_settlements (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id   uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  from_member_id uuid NOT NULL REFERENCES public.home_bewohner(id) ON DELETE RESTRICT,
  to_member_id   uuid NOT NULL REFERENCES public.home_bewohner(id) ON DELETE RESTRICT,
  amount         numeric(12,2) NOT NULL CHECK (amount > 0),
  date           date NOT NULL DEFAULT CURRENT_DATE,
  note           text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CHECK (from_member_id <> to_member_id)
);

CREATE INDEX IF NOT EXISTS idx_budget_settlements_household
  ON public.budget_settlements (household_id);
CREATE INDEX IF NOT EXISTS idx_budget_settlements_from_member
  ON public.budget_settlements (from_member_id);
CREATE INDEX IF NOT EXISTS idx_budget_settlements_to_member
  ON public.budget_settlements (to_member_id);
CREATE INDEX IF NOT EXISTS idx_budget_settlements_date
  ON public.budget_settlements (date);

CREATE OR REPLACE FUNCTION public.validate_budget_split_group()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_posten_household uuid;
  v_payer_household  uuid;
BEGIN
  SELECT bp.household_id
  INTO v_posten_household
  FROM public.budget_posten bp
  WHERE bp.id = NEW.budget_posten_id;

  IF v_posten_household IS NULL THEN
    RAISE EXCEPTION 'budget_posten nicht gefunden.';
  END IF;

  IF v_posten_household IS DISTINCT FROM NEW.household_id THEN
    RAISE EXCEPTION 'budget_split_group.household_id passt nicht zum Budget-Posten.';
  END IF;

  SELECT hb.household_id
  INTO v_payer_household
  FROM public.home_bewohner hb
  WHERE hb.id = NEW.payer_member_id;

  IF v_payer_household IS NULL THEN
    RAISE EXCEPTION 'Zahler nicht gefunden.';
  END IF;

  IF v_payer_household IS DISTINCT FROM NEW.household_id THEN
    RAISE EXCEPTION 'Zahler gehoert nicht zum Haushalt.';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_budget_split_share()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_group_household uuid;
  v_member_household uuid;
  v_payer_member_id uuid;
BEGIN
  SELECT bsg.household_id, bsg.payer_member_id
  INTO v_group_household, v_payer_member_id
  FROM public.budget_split_groups bsg
  WHERE bsg.id = NEW.split_group_id;

  IF v_group_household IS NULL THEN
    RAISE EXCEPTION 'Split-Gruppe nicht gefunden.';
  END IF;

  IF v_group_household IS DISTINCT FROM NEW.household_id THEN
    RAISE EXCEPTION 'budget_split_share.household_id passt nicht zur Split-Gruppe.';
  END IF;

  SELECT hb.household_id
  INTO v_member_household
  FROM public.home_bewohner hb
  WHERE hb.id = NEW.member_id;

  IF v_member_household IS NULL THEN
    RAISE EXCEPTION 'Bewohner nicht gefunden.';
  END IF;

  IF v_member_household IS DISTINCT FROM NEW.household_id THEN
    RAISE EXCEPTION 'Bewohner gehoert nicht zum Haushalt.';
  END IF;

  IF NEW.member_id = v_payer_member_id THEN
    RAISE EXCEPTION 'Der Zahler darf keinen eigenen Share-Eintrag haben.';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_budget_settlement()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_from_household uuid;
  v_to_household uuid;
BEGIN
  SELECT hb.household_id
  INTO v_from_household
  FROM public.home_bewohner hb
  WHERE hb.id = NEW.from_member_id;

  SELECT hb.household_id
  INTO v_to_household
  FROM public.home_bewohner hb
  WHERE hb.id = NEW.to_member_id;

  IF v_from_household IS NULL OR v_to_household IS NULL THEN
    RAISE EXCEPTION 'Settlement-Bewohner nicht gefunden.';
  END IF;

  IF v_from_household IS DISTINCT FROM NEW.household_id
     OR v_to_household IS DISTINCT FROM NEW.household_id THEN
    RAISE EXCEPTION 'Settlement-Bewohner gehoeren nicht zum Haushalt.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_budget_split_group_trigger ON public.budget_split_groups;
CREATE TRIGGER validate_budget_split_group_trigger
  BEFORE INSERT OR UPDATE ON public.budget_split_groups
  FOR EACH ROW EXECUTE FUNCTION public.validate_budget_split_group();

DROP TRIGGER IF EXISTS validate_budget_split_share_trigger ON public.budget_split_shares;
CREATE TRIGGER validate_budget_split_share_trigger
  BEFORE INSERT OR UPDATE ON public.budget_split_shares
  FOR EACH ROW EXECUTE FUNCTION public.validate_budget_split_share();

DROP TRIGGER IF EXISTS validate_budget_settlement_trigger ON public.budget_settlements;
CREATE TRIGGER validate_budget_settlement_trigger
  BEFORE INSERT OR UPDATE ON public.budget_settlements
  FOR EACH ROW EXECUTE FUNCTION public.validate_budget_settlement();

ALTER TABLE public.budget_split_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budget_split_shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budget_settlements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS budget_split_groups_household ON public.budget_split_groups;
CREATE POLICY budget_split_groups_household ON public.budget_split_groups FOR ALL
  USING (public.is_household_member(household_id))
  WITH CHECK (public.is_household_member(household_id));

DROP POLICY IF EXISTS budget_split_shares_household ON public.budget_split_shares;
CREATE POLICY budget_split_shares_household ON public.budget_split_shares FOR ALL
  USING (public.is_household_member(household_id))
  WITH CHECK (public.is_household_member(household_id));

DROP POLICY IF EXISTS budget_settlements_household ON public.budget_settlements;
CREATE POLICY budget_settlements_household ON public.budget_settlements FOR ALL
  USING (public.is_household_member(household_id))
  WITH CHECK (public.is_household_member(household_id));

-- ============================================================
-- Phase B: Kostenaufteilung Erweiterungen
-- ============================================================

-- 1a. budget_split_groups: Zahler-Prozentanteil speichern
ALTER TABLE public.budget_split_groups
  ADD COLUMN IF NOT EXISTS payer_share_input numeric(12,4),
  ADD COLUMN IF NOT EXISTS split_origin text NOT NULL DEFAULT 'manual_occurrence'
    CHECK (split_origin IN ('template_default','inherited_occurrence','manual_occurrence')),
  ADD COLUMN IF NOT EXISTS source_template_id uuid REFERENCES public.budget_posten(id) ON DELETE SET NULL;

UPDATE public.budget_split_groups bsg
SET split_origin = CASE
  WHEN bp.wiederholen = true THEN 'template_default'
  WHEN bp.ursprung_template_id IS NOT NULL THEN 'manual_occurrence'
  ELSE COALESCE(bsg.split_origin, 'manual_occurrence')
END,
source_template_id = CASE
  WHEN bp.ursprung_template_id IS NOT NULL THEN COALESCE(bsg.source_template_id, bp.ursprung_template_id)
  ELSE bsg.source_template_id
END
FROM public.budget_posten bp
WHERE bp.id = bsg.budget_posten_id;

-- 1b. budget_split_shares: Split-Typ und Eingabewert speichern
ALTER TABLE public.budget_split_shares
  ADD COLUMN IF NOT EXISTS share_type text NOT NULL DEFAULT 'equal'
              CHECK (share_type IN ('equal','fixed','percent')),
  ADD COLUMN IF NOT EXISTS share_input numeric(12,4);

-- 1c. Neue Tabelle: Kategorie-Standardverteilungen
CREATE TABLE IF NOT EXISTS public.home_budget_split_defaults (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id    uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  kategorie       text NOT NULL,
  payer_member_id uuid REFERENCES public.home_bewohner(id) ON DELETE SET NULL,
  split_mode      text NOT NULL DEFAULT 'equal'
                  CHECK (split_mode IN ('equal','fixed','percent')),
  teilnehmer_ids  uuid[] NOT NULL DEFAULT '{}',
  shares_input    jsonb,
  created_at      timestamptz DEFAULT now(),
  UNIQUE (household_id, kategorie)
);
CREATE INDEX IF NOT EXISTS idx_hbsd_household ON public.home_budget_split_defaults(household_id);
ALTER TABLE public.home_budget_split_defaults ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS hbsd_household ON public.home_budget_split_defaults;
CREATE POLICY hbsd_household ON public.home_budget_split_defaults FOR ALL
  USING (public.is_household_member(household_id))
  WITH CHECK (public.is_household_member(household_id));

-- 1d. Neue Tabelle: Settlement-Allocations
CREATE TABLE IF NOT EXISTS public.budget_settlement_allocations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  settlement_id   uuid NOT NULL REFERENCES public.budget_settlements(id) ON DELETE CASCADE,
  split_share_id  uuid NOT NULL REFERENCES public.budget_split_shares(id) ON DELETE CASCADE,
  household_id    uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  amount          numeric(12,2) NOT NULL CHECK (amount > 0),
  created_at      timestamptz DEFAULT now(),
  UNIQUE (settlement_id, split_share_id)
);
CREATE INDEX IF NOT EXISTS idx_bsa_settlement ON public.budget_settlement_allocations(settlement_id);
CREATE INDEX IF NOT EXISTS idx_bsa_share      ON public.budget_settlement_allocations(split_share_id);
ALTER TABLE public.budget_settlement_allocations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS bsa_household ON public.budget_settlement_allocations;
CREATE POLICY bsa_household ON public.budget_settlement_allocations FOR ALL
  USING (public.is_household_member(household_id))
  WITH CHECK (public.is_household_member(household_id));

-- Integritäts-Trigger für budget_settlement_allocations
CREATE OR REPLACE FUNCTION public.validate_settlement_allocation()
RETURNS trigger LANGUAGE plpgsql SET search_path = ''
AS $$
DECLARE
  v_settlement_household  uuid;
  v_share_household       uuid;
  v_allocated_sum         numeric(12,2);
  v_settlement_amount     numeric(12,2);
  v_share_amount_owed     numeric(12,2);
  v_share_allocated_sum   numeric(12,2);
  v_settlement_from       uuid;
  v_settlement_to         uuid;
  v_share_member          uuid;
  v_group_payer           uuid;
BEGIN
  -- household_id konsistent
  SELECT household_id INTO v_settlement_household FROM public.budget_settlements WHERE id = NEW.settlement_id;
  SELECT bs.household_id INTO v_share_household FROM public.budget_split_shares bs WHERE bs.id = NEW.split_share_id;

  IF v_settlement_household IS DISTINCT FROM NEW.household_id OR v_share_household IS DISTINCT FROM NEW.household_id THEN
    RAISE EXCEPTION 'Settlement-Allocation: household_id inkonsistent.';
  END IF;

  -- Fachliche Beziehung: Settlement-Paar muss zum Share passen
  SELECT from_member_id, to_member_id INTO v_settlement_from, v_settlement_to
    FROM public.budget_settlements WHERE id = NEW.settlement_id;
  SELECT bs.member_id, bsg.payer_member_id INTO v_share_member, v_group_payer
    FROM public.budget_split_shares bs
    JOIN public.budget_split_groups bsg ON bsg.id = bs.split_group_id
    WHERE bs.id = NEW.split_share_id;

  IF v_settlement_from IS DISTINCT FROM v_share_member THEN
    RAISE EXCEPTION 'Settlement-Allocation: Settlement.from_member_id (%) passt nicht zu Share.member_id (%).',
      v_settlement_from, v_share_member;
  END IF;
  IF v_settlement_to IS DISTINCT FROM v_group_payer THEN
    RAISE EXCEPTION 'Settlement-Allocation: Settlement.to_member_id (%) passt nicht zu Gruppe.payer_member_id (%).',
      v_settlement_to, v_group_payer;
  END IF;

  -- Überallokation: settlement.amount nicht überschreiten
  SELECT amount INTO v_settlement_amount FROM public.budget_settlements WHERE id = NEW.settlement_id;
  SELECT COALESCE(SUM(amount), 0) INTO v_allocated_sum
  FROM public.budget_settlement_allocations
  WHERE settlement_id = NEW.settlement_id AND id IS DISTINCT FROM NEW.id;
  IF v_allocated_sum + NEW.amount > v_settlement_amount THEN
    RAISE EXCEPTION 'Settlement-Allocation überschreitet Settlement-Betrag.';
  END IF;

  -- Überallokation: share.amount_owed nicht überschreiten
  SELECT amount_owed INTO v_share_amount_owed FROM public.budget_split_shares WHERE id = NEW.split_share_id;
  SELECT COALESCE(SUM(amount), 0) INTO v_share_allocated_sum
  FROM public.budget_settlement_allocations
  WHERE split_share_id = NEW.split_share_id AND id IS DISTINCT FROM NEW.id;
  IF v_share_allocated_sum + NEW.amount > v_share_amount_owed THEN
    RAISE EXCEPTION 'Settlement-Allocation überschreitet Share-Betrag.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_settlement_allocation_trigger ON public.budget_settlement_allocations;
CREATE TRIGGER validate_settlement_allocation_trigger
  BEFORE INSERT OR UPDATE ON public.budget_settlement_allocations
  FOR EACH ROW EXECUTE FUNCTION public.validate_settlement_allocation();

-- ════════════════════════════════════════════════════════
-- Abschnitt: Bibliothek (Phase 1)
-- ════════════════════════════════════════════════════════

-- home_buecher ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.home_buecher (
  id                            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id                  uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  user_id                       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by_user_id            uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  titel                         text NOT NULL,
  untertitel                    text,
  autoren                       text[]      DEFAULT '{}'::text[],
  autor_anzeige                 text,
  isbn_10                       text,
  isbn_13                       text,
  verlag                        text,
  erscheinungsjahr              int,
  sprache                       text        DEFAULT 'de',
  seitenzahl                    int,
  beschreibung                  text,
  cover_url                     text,
  thumbnail_url                 text,
  genres                        text[]      DEFAULT '{}'::text[],
  tags                          text[]      DEFAULT '{}'::text[],

  ort_id                        uuid REFERENCES public.home_orte(id) ON DELETE SET NULL,
  lagerort_id                   uuid REFERENCES public.home_lagerorte(id) ON DELETE SET NULL,

  status                        text NOT NULL DEFAULT 'im_regal'
                                CHECK (status IN ('im_regal','verliehen','vermisst','verschenkt','entsorgt')),
  zustand                       text CHECK (zustand IN ('sehr_gut','gut','akzeptabel','schlecht')),
  anzahl                        int NOT NULL DEFAULT 1,
  exemplar_nummer               int,
  notizen                       text,

  -- Herkunft / Scan-Architektur (Phase 2)
  api_quelle                    text,
  api_ref                       text,
  api_payload                   jsonb       DEFAULT '{}'::jsonb,
  scan_quelle                   text,
  scan_confidence               numeric(4,3),
  review_noetig                 boolean     NOT NULL DEFAULT false,

  -- Aktive Ausleihe
  verliehen_an_name             text,
  verliehen_an_kontakt_id       uuid REFERENCES public.kontakte(id) ON DELETE SET NULL,
  verliehen_seit                date,
  rueckgabe_erwartet_am         date,
  erinnerung_aktiv              boolean     NOT NULL DEFAULT false,
  erinnerung_intervall_tage     int         DEFAULT 7,
  letzte_erinnerung_am          date,
  erinnerung_empfaenger_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  created_at                    timestamptz NOT NULL DEFAULT now(),
  updated_at                    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS home_buecher_household_status_idx
  ON public.home_buecher(household_id, status);
CREATE INDEX IF NOT EXISTS home_buecher_household_isbn_13_idx
  ON public.home_buecher(household_id, isbn_13);
CREATE INDEX IF NOT EXISTS home_buecher_household_ort_idx
  ON public.home_buecher(household_id, ort_id, lagerort_id);
CREATE INDEX IF NOT EXISTS home_buecher_tags_idx
  ON public.home_buecher USING GIN(tags);
CREATE INDEX IF NOT EXISTS home_buecher_autoren_idx
  ON public.home_buecher USING GIN(autoren);

ALTER TABLE public.home_buecher ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS household_member_access ON public.home_buecher;
CREATE POLICY household_member_access ON public.home_buecher
  FOR ALL
  USING (public.is_household_member(household_id))
  WITH CHECK (public.is_household_member(household_id));

DROP TRIGGER IF EXISTS set_household_scope_defaults_trigger ON public.home_buecher;
CREATE TRIGGER set_household_scope_defaults_trigger
  BEFORE INSERT OR UPDATE ON public.home_buecher
  FOR EACH ROW EXECUTE FUNCTION public.set_household_scope_defaults();

DROP TRIGGER IF EXISTS set_home_buecher_updated_at ON public.home_buecher;
CREATE TRIGGER set_home_buecher_updated_at
  BEFORE UPDATE ON public.home_buecher
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- home_buch_verleihverlauf ─────────────────────────────
CREATE TABLE IF NOT EXISTS public.home_buch_verleihverlauf (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  user_id      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  buch_id      uuid NOT NULL REFERENCES public.home_buecher(id) ON DELETE CASCADE,
  ereignis     text NOT NULL
               CHECK (ereignis IN ('verliehen','zurueckgegeben','erinnerung_gesendet','verlaengert')),
  kontakt_id   uuid REFERENCES public.kontakte(id) ON DELETE SET NULL,
  person_name  text,
  datum        date NOT NULL DEFAULT CURRENT_DATE,
  notiz        text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS home_buch_verleihverlauf_buch_id_idx
  ON public.home_buch_verleihverlauf(buch_id);
CREATE INDEX IF NOT EXISTS home_buch_verleihverlauf_household_idx
  ON public.home_buch_verleihverlauf(household_id);

ALTER TABLE public.home_buch_verleihverlauf ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS household_member_access ON public.home_buch_verleihverlauf;
CREATE POLICY household_member_access ON public.home_buch_verleihverlauf
  FOR ALL
  USING (public.is_household_member(household_id))
  WITH CHECK (public.is_household_member(household_id));

-- Kein set_household_scope_defaults_trigger: kein created_by_user_id.
-- household_id wird vom SHARED_TABLES-Proxy injiziert; user_id im Code gesetzt.

-- home_buch_importe ────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.home_buch_importe (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  user_id      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  quelle       text NOT NULL CHECK (quelle IN ('regal_scan','csv','manuell')),
  status       text NOT NULL DEFAULT 'ausstehend'
               CHECK (status IN ('ausstehend','in_bearbeitung','abgeschlossen','verworfen')),
  roh_input    text,
  summary      jsonb DEFAULT '{}'::jsonb,
  ort_id       uuid REFERENCES public.home_orte(id) ON DELETE SET NULL,
  lagerort_id  uuid REFERENCES public.home_lagerorte(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS home_buch_importe_household_idx
  ON public.home_buch_importe(household_id);

ALTER TABLE public.home_buch_importe ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS household_member_access ON public.home_buch_importe;
CREATE POLICY household_member_access ON public.home_buch_importe
  FOR ALL
  USING (public.is_household_member(household_id))
  WITH CHECK (public.is_household_member(household_id));

-- Kein set_household_scope_defaults_trigger: kein created_by_user_id.
DROP TRIGGER IF EXISTS set_home_buch_importe_updated_at ON public.home_buch_importe;
CREATE TRIGGER set_home_buch_importe_updated_at
  BEFORE UPDATE ON public.home_buch_importe
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- home_buch_import_kandidaten ──────────────────────────
CREATE TABLE IF NOT EXISTS public.home_buch_import_kandidaten (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id  uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  import_id     uuid NOT NULL REFERENCES public.home_buch_importe(id) ON DELETE CASCADE,
  roh_daten     jsonb DEFAULT '{}'::jsonb,
  api_match     jsonb DEFAULT '{}'::jsonb,
  confidence    numeric(4,3),
  vorschlag     jsonb DEFAULT '{}'::jsonb,
  review_status text NOT NULL DEFAULT 'ausstehend'
                CHECK (review_status IN ('ausstehend','bestaetigt','abgelehnt','bearbeitet')),
  buch_id       uuid REFERENCES public.home_buecher(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS home_buch_import_kandidaten_import_id_idx
  ON public.home_buch_import_kandidaten(import_id);

ALTER TABLE public.home_buch_import_kandidaten ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS household_member_access ON public.home_buch_import_kandidaten;
CREATE POLICY household_member_access ON public.home_buch_import_kandidaten
  FOR ALL
  USING (public.is_household_member(household_id))
  WITH CHECK (public.is_household_member(household_id));

-- Kein set_household_scope_defaults_trigger: weder user_id noch created_by_user_id.
-- household_id wird vom SHARED_TABLES-Proxy injiziert.

-- ── Push-Dedupe-Spalten für todo_aufgaben ────────────────────────────────────
-- Verhindert Spam bei periodischen Cron-Reminder-Checks.
ALTER TABLE public.todo_aufgaben
  ADD COLUMN IF NOT EXISTS letzte_push_erinnerung_am     timestamptz,
  ADD COLUMN IF NOT EXISTS letzte_push_bald_faellig_am   timestamptz,
  ADD COLUMN IF NOT EXISTS letzte_push_bald_faellig_fuer date,
  ADD COLUMN IF NOT EXISTS letzte_push_ueberfaellig_am   timestamptz,
  ADD COLUMN IF NOT EXISTS letzte_push_neu_am             timestamptz;

SELECT pg_notify('pgrst', 'reload schema');


