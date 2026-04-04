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
  menge       numeric(10,2) DEFAULT 1,
  einheit     text DEFAULT 'StÃƒÂ¼ck',
  kategorie   text,
  erledigt    boolean DEFAULT FALSE,
  erledigt_am timestamptz,
  notizen     text,
  created_at  timestamptz DEFAULT NOW(),
  updated_at  timestamptz DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_home_einkaufliste_user_id  ON public.home_einkaufliste(user_id);
CREATE INDEX IF NOT EXISTS idx_home_einkaufliste_erledigt ON public.home_einkaufliste(erledigt);

DROP TRIGGER IF EXISTS set_home_einkaufliste_updated_at ON public.home_einkaufliste;
CREATE TRIGGER set_home_einkaufliste_updated_at
  BEFORE UPDATE ON public.home_einkaufliste
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.home_einkaufliste ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS home_einkaufliste_crud_own ON public.home_einkaufliste;
CREATE POLICY home_einkaufliste_crud_own ON public.home_einkaufliste FOR ALL
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


-- home_finanzkonten (muss vor den Shared-Table-DO-Bloecken stehen)
CREATE TABLE IF NOT EXISTS public.home_finanzkonten (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id         uuid REFERENCES public.households(id) ON DELETE CASCADE,
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

CREATE INDEX IF NOT EXISTS idx_budget_posten_scope
  ON public.budget_posten(household_id, budget_scope, datum);
CREATE INDEX IF NOT EXISTS idx_budget_posten_bewohner_scope
  ON public.budget_posten(household_id, bewohner_id, budget_scope, datum);


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
  WHERE created_at < NOW() - INTERVAL '90 days';
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
  WHERE created_at < NOW() - INTERVAL '90 days';
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

-- Genau ein Admin pro Haushalt
CREATE UNIQUE INDEX IF NOT EXISTS idx_household_one_admin
  ON public.household_members(household_id)
  WHERE role = 'admin';

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
    'home_vorraete','home_einkaufliste','home_geraete','home_wartungen',
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
      split_part(COALESCE(u.email, ''), '@', 1),
      NULLIF(BTRIM(hb.name), ''),
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
      split_part(COALESCE(u.email, ''), '@', 1),
      'Mitglied'
    )
  INTO v_display_name
  FROM auth.users u
  LEFT JOIN public.user_profile up ON up.id = u.id
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
        split_part(COALESCE(u.email, ''), '@', 1),
        'Mitglied'
      ) AS name,
      '#10B981' AS farbe,
      U&'\D83D\DC64' AS emoji,
      hm.user_id AS created_by_user_id
    FROM public.household_members hm
    LEFT JOIN auth.users u ON u.id = hm.user_id
    LEFT JOIN public.user_profile up ON up.id = hm.user_id
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
    'home_vorraete','home_einkaufliste','home_geraete','home_wartungen',
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
  ADD COLUMN IF NOT EXISTS rechnung_id uuid; -- FK zu rechnungen wird in 12f nachgezogen

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

SELECT pg_notify('pgrst', 'reload schema');


