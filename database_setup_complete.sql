-- ============================================================
-- UMZUGSHELFER & HOME ORGANIZER - Komplettes Datenbank-Setup
-- Zuletzt aktualisiert: 2026-03-19
--
-- Einmalig im Supabase SQL Editor ausführen.
-- Das Skript ist idempotent (kann mehrfach ausgeführt werden).
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
--   9. Migrationen (für bestehende Installationen)
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

-- Alias für Kompatibilität mit älteren Trigger-Definitionen
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

-- ── user_profile ──────────────────────────────────────────
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
  kochbuch_ki_provider text NOT NULL DEFAULT 'global',
  kochbuch_openai_model text,
  kochbuch_ollama_model text,
  kochbuch_ollama_thinking_enabled boolean NOT NULL DEFAULT false,
  password_change_required boolean NOT NULL DEFAULT false,
  mobile_nav_config jsonb NOT NULL DEFAULT '{"home":["aufgaben","inventar","budget"],"umzug":["todos","packliste","budget"]}'::jsonb,
  locale           text NOT NULL DEFAULT 'de' CONSTRAINT user_profile_locale_supported CHECK (locale IN ('de', 'en-GB')),
  timezone         text NOT NULL DEFAULT 'Europe/Vienna',
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

-- Backfill für User die vor dem Trigger angelegt wurden
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


-- ── kontakte ──────────────────────────────────────────────
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


-- ── budget_posten ─────────────────────────────────────────
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

-- Migration: fehlende Spalten nachträglich ergänzen (für bestehende Installationen)
ALTER TABLE public.budget_posten ADD COLUMN IF NOT EXISTS app_modus       text NOT NULL DEFAULT 'umzug';
ALTER TABLE public.budget_posten ADD COLUMN IF NOT EXISTS wiederholen     boolean DEFAULT false;
ALTER TABLE public.budget_posten ADD COLUMN IF NOT EXISTS intervall       text;
ALTER TABLE public.budget_posten ADD COLUMN IF NOT EXISTS naechstes_datum date;
ALTER TABLE public.budget_posten ADD COLUMN IF NOT EXISTS ursprung_template_id uuid REFERENCES public.budget_posten(id) ON DELETE SET NULL;
ALTER TABLE public.budget_posten ADD COLUMN IF NOT EXISTS ende_datum          date;
ALTER TABLE public.budget_posten ADD COLUMN IF NOT EXISTS archived_at         timestamptz;
ALTER TABLE public.budget_posten ADD COLUMN IF NOT EXISTS archived_reason     text;
ALTER TABLE public.budget_posten ADD COLUMN IF NOT EXISTS archived_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
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


-- ── budget_teilzahlungen ──────────────────────────────────
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


-- ── todo_aufgaben ─────────────────────────────────────────
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

-- Migration: fehlende Spalten nachträglich ergänzen (für bestehende Installationen)
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


-- ── todo_vorlagen ─────────────────────────────────────────
-- user_id nullable: NULL = globale Vorlage, gesetzt = persönliche Vorlage
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

-- Globale Vorlagen zurücksetzen (persönliche bleiben erhalten)
DELETE FROM public.todo_vorlagen WHERE user_id IS NULL;

INSERT INTO public.todo_vorlagen (beschreibung, kategorie, prioritaet, faelligkeitsdatum_offset_tage, standard_anhaenge_text, sortier_reihenfolge) VALUES
('Mietvertrag alte Wohnung kündigen (Standard: 3 Monate Frist)', 'Verträge', 'Hoch', 90, NULL, 10),
('Nachsendeauftrag bei der Post einrichten (ca. 2 Wochen vorher)', 'Organisation', 'Hoch', 14, NULL, 20),
('Strom, Gas, Wasser ummelden (ca. 1 Woche vorher)', 'Versorger', 'Hoch', 7, NULL, 30),
('Internet- und Telefonanschluss ummelden/kündigen (ca. 4 Wochen vorher)', 'Versorger', 'Hoch', 28, NULL, 40),
('Termin für Wohnungsübergabe (alte Wohnung) vereinbaren', 'Wohnung', 'Hoch', 21, NULL, 50),
('Umzugshelfer organisieren', 'Umzugstag', 'Mittel', 30, NULL, 60),
('Umzugskartons besorgen und packen beginnen', 'Umzugstag', 'Mittel', 45, NULL, 70),
('Sperrmüll anmelden (falls benötigt)', 'Ausmisten', 'Mittel', 21, NULL, 80),
('Umzugsurlaub beim Arbeitgeber einreichen', 'Organisation', 'Hoch', 60, 'Gesetzlicher Anspruch prüfen, schriftlich einreichen', 100),
('Kindergarten/Schule am neuen Wohnort anmelden', 'Organisation', 'Hoch', 90, 'Unterlagen: Geburtsurkunde, Meldezettel', 110),
('Haustierbetreuung für den Umzugstag organisieren', 'Organisation', 'Mittel', 14, 'Freunde fragen oder professionelle Betreuung buchen', 120),
('Adressänderung bei Banken und Versicherungen bekannt geben', 'Organisation', 'Hoch', 7, 'Online-Portale oder Formulare nutzen', 130),
('Adressänderung bei Online-Shops und Abonnements aktualisieren', 'Organisation', 'Mittel', 5, 'Wichtige Lieferdienste prüfen (Amazon, Zalando etc.)', 140),
('Termin für Sperrmüllabholung vereinbaren (falls benötigt)', 'Ausmisten', 'Mittel', 21, 'Details bei der Gemeinde/Stadt erfragen', 150),
('Wichtige Dokumente scannen und digital sichern', 'Dokumente', 'Mittel', 30, 'Cloud-Speicher oder externe Festplatte nutzen', 160),
('Schönheitsreparaturen in alter Wohnung durchführen (falls vertraglich vereinbart)', 'Wohnung', 'Mittel', 14, 'Malerarbeiten, Löcher schließen etc.', 200),
('Zählerstände (Strom, Gas, Wasser) in alter Wohnung ablesen und protokollieren', 'Wohnung', 'Hoch', 0, 'Protokoll mit Vermieter/Nachmieter, Fotos machen', 210),
('Übergabeprotokoll für alte Wohnung vorbereiten/prüfen', 'Wohnung', 'Hoch', 3, 'Mängelliste, Zustand der Räume', 220),
('Schlüssel für neue Wohnung übernehmen und Übergabeprotokoll erstellen', 'Wohnung', 'Hoch', 0, 'Zustand prüfen, Mängel dokumentieren, Zählerstände neue Wohnung', 230),
('Namensschilder an Klingel und Briefkasten (neue Wohnung) anbringen', 'Wohnung', 'Niedrig', -1, 'Nach Einzug erledigen', 240),
('Reinigung der neuen Wohnung vor Einzug organisieren/durchführen', 'Wohnung', 'Mittel', 2, 'Grundreinigung, Fenster putzen', 250),
('Packmaterial besorgen (Kartons, Klebeband, Polstermaterial)', 'Umzugstag', 'Hoch', 45, 'Auch an Werkzeug, Müllsäcke denken', 300),
('Systematisches Packen beginnen (Raum für Raum)', 'Umzugstag', 'Mittel', 30, 'Kartons beschriften (Inhalt, Zielraum)', 310),
('Erste-Hilfe-Koffer für den Umzugstag packen', 'Umzugstag', 'Mittel', 7, 'Pflaster, Desinfektionsmittel, Schmerzmittel', 320),
('Verpflegung für Umzugshelfer planen und einkaufen', 'Umzugstag', 'Mittel', 3, 'Getränke, Snacks, ggf. Mittagessen', 330),
('Parkverbotszone für Umzugswagen beantragen (falls nötig)', 'Umzugstag', 'Hoch', 21, 'Bei der zuständigen Behörde', 340),
('Transportmittel für Haustiere und Pflanzen organisieren', 'Umzugstag', 'Mittel', 7, 'Sichere Transportboxen, ggf. spezielles Fahrzeug', 350),
('Budget für Umzugskosten erstellen und verfolgen', 'Finanzen', 'Hoch', 60, 'Alle erwarteten Ausgaben auflisten', 400),
('Kaution für neue Wohnung überweisen', 'Finanzen', 'Hoch', 30, 'Zahlungsfrist beachten', 410),
('Daueraufträge für Miete etc. anpassen', 'Finanzen', 'Hoch', 5, 'Alte Daueraufträge kündigen, neue einrichten', 420),
('Wohnsitz ummelden (innerhalb der Frist)', 'Behörde', 'Hoch', -3, 'Nach Einzug, Fristen beachten (oft 3 Tage bis 2 Wochen)', 500),
('KFZ ummelden (falls anderer Zulassungsbezirk)', 'Behörde', 'Mittel', -7, 'Unterlagen: Fahrzeugpapiere, eVB-Nummer, Ausweis', 510),
('Neuen Hausarzt/Zahnarzt suchen (falls nötig)', 'Gesundheit', 'Niedrig', -30, 'Nach Einzug, Empfehlungen einholen', 520),
('Vorräte aufbrauchen (Kühlschrank, Gefriertruhe)', 'Sonstiges', 'Mittel', 14, 'Reduziert Packaufwand und Lebensmittelverschwendung', 600),
('Nachbarn über Auszug/Einzug informieren', 'Sonstiges', 'Niedrig', 3, 'Gute Geste, ggf. um Verständnis für Lärm bitten', 610),
('Werkzeugkiste für Möbelmontage/-demontage vorbereiten', 'Umzugstag', 'Mittel', 7, 'Akkuschrauber, Schraubenzieher, Hammer etc.', 620),
('Wichtige Telefonnummern und Adressen griffbereit halten', 'Organisation', 'Hoch', 1, 'Umzugsfirma, Helfer, neue/alte Vermieter', 630),
('Kinder während des Umzugs betreuen lassen oder beschäftigen', 'Organisation', 'Hoch', 0, 'Sicherheit und Stressreduktion für Kinder', 640);

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


-- ── pack_kisten ───────────────────────────────────────────
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


-- ── pack_gegenstaende ─────────────────────────────────────
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

-- Legacy: kisten_id → kiste_id migrieren und FK setzen
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


-- ── dokumente ─────────────────────────────────────────────
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
ALTER TABLE public.dokumente ADD COLUMN IF NOT EXISTS app_modus text NOT NULL DEFAULT 'beides';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'dokumente_app_modus_check'
      AND conrelid = 'public.dokumente'::regclass
  ) THEN
    ALTER TABLE public.dokumente
      ADD CONSTRAINT dokumente_app_modus_check
      CHECK (app_modus IN ('umzug', 'home', 'beides'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_dokumente_user_id         ON public.dokumente(user_id);
CREATE INDEX IF NOT EXISTS idx_dokumente_todo_aufgabe_id ON public.dokumente(todo_aufgabe_id);
CREATE INDEX IF NOT EXISTS idx_dokumente_kategorie       ON public.dokumente(kategorie);
CREATE INDEX IF NOT EXISTS idx_dokumente_user_app_modus  ON public.dokumente(user_id, app_modus);

DROP TRIGGER IF EXISTS set_dokumente_updated_at ON public.dokumente;
CREATE TRIGGER set_dokumente_updated_at
  BEFORE UPDATE ON public.dokumente
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.dokumente ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS dokumente_crud_own ON public.dokumente;
CREATE POLICY dokumente_crud_own ON public.dokumente FOR ALL
  USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);


-- ── renovierungs_posten ───────────────────────────────────
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

-- Bestehende Daten löschen, um Duplikate zu vermeiden
DELETE FROM public.materialien;

INSERT INTO public.materialien (name, kategorie, einheit, standardpreis) VALUES
('Dispersionsfarbe weiß (Innen)', 'Maler- & Tapezierbedarf', 'L', 24.99),
('Tiefgrund 5 L', 'Maler- & Tapezierbedarf', 'Kanister', 18.00),
('Malerrolle (18 cm)', 'Maler- & Tapezierbedarf', 'Stück', 3.00),
('Farbwanne', 'Maler- & Tapezierbedarf', 'Stück', 4.00),
('Malerkreppband (50 m)', 'Maler- & Tapezierbedarf', 'Rolle', 5.00),
('Schleifpapier (Körnung 120)', 'Maler- & Tapezierbedarf', 'Blatt', 0.50),
('Pinselset (3 Stück)', 'Maler- & Tapezierbedarf', 'Set', 8.00),
('Spachtelmasse (innen) 5 kg', 'Maler- & Tapezierbedarf', 'Sack', 12.00),
('Acryl-Dichtmasse 310 ml', 'Maler- & Tapezierbedarf', 'Kartusche', 4.00),
('Feinputz 25 kg', 'Maler- & Tapezierbedarf', 'Sack', 15.00),
('Buntlack (Kunstharz, farbig) 0,75 L', 'Maler- & Tapezierbedarf', 'Dose', 15.00),
('Lackfarbe weiß (Holz/Metall) 1 L', 'Maler- & Tapezierbedarf', 'Dose', 12.00),
('Fassadenfarbe weiß (Außen) 10 L', 'Maler- & Tapezierbedarf', 'Eimer', 60.00),
('Tapetenrolle (Vliestapete) 10 m²', 'Maler- & Tapezierbedarf', 'Rolle', 10.00),
('Tapetenkleister 500 g', 'Maler- & Tapezierbedarf', 'Packung', 5.00),
('Tapezierbürste', 'Maler- & Tapezierbedarf', 'Stück', 7.00),
('Quast (Deckenbürste)', 'Maler- & Tapezierbedarf', 'Stück', 8.00),
('Farbkratzer (Schaber)', 'Maler- & Tapezierbedarf', 'Stück', 5.00),
('Abstreifgitter (für Farbeimer)', 'Maler- & Tapezierbedarf', 'Stück', 2.00),
('Teleskop-Verlängerungsstange', 'Maler- & Tapezierbedarf', 'Stück', 15.00),
('Abdeckpapier (Rolle 50 m)', 'Maler- & Tapezierbedarf', 'Rolle', 10.00),
('Abdeckfolie mit Klebeband (maskierend)', 'Maler- & Tapezierbedarf', 'Rolle', 5.00),
('Maleroverall (Einweg)', 'Maler- & Tapezierbedarf', 'Stück', 5.00),
('Abbeizer (Lackentferner) 1 L', 'Maler- & Tapezierbedarf', 'L', 15.00),
('Pinselreiniger (Lösungsmittel) 1 L', 'Maler- & Tapezierbedarf', 'L', 8.00),
('Holzlasur (farblos) 5 L', 'Maler- & Tapezierbedarf', 'L', 30.00),
('Tapetenlöser 500 ml', 'Maler- & Tapezierbedarf', 'ml', 6.00),
('Stachelwalze (Tapetenperforierer)', 'Maler- & Tapezierbedarf', 'Stück', 15.00),
('Nahtroller (Tapeten-Andruckrolle)', 'Maler- & Tapezierbedarf', 'Stück', 6.00),
('Tapeziertisch (klappbar)', 'Maler- & Tapezierbedarf', 'Stück', 50.00),
('Zement (Portland) 25 kg', 'Maurer & Putz', 'Sack', 5.00),
('Mauerziegel (Standard)', 'Maurer & Putz', 'Stück', 0.80),
('Kalkputz (innen) 25 kg', 'Maurer & Putz', 'Sack', 10.00),
('Estrichmörtel 25 kg', 'Maurer & Putz', 'Sack', 6.00),
('Beton C25/30 (Transportbeton) 1 m³', 'Maurer & Putz', 'm³', 120.00),
('Mauermörtel 25 kg', 'Maurer & Putz', 'Sack', 4.00),
('Kalksandstein (Format NF)', 'Maurer & Putz', 'Stück', 2.50),
('WDVS-Dämmplatte 1 m²', 'Maurer & Putz', 'Stück', 20.00),
('Dämmwolle (Mineralwolle) 1 m²', 'Maurer & Putz', 'm²', 3.50),
('Perlit-Leichtbeton 25 kg', 'Maurer & Putz', 'Sack', 8.00),
('Bausand (Betonsand) 25 kg', 'Maurer & Putz', 'Sack', 3.00),
('Kies (Betonkies) 1 t', 'Maurer & Putz', 't', 30.00),
('Betonstahl (Bewehrungsstab) 6 m', 'Maurer & Putz', 'Stück', 10.00),
('Bewehrungsmatte (Stahlgitter)', 'Maurer & Putz', 'Stück', 50.00),
('Bitumenbahn (Abdichtung) 10 m²', 'Maurer & Putz', 'Rolle', 30.00),
('Dachziegel 1 m²', 'Maurer & Putz', 'm²', 25.00),
('Bauschaum (PU-Montageschaum) 750 ml', 'Maurer & Putz', 'Dose', 8.00),
('Trockenbeton (Fertigbeton) 40 kg', 'Maurer & Putz', 'Sack', 8.00),
('Porenbeton-Stein (Ytong) 625 × 240 × 200 mm', 'Maurer & Putz', 'Stück', 5.00),
('Schamottmörtel (feuerfest) 5 kg', 'Maurer & Putz', 'Eimer', 10.00),
('Schamottstein 230 × 114 × 64 mm', 'Maurer & Putz', 'Stück', 3.00),
('Betonsturz (Fertigteil) 1,0 m', 'Maurer & Putz', 'Stück', 15.00),
('Putzprofil (Eckschiene)', 'Maurer & Putz', 'Stück', 3.00),
('Baugips (Gipspulver) 5 kg', 'Maurer & Putz', 'Sack', 5.00),
('Dichtschlämme (Kellerabdichtung) 5 kg', 'Maurer & Putz', 'Eimer', 20.00),
('Dickbeschichtung (KMB) 10 kg', 'Maurer & Putz', 'Eimer', 30.00),
('Stahlträger (HEA 100) pro lfm', 'Maurer & Putz', 'm', 50.00),
('Porenbetonkleber 25 kg', 'Maurer & Putz', 'Sack', 10.00),
('Perimeterdämmung (XPS-Platte) 1 m²', 'Maurer & Putz', 'Stück', 15.00),
('Trittschalldämmung (EPS) 1 m²', 'Maurer & Putz', 'm²', 5.00),
('Fertigparkett (Buche) 1 m²', 'Holz & Boden', 'm²', 60.00),
('Laminat 1 m²', 'Holz & Boden', 'm²', 20.00),
('OSB-Platte 250×125 cm', 'Holz & Boden', 'Platte', 12.00),
('MDF-Platte 122×61 cm', 'Holz & Boden', 'Platte', 8.00),
('Spanplatte 250×125 cm', 'Holz & Boden', 'Platte', 10.00),
('Dachlatte 4 × 6 cm (Konstruktionsholz)', 'Holz & Boden', 'Stück', 2.00),
('Balken, Fichte 10 × 10 cm', 'Holz & Boden', 'lfm', 15.00),
('Parkettleim 5 kg', 'Holz & Boden', 'Beutel', 25.00),
('Trittschalldämm-Unterlage 1 m²', 'Holz & Boden', 'm²', 1.50),
('Sockelleiste Buche 2,4 m', 'Holz & Boden', 'Stück', 3.50),
('Massivholzdielen (Eiche) 1 m²', 'Holz & Boden', 'm²', 80.00),
('Vinylboden (Designbelag) 1 m²', 'Holz & Boden', 'm²', 30.00),
('Teppichboden (Auslegware) 1 m²', 'Holz & Boden', 'm²', 20.00),
('Bodenfliesen (Keramik) 1 m²', 'Holz & Boden', 'm²', 25.00),
('Wandfliesen (weiß) 1 m²', 'Holz & Boden', 'm²', 15.00),
('Fliesenkleber 25 kg', 'Holz & Boden', 'Sack', 10.00),
('Fugenmörtel 5 kg', 'Holz & Boden', 'Beutel', 8.00),
('Fliesenkreuze (Abstandhalter) 100 Stk', 'Holz & Boden', 'Pack', 3.00),
('Sockelfliese 30 cm', 'Holz & Boden', 'Stück', 2.00),
('PVC-Bodenbelag (Rolle) 1 m²', 'Holz & Boden', 'm²', 10.00),
('Natursteinfliese (Granit) 1 m²', 'Holz & Boden', 'm²', 60.00),
('Holzleim (Ponal) 1 kg', 'Holz & Boden', 'Flasche', 10.00),
('Leimholzplatte (Fichte) 200×60×2 cm', 'Holz & Boden', 'Stück', 50.00),
('Siebdruckplatte (Birkensperrholz) 21 mm', 'Holz & Boden', 'Platte', 70.00),
('Sperrholzplatte 4 mm 122×244 cm', 'Holz & Boden', 'Platte', 15.00),
('Terrassendiele (WPC) pro lfm', 'Holz & Boden', 'm', 5.00),
('KVH Kantholz 60×60 mm', 'Holz & Boden', 'lfm', 5.00),
('Parkettlack (Versiegelung) 1 L', 'Holz & Boden', 'L', 20.00),
('Korkboden 1 m²', 'Holz & Boden', 'm²', 40.00),
('Teppichfliesen 1 m²', 'Holz & Boden', 'm²', 30.00),
('Spanplattenschrauben 4×30 mm', 'Schrauben, Dübel & Befestigung', 'Stück', 0.05),
('Universaldübel 8×50 mm', 'Schrauben, Dübel & Befestigung', 'Stück', 0.10),
('Holzschrauben 6×60 mm', 'Schrauben, Dübel & Befestigung', 'Stück', 0.08),
('Blechschrauben 4×20 mm', 'Schrauben, Dübel & Befestigung', 'Stück', 0.07),
('Nageldübel 10×100 mm', 'Schrauben, Dübel & Befestigung', 'Stück', 0.15),
('Schraubenset 200 Stk (Sortiment)', 'Schrauben, Dübel & Befestigung', 'Set', 15.00),
('Hakenanker 8×120 mm', 'Schrauben, Dübel & Befestigung', 'Stück', 0.45),
('Rohrschelle (für Sanitär) 1/2″', 'Schrauben, Dübel & Befestigung', 'Stück', 0.20),
('Dübelbox (Sortiment)', 'Schrauben, Dübel & Befestigung', 'Packung', 20.00),
('Holznagel 5×50 mm (Stahlstift)', 'Schrauben, Dübel & Befestigung', 'Stück', 0.03),
('Betonschraube 7,5×80 mm', 'Schrauben, Dübel & Befestigung', 'Stück', 0.50),
('Schwerlastanker M10', 'Schrauben, Dübel & Befestigung', 'Stück', 2.00),
('Gewindestange M8 (1 m)', 'Schrauben, Dübel & Befestigung', 'Stück', 2.00),
('Sechskantmutter M8', 'Schrauben, Dübel & Befestigung', 'Stück', 0.05),
('Unterlegscheibe M8', 'Schrauben, Dübel & Befestigung', 'Stück', 0.02),
('Stahlnagel 100 mm', 'Schrauben, Dübel & Befestigung', 'Stück', 0.05),
('Stahlnagel (gehärtet) 30 mm', 'Schrauben, Dübel & Befestigung', 'Stück', 0.10),
('Maschinenschraube M6×40 (mit Mutter)', 'Schrauben, Dübel & Befestigung', 'Stück', 0.20),
('Holzdübel 8×40 mm (Holzverbinder)', 'Schrauben, Dübel & Befestigung', 'Stück', 0.05),
('Kabelbinder 300 mm', 'Schrauben, Dübel & Befestigung', 'Stück', 0.10),
('Winkelverbinder (Metallwinkel)', 'Schrauben, Dübel & Befestigung', 'Stück', 1.00),
('Lochband (Lochstreifen) 1 m', 'Schrauben, Dübel & Befestigung', 'm', 2.00),
('Bindedraht (1 kg Rolle)', 'Schrauben, Dübel & Befestigung', 'Rolle', 5.00),
('Blindnieten 4×20 mm (Popnieten)', 'Schrauben, Dübel & Befestigung', 'Stück', 0.05),
('Nagelschellen (Kabelclips) 20 Stk', 'Schrauben, Dübel & Befestigung', 'Pack', 2.00),
('Tellerkopfschrauben 6×140 mm', 'Schrauben, Dübel & Befestigung', 'Stück', 0.50),
('Hohlraumdübel M6', 'Schrauben, Dübel & Befestigung', 'Stück', 0.50),
('Injektionsmörtel (Vinylester) 300 ml', 'Schrauben, Dübel & Befestigung', 'Kartusche', 15.00),
('Gewindestange M12 (1 m)', 'Schrauben, Dübel & Befestigung', 'Stück', 5.00),
('Sechskantmutter M12', 'Schrauben, Dübel & Befestigung', 'Stück', 0.10),
('Unterlegscheibe M12', 'Schrauben, Dübel & Befestigung', 'Stück', 0.05),
('Holzschrauben 8×120 mm', 'Schrauben, Dübel & Befestigung', 'Stück', 0.20),
('Spanplattenschrauben 4×50 mm', 'Schrauben, Dübel & Befestigung', 'Stück', 0.08),
('Spanplattenschrauben 5×80 mm', 'Schrauben, Dübel & Befestigung', 'Stück', 0.10),
('Nageldübel 6×60 mm', 'Schrauben, Dübel & Befestigung', 'Stück', 0.10),
('Drahtseil (Stahl) 1 m', 'Schrauben, Dübel & Befestigung', 'm', 2.00),
('Karabinerhaken (Stahl) 8 mm', 'Schrauben, Dübel & Befestigung', 'Stück', 2.00),
('Akku-Bohrschrauber (18 V)', 'Werkzeuge & Verbrauchsmaterial', 'Stück', 80.00),
('Bohrerset (10 tlg.)', 'Werkzeuge & Verbrauchsmaterial', 'Set', 15.00),
('Wasserwaage 60 cm', 'Werkzeuge & Verbrauchsmaterial', 'Stück', 10.00),
('Cuttermesser', 'Werkzeuge & Verbrauchsmaterial', 'Stück', 3.00),
('Zollstock 2 m', 'Werkzeuge & Verbrauchsmaterial', 'Stück', 5.00),
('Hand-Schraubendreher-Set', 'Werkzeuge & Verbrauchsmaterial', 'Set', 10.00),
('Elektroklebeband (Isolierband) schwarz', 'Werkzeuge & Verbrauchsmaterial', 'Rolle', 2.00),
('Eimer 10 L (Baueimer)', 'Werkzeuge & Verbrauchsmaterial', 'Stück', 4.00),
('Hammer (Schlosserhammer)', 'Werkzeuge & Verbrauchsmaterial', 'Stück', 10.00),
('Handsäge (Fuchsschwanz)', 'Werkzeuge & Verbrauchsmaterial', 'Stück', 12.00),
('Metallsäge (Bügelsäge)', 'Werkzeuge & Verbrauchsmaterial', 'Stück', 15.00),
('Feilen-Set (Metall/Holz)', 'Werkzeuge & Verbrauchsmaterial', 'Set', 10.00),
('Kombizange', 'Werkzeuge & Verbrauchsmaterial', 'Stück', 8.00),
('Seitenschneider', 'Werkzeuge & Verbrauchsmaterial', 'Stück', 7.00),
('Schraubenschlüssel-Set', 'Werkzeuge & Verbrauchsmaterial', 'Set', 20.00),
('Ratschen-/Steckschlüsselsatz', 'Werkzeuge & Verbrauchsmaterial', 'Set', 30.00),
('Inbusschlüssel-Set', 'Werkzeuge & Verbrauchsmaterial', 'Set', 5.00),
('Stichsäge (elektrisch)', 'Werkzeuge & Verbrauchsmaterial', 'Stück', 50.00),
('Handkreissäge', 'Werkzeuge & Verbrauchsmaterial', 'Stück', 100.00),
('Winkelschleifer (Flex)', 'Werkzeuge & Verbrauchsmaterial', 'Stück', 60.00),
('Bohrhammer (SDS)', 'Werkzeuge & Verbrauchsmaterial', 'Stück', 150.00),
('Multitool (Oszillationswerkzeug)', 'Werkzeuge & Verbrauchsmaterial', 'Stück', 80.00),
('Exzenterschleifer', 'Werkzeuge & Verbrauchsmaterial', 'Stück', 50.00),
('Deltaschleifer', 'Werkzeuge & Verbrauchsmaterial', 'Stück', 30.00),
('Heißluftpistole', 'Werkzeuge & Verbrauchsmaterial', 'Stück', 40.00),
('Tacker (Handtacker)', 'Werkzeuge & Verbrauchsmaterial', 'Stück', 15.00),
('Heißklebepistole', 'Werkzeuge & Verbrauchsmaterial', 'Stück', 10.00),
('Kabeltrommel (Verlängerung) 25 m', 'Werkzeuge & Verbrauchsmaterial', 'Stück', 25.00),
('Stehleiter (zweiteilig) 2 m', 'Werkzeuge & Verbrauchsmaterial', 'Stück', 50.00),
('Klappgerüst (klein, fahrbar)', 'Werkzeuge & Verbrauchsmaterial', 'Stück', 200.00),
('Schubkarre (Baustellenschubkarre)', 'Werkzeuge & Verbrauchsmaterial', 'Stück', 80.00),
('Maurerkelle (Kelle)', 'Werkzeuge & Verbrauchsmaterial', 'Stück', 8.00),
('Bit-Set (Schrauberbits) 20 tlg.', 'Werkzeuge & Verbrauchsmaterial', 'Set', 10.00),
('Maßband (Rollbandmaß) 5 m', 'Werkzeuge & Verbrauchsmaterial', 'Stück', 8.00),
('Laser-Entfernungsmesser', 'Werkzeuge & Verbrauchsmaterial', 'Stück', 50.00),
('Tapeten-Dampfablöser (Elektro)', 'Werkzeuge & Verbrauchsmaterial', 'Stück', 30.00),
('Nass-/Trockensauger (Bau-Staubsauger)', 'Werkzeuge & Verbrauchsmaterial', 'Stück', 100.00),
('Laminatschneider (Hebel)', 'Werkzeuge & Verbrauchsmaterial', 'Stück', 40.00),
('Fliesenschneider (manuell)', 'Werkzeuge & Verbrauchsmaterial', 'Stück', 50.00),
('Abbruchhammer (Stemmgerät)', 'Werkzeuge & Verbrauchsmaterial', 'Stück', 200.00),
('Rotationslaser (Nivelliergerät)', 'Werkzeuge & Verbrauchsmaterial', 'Stück', 300.00),
('Bohrständer (für Bohrmaschine)', 'Werkzeuge & Verbrauchsmaterial', 'Stück', 150.00),
('Tischkreissäge', 'Werkzeuge & Verbrauchsmaterial', 'Stück', 250.00),
('Kettensäge (Elektro)', 'Werkzeuge & Verbrauchsmaterial', 'Stück', 100.00),
('Farbsprühsystem (Elektro)', 'Werkzeuge & Verbrauchsmaterial', 'Stück', 100.00),
('Kernbohrer-Set (Bohrkronen)', 'Werkzeuge & Verbrauchsmaterial', 'Set', 50.00),
('Baugerüst (Modulgerüst)', 'Werkzeuge & Verbrauchsmaterial', 'Stück', 1000.00),
('Betonmischer (mobil)', 'Werkzeuge & Verbrauchsmaterial', 'Stück', 300.00),
('Rührgerät (Mörtelmischer)', 'Werkzeuge & Verbrauchsmaterial', 'Stück', 80.00),
('Leitungssucher (Ortungsgerät)', 'Werkzeuge & Verbrauchsmaterial', 'Stück', 30.00),
('Druckluft-Kompressor 50 L', 'Werkzeuge & Verbrauchsmaterial', 'Stück', 200.00),
('Lackierpistole (Druckluft)', 'Werkzeuge & Verbrauchsmaterial', 'Stück', 40.00),
('Werkstattwagen (Werkzeugwagen)', 'Werkzeuge & Verbrauchsmaterial', 'Stück', 200.00),
('Schweißgerät (Elektrode)', 'Werkzeuge & Verbrauchsmaterial', 'Stück', 300.00),
('WC-Keramik (Stand-WC)', 'Sanitär & Installation', 'Stück', 150.00),
('Waschbecken (Keramik)', 'Sanitär & Installation', 'Stück', 80.00),
('Duscharmatur (Mischbatterie)', 'Sanitär & Installation', 'Stück', 100.00),
('Eckventil 1/2″', 'Sanitär & Installation', 'Stück', 5.00),
('HT-Rohr (Abwasserrohr) DN 110', 'Sanitär & Installation', 'm', 3.00),
('Siphon (Geruchsverschluss)', 'Sanitär & Installation', 'Stück', 8.00),
('Teflon-Dichtband', 'Sanitär & Installation', 'Rolle', 1.00),
('Gummidichtung (O-Ring)', 'Sanitär & Installation', 'Stück', 0.50),
('Silikon-Dichtmasse (Sanitär) 310 ml', 'Sanitär & Installation', 'Kartusche', 6.00),
('Montagekleber 290 ml', 'Sanitär & Installation', 'Tube', 6.00),
('Badewanne (Acryl)', 'Sanitär & Installation', 'Stück', 300.00),
('Duschwanne 90×90 cm', 'Sanitär & Installation', 'Stück', 100.00),
('Duschkabine (Glas, komplett)', 'Sanitär & Installation', 'Stück', 250.00),
('WC-Sitz (Deckel)', 'Sanitär & Installation', 'Stück', 30.00),
('Waschtischarmatur', 'Sanitär & Installation', 'Stück', 60.00),
('Küchenarmatur (Einhebel)', 'Sanitär & Installation', 'Stück', 80.00),
('Brause-Set (Duschkopf + Schlauch)', 'Sanitär & Installation', 'Set', 30.00),
('Waschmaschinenhahn', 'Sanitär & Installation', 'Stück', 15.00),
('HT-Rohr DN 50', 'Sanitär & Installation', 'm', 2.00),
('Kupferrohr 15 mm', 'Sanitär & Installation', 'm', 8.00),
('Pressfitting 15 mm (Kupplung)', 'Sanitär & Installation', 'Stück', 5.00),
('Ablaufverlängerung (Siphonrohr)', 'Sanitär & Installation', 'Stück', 5.00),
('WC-Anschlussset (Flexrohr)', 'Sanitär & Installation', 'Set', 15.00),
('Untertischboiler 5 L (Elektro)', 'Sanitär & Installation', 'Stück', 100.00),
('Durchlauferhitzer 18 kW', 'Sanitär & Installation', 'Stück', 250.00),
('Bodenablauf (Dusche) mit Geruchsstopp', 'Sanitär & Installation', 'Stück', 20.00),
('Ablaufgarnitur (Waschbecken)', 'Sanitär & Installation', 'Stück', 10.00),
('Flexschlauch 3/8″ (Anschluss)', 'Sanitär & Installation', 'Stück', 5.00),
('Aufputz-Spülkasten (WC)', 'Sanitär & Installation', 'Stück', 50.00),
('Hebeanlage (Abwasserpumpe)', 'Sanitär & Installation', 'Stück', 300.00),
('Kupferkabel (Litze) 1,5 mm², 100 m', 'Elektro & Beleuchtung', 'Rolle', 50.00),
('Steckdose (Unterputz)', 'Elektro & Beleuchtung', 'Stück', 3.00),
('Lichtschalter (Wechselschalter)', 'Elektro & Beleuchtung', 'Stück', 3.00),
('FI-Schutzschalter 30 mA', 'Elektro & Beleuchtung', 'Stück', 30.00),
('Leitungsschutzschalter 16 A', 'Elektro & Beleuchtung', 'Stück', 2.00),
('Deckenleuchte (Fassung+Schirm)', 'Elektro & Beleuchtung', 'Stück', 25.00),
('LED-Lampe E27 (Glühbirne)', 'Elektro & Beleuchtung', 'Stück', 5.00),
('Verlängerungskabel 10 m', 'Elektro & Beleuchtung', 'Stück', 15.00),
('Kabelverbinder (Lüsterklemme)', 'Elektro & Beleuchtung', 'Stück', 0.10),
('Unterputzdose (Gerätedose)', 'Elektro & Beleuchtung', 'Stück', 2.00),
('Installationskabel NYM-J 3×1,5² (50 m)', 'Elektro & Beleuchtung', 'Rolle', 25.00),
('Kabelkanal 20×20 mm (2 m)', 'Elektro & Beleuchtung', 'Stück', 5.00),
('Abzweigdose (Aufputz)', 'Elektro & Beleuchtung', 'Stück', 3.00),
('Nagelschellen 20 Stk (Kabelschellen)', 'Elektro & Beleuchtung', 'Pack', 2.00),
('Netzwerkdose CAT6 (LAN)', 'Elektro & Beleuchtung', 'Stück', 10.00),
('Netzwerkkabel CAT6 20 m', 'Elektro & Beleuchtung', 'Stück', 15.00),
('Koaxialkabel (TV) 10 m', 'Elektro & Beleuchtung', 'Stück', 10.00),
('Bewegungsmelder (Innen)', 'Elektro & Beleuchtung', 'Stück', 20.00),
('Rauchmelder (Batterie)', 'Elektro & Beleuchtung', 'Stück', 10.00),
('Türklingel (Gong)', 'Elektro & Beleuchtung', 'Stück', 15.00),
('Multimeter (Digital)', 'Elektro & Beleuchtung', 'Stück', 20.00),
('Sicherungskasten (Unterverteilung)', 'Elektro & Beleuchtung', 'Stück', 50.00),
('Dimmer-Schalter (Unterputz)', 'Elektro & Beleuchtung', 'Stück', 15.00),
('Steckdosenleiste 6-fach', 'Elektro & Beleuchtung', 'Stück', 10.00),
('Antennendose (TV/Sat)', 'Elektro & Beleuchtung', 'Stück', 5.00),
('LED-Baustrahler (Arbeitslampe)', 'Elektro & Beleuchtung', 'Stück', 30.00),
('Leitungssucher (Ortungsgerät)', 'Elektro & Beleuchtung', 'Stück', 30.00),
('Überspannungsschutz (Zwischenstecker)', 'Elektro & Beleuchtung', 'Stück', 15.00),
('Zeitschaltuhr (Steckdose)', 'Elektro & Beleuchtung', 'Stück', 10.00),
('Spannungsprüfer (Prüfschraubendreher)', 'Elektro & Beleuchtung', 'Stück', 5.00),
('Umzugskarton (Standard)', 'Umzugs- & Verpackungsmaterial', 'Stück', 3.00),
('Luftpolsterfolie', 'Umzugs- & Verpackungsmaterial', 'm', 3.00),
('Packseide (Seidenpapier)', 'Umzugs- & Verpackungsmaterial', 'kg', 3.00),
('Klebeband (Packband) 50 m', 'Umzugs- & Verpackungsmaterial', 'Rolle', 5.00),
('Umzugsdecke (Polsterdecke)', 'Umzugs- & Verpackungsmaterial', 'Stück', 10.00),
('Möbelroller (Rollbrett)', 'Umzugs- & Verpackungsmaterial', 'Stück', 15.00),
('Zurrgurt (Spanngurt)', 'Umzugs- & Verpackungsmaterial', 'Stück', 8.00),
('Halteverbot-Schild', 'Umzugs- & Verpackungsmaterial', 'Stück', 20.00),
('Sackkarre', 'Umzugs- & Verpackungsmaterial', 'Stück', 40.00),
('Werkzeugkoffer (leer)', 'Umzugs- & Verpackungsmaterial', 'Stück', 50.00),
('Kleiderkarton (mit Stange)', 'Umzugs- & Verpackungsmaterial', 'Stück', 14.00),
('Matratzenhülle (Schutzfolie)', 'Umzugs- & Verpackungsmaterial', 'Stück', 8.00),
('Stretchfolie (Wickelfolie)', 'Umzugs- & Verpackungsmaterial', 'Rolle', 15.00),
('Möbel-Schutzfolie (Sofaüberzug)', 'Umzugs- & Verpackungsmaterial', 'Stück', 10.00),
('Möbelgleiter (Gleiter-Set) 4 Stk', 'Umzugs- & Verpackungsmaterial', 'Set', 5.00),
('Tragegurte (Möbelgurte) 2 Stk', 'Umzugs- & Verpackungsmaterial', 'Set', 20.00),
('Seil (Polypropylen) 10 m', 'Umzugs- & Verpackungsmaterial', 'Stück', 5.00),
('Kantenschutzecken (Schaum) 8 Stk', 'Umzugs- & Verpackungsmaterial', 'Pack', 5.00),
('Klappbox (Kunststoffkiste) 60 L', 'Umzugs- & Verpackungsmaterial', 'Stück', 20.00),
('Treppensackkarre (Treppensteiger)', 'Umzugs- & Verpackungsmaterial', 'Stück', 120.00),
('Müllsäcke 120 L (10 Stk)', 'Sonstiges & Verbrauch', 'Packung', 8.00),
('Putzlappen (Baumwolle) 10 Stk', 'Sonstiges & Verbrauch', 'Packung', 5.00),
('Schwammtücher (Reinigung) 5 Stk', 'Sonstiges & Verbrauch', 'Packung', 2.00),
('Bodenabdeckfolie (PE) 5 m', 'Sonstiges & Verbrauch', 'Rolle', 10.00),
('Baustellenradio', 'Sonstiges & Verbrauch', 'Stück', 40.00),
('Breitklebeband (Gaffa)', 'Sonstiges & Verbrauch', 'Rolle', 4.00),
('Baustellenlampe (Warnleuchte)', 'Sonstiges & Verbrauch', 'Stück', 30.00),
('WD-40 Spray (Kriechöl) 250 ml', 'Sonstiges & Verbrauch', 'Dose', 5.00),
('Stromgenerator (Benzin)', 'Sonstiges & Verbrauch', 'Stück', 400.00),
('Handfeger & Kehrschaufel (Set)', 'Sonstiges & Verbrauch', 'Set', 8.00),
('Schaufel (Spitzschaufel)', 'Sonstiges & Verbrauch', 'Stück', 15.00),
('Besen (Straßenbesen)', 'Sonstiges & Verbrauch', 'Stück', 15.00),
('Schuttsack (Bauabfallsack)', 'Sonstiges & Verbrauch', 'Stück', 2.00),
('Sprühkleber 400 ml', 'Sonstiges & Verbrauch', 'Dose', 8.00),
('Bautrockner (Luftentfeuchter)', 'Sonstiges & Verbrauch', 'Stück', 300.00),
('Bauventilator (Trocknerlüfter)', 'Sonstiges & Verbrauch', 'Stück', 100.00),
('Big-Bag Abfallsack (1 m³)', 'Sonstiges & Verbrauch', 'Stück', 30.00),
('Markierspray (fluoreszierend) 500 ml', 'Sonstiges & Verbrauch', 'Dose', 10.00),
('Feinsteinzeug-Reiniger 5 L', 'Baustellenreiniger & Pflege', 'L', 20.00),
('Glasreiniger 1 L', 'Baustellenreiniger & Pflege', 'L', 3.00),
('Allzweckreiniger 1 L', 'Baustellenreiniger & Pflege', 'L', 4.00),
('Desinfektionsmittel 1 L', 'Baustellenreiniger & Pflege', 'L', 8.00),
('Fugenreiniger (Gel) 500 ml', 'Baustellenreiniger & Pflege', 'ml', 10.00),
('Bodenreiniger (Wischpflege)', 'Baustellenreiniger & Pflege', 'L', 5.00),
('Handreiniger (Paste) 500 ml', 'Baustellenreiniger & Pflege', 'Dose', 6.00),
('Mikrofaser-Tuch', 'Baustellenreiniger & Pflege', 'Stück', 1.00),
('Stahlwolle (Reinigungspad) 200 g', 'Baustellenreiniger & Pflege', 'g', 2.00),
('WC-Reiniger 1 L', 'Baustellenreiniger & Pflege', 'L', 3.00),
('Zementschleier-Entferner 1 L', 'Baustellenreiniger & Pflege', 'L', 10.00),
('Schimmelentferner 500 ml', 'Baustellenreiniger & Pflege', 'ml', 12.00),
('Parkettpflege-Öl 1 L', 'Baustellenreiniger & Pflege', 'L', 15.00),
('Stein-Imprägnierung 1 L', 'Baustellenreiniger & Pflege', 'L', 20.00),
('Backofenreiniger', 'Baustellenreiniger & Pflege', 'Stück', 5.00),
('Rohrreiniger (chemisch) 1 L', 'Baustellenreiniger & Pflege', 'L', 5.00),
('Entkalker 1 L', 'Baustellenreiniger & Pflege', 'L', 4.00),
('Teppichreiniger (Shampoo) 1 L', 'Baustellenreiniger & Pflege', 'L', 10.00),
('Klebstoffentferner 200 ml', 'Baustellenreiniger & Pflege', 'ml', 8.00),
('Grundreiniger (Bauschmutz) 1 L', 'Baustellenreiniger & Pflege', 'L', 10.00),
('Gipskartonplatte (12,5 mm) 2000×1250 mm', 'Trockenbau & Dämmung', 'Stück', 10.00),
('UW-Profil 50 mm (4 m)', 'Trockenbau & Dämmung', 'Stück', 5.00),
('CW-Profil 50 mm (4 m)', 'Trockenbau & Dämmung', 'Stück', 6.00),
('Schnellbauschrauben 25 mm (500 Stk)', 'Trockenbau & Dämmung', 'Pack', 15.00),
('Fugenband (Gipskarton) 25 m', 'Trockenbau & Dämmung', 'Rolle', 5.00),
('Fugenspachtel (Gipskarton) 5 kg', 'Trockenbau & Dämmung', 'Beutel', 10.00),
('Trennwand-Dämmung (Mineralwolle) 1 m²', 'Trockenbau & Dämmung', 'm²', 5.00),
('Dampfsperrfolie 20 m²', 'Trockenbau & Dämmung', 'Rolle', 20.00),
('Kantenschutzprofil (Alu) 2,5 m', 'Trockenbau & Dämmung', 'Stück', 2.00),
('Direktabhänger (Deckenträger)', 'Trockenbau & Dämmung', 'Stück', 0.50),
('Innentür (inkl. Zarge)', 'Fenster & Türen', 'Stück', 300.00),
('Haustür (wärmegedämmt)', 'Fenster & Türen', 'Stück', 1000.00),
('Fenster (Kunststoff, 1×1 m)', 'Fenster & Türen', 'Stück', 500.00),
('Balkontür 90×200 cm', 'Fenster & Türen', 'Stück', 700.00),
('Türdrücker-Garnitur (Innentürgriff)', 'Fenster & Türen', 'Set', 25.00),
('Türzarge (Ersatz) 88×200 cm', 'Fenster & Türen', 'Stück', 100.00),
('Einsteckschloss (Zimmertür)', 'Fenster & Türen', 'Stück', 15.00),
('Schließzylinder (Profil, 30/30)', 'Fenster & Türen', 'Stück', 30.00),
('Türschwelle (Übergangsschiene)', 'Fenster & Türen', 'Stück', 20.00),
('Fensterbank innen (PVC) 1,0 m', 'Fenster & Türen', 'Stück', 20.00),
('Fensterbank außen (Alu) 1,0 m', 'Fenster & Türen', 'Stück', 40.00),
('Rollladen (Fensterladen) 1 m²', 'Fenster & Türen', 'Stück', 150.00),
('Dachfenster 78×98 cm (Schwingfenster)', 'Fenster & Türen', 'Stück', 500.00),
('Türstopper', 'Fenster & Türen', 'Stück', 5.00),
('Türschließer (Türheber)', 'Fenster & Türen', 'Stück', 80.00),
('Heizkörper (Plattenbau, Mittelgröße)', 'Heizung & Klima', 'Stück', 200.00),
('Thermostatventil (Heizkörper)', 'Heizung & Klima', 'Stück', 20.00),
('Heizkörper-Befestigung (Wandhalter-Set)', 'Heizung & Klima', 'Set', 10.00),
('Umwälzpumpe (Heizung)', 'Heizung & Klima', 'Stück', 150.00),
('Gas-Brennwerttherme', 'Heizung & Klima', 'Stück', 3000.00),
('Klimagerät (Split-Anlage)', 'Heizung & Klima', 'Stück', 1000.00),
('Badheizkörper (Handtuchwärmer)', 'Heizung & Klima', 'Stück', 150.00),
('Fußbodenheizungsrohr 100 m', 'Heizung & Klima', 'Rolle', 100.00),
('Kaminofen (Holzofen) freistehend', 'Heizung & Klima', 'Stück', 800.00),
('Ausdehnungsgefäß 25 L (Heizung)', 'Heizung & Klima', 'Stück', 100.00),
('Solarthermie-Paneel (Modul)', 'Heizung & Klima', 'Stück', 1000.00),
('Heizlüfter (Elektro, mobil)', 'Heizung & Klima', 'Stück', 30.00),
('Schutzhelm (Bauhelm)', 'Arbeitsschutz & Sicherheit', 'Stück', 20.00),
('Schutzbrille (Klarglas)', 'Arbeitsschutz & Sicherheit', 'Stück', 6.00),
('Atemschutzmaske (FFP3)', 'Arbeitsschutz & Sicherheit', 'Stück', 7.00),
('Gehörschutz (Kapselgehörschutz)', 'Arbeitsschutz & Sicherheit', 'Paar', 10.00),
('Arbeitshandschuhe (PVC-beschichtet)', 'Arbeitsschutz & Sicherheit', 'Paar', 4.00),
('Sicherheitsschuhe (S3)', 'Arbeitsschutz & Sicherheit', 'Paar', 60.00),
('Warnweste (hi-vis)', 'Arbeitsschutz & Sicherheit', 'Stück', 5.00),
('Feuerlöscher 6 kg (ABC)', 'Arbeitsschutz & Sicherheit', 'Stück', 50.00),
('Erste-Hilfe-Kasten (DIN 13164)', 'Arbeitsschutz & Sicherheit', 'Stück', 20.00),
('Auffanggurt (Sicherheitsgurt)', 'Arbeitsschutz & Sicherheit', 'Stück', 100.00),
('Absperrband (Warnband) 50 m', 'Arbeitsschutz & Sicherheit', 'Rolle', 3.00),
('Gartenzaun-Holzelement 1 m', 'Außenbereich & Garten', 'Stück', 30.00),
('Maschendrahtzaun 1,5 m (10 m Rolle)', 'Außenbereich & Garten', 'Rolle', 50.00),
('Zaunpfosten (Metall) 1,5 m', 'Außenbereich & Garten', 'Stück', 20.00),
('Gartentor (Metall) 100 cm', 'Außenbereich & Garten', 'Stück', 150.00),
('Terrassenplatte (Beton) 50×50 cm', 'Außenbereich & Garten', 'Stück', 5.00),
('Pflasterstein (Beton) 10×20 cm', 'Außenbereich & Garten', 'Stück', 0.50),
('Randstein (Beetkante) 100 cm', 'Außenbereich & Garten', 'Stück', 10.00),
('Zierkies 25 kg', 'Außenbereich & Garten', 'Sack', 6.00),
('Gehwegplatte 30×30 cm', 'Außenbereich & Garten', 'Stück', 2.00),
('Rasengitterstein (Beton) 40×40 cm', 'Außenbereich & Garten', 'Stück', 5.00),
('Regentonne 200 L', 'Außenbereich & Garten', 'Stück', 40.00),
('Gartenschlauch 20 m', 'Außenbereich & Garten', 'Stück', 25.00),
('Rasensprenger (Sprinkler)', 'Außenbereich & Garten', 'Stück', 15.00),
('Außenleuchte (Wandlampe)', 'Außenbereich & Garten', 'Stück', 30.00),
('Bewegungsmelder (Außen)', 'Außenbereich & Garten', 'Stück', 25.00),
('Außensteckdose (Garten) Dual', 'Außenbereich & Garten', 'Stück', 20.00),
('Teichfolie 4 m²', 'Außenbereich & Garten', 'm²', 40.00),
('Gartenhacke (Handhacke)', 'Außenbereich & Garten', 'Stück', 15.00),
('Spaten (Gärtnerspaten)', 'Außenbereich & Garten', 'Stück', 20.00),
('Heckenschere (manuell)', 'Außenbereich & Garten', 'Stück', 25.00);

ALTER TABLE public.materialien ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS materialien_read ON public.materialien;
CREATE POLICY materialien_read ON public.materialien FOR SELECT TO authenticated USING (TRUE);

CREATE INDEX IF NOT EXISTS idx_materialien_kategorie ON public.materialien(kategorie);
CREATE INDEX IF NOT EXISTS idx_materialien_name      ON public.materialien(name);


-- ============================================================
-- 5. HOME ORGANIZER TABELLEN
-- ============================================================

-- ── home_projekte (vor todo_aufgaben FK) ──────────────────
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


-- ── home_orte ─────────────────────────────────────────────
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


-- ── home_lagerorte ────────────────────────────────────────
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


-- ── home_objekte ──────────────────────────────────────────
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


-- ── home_vorraete ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.home_vorraete (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  lagerort_id   uuid REFERENCES public.home_lagerorte(id) ON DELETE SET NULL,
  name          text NOT NULL,
  kategorie     text DEFAULT 'Haushalt',
  einheit       text DEFAULT 'Stück',
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


-- ── home_einkaufliste ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.home_einkaufliste (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  vorrat_id   uuid REFERENCES public.home_vorraete(id) ON DELETE SET NULL,
  name        text NOT NULL,
  original_text text,
  normalized_name text,
  menge       numeric(10,2) DEFAULT 1,
  einheit     text DEFAULT 'Stück',
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
ALTER TABLE public.home_einkaufliste ADD COLUMN IF NOT EXISTS localized_content jsonb NOT NULL DEFAULT '{}'::jsonb;

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
CREATE INDEX IF NOT EXISTS idx_home_einkaufliste_localized_content ON public.home_einkaufliste USING gin(localized_content);

DROP TRIGGER IF EXISTS set_home_einkaufliste_updated_at ON public.home_einkaufliste;
CREATE TRIGGER set_home_einkaufliste_updated_at
  BEFORE UPDATE ON public.home_einkaufliste
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.home_einkaufliste ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS home_einkaufliste_crud_own ON public.home_einkaufliste;
CREATE POLICY home_einkaufliste_crud_own ON public.home_einkaufliste FOR ALL
  USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);


-- ── home_einkauf_korrekturen ──────────────────
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


-- ── home_geraete ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.home_geraete (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  ort_id                   uuid REFERENCES public.home_orte(id) ON DELETE SET NULL,
  lagerort_id              uuid REFERENCES public.home_lagerorte(id) ON DELETE SET NULL,
  name                     text NOT NULL,
  hersteller               text,
  modell                   text,
  seriennummer             text,
  status                   text DEFAULT 'in_verwendung',
  tags                     text[] DEFAULT '{}',
  bewohner_id              uuid,
  zugriffshaeufigkeit      text DEFAULT 'selten',
  menge                    integer DEFAULT 1,
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
CREATE INDEX IF NOT EXISTS idx_home_geraete_user_ort         ON public.home_geraete(user_id, ort_id);
CREATE INDEX IF NOT EXISTS idx_home_geraete_user_lagerort    ON public.home_geraete(user_id, lagerort_id);
CREATE INDEX IF NOT EXISTS idx_home_geraete_status           ON public.home_geraete(user_id, status);
CREATE INDEX IF NOT EXISTS idx_home_geraete_tags             ON public.home_geraete USING gin(tags);
CREATE INDEX IF NOT EXISTS idx_home_geraete_bewohner         ON public.home_geraete(user_id, bewohner_id);
CREATE INDEX IF NOT EXISTS idx_home_geraete_naechste_wartung ON public.home_geraete(naechste_wartung);

DROP TRIGGER IF EXISTS set_home_geraete_updated_at ON public.home_geraete;
CREATE TRIGGER set_home_geraete_updated_at
  BEFORE UPDATE ON public.home_geraete
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.home_geraete ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS home_geraete_crud_own ON public.home_geraete;
CREATE POLICY home_geraete_crud_own ON public.home_geraete FOR ALL
  USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);


-- ── home_wartungen ────────────────────────────────────────
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


-- ── home_bewohner ─────────────────────────────────────────
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

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'home_geraete_bewohner_id_fkey'
      AND conrelid = 'public.home_geraete'::regclass
  ) THEN
    ALTER TABLE public.home_geraete
      ADD CONSTRAINT home_geraete_bewohner_id_fkey
      FOREIGN KEY (bewohner_id)
      REFERENCES public.home_bewohner(id)
      ON DELETE SET NULL;
  END IF;
END $$;


-- ── home_budget_limits ────────────────────────────────────
-- home_budget_categories
CREATE TABLE IF NOT EXISTS public.home_budget_categories (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id       uuid,
  name               text NOT NULL,
  color              text NOT NULL DEFAULT '#6B7280',
  sort_order         integer NOT NULL DEFAULT 0,
  is_system          boolean NOT NULL DEFAULT false,
  is_active          boolean NOT NULL DEFAULT true,
  created_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at         timestamptz NOT NULL DEFAULT NOW(),
  updated_at         timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_home_budget_categories_household
  ON public.home_budget_categories(household_id);
CREATE INDEX IF NOT EXISTS idx_home_budget_categories_household_active_sort
  ON public.home_budget_categories(household_id, is_active, sort_order, name);
CREATE UNIQUE INDEX IF NOT EXISTS idx_home_budget_categories_household_name_unique
  ON public.home_budget_categories(household_id, lower(btrim(name)));

DROP TRIGGER IF EXISTS set_home_budget_categories_updated_at ON public.home_budget_categories;
CREATE TRIGGER set_home_budget_categories_updated_at
  BEFORE UPDATE ON public.home_budget_categories
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.home_budget_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS home_budget_categories_household_member_access ON public.home_budget_categories;

CREATE OR REPLACE FUNCTION public.seed_home_budget_categories(
  p_household_id uuid,
  p_created_by_user_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_created_by uuid;
BEGIN
  IF p_household_id IS NULL THEN
    RAISE EXCEPTION 'household_id fehlt';
  END IF;

  v_created_by := COALESCE(p_created_by_user_id, (SELECT auth.uid()));

  INSERT INTO public.home_budget_categories (
    household_id, name, color, sort_order, is_system, is_active, created_by_user_id
  )
  VALUES
    (p_household_id, 'Lebensmittel', '#10B981', 10, true, true, v_created_by),
    (p_household_id, 'Hygieneartikel', '#F97316', 20, true, true, v_created_by),
    (p_household_id, 'Reinigungsmittel', '#06B6D4', 30, true, true, v_created_by),
    (p_household_id, 'Haushalt', '#3B82F6', 40, true, true, v_created_by),
    (p_household_id, 'Elektronikartikel', '#6366F1', 50, true, true, v_created_by),
    (p_household_id, 'Elektronikgeräte', '#8B5CF6', 60, true, true, v_created_by),
    (p_household_id, 'Reparaturen', '#F59E0B', 70, true, true, v_created_by),
    (p_household_id, 'Abonnements', '#A855F7', 80, true, true, v_created_by),
    (p_household_id, 'Versicherungen', '#EC4899', 90, true, true, v_created_by),
    (p_household_id, 'Einrichtung', '#14B8A6', 100, true, true, v_created_by),
    (p_household_id, 'Tanken', '#0EA5E9', 110, true, true, v_created_by),
    (p_household_id, 'Rücklagen', '#FB923C', 120, true, true, v_created_by),
    (p_household_id, 'Medikamente & Gesundheit', '#EF4444', 130, true, true, v_created_by),
    (p_household_id, 'Freizeit', '#22C55E', 140, true, true, v_created_by),
    (p_household_id, 'Kleidung', '#F472B6', 150, true, true, v_created_by),
    (p_household_id, 'Sonstiges', '#6B7280', 999, true, true, v_created_by)
  ON CONFLICT DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public.backfill_home_budget_categories(
  p_household_id uuid,
  p_created_by_user_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_created_by uuid;
BEGIN
  IF p_household_id IS NULL THEN
    RAISE EXCEPTION 'household_id fehlt';
  END IF;

  v_created_by := COALESCE(p_created_by_user_id, (SELECT auth.uid()));

  PERFORM public.seed_home_budget_categories(p_household_id, v_created_by);

  INSERT INTO public.home_budget_categories (
    household_id, name, color, sort_order, is_system, is_active, created_by_user_id
  )
  SELECT
    p_household_id,
    source.name,
    '#6B7280',
    1000 + row_number() OVER (ORDER BY lower(source.name)),
    false,
    true,
    v_created_by
  FROM (
    SELECT DISTINCT btrim(bp.kategorie) AS name
    FROM public.budget_posten bp
    WHERE bp.household_id = p_household_id
      AND nullif(btrim(bp.kategorie), '') IS NOT NULL

    UNION

    SELECT DISTINCT btrim(hbl.kategorie) AS name
    FROM public.home_budget_limits hbl
    WHERE hbl.household_id = p_household_id
      AND nullif(btrim(hbl.kategorie), '') IS NOT NULL

    UNION

    SELECT DISTINCT btrim(hbsd.kategorie) AS name
    FROM public.home_budget_split_defaults hbsd
    WHERE hbsd.household_id = p_household_id
      AND nullif(btrim(hbsd.kategorie), '') IS NOT NULL

    UNION

    SELECT DISTINCT btrim(rp.klassifikation->>'budget_kategorie') AS name
    FROM public.rechnungs_positionen rp
    WHERE rp.household_id = p_household_id
      AND nullif(btrim(rp.klassifikation->>'budget_kategorie'), '') IS NOT NULL
  ) source
  WHERE nullif(source.name, '') IS NOT NULL
  ON CONFLICT DO NOTHING;
END;
$$;

CREATE TABLE IF NOT EXISTS public.home_budget_limits (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  household_id uuid,
  kategorie  text NOT NULL,
  limit_euro numeric(10,2) NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT NOW(),
  UNIQUE(household_id, kategorie)
);

ALTER TABLE public.home_budget_limits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS home_budget_limits_own ON public.home_budget_limits;
CREATE POLICY home_budget_limits_own ON public.home_budget_limits FOR ALL
  USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);

CREATE INDEX IF NOT EXISTS idx_home_budget_limits_user ON public.home_budget_limits(user_id);
CREATE INDEX IF NOT EXISTS idx_home_budget_limits_household ON public.home_budget_limits(household_id);


-- ── home_sparziele ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.home_sparziele (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name             text NOT NULL,
  ziel_betrag      numeric(10,2) NOT NULL,
  aktueller_betrag numeric(10,2) NOT NULL DEFAULT 0,
  zieldatum        date,
  produkt_url      text,
  farbe            text DEFAULT '#10B981',
  emoji            text DEFAULT '🎯',
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


-- ── home_verlauf ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.home_verlauf (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  household_id  uuid,
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
CREATE INDEX IF NOT EXISTS idx_home_verlauf_household_created ON public.home_verlauf(household_id, created_at DESC);


-- ── home_wissen ───────────────────────────────────────────
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


-- ── haushaltsaufgaben ─────────────────────────────────────
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


-- ── vorraete (Alias-Tabelle für check-reminders) ──────────
-- Wird von der check-reminders Edge Function verwendet.
-- Spiegelt home_vorraete mit konsistenten Spaltennamen.
CREATE TABLE IF NOT EXISTS public.vorraete (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name          text NOT NULL,
  kategorie     text DEFAULT 'Haushalt',
  einheit       text DEFAULT 'Stück',
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


-- ── projekte (Alias für check-reminders) ──────────────────
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


-- ── geraete (Alias für check-reminders) ───────────────────
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

-- Check-Constraint für budget_posten.typ
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

-- user_profile: App-Modus für geräteübergreifende Synchronisation
ALTER TABLE public.user_profile
  ADD COLUMN IF NOT EXISTS app_modus text DEFAULT 'umzug';

-- user_profile: Einkaufsliste Push-Reminder
ALTER TABLE public.user_profile
  ADD COLUMN IF NOT EXISTS einkauf_reminder_aktiv        boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS einkauf_reminder_zeit         text,
  ADD COLUMN IF NOT EXISTS einkauf_reminder_letzter_versand date,
  ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'Europe/Vienna';

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

-- Speichert Web-Push-Subscriptions pro Nutzer und Gerät
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

ALTER TABLE public.push_subscriptions
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT NOW();

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
-- 9. MIGRATIONEN (für bestehende Installationen)
-- Neue Installationen können diesen Block ignorieren.
-- Er ist idempotent und schadet nicht.
-- ============================================================

-- KI-Provider-Felder hinzufügen (falls noch nicht vorhanden)
ALTER TABLE public.user_profile ADD COLUMN IF NOT EXISTS ki_provider     text DEFAULT 'openai';
ALTER TABLE public.user_profile ADD COLUMN IF NOT EXISTS ollama_base_url text;
ALTER TABLE public.user_profile ADD COLUMN IF NOT EXISTS ollama_model    text DEFAULT 'llama3.2';
ALTER TABLE public.user_profile ADD COLUMN IF NOT EXISTS kochbuch_ki_provider text NOT NULL DEFAULT 'global';
ALTER TABLE public.user_profile ADD COLUMN IF NOT EXISTS kochbuch_openai_model text;
ALTER TABLE public.user_profile ADD COLUMN IF NOT EXISTS kochbuch_ollama_model text;
ALTER TABLE public.user_profile ADD COLUMN IF NOT EXISTS kochbuch_ollama_thinking_enabled boolean NOT NULL DEFAULT false;
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

-- Migration: persönliche To-Do-Vorlagen (user_id nullable)
ALTER TABLE public.todo_vorlagen
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

-- RLS für todo_vorlagen aktualisieren
DROP POLICY IF EXISTS todo_vorlagen_read ON public.todo_vorlagen;
CREATE POLICY todo_vorlagen_read ON public.todo_vorlagen FOR SELECT TO authenticated
  USING (user_id IS NULL OR (select auth.uid()) = user_id);

DROP POLICY IF EXISTS todo_vorlagen_insert ON public.todo_vorlagen;
CREATE POLICY todo_vorlagen_insert ON public.todo_vorlagen FOR INSERT TO authenticated
  WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS todo_vorlagen_delete ON public.todo_vorlagen;
CREATE POLICY todo_vorlagen_delete ON public.todo_vorlagen FOR DELETE TO authenticated
  USING ((select auth.uid()) = user_id);

-- Migration: home_vorraete Spalten auf Originalnamen zurücksetzen (menge → bestand, mindest_menge → mindestmenge)
-- Stellt Kompatibilität mit dem Frontend sicher
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
  -- Fehlende Spalten ergänzen falls noch nicht vorhanden
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

-- pg_cron Setup (einmalig manuell ausführen nach pg_cron-Aktivierung):
-- Database → Extensions → cron → Enable (Schema: pg_catalog)
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

-- ============================================================
-- Migration: RLS Performance & Security Fixes
-- Kann auch einzeln im Supabase SQL Editor auf bestehenden Instanzen ausgeführt werden
-- ============================================================

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

-- Kfz-Stabilisierung: Die idempotenten Definitionen entsprechen
-- scripts/migration_2026_06_04_home_kfz.sql und werden fuer Neuinstallationen
-- durch die Migration am Ende des Installationsablaufs angewendet.
-- ── Avatar-Support ─────────────────────────────────────────────────────────
ALTER TABLE public.user_profile
  ADD COLUMN IF NOT EXISTS avatar_url text;

-- Öffentlicher Bucket für Profilbilder
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', TRUE)
ON CONFLICT (id) DO NOTHING;

-- RLS: Nur eigener User darf hochladen / überschreiben
DROP POLICY IF EXISTS avatars_upload ON storage.objects;
CREATE POLICY avatars_upload ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'avatars' AND (select auth.uid())::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS avatars_update ON storage.objects;
CREATE POLICY avatars_update ON storage.objects FOR UPDATE
  USING (bucket_id = 'avatars' AND (select auth.uid())::text = (storage.foldername(name))[1]);

-- RLS: Öffentliches Lesen (für <img src>)
DROP POLICY IF EXISTS avatars_public_read ON storage.objects;
CREATE POLICY avatars_public_read ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

-- ============================================================
-- 10. MULTI-USER HAUSHALT
-- Haushaltstabellen, Helfer-Funktionen, RLS und Datenmigration.
-- Basiert auf haushalt_multiuser_setup.sql (vollständig integriert).
-- ============================================================

-- ── Kern-Tabellen ─────────────────────────────────────────

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
  kochbuch_ki_provider          text NOT NULL DEFAULT 'global',
  kochbuch_openai_model         text,
  kochbuch_ollama_model         text,
  kochbuch_ollama_thinking_enabled boolean NOT NULL DEFAULT false,
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
  revoked_at   timestamptz,
  locale       text NOT NULL DEFAULT 'de' CONSTRAINT household_invites_locale_supported CHECK (locale IN ('de', 'en-GB'))
);

CREATE INDEX IF NOT EXISTS idx_household_invites_household ON public.household_invites(household_id);
CREATE INDEX IF NOT EXISTS idx_household_invites_email    ON public.household_invites(LOWER(email));
CREATE INDEX IF NOT EXISTS idx_household_invites_active   ON public.household_invites(expires_at, accepted_at, revoked_at);

-- ── Helfer-Funktionen ──────────────────────────────────────

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

-- home_budget_categories: Haushalts-FK und RLS erst nach Haushaltsfunktionen setzen.
DO $$
BEGIN
  ALTER TABLE public.home_budget_categories
    ADD COLUMN IF NOT EXISTS household_id uuid;

  DROP INDEX IF EXISTS public.idx_home_budget_categories_household_name_unique;

  UPDATE public.home_budget_categories hbc
     SET household_id = hm.household_id
    FROM public.household_members hm
   WHERE hbc.household_id IS NULL
     AND hbc.created_by_user_id = hm.user_id;

  DELETE FROM public.home_budget_categories
   WHERE household_id IS NULL;

  WITH ranked_categories AS (
    SELECT id,
           row_number() OVER (
             PARTITION BY household_id, lower(btrim(name))
             ORDER BY is_system DESC, sort_order ASC, created_at ASC, id ASC
           ) AS row_nr
      FROM public.home_budget_categories
     WHERE household_id IS NOT NULL
  )
  DELETE FROM public.home_budget_categories hbc
   USING ranked_categories rc
   WHERE rc.id = hbc.id
     AND rc.row_nr > 1;

  ALTER TABLE public.home_budget_categories
    ALTER COLUMN household_id SET NOT NULL;

  CREATE UNIQUE INDEX IF NOT EXISTS idx_home_budget_categories_household_name_unique
    ON public.home_budget_categories(household_id, lower(btrim(name)));

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'home_budget_categories_household_id_fkey'
      AND conrelid = 'public.home_budget_categories'::regclass
  ) THEN
    ALTER TABLE public.home_budget_categories
      ADD CONSTRAINT home_budget_categories_household_id_fkey
      FOREIGN KEY (household_id)
      REFERENCES public.households(id)
      ON DELETE CASCADE;
  END IF;
END $$;

DROP POLICY IF EXISTS home_budget_categories_household_member_access ON public.home_budget_categories;
DROP POLICY IF EXISTS household_member_access ON public.home_budget_categories;
CREATE POLICY home_budget_categories_household_member_access ON public.home_budget_categories FOR ALL
  USING (public.is_household_member(household_id))
  WITH CHECK (public.is_household_member(household_id));

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

  PERFORM public.seed_home_budget_categories(v_household_id, v_uid);

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

  IF v_invite.id IS NULL THEN RAISE EXCEPTION 'Einladung ungültig oder abgelaufen.'; END IF;
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
    RAISE EXCEPTION 'Nur Admin kann die Rolle übertragen.';
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
    RAISE EXCEPTION 'Admin kann den Haushalt nicht verlassen. Erst Admin übertragen oder Haushalt löschen.';
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
    RAISE EXCEPTION 'Nur Admin darf den Haushalt löschen.';
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
    RAISE EXCEPTION 'Nur Admins können Mitglieder entfernen.';
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
    RAISE EXCEPTION 'Nur Admin darf globale Haushaltseinstellungen ändern.';
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
    RAISE EXCEPTION 'Nur Admin darf KI-Einstellungen ändern.';
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

-- ── Datenmigration für bestehende Installationen ──────────

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

-- Settings für bestehende Haushalte aus Admin-Profil befüllen
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
    'home_wissen','haushaltsaufgaben','vorraete','projekte','geraete'
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

-- home_verlauf bleibt bewusst Legacy-kompatibel:
-- household_id wird backfilled und per RLS haushaltsweit sichtbar, aber nicht NOT NULL.
ALTER TABLE public.home_verlauf
  ADD COLUMN IF NOT EXISTS household_id uuid;

UPDATE public.home_verlauf hv
SET household_id = hm.household_id
FROM public.household_members hm
WHERE hv.household_id IS NULL
  AND hv.user_id = hm.user_id;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'home_verlauf_household_id_fkey'
      AND conrelid = 'public.home_verlauf'::regclass
  ) THEN
    ALTER TABLE public.home_verlauf
      ADD CONSTRAINT home_verlauf_household_id_fkey
      FOREIGN KEY (household_id)
      REFERENCES public.households(id)
      ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_home_verlauf_household_created
  ON public.home_verlauf(household_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_home_verlauf_tabelle_created
  ON public.home_verlauf(tabelle, created_at DESC);

ALTER TABLE public.home_verlauf ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS home_verlauf_own ON public.home_verlauf;
DROP POLICY IF EXISTS household_member_access ON public.home_verlauf;
DROP POLICY IF EXISTS home_verlauf_select_household_or_legacy ON public.home_verlauf;
DROP POLICY IF EXISTS home_verlauf_insert_household_or_legacy ON public.home_verlauf;
DROP POLICY IF EXISTS home_verlauf_update_own ON public.home_verlauf;
DROP POLICY IF EXISTS home_verlauf_delete_own ON public.home_verlauf;

CREATE POLICY home_verlauf_select_household_or_legacy
  ON public.home_verlauf
  FOR SELECT
  USING (
    (household_id IS NOT NULL AND public.is_household_member(household_id))
    OR (household_id IS NULL AND (SELECT auth.uid()) = user_id)
  );

CREATE POLICY home_verlauf_insert_household_or_legacy
  ON public.home_verlauf
  FOR INSERT
  WITH CHECK (
    (SELECT auth.uid()) = user_id
    AND (
      (household_id IS NOT NULL AND public.is_household_member(household_id))
      OR household_id IS NULL
    )
  );

CREATE POLICY home_verlauf_update_own
  ON public.home_verlauf
  FOR UPDATE
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK (
    (SELECT auth.uid()) = user_id
    AND (
      (household_id IS NOT NULL AND public.is_household_member(household_id))
      OR household_id IS NULL
    )
  );

CREATE POLICY home_verlauf_delete_own
  ON public.home_verlauf
  FOR DELETE
  USING ((SELECT auth.uid()) = user_id);

CREATE INDEX IF NOT EXISTS idx_budget_posten_scope
  ON public.budget_posten(household_id, budget_scope, datum);
CREATE INDEX IF NOT EXISTS idx_budget_posten_bewohner_scope
  ON public.budget_posten(household_id, bewohner_id, budget_scope, datum);
CREATE INDEX IF NOT EXISTS idx_budget_posten_active_household_datum
  ON public.budget_posten(household_id, archived_at, datum);

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
-- home_budget_limits: Unique-Constraint von user_id → household_id
DO $$
BEGIN
  ALTER TABLE public.home_budget_limits
    ADD COLUMN IF NOT EXISTS household_id uuid;

  UPDATE public.home_budget_limits hbl
     SET household_id = hm.household_id
    FROM public.household_members hm
   WHERE hbl.household_id IS NULL
     AND hm.user_id = hbl.user_id;

  DELETE FROM public.home_budget_limits hbl
   WHERE hbl.household_id IS NULL;

  WITH ranked_limits AS (
    SELECT id,
           row_number() OVER (
             PARTITION BY household_id, kategorie
             ORDER BY created_at DESC NULLS LAST, id DESC
           ) AS row_nr
      FROM public.home_budget_limits
     WHERE household_id IS NOT NULL
  )
  DELETE FROM public.home_budget_limits hbl
   USING ranked_limits rl
   WHERE rl.id = hbl.id
     AND rl.row_nr > 1;

  ALTER TABLE public.home_budget_limits
    ALTER COLUMN household_id SET NOT NULL;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'home_budget_limits_household_id_fkey'
      AND conrelid = 'public.home_budget_limits'::regclass
  ) THEN
    ALTER TABLE public.home_budget_limits
      ADD CONSTRAINT home_budget_limits_household_id_fkey
      FOREIGN KEY (household_id) REFERENCES public.households(id) ON DELETE CASCADE;
  END IF;

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

CREATE INDEX IF NOT EXISTS idx_home_budget_limits_household
  ON public.home_budget_limits(household_id);
DROP INDEX IF EXISTS public.idx_home_budget_limits_household_id;
DROP INDEX IF EXISTS public.idx_home_finanzkonten_household_id;

DROP POLICY IF EXISTS home_budget_limits_own ON public.home_budget_limits;
DROP POLICY IF EXISTS household_member_access ON public.home_budget_limits;
CREATE POLICY household_member_access ON public.home_budget_limits FOR ALL
  USING (public.is_household_member(household_id))
  WITH CHECK (public.is_household_member(household_id));

-- ── Insert/Update-Helfer für alte Frontend-Payloads ────────

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
    'home_wissen','haushaltsaufgaben','vorraete','projekte','geraete'
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

-- ── RLS für Haushalts-Verwaltungstabellen ─────────────────
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
--   Nur EINE permissive SELECT-Policy → household_member_read_members (FOR SELECT)
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
--   FOR ALL erzeugt doppeltes SELECT → aufgeteilt in SELECT + INSERT/UPDATE/DELETE.
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

-- ── Sync: Admin user_profile → household_settings ─────────

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
  ADD COLUMN IF NOT EXISTS kochbuch_ki_provider text NOT NULL DEFAULT 'global',
  ADD COLUMN IF NOT EXISTS kochbuch_openai_model text,
  ADD COLUMN IF NOT EXISTS kochbuch_ollama_model text,
  ADD COLUMN IF NOT EXISTS kochbuch_ollama_thinking_enabled boolean NOT NULL DEFAULT false;
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
  ADD COLUMN IF NOT EXISTS household_id      uuid REFERENCES public.households(id) ON DELETE CASCADE,
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
  ADD COLUMN IF NOT EXISTS household_id uuid REFERENCES public.households(id) ON DELETE CASCADE,
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

CREATE OR REPLACE FUNCTION public.save_budget_invoice_positions(
  p_rechnung_id uuid,
  p_positionen jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_payload_count int;
  v_distinct_count int;
  v_updated_count int;
  v_brutto numeric(12,2);
BEGIN
  IF p_rechnung_id IS NULL THEN
    RAISE EXCEPTION 'rechnung_id fehlt';
  END IF;

  IF p_positionen IS NULL OR jsonb_typeof(p_positionen) <> 'array' OR jsonb_array_length(p_positionen) = 0 THEN
    RAISE EXCEPTION 'Mindestens eine Position ist erforderlich';
  END IF;

  WITH payload AS (
    SELECT
      (entry->>'id')::uuid AS id,
      btrim(COALESCE(entry->>'beschreibung', '')) AS beschreibung,
      NULLIF(entry->>'menge', '')::numeric(12,3) AS menge,
      NULLIF(btrim(COALESCE(entry->>'einheit', '')), '') AS einheit,
      NULLIF(entry->>'einzelpreis', '')::numeric(12,2) AS einzelpreis,
      NULLIF(entry->>'gesamtpreis', '')::numeric(12,2) AS gesamtpreis,
      NULLIF(entry->>'ust_satz', '')::numeric(5,2) AS ust_satz,
      CASE
        WHEN jsonb_typeof(entry->'klassifikation') = 'object' THEN entry->'klassifikation'
        ELSE '{}'::jsonb
      END AS klassifikation
    FROM jsonb_array_elements(p_positionen) AS entry
  )
  SELECT count(*), count(DISTINCT id)
    INTO v_payload_count, v_distinct_count
    FROM payload;

  IF v_payload_count = 0 OR v_payload_count <> v_distinct_count THEN
    RAISE EXCEPTION 'Ungueltige oder doppelte Positions-IDs';
  END IF;

  IF EXISTS (
    WITH payload AS (
      SELECT
        (entry->>'id')::uuid AS id,
        btrim(COALESCE(entry->>'beschreibung', '')) AS beschreibung
      FROM jsonb_array_elements(p_positionen) AS entry
    )
    SELECT 1
    FROM payload
    WHERE id IS NULL OR beschreibung = ''
  ) THEN
    RAISE EXCEPTION 'Jede Position braucht eine gueltige ID und Beschreibung';
  END IF;

  IF (
    WITH payload AS (
      SELECT (entry->>'id')::uuid AS id
      FROM jsonb_array_elements(p_positionen) AS entry
    )
    SELECT count(*)
    FROM public.rechnungs_positionen rp
    JOIN payload p ON p.id = rp.id
    WHERE rp.rechnung_id = p_rechnung_id
  ) <> v_payload_count THEN
    RAISE EXCEPTION 'Mindestens eine Position gehoert nicht zu dieser Rechnung';
  END IF;

  WITH payload AS (
    SELECT
      (entry->>'id')::uuid AS id,
      btrim(COALESCE(entry->>'beschreibung', '')) AS beschreibung,
      NULLIF(entry->>'menge', '')::numeric(12,3) AS menge,
      NULLIF(btrim(COALESCE(entry->>'einheit', '')), '') AS einheit,
      NULLIF(entry->>'einzelpreis', '')::numeric(12,2) AS einzelpreis,
      NULLIF(entry->>'gesamtpreis', '')::numeric(12,2) AS gesamtpreis,
      NULLIF(entry->>'ust_satz', '')::numeric(5,2) AS ust_satz,
      CASE
        WHEN jsonb_typeof(entry->'klassifikation') = 'object' THEN entry->'klassifikation'
        ELSE '{}'::jsonb
      END AS klassifikation
    FROM jsonb_array_elements(p_positionen) AS entry
  ),
  updated AS (
    UPDATE public.rechnungs_positionen rp
       SET beschreibung = payload.beschreibung,
           menge = payload.menge,
           einheit = payload.einheit,
           einzelpreis = payload.einzelpreis,
           gesamtpreis = payload.gesamtpreis,
           ust_satz = payload.ust_satz,
           klassifikation = payload.klassifikation
      FROM payload
     WHERE rp.id = payload.id
       AND rp.rechnung_id = p_rechnung_id
    RETURNING rp.id
  )
  SELECT count(*) INTO v_updated_count FROM updated;

  IF v_updated_count <> v_payload_count THEN
    RAISE EXCEPTION 'Nicht alle Positionen konnten gespeichert werden';
  END IF;

  SELECT COALESCE(ROUND(SUM(COALESCE(gesamtpreis, 0))::numeric, 2), 0)::numeric(12,2)
    INTO v_brutto
    FROM public.rechnungs_positionen
   WHERE rechnung_id = p_rechnung_id;

  UPDATE public.rechnungen
     SET brutto = v_brutto
   WHERE id = p_rechnung_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Rechnung nicht gefunden';
  END IF;

  RETURN jsonb_build_object(
    'brutto', v_brutto,
    'updated_positions', v_updated_count
  );
END;
$$;


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

ALTER TABLE public.home_wissen
  ADD COLUMN IF NOT EXISTS summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS localized_content jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS source_locale text NOT NULL DEFAULT 'de';

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'home_wissen_source_locale_check'
      AND conrelid = 'public.home_wissen'::regclass
  ) THEN
    ALTER TABLE public.home_wissen
      ADD CONSTRAINT home_wissen_source_locale_check
      CHECK (source_locale IN ('de', 'en-GB'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_home_wissen_localized_content_gin
  ON public.home_wissen USING gin (localized_content);

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
-- 15. PUSH-REMINDER-STATE
-- Generischer Wiederholschutz fuer geplante Push-Erinnerungen.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.home_push_reminder_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  recipient_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  reminder_type text NOT NULL,
  reminder_key text NOT NULL,
  period_key text NOT NULL,
  last_value jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_sent_at timestamptz NOT NULL DEFAULT now(),
  delivery_status text NOT NULL DEFAULT 'sent'
    CHECK (delivery_status IN ('pending', 'sent')),
  reserved_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.home_push_reminder_state
  ADD COLUMN IF NOT EXISTS delivery_status text NOT NULL DEFAULT 'sent',
  ADD COLUMN IF NOT EXISTS reserved_at timestamptz NOT NULL DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS idx_home_push_reminder_state_unique
  ON public.home_push_reminder_state (
    household_id,
    recipient_user_id,
    entity_type,
    entity_id,
    reminder_type,
    reminder_key,
    period_key
  );

CREATE INDEX IF NOT EXISTS idx_home_push_reminder_state_household_sent
  ON public.home_push_reminder_state (household_id, last_sent_at DESC);

CREATE INDEX IF NOT EXISTS idx_home_push_reminder_state_pending
  ON public.home_push_reminder_state (delivery_status, reserved_at)
  WHERE delivery_status = 'pending';

DROP TRIGGER IF EXISTS set_home_push_reminder_state_updated_at ON public.home_push_reminder_state;
CREATE TRIGGER set_home_push_reminder_state_updated_at
  BEFORE UPDATE ON public.home_push_reminder_state
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.home_push_reminder_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS home_push_reminder_state_household_member_access ON public.home_push_reminder_state;
-- No authenticated-client policy: only service-role reminder workers may mutate
-- delivery reservations and dedupe state.

CREATE INDEX IF NOT EXISTS idx_home_geraete_garantie_bis
  ON public.home_geraete (household_id, garantie_bis);

CREATE INDEX IF NOT EXISTS idx_home_geraete_gewaehrleistung_bis
  ON public.home_geraete (household_id, gewaehrleistung_bis);

CREATE INDEX IF NOT EXISTS idx_versicherungs_polizzen_naechste_faelligkeit
  ON public.versicherungs_polizzen (household_id, naechste_faelligkeit);

-- ============================================================
-- 16. HOME ORGANIZER KOCHBUCH / RECIPE IMPORT
-- Spiegel von scripts/migration_2026_05_02_home_kochbuch.sql fuer frische Installationen.
-- ============================================================
-- Home Organizer Kochbuch: Rezepte, Zutaten, Importjobs und Settings
-- Idempotent fuer bestehende Self-Hosted Installationen.

CREATE TABLE IF NOT EXISTS public.home_rezepte (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  titel text NOT NULL,
  beschreibung text,
  quelle_url text,
  quelle_plattform text,
  quelle_titel text,
  quelle_uploader text,
  thumbnail_url text,
  thumbnail_storage_path text,
  video_dauer_sekunden integer,

  import_typ text NOT NULL DEFAULT 'manuell',
  analyse_modus text NOT NULL DEFAULT 'web',

  sprache text DEFAULT 'de',
  original_sprache text,
  original_sprache_label text,
  original_sprache_confidence numeric(4,3),
  ziel_locale text DEFAULT 'de',
  wurde_uebersetzt boolean NOT NULL DEFAULT false,
  localized_content jsonb NOT NULL DEFAULT '{}'::jsonb,

  standort text DEFAULT 'Wien, Österreich',
  confidence numeric(4,3),
  gruppe text,

  portionen integer DEFAULT 4,
  vorbereitungszeit_minuten integer,
  kochzeit_minuten integer,
  gesamtzeit_minuten integer,

  kosten_min numeric(10,2),
  kosten_max numeric(10,2),
  waehrung text DEFAULT 'EUR',

  kalorien_gesamt numeric(10,2),
  protein_gesamt_g numeric(10,2),
  kohlenhydrate_gesamt_g numeric(10,2),
  fett_gesamt_g numeric(10,2),
  kalorien_pro_portion numeric(10,2),
  protein_pro_portion_g numeric(10,2),
  kohlenhydrate_pro_portion_g numeric(10,2),
  fett_pro_portion_g numeric(10,2),

  anleitung jsonb NOT NULL DEFAULT '[]'::jsonb,
  equipment jsonb NOT NULL DEFAULT '[]'::jsonb,
  ersatzoptionen jsonb NOT NULL DEFAULT '{}'::jsonb,
  notizen text,
  tags text[] DEFAULT '{}',

  favorisiert boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'review',

  raw_import_result jsonb NOT NULL DEFAULT '{}'::jsonb,
  warnings jsonb NOT NULL DEFAULT '[]'::jsonb,
  wissen_id uuid,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.home_rezepte
  DROP CONSTRAINT IF EXISTS home_rezepte_import_typ_check,
  ADD CONSTRAINT home_rezepte_import_typ_check
    CHECK (import_typ IN ('video', 'manuell', 'ki', 'web'));

ALTER TABLE public.home_rezepte
  DROP CONSTRAINT IF EXISTS home_rezepte_analyse_modus_check,
  ADD CONSTRAINT home_rezepte_analyse_modus_check
    CHECK (analyse_modus IN ('web', 'metadata', 'transcript', 'combined'));

ALTER TABLE public.home_rezepte
  DROP CONSTRAINT IF EXISTS home_rezepte_status_check,
  ADD CONSTRAINT home_rezepte_status_check
    CHECK (status IN ('review', 'gespeichert', 'archiviert', 'fehler'));

CREATE TABLE IF NOT EXISTS public.home_rezept_zutaten (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rezept_id uuid NOT NULL REFERENCES public.home_rezepte(id) ON DELETE CASCADE,
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,

  name text NOT NULL,
  normalized_name text,
  kategorie text DEFAULT 'Lebensmittel',
  menge numeric(10,2),
  einheit text,
  menge_text text,
  original_text text,
  geschaetzt boolean NOT NULL DEFAULT false,
  confidence numeric(4,3),

  kosten_min numeric(10,2),
  kosten_max numeric(10,2),
  waehrung text DEFAULT 'EUR',
  kalorien numeric(10,2),
  protein_g numeric(10,2),
  kohlenhydrate_g numeric(10,2),
  fett_g numeric(10,2),

  matched_vorrat_id uuid REFERENCES public.home_vorraete(id) ON DELETE SET NULL,
  einkauf_noetig boolean NOT NULL DEFAULT false,
  einkaufsliste_id uuid REFERENCES public.home_einkaufliste(id) ON DELETE SET NULL,

  sortierung integer DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.home_rezept_import_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  quelle_url text NOT NULL,
  quelle_plattform text,
  standort text DEFAULT 'Wien, Österreich',
  sprache text DEFAULT 'de',
  original_sprache text,
  ziel_locale text DEFAULT 'de',
  wurde_uebersetzt boolean NOT NULL DEFAULT false,
  analyse_modus text NOT NULL DEFAULT 'combined',

  status text NOT NULL DEFAULT 'queued',
  progress integer NOT NULL DEFAULT 0,
  progress_message text,
  error_message text,

  result_rezept_id uuid REFERENCES public.home_rezepte(id) ON DELETE SET NULL,
  transcription_engine text,
  transcription_model text,
  transcription_device text,
  transcription_compute_type text,
  transcription_fallback_used boolean NOT NULL DEFAULT false,
  transcription_warnings jsonb NOT NULL DEFAULT '[]'::jsonb,

  raw_web_extract jsonb,
  raw_metadata jsonb,
  raw_transcript text,
  raw_ai_result jsonb,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);

ALTER TABLE public.home_rezept_import_jobs
  DROP CONSTRAINT IF EXISTS home_rezept_import_jobs_analyse_modus_check,
  ADD CONSTRAINT home_rezept_import_jobs_analyse_modus_check
    CHECK (analyse_modus IN ('web', 'metadata', 'transcript', 'combined'));

ALTER TABLE public.home_rezept_import_jobs
  DROP CONSTRAINT IF EXISTS home_rezept_import_jobs_status_check,
  ADD CONSTRAINT home_rezept_import_jobs_status_check
    CHECK (status IN (
      'queued', 'web_extract', 'metadata', 'download', 'audio_extract',
      'transcribe', 'fallback_transcribe', 'ai_extract',
      'needs_openai_fallback_confirmation', 'review', 'done', 'failed'
    ));

ALTER TABLE public.home_wissen
  ADD COLUMN IF NOT EXISTS rezept_id uuid REFERENCES public.home_rezepte(id) ON DELETE SET NULL;

ALTER TABLE public.home_rezepte
  ADD COLUMN IF NOT EXISTS gruppe text;

ALTER TABLE public.home_rezepte
  ADD COLUMN IF NOT EXISTS thumbnail_storage_path text;

ALTER TABLE public.home_einkaufliste
  ADD COLUMN IF NOT EXISTS localized_content jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.household_settings
  ADD COLUMN IF NOT EXISTS kochbuch_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS kochbuch_video_import_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS kochbuch_daily_web_import_limit integer NOT NULL DEFAULT 20,
  ADD COLUMN IF NOT EXISTS kochbuch_daily_video_import_limit integer NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS kochbuch_default_location text DEFAULT 'Wien, Österreich',
  ADD COLUMN IF NOT EXISTS kochbuch_default_analyse_modus text NOT NULL DEFAULT 'combined',
  ADD COLUMN IF NOT EXISTS kochbuch_extract_costs boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS kochbuch_extract_macros boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS kochbuch_use_moderation boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS kochbuch_ai_model text NOT NULL DEFAULT 'gpt-4o-mini',
  ADD COLUMN IF NOT EXISTS kochbuch_ki_provider text NOT NULL DEFAULT 'global',
  ADD COLUMN IF NOT EXISTS kochbuch_openai_model text,
  ADD COLUMN IF NOT EXISTS kochbuch_ollama_model text,
  ADD COLUMN IF NOT EXISTS kochbuch_ollama_thinking_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS kochbuch_auto_translate boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS kochbuch_supported_target_locales text[] NOT NULL DEFAULT ARRAY['de','en-GB'],
  ADD COLUMN IF NOT EXISTS kochbuch_transcription_provider text NOT NULL DEFAULT 'local_auto_fallback_openai',
  ADD COLUMN IF NOT EXISTS kochbuch_local_whisper_model text NOT NULL DEFAULT 'small',
  ADD COLUMN IF NOT EXISTS kochbuch_whisper_device text NOT NULL DEFAULT 'auto',
  ADD COLUMN IF NOT EXISTS kochbuch_whisper_cpu_compute_type text NOT NULL DEFAULT 'int8',
  ADD COLUMN IF NOT EXISTS kochbuch_whisper_gpu_compute_type text NOT NULL DEFAULT 'float16',
  ADD COLUMN IF NOT EXISTS kochbuch_whisper_cpp_fallback_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS kochbuch_openai_transcription_fallback_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS kochbuch_openai_transcription_model text NOT NULL DEFAULT 'gpt-4o-mini-transcribe',
  ADD COLUMN IF NOT EXISTS kochbuch_max_video_minutes integer NOT NULL DEFAULT 30;

ALTER TABLE public.household_settings
  DROP CONSTRAINT IF EXISTS household_settings_kochbuch_default_analyse_modus_check,
  ADD CONSTRAINT household_settings_kochbuch_default_analyse_modus_check
    CHECK (kochbuch_default_analyse_modus IN ('web', 'metadata', 'transcript', 'combined'));

ALTER TABLE public.household_settings
  DROP CONSTRAINT IF EXISTS household_settings_kochbuch_ki_provider_check,
  ADD CONSTRAINT household_settings_kochbuch_ki_provider_check
    CHECK (kochbuch_ki_provider IN ('global', 'openai', 'ollama'));

ALTER TABLE public.user_profile
  ADD COLUMN IF NOT EXISTS kochbuch_ki_provider text NOT NULL DEFAULT 'global',
  ADD COLUMN IF NOT EXISTS kochbuch_openai_model text,
  ADD COLUMN IF NOT EXISTS kochbuch_ollama_model text,
  ADD COLUMN IF NOT EXISTS kochbuch_ollama_thinking_enabled boolean NOT NULL DEFAULT false;

ALTER TABLE public.user_profile
  DROP CONSTRAINT IF EXISTS user_profile_kochbuch_ki_provider_check,
  ADD CONSTRAINT user_profile_kochbuch_ki_provider_check
    CHECK (kochbuch_ki_provider IN ('global', 'openai', 'ollama'));

DROP FUNCTION IF EXISTS public.set_household_kochbuch_limits(integer, integer);
CREATE OR REPLACE FUNCTION public.set_household_kochbuch_limits(
  p_daily_web_import_limit integer,
  p_daily_video_import_limit integer
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
    RAISE EXCEPTION 'Nur Admin darf Kochbuch-Einstellungen aendern.';
  END IF;

  INSERT INTO public.household_settings (
    household_id,
    kochbuch_daily_web_import_limit,
    kochbuch_daily_video_import_limit
  )
  VALUES (
    v_household_id,
    GREATEST(0, LEAST(1000, COALESCE(p_daily_web_import_limit, 20))),
    GREATEST(0, LEAST(1000, COALESCE(p_daily_video_import_limit, 5)))
  )
  ON CONFLICT (household_id) DO UPDATE
  SET kochbuch_daily_web_import_limit = EXCLUDED.kochbuch_daily_web_import_limit,
      kochbuch_daily_video_import_limit = EXCLUDED.kochbuch_daily_video_import_limit,
      updated_at = NOW();
END;
$$;

DROP FUNCTION IF EXISTS public.set_household_kochbuch_ai_settings(text, text, text);
DROP FUNCTION IF EXISTS public.set_household_kochbuch_ai_settings(text, text, text, text, text);
DROP FUNCTION IF EXISTS public.set_household_kochbuch_ai_settings(text, text, text, text, text, boolean);
CREATE OR REPLACE FUNCTION public.set_household_kochbuch_ai_settings(
  p_kochbuch_ki_provider text,
  p_kochbuch_openai_model text,
  p_kochbuch_ollama_model text,
  p_ollama_base_url text DEFAULT NULL,
  p_ollama_model text DEFAULT NULL,
  p_kochbuch_ollama_thinking_enabled boolean DEFAULT false
)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
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
    RAISE EXCEPTION 'Nur Admin darf Kochbuch-Einstellungen ändern.';
  END IF;

  INSERT INTO public.household_settings (
    household_id,
    kochbuch_ki_provider,
    kochbuch_openai_model,
    kochbuch_ollama_model,
    kochbuch_ollama_thinking_enabled,
    ollama_base_url,
    ollama_model,
    updated_by
  )
  VALUES (
    v_household_id,
    COALESCE(NULLIF(BTRIM(p_kochbuch_ki_provider), ''), 'global'),
    NULLIF(BTRIM(p_kochbuch_openai_model), ''),
    NULLIF(BTRIM(p_kochbuch_ollama_model), ''),
    COALESCE(p_kochbuch_ollama_thinking_enabled, false),
    NULLIF(BTRIM(p_ollama_base_url), ''),
    COALESCE(NULLIF(BTRIM(p_ollama_model), ''), NULLIF(BTRIM(p_kochbuch_ollama_model), ''), 'llama3.2'),
    auth.uid()
  )
  ON CONFLICT (household_id) DO UPDATE
  SET kochbuch_ki_provider = EXCLUDED.kochbuch_ki_provider,
      kochbuch_openai_model = EXCLUDED.kochbuch_openai_model,
      kochbuch_ollama_model = EXCLUDED.kochbuch_ollama_model,
      kochbuch_ollama_thinking_enabled = EXCLUDED.kochbuch_ollama_thinking_enabled,
      ollama_base_url = COALESCE(EXCLUDED.ollama_base_url, public.household_settings.ollama_base_url),
      ollama_model = COALESCE(EXCLUDED.ollama_model, public.household_settings.ollama_model),
      updated_by = auth.uid(),
      updated_at = NOW();

  RETURN true;
END;
$$;

ALTER TABLE public.home_einkaufliste
  DROP CONSTRAINT IF EXISTS home_einkaufliste_quelle_check,
  ADD CONSTRAINT home_einkaufliste_quelle_check
    CHECK (quelle IN ('manuell','ki','vorrat','kochbuch'));

CREATE INDEX IF NOT EXISTS idx_home_rezepte_household_id ON public.home_rezepte(household_id);
CREATE INDEX IF NOT EXISTS idx_home_rezepte_user_id ON public.home_rezepte(user_id);
CREATE INDEX IF NOT EXISTS idx_home_rezepte_status ON public.home_rezepte(status);
CREATE INDEX IF NOT EXISTS idx_home_rezepte_quelle_plattform ON public.home_rezepte(quelle_plattform);
CREATE INDEX IF NOT EXISTS idx_home_rezepte_created_at ON public.home_rezepte(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_home_rezepte_tags ON public.home_rezepte USING gin(tags);
CREATE INDEX IF NOT EXISTS idx_home_rezepte_gruppe ON public.home_rezepte(gruppe);
CREATE INDEX IF NOT EXISTS idx_home_rezepte_thumbnail_storage_path
  ON public.home_rezepte(thumbnail_storage_path)
  WHERE thumbnail_storage_path IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_home_rezept_zutaten_rezept_id ON public.home_rezept_zutaten(rezept_id);
CREATE INDEX IF NOT EXISTS idx_home_rezept_zutaten_household_id ON public.home_rezept_zutaten(household_id);
CREATE INDEX IF NOT EXISTS idx_home_rezept_zutaten_normalized_name ON public.home_rezept_zutaten(normalized_name);
CREATE INDEX IF NOT EXISTS idx_home_rezept_import_jobs_household_id ON public.home_rezept_import_jobs(household_id);
CREATE INDEX IF NOT EXISTS idx_home_rezept_import_jobs_status ON public.home_rezept_import_jobs(status);
CREATE INDEX IF NOT EXISTS idx_home_rezept_import_jobs_created_at ON public.home_rezept_import_jobs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_home_wissen_rezept_id ON public.home_wissen(rezept_id);
CREATE INDEX IF NOT EXISTS idx_home_einkaufliste_localized_content ON public.home_einkaufliste USING gin(localized_content);

DROP TRIGGER IF EXISTS set_home_rezepte_updated_at ON public.home_rezepte;
CREATE TRIGGER set_home_rezepte_updated_at
  BEFORE UPDATE ON public.home_rezepte
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_home_rezept_import_jobs_updated_at ON public.home_rezept_import_jobs;
CREATE TRIGGER set_home_rezept_import_jobs_updated_at
  BEFORE UPDATE ON public.home_rezept_import_jobs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.home_rezepte ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.home_rezept_zutaten ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.home_rezept_import_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS home_rezepte_household_select ON public.home_rezepte;
CREATE POLICY home_rezepte_household_select ON public.home_rezepte
  FOR SELECT USING (public.is_household_member(household_id));
DROP POLICY IF EXISTS home_rezepte_household_insert ON public.home_rezepte;
CREATE POLICY home_rezepte_household_insert ON public.home_rezepte
  FOR INSERT WITH CHECK (public.is_household_member(household_id));
DROP POLICY IF EXISTS home_rezepte_household_update ON public.home_rezepte;
CREATE POLICY home_rezepte_household_update ON public.home_rezepte
  FOR UPDATE USING (public.is_household_member(household_id))
  WITH CHECK (public.is_household_member(household_id));
DROP POLICY IF EXISTS home_rezepte_household_delete ON public.home_rezepte;
CREATE POLICY home_rezepte_household_delete ON public.home_rezepte
  FOR DELETE USING (public.is_household_member(household_id));

DROP POLICY IF EXISTS home_rezept_zutaten_household_select ON public.home_rezept_zutaten;
CREATE POLICY home_rezept_zutaten_household_select ON public.home_rezept_zutaten
  FOR SELECT USING (public.is_household_member(household_id));
DROP POLICY IF EXISTS home_rezept_zutaten_household_insert ON public.home_rezept_zutaten;
CREATE POLICY home_rezept_zutaten_household_insert ON public.home_rezept_zutaten
  FOR INSERT WITH CHECK (public.is_household_member(household_id));
DROP POLICY IF EXISTS home_rezept_zutaten_household_update ON public.home_rezept_zutaten;
CREATE POLICY home_rezept_zutaten_household_update ON public.home_rezept_zutaten
  FOR UPDATE USING (public.is_household_member(household_id))
  WITH CHECK (public.is_household_member(household_id));
DROP POLICY IF EXISTS home_rezept_zutaten_household_delete ON public.home_rezept_zutaten;
CREATE POLICY home_rezept_zutaten_household_delete ON public.home_rezept_zutaten
  FOR DELETE USING (public.is_household_member(household_id));

DROP POLICY IF EXISTS home_rezept_import_jobs_household_select ON public.home_rezept_import_jobs;
CREATE POLICY home_rezept_import_jobs_household_select ON public.home_rezept_import_jobs
  FOR SELECT USING (public.is_household_member(household_id));
DROP POLICY IF EXISTS home_rezept_import_jobs_household_insert ON public.home_rezept_import_jobs;
CREATE POLICY home_rezept_import_jobs_household_insert ON public.home_rezept_import_jobs
  FOR INSERT WITH CHECK (public.is_household_member(household_id));
DROP POLICY IF EXISTS home_rezept_import_jobs_household_update ON public.home_rezept_import_jobs;
CREATE POLICY home_rezept_import_jobs_household_update ON public.home_rezept_import_jobs
  FOR UPDATE USING (public.is_household_member(household_id))
  WITH CHECK (public.is_household_member(household_id));
DROP POLICY IF EXISTS home_rezept_import_jobs_household_delete ON public.home_rezept_import_jobs;
CREATE POLICY home_rezept_import_jobs_household_delete ON public.home_rezept_import_jobs
  FOR DELETE USING (public.is_household_member(household_id));

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'recipe-images', 'recipe-images', false, 5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS recipe_images_household_select ON storage.objects;
CREATE POLICY recipe_images_household_select ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'recipe-images'
  AND EXISTS (
    SELECT 1 FROM public.household_members hm
    WHERE hm.user_id = (SELECT auth.uid())
      AND hm.household_id::text = (storage.foldername(name))[1]
  )
);

DROP POLICY IF EXISTS recipe_images_household_insert ON storage.objects;
CREATE POLICY recipe_images_household_insert ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'recipe-images'
  AND EXISTS (
    SELECT 1 FROM public.household_members hm
    WHERE hm.user_id = (SELECT auth.uid())
      AND hm.household_id::text = (storage.foldername(name))[1]
  )
);

DROP POLICY IF EXISTS recipe_images_household_update ON storage.objects;
CREATE POLICY recipe_images_household_update ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'recipe-images'
  AND EXISTS (
    SELECT 1 FROM public.household_members hm
    WHERE hm.user_id = (SELECT auth.uid())
      AND hm.household_id::text = (storage.foldername(name))[1]
  )
)
WITH CHECK (
  bucket_id = 'recipe-images'
  AND EXISTS (
    SELECT 1 FROM public.household_members hm
    WHERE hm.user_id = (SELECT auth.uid())
      AND hm.household_id::text = (storage.foldername(name))[1]
  )
);

DROP POLICY IF EXISTS recipe_images_household_delete ON storage.objects;
CREATE POLICY recipe_images_household_delete ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'recipe-images'
  AND EXISTS (
    SELECT 1 FROM public.household_members hm
    WHERE hm.user_id = (SELECT auth.uid())
      AND hm.household_id::text = (storage.foldername(name))[1]
  )
);

SELECT pg_notify('pgrst', 'reload schema');

-- =====================================================
-- Home Organizer Kochbuch: Essensplaner
-- Spiegel von scripts/migration_2026_05_10_home_rezept_plan.sql fuer frische Installationen.
-- =====================================================

CREATE TABLE IF NOT EXISTS public.home_rezept_plan (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rezept_id uuid NOT NULL REFERENCES public.home_rezepte(id) ON DELETE CASCADE,

  planned_date date NOT NULL,
  meal_slot text NOT NULL,
  portionen integer,
  notizen text,
  sort_order integer NOT NULL DEFAULT 0,

  series_id uuid,
  recurrence_frequency text NOT NULL DEFAULT 'none',
  recurrence_until date,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.home_rezept_plan
  DROP CONSTRAINT IF EXISTS home_rezept_plan_meal_slot_check,
  ADD CONSTRAINT home_rezept_plan_meal_slot_check
    CHECK (meal_slot IN ('breakfast', 'lunch', 'dinner', 'snack'));

ALTER TABLE public.home_rezept_plan
  DROP CONSTRAINT IF EXISTS home_rezept_plan_recurrence_frequency_check,
  ADD CONSTRAINT home_rezept_plan_recurrence_frequency_check
    CHECK (recurrence_frequency IN ('none', 'weekly'));

CREATE INDEX IF NOT EXISTS idx_home_rezept_plan_household_id ON public.home_rezept_plan(household_id);
CREATE INDEX IF NOT EXISTS idx_home_rezept_plan_user_id ON public.home_rezept_plan(user_id);
CREATE INDEX IF NOT EXISTS idx_home_rezept_plan_planned_date ON public.home_rezept_plan(planned_date);
CREATE INDEX IF NOT EXISTS idx_home_rezept_plan_rezept_id ON public.home_rezept_plan(rezept_id);
CREATE INDEX IF NOT EXISTS idx_home_rezept_plan_series_id ON public.home_rezept_plan(series_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_home_rezept_plan_unique_recipe_slot
  ON public.home_rezept_plan(household_id, planned_date, meal_slot, rezept_id);

DROP TRIGGER IF EXISTS set_home_rezept_plan_updated_at ON public.home_rezept_plan;
CREATE TRIGGER set_home_rezept_plan_updated_at
  BEFORE UPDATE ON public.home_rezept_plan
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.home_rezept_plan ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS home_rezept_plan_household_select ON public.home_rezept_plan;
CREATE POLICY home_rezept_plan_household_select ON public.home_rezept_plan
  FOR SELECT USING (public.is_household_member(household_id));

DROP POLICY IF EXISTS home_rezept_plan_household_insert ON public.home_rezept_plan;
CREATE POLICY home_rezept_plan_household_insert ON public.home_rezept_plan
  FOR INSERT WITH CHECK (public.is_household_member(household_id));

DROP POLICY IF EXISTS home_rezept_plan_household_update ON public.home_rezept_plan;
CREATE POLICY home_rezept_plan_household_update ON public.home_rezept_plan
  FOR UPDATE USING (public.is_household_member(household_id))
  WITH CHECK (public.is_household_member(household_id));

DROP POLICY IF EXISTS home_rezept_plan_household_delete ON public.home_rezept_plan;
CREATE POLICY home_rezept_plan_household_delete ON public.home_rezept_plan
  FOR DELETE USING (public.is_household_member(household_id));

SELECT pg_notify('pgrst', 'reload schema');

-- =====================================================
-- Home Organizer: Heimapotheke
-- Spiegel von scripts/migration_2026_05_13_home_heimapotheke.sql fuer frische Installationen.
-- =====================================================

CREATE TABLE IF NOT EXISTS public.home_medikamente (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  household_id uuid REFERENCES public.households(id) ON DELETE CASCADE,
  name text NOT NULL,
  wirkstoff text,
  darreichungsform text,
  packungsgroesse text,
  bestand numeric(10,2) NOT NULL DEFAULT 1,
  mindestbestand numeric(10,2) NOT NULL DEFAULT 1,
  ablaufdatum date,
  lagerort text,
  kategorie text,
  notizen text,
  kaufdatum date,
  preis numeric(10,2),
  haendler text,
  rechnung_id uuid REFERENCES public.rechnungen(id) ON DELETE SET NULL,
  rechnung_dokument_id uuid REFERENCES public.dokumente(id) ON DELETE SET NULL,
  beipackzettel_dokument_id uuid REFERENCES public.dokumente(id) ON DELETE SET NULL,
  beipackzettel_url text,
  offizielle_quelle text,
  source_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.home_medikament_beipackzettel_analysen (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  medikament_id uuid NOT NULL REFERENCES public.home_medikamente(id) ON DELETE CASCADE,
  household_id uuid REFERENCES public.households(id) ON DELETE CASCADE,
  dokument_id uuid REFERENCES public.dokumente(id) ON DELETE SET NULL,
  source_url text,
  source_hash text,
  analyse_status text NOT NULL DEFAULT 'pending',
  summary_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  model text,
  analysiert_am timestamptz,
  fehler text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_home_medikamente_household_name
  ON public.home_medikamente (household_id, lower(name));
CREATE INDEX IF NOT EXISTS idx_home_medikamente_user_id
  ON public.home_medikamente (user_id);
CREATE INDEX IF NOT EXISTS idx_home_medikamente_wirkstoff
  ON public.home_medikamente (household_id, lower(wirkstoff));
CREATE INDEX IF NOT EXISTS idx_home_medikamente_lagerort
  ON public.home_medikamente (household_id, lagerort);
CREATE INDEX IF NOT EXISTS idx_home_medikamente_kategorie
  ON public.home_medikamente (household_id, kategorie);
CREATE INDEX IF NOT EXISTS idx_home_medikamente_ablaufdatum
  ON public.home_medikamente (household_id, ablaufdatum);
CREATE INDEX IF NOT EXISTS idx_home_medikamente_bestand
  ON public.home_medikamente (household_id, bestand);

CREATE INDEX IF NOT EXISTS idx_home_medikament_analysen_medikament
  ON public.home_medikament_beipackzettel_analysen (medikament_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_home_medikament_analysen_household
  ON public.home_medikament_beipackzettel_analysen (household_id, analysiert_am DESC);

DROP TRIGGER IF EXISTS set_home_medikamente_updated_at ON public.home_medikamente;
CREATE TRIGGER set_home_medikamente_updated_at
  BEFORE UPDATE ON public.home_medikamente
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_home_medikament_beipackzettel_analysen_updated_at ON public.home_medikament_beipackzettel_analysen;
CREATE TRIGGER set_home_medikament_beipackzettel_analysen_updated_at
  BEFORE UPDATE ON public.home_medikament_beipackzettel_analysen
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.home_medikamente ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.home_medikament_beipackzettel_analysen ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS home_medikamente_household_member_access ON public.home_medikamente;
CREATE POLICY home_medikamente_household_member_access ON public.home_medikamente FOR ALL
  USING (
    user_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.household_members hm
      WHERE hm.household_id = home_medikamente.household_id
        AND hm.user_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND (
      household_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.household_members hm
        WHERE hm.household_id = home_medikamente.household_id
          AND hm.user_id = (SELECT auth.uid())
      )
    )
  );

DROP POLICY IF EXISTS home_medikament_analysen_household_member_access ON public.home_medikament_beipackzettel_analysen;
CREATE POLICY home_medikament_analysen_household_member_access ON public.home_medikament_beipackzettel_analysen FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.home_medikamente m
      WHERE m.id = home_medikament_beipackzettel_analysen.medikament_id
        AND (
          m.user_id = (SELECT auth.uid())
          OR EXISTS (
            SELECT 1 FROM public.household_members hm
            WHERE hm.household_id = m.household_id
              AND hm.user_id = (SELECT auth.uid())
          )
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.home_medikamente m
      WHERE m.id = home_medikament_beipackzettel_analysen.medikament_id
        AND (
          m.user_id = (SELECT auth.uid())
          OR EXISTS (
            SELECT 1 FROM public.household_members hm
            WHERE hm.household_id = m.household_id
              AND hm.user_id = (SELECT auth.uid())
          )
        )
    )
  );

-- ── Heimapotheke: Beipackzettel im Dokumentenarchiv normalisieren ──
UPDATE public.dokumente
SET
  kategorie = 'Medikamente',
  dokument_typ = COALESCE(NULLIF(dokument_typ, ''), 'beipackzettel'),
  app_modus = CASE
    WHEN app_modus IN ('home', 'beides') THEN app_modus
    ELSE 'home'
  END,
  tags = (
    SELECT array(
      SELECT DISTINCT tag
      FROM unnest(COALESCE(tags, '{}'::text[]) || ARRAY['heimapotheke', 'beipackzettel']) AS tag
      WHERE tag IS NOT NULL AND tag <> ''
    )
  )
WHERE
  dokument_typ = 'beipackzettel'
  OR kategorie IN ('Medikament', 'Medikamente')
  OR storage_pfad ILIKE '%/heimapotheke/%'
  OR dateiname ILIKE '%beipackzettel%';

-- Kfz-Modul: Fahrzeugakte, Tankhistorie, Service und Reifen
CREATE TABLE IF NOT EXISTS public.home_fahrzeuge (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  created_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  name text NOT NULL,
  marke text,
  modell text,
  baujahr integer,
  kennzeichen text,
  vin text,
  kilometerstand integer DEFAULT 0,
  kraftstoffart text DEFAULT 'Benzin',
  versicherung text,
  polizzennummer text,
  pickerl_termin date,
  status text NOT NULL DEFAULT 'aktiv' CHECK (status IN ('aktiv','verkauft','stillgelegt')),
  notizen text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.home_fahrzeug_tankvorgaenge (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  fahrzeug_id uuid NOT NULL REFERENCES public.home_fahrzeuge(id) ON DELETE CASCADE,
  created_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  datum date NOT NULL DEFAULT CURRENT_DATE,
  betrag numeric(12,2) NOT NULL DEFAULT 0,
  tankstelle text,
  liter numeric(10,3),
  kilometerstand integer,
  preis_pro_liter numeric(10,3),
  kraftstoffart text,
  quelle text NOT NULL DEFAULT 'manuell' CHECK (quelle IN ('manuell','budget','rechnung')),
  budget_posten_id uuid REFERENCES public.budget_posten(id) ON DELETE SET NULL,
  rechnung_id uuid REFERENCES public.rechnungen(id) ON DELETE SET NULL,
  dokument_id uuid REFERENCES public.dokumente(id) ON DELETE SET NULL,
  notizen text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.home_fahrzeug_services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  fahrzeug_id uuid NOT NULL REFERENCES public.home_fahrzeuge(id) ON DELETE CASCADE,
  created_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  typ text NOT NULL DEFAULT 'Service',
  datum date NOT NULL DEFAULT CURRENT_DATE,
  kilometerstand integer,
  kosten numeric(12,2),
  werkstatt text,
  beschreibung text,
  naechste_faelligkeit_datum date,
  naechste_faelligkeit_km integer,
  dokument_id uuid REFERENCES public.dokumente(id) ON DELETE SET NULL,
  notizen text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.home_fahrzeug_reifen (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  fahrzeug_id uuid NOT NULL REFERENCES public.home_fahrzeuge(id) ON DELETE CASCADE,
  created_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  saison text NOT NULL DEFAULT 'Sommerreifen' CHECK (saison IN ('Sommerreifen','Winterreifen','Ganzjahresreifen')),
  marke text,
  groesse text,
  profiltiefe numeric(4,1),
  kaufdatum date,
  lagerort text,
  zustand text DEFAULT 'gut',
  montiert_ab date,
  montiert_bis date,
  naechster_wechsel date,
  austausch_faellig_ab_mm numeric(4,1) DEFAULT 4.0,
  dokument_id uuid REFERENCES public.dokumente(id) ON DELETE SET NULL,
  notizen text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_home_fahrzeuge_household_status ON public.home_fahrzeuge(household_id, status);
CREATE INDEX IF NOT EXISTS idx_home_fahrzeuge_pickerl ON public.home_fahrzeuge(household_id, pickerl_termin);
CREATE INDEX IF NOT EXISTS idx_home_fahrzeug_tank_fahrzeug_datum ON public.home_fahrzeug_tankvorgaenge(fahrzeug_id, datum DESC);
CREATE INDEX IF NOT EXISTS idx_home_fahrzeug_tank_household_datum ON public.home_fahrzeug_tankvorgaenge(household_id, datum DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_home_fahrzeug_tank_budget_unique ON public.home_fahrzeug_tankvorgaenge(household_id, budget_posten_id) WHERE budget_posten_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_home_fahrzeug_tank_rechnung_unique ON public.home_fahrzeug_tankvorgaenge(household_id, rechnung_id) WHERE rechnung_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_home_fahrzeug_services_fahrzeug_datum ON public.home_fahrzeug_services(fahrzeug_id, datum DESC);
CREATE INDEX IF NOT EXISTS idx_home_fahrzeug_services_due_date ON public.home_fahrzeug_services(household_id, naechste_faelligkeit_datum);
CREATE INDEX IF NOT EXISTS idx_home_fahrzeug_services_due_km ON public.home_fahrzeug_services(household_id, naechste_faelligkeit_km);
CREATE INDEX IF NOT EXISTS idx_home_fahrzeug_reifen_fahrzeug ON public.home_fahrzeug_reifen(fahrzeug_id);
CREATE INDEX IF NOT EXISTS idx_home_fahrzeug_reifen_wechsel ON public.home_fahrzeug_reifen(household_id, naechster_wechsel);

DROP TRIGGER IF EXISTS set_home_fahrzeuge_updated_at ON public.home_fahrzeuge;
CREATE TRIGGER set_home_fahrzeuge_updated_at BEFORE UPDATE ON public.home_fahrzeuge FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS set_home_fahrzeug_tankvorgaenge_updated_at ON public.home_fahrzeug_tankvorgaenge;
CREATE TRIGGER set_home_fahrzeug_tankvorgaenge_updated_at BEFORE UPDATE ON public.home_fahrzeug_tankvorgaenge FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS set_home_fahrzeug_services_updated_at ON public.home_fahrzeug_services;
CREATE TRIGGER set_home_fahrzeug_services_updated_at BEFORE UPDATE ON public.home_fahrzeug_services FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS set_home_fahrzeug_reifen_updated_at ON public.home_fahrzeug_reifen;
CREATE TRIGGER set_home_fahrzeug_reifen_updated_at BEFORE UPDATE ON public.home_fahrzeug_reifen FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.home_fahrzeuge ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.home_fahrzeug_tankvorgaenge ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.home_fahrzeug_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.home_fahrzeug_reifen ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS home_fahrzeuge_household_member_access ON public.home_fahrzeuge;
CREATE POLICY home_fahrzeuge_household_member_access ON public.home_fahrzeuge FOR ALL USING (public.is_household_member(household_id)) WITH CHECK (public.is_household_member(household_id));
DROP POLICY IF EXISTS home_fahrzeug_tankvorgaenge_household_member_access ON public.home_fahrzeug_tankvorgaenge;
CREATE POLICY home_fahrzeug_tankvorgaenge_household_member_access ON public.home_fahrzeug_tankvorgaenge FOR ALL USING (public.is_household_member(household_id)) WITH CHECK (public.is_household_member(household_id));
DROP POLICY IF EXISTS home_fahrzeug_services_household_member_access ON public.home_fahrzeug_services;
CREATE POLICY home_fahrzeug_services_household_member_access ON public.home_fahrzeug_services FOR ALL USING (public.is_household_member(household_id)) WITH CHECK (public.is_household_member(household_id));
DROP POLICY IF EXISTS home_fahrzeug_reifen_household_member_access ON public.home_fahrzeug_reifen;
CREATE POLICY home_fahrzeug_reifen_household_member_access ON public.home_fahrzeug_reifen FOR ALL USING (public.is_household_member(household_id)) WITH CHECK (public.is_household_member(household_id));

SELECT pg_notify('pgrst', 'reload schema');

-- Kfz-Ausbau: TCO, Volltankverbrauch, Reifenhistorie, Aufgaben und Teile
ALTER TABLE public.home_fahrzeug_tankvorgaenge
  ADD COLUMN IF NOT EXISTS vollgetankt boolean NOT NULL DEFAULT true;

ALTER TABLE public.home_fahrzeug_reifen
  ADD COLUMN IF NOT EXISTS laufleistung_km integer,
  ADD COLUMN IF NOT EXISTS kaufpreis numeric(12,2),
  ADD COLUMN IF NOT EXISTS herstellungsjahr integer,
  ADD COLUMN IF NOT EXISTS dot_nummer text;

ALTER TABLE public.vertraege
  ADD COLUMN IF NOT EXISTS fahrzeug_id uuid REFERENCES public.home_fahrzeuge(id) ON DELETE SET NULL;
ALTER TABLE public.versicherungs_polizzen
  ADD COLUMN IF NOT EXISTS fahrzeug_id uuid REFERENCES public.home_fahrzeuge(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.home_fahrzeug_ausgaben (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  fahrzeug_id uuid NOT NULL REFERENCES public.home_fahrzeuge(id) ON DELETE CASCADE,
  created_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  datum date NOT NULL DEFAULT CURRENT_DATE,
  kategorie text NOT NULL DEFAULT 'Sonstiges'
    CHECK (kategorie IN ('Versicherung','Steuer','Parken','Maut','Reifen','Zubehoer','Sonstiges')),
  beschreibung text NOT NULL,
  betrag numeric(12,2) NOT NULL CHECK (betrag >= 0),
  budget_posten_id uuid REFERENCES public.budget_posten(id) ON DELETE SET NULL,
  rechnung_id uuid REFERENCES public.rechnungen(id) ON DELETE SET NULL,
  dokument_id uuid REFERENCES public.dokumente(id) ON DELETE SET NULL,
  notizen text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.home_fahrzeug_aufgaben (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  fahrzeug_id uuid NOT NULL REFERENCES public.home_fahrzeuge(id) ON DELETE CASCADE,
  created_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  titel text NOT NULL,
  beschreibung text,
  status text NOT NULL DEFAULT 'offen' CHECK (status IN ('offen','in_bearbeitung','erledigt')),
  prioritaet text NOT NULL DEFAULT 'mittel' CHECK (prioritaet IN ('niedrig','mittel','hoch')),
  faellig_am date,
  erledigt_am timestamptz,
  kilometerstand_faellig integer,
  notizen text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.home_fahrzeug_teile (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  fahrzeug_id uuid NOT NULL REFERENCES public.home_fahrzeuge(id) ON DELETE CASCADE,
  aufgabe_id uuid REFERENCES public.home_fahrzeug_aufgaben(id) ON DELETE SET NULL,
  created_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  name text NOT NULL,
  teilenummer text,
  menge numeric(10,2) NOT NULL DEFAULT 1 CHECK (menge > 0),
  einzelpreis numeric(12,2) CHECK (einzelpreis IS NULL OR einzelpreis >= 0),
  status text NOT NULL DEFAULT 'benoetigt' CHECK (status IN ('benoetigt','bestellt','vorhanden','verbaut')),
  bezugsquelle text,
  dokument_id uuid REFERENCES public.dokumente(id) ON DELETE SET NULL,
  notizen text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_home_fahrzeug_ausgaben_fahrzeug_datum ON public.home_fahrzeug_ausgaben(fahrzeug_id, datum DESC);
CREATE INDEX IF NOT EXISTS idx_home_fahrzeug_ausgaben_household_kategorie ON public.home_fahrzeug_ausgaben(household_id, kategorie);
CREATE UNIQUE INDEX IF NOT EXISTS idx_home_fahrzeug_ausgaben_budget_unique ON public.home_fahrzeug_ausgaben(household_id, budget_posten_id) WHERE budget_posten_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_home_fahrzeug_aufgaben_fahrzeug_status ON public.home_fahrzeug_aufgaben(fahrzeug_id, status, faellig_am);
CREATE INDEX IF NOT EXISTS idx_home_fahrzeug_teile_fahrzeug_status ON public.home_fahrzeug_teile(fahrzeug_id, status);
CREATE INDEX IF NOT EXISTS idx_vertraege_fahrzeug ON public.vertraege(fahrzeug_id);
CREATE INDEX IF NOT EXISTS idx_versicherungs_polizzen_fahrzeug ON public.versicherungs_polizzen(fahrzeug_id);

DROP TRIGGER IF EXISTS set_home_fahrzeug_ausgaben_updated_at ON public.home_fahrzeug_ausgaben;
CREATE TRIGGER set_home_fahrzeug_ausgaben_updated_at BEFORE UPDATE ON public.home_fahrzeug_ausgaben FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS set_home_fahrzeug_aufgaben_updated_at ON public.home_fahrzeug_aufgaben;
CREATE TRIGGER set_home_fahrzeug_aufgaben_updated_at BEFORE UPDATE ON public.home_fahrzeug_aufgaben FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS set_home_fahrzeug_teile_updated_at ON public.home_fahrzeug_teile;
CREATE TRIGGER set_home_fahrzeug_teile_updated_at BEFORE UPDATE ON public.home_fahrzeug_teile FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.home_fahrzeug_ausgaben ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.home_fahrzeug_aufgaben ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.home_fahrzeug_teile ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS home_fahrzeug_ausgaben_household_member_access ON public.home_fahrzeug_ausgaben;
CREATE POLICY home_fahrzeug_ausgaben_household_member_access ON public.home_fahrzeug_ausgaben FOR ALL USING (public.is_household_member(household_id)) WITH CHECK (public.is_household_member(household_id));
DROP POLICY IF EXISTS home_fahrzeug_aufgaben_household_member_access ON public.home_fahrzeug_aufgaben;
CREATE POLICY home_fahrzeug_aufgaben_household_member_access ON public.home_fahrzeug_aufgaben FOR ALL USING (public.is_household_member(household_id)) WITH CHECK (public.is_household_member(household_id));
DROP POLICY IF EXISTS home_fahrzeug_teile_household_member_access ON public.home_fahrzeug_teile;
CREATE POLICY home_fahrzeug_teile_household_member_access ON public.home_fahrzeug_teile FOR ALL USING (public.is_household_member(household_id)) WITH CHECK (public.is_household_member(household_id));

-- KI-Serviceanalyse wird durch die idempotente Kfz-Migration vervollstaendigt.
-- Die Definitionen werden hier ebenfalls eingebunden, damit Neuinstallationen
-- denselben Stand wie scripts/migration_2026_06_04_home_kfz.sql erhalten.
ALTER TABLE public.home_fahrzeug_services
  ADD COLUMN IF NOT EXISTS rechnung_id uuid REFERENCES public.rechnungen(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS budget_posten_id uuid REFERENCES public.budget_posten(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS rechnungsnummer text,
  ADD COLUMN IF NOT EXISTS leistungsdatum date,
  ADD COLUMN IF NOT EXISTS zahlungsart text,
  ADD COLUMN IF NOT EXISTS analyse_meta jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.home_fahrzeug_aufgaben
  ADD COLUMN IF NOT EXISTS service_id uuid REFERENCES public.home_fahrzeug_services(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS quelle text NOT NULL DEFAULT 'manuell';
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'home_fahrzeug_aufgaben_quelle_check'
      AND conrelid = 'public.home_fahrzeug_aufgaben'::regclass
  ) THEN
    ALTER TABLE public.home_fahrzeug_aufgaben
      ADD CONSTRAINT home_fahrzeug_aufgaben_quelle_check
      CHECK (quelle IN ('manuell','ki_serviceanalyse'));
  END IF;
END $$;
CREATE TABLE IF NOT EXISTS public.home_fahrzeug_service_positionen (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  service_id uuid NOT NULL REFERENCES public.home_fahrzeug_services(id) ON DELETE CASCADE,
  sortierung integer NOT NULL DEFAULT 0,
  originaltext text,
  beschreibung text NOT NULL,
  kategorie text NOT NULL DEFAULT 'sonstiges' CHECK (kategorie IN ('arbeit','ersatzteil','fluessigkeit','reifen','pruefung','entsorgung','sonstiges')),
  menge numeric(12,3), einheit text, einzelpreis numeric(12,2), gesamtpreis numeric(12,2),
  ust_satz numeric(5,2), rabatt_betrag numeric(12,2), kostenlos boolean NOT NULL DEFAULT false,
  teilenummer text, confidence numeric(4,3), notizen text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_home_fahrzeug_service_positionen_service ON public.home_fahrzeug_service_positionen(service_id, sortierung);
CREATE INDEX IF NOT EXISTS idx_home_fahrzeug_service_positionen_household_kategorie ON public.home_fahrzeug_service_positionen(household_id, kategorie);
CREATE INDEX IF NOT EXISTS idx_home_fahrzeug_aufgaben_service ON public.home_fahrzeug_aufgaben(service_id);
DROP TRIGGER IF EXISTS set_home_fahrzeug_service_positionen_updated_at ON public.home_fahrzeug_service_positionen;
CREATE TRIGGER set_home_fahrzeug_service_positionen_updated_at BEFORE UPDATE ON public.home_fahrzeug_service_positionen FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
ALTER TABLE public.home_fahrzeug_service_positionen ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS home_fahrzeug_service_positionen_household_member_access ON public.home_fahrzeug_service_positionen;
CREATE POLICY home_fahrzeug_service_positionen_household_member_access ON public.home_fahrzeug_service_positionen FOR ALL
  USING (public.is_household_member(household_id)) WITH CHECK (public.is_household_member(household_id));

CREATE OR REPLACE FUNCTION public.save_kfz_service_analysis(p_payload jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_household uuid := nullif(p_payload->>'household_id','')::uuid;
  v_vehicle uuid := nullif(p_payload->>'fahrzeug_id','')::uuid;
  v_document uuid := nullif(p_payload->>'dokument_id','')::uuid;
  v_service uuid;
  v_invoice uuid;
  v_budget uuid;
  v_row jsonb;
BEGIN
  IF v_user IS NULL OR v_household IS NULL OR NOT public.is_household_member(v_household) THEN
    RAISE EXCEPTION 'Kein Zugriff auf diesen Haushalt.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.home_fahrzeuge WHERE id = v_vehicle AND household_id = v_household) THEN
    RAISE EXCEPTION 'Fahrzeug nicht gefunden.';
  END IF;
  IF v_document IS NULL OR NOT EXISTS (SELECT 1 FROM public.dokumente WHERE id = v_document AND household_id = v_household) THEN
    RAISE EXCEPTION 'Dokument nicht gefunden.';
  END IF;

  IF coalesce((p_payload->>'create_invoice')::boolean, false) THEN
    INSERT INTO public.rechnungen (
      household_id, dokument_id, lieferant_name, rechnungsnummer, rechnungsdatum,
      leistungsdatum, waehrung, netto, ust, brutto, confidence, extraktion, raw_text
    ) VALUES (
      v_household, v_document, nullif(p_payload->>'werkstatt',''),
      nullif(p_payload->>'rechnungsnummer',''), nullif(p_payload->>'datum','')::date,
      nullif(p_payload->>'leistungsdatum','')::date, coalesce(nullif(p_payload->>'waehrung',''),'EUR'),
      nullif(p_payload->>'netto','')::numeric, nullif(p_payload->>'steuer','')::numeric,
      nullif(p_payload->>'kosten','')::numeric, nullif(p_payload->>'confidence','')::numeric,
      coalesce(p_payload->'analyse_meta','{}'::jsonb), nullif(p_payload->>'raw_text','')
    )
    ON CONFLICT (household_id, dokument_id) DO UPDATE SET
      lieferant_name = excluded.lieferant_name, rechnungsnummer = excluded.rechnungsnummer,
      rechnungsdatum = excluded.rechnungsdatum, leistungsdatum = excluded.leistungsdatum,
      waehrung = excluded.waehrung, netto = excluded.netto, ust = excluded.ust,
      brutto = excluded.brutto, confidence = excluded.confidence,
      extraktion = excluded.extraktion, raw_text = excluded.raw_text
    RETURNING id INTO v_invoice;
    DELETE FROM public.rechnungs_positionen WHERE rechnung_id = v_invoice;
  END IF;

  IF coalesce((p_payload->>'create_budget')::boolean, false) THEN
    INSERT INTO public.budget_posten (
      user_id, household_id, app_modus, typ, beschreibung, kategorie, betrag, datum, wiederholen
    ) VALUES (
      v_user, v_household, 'home', 'ausgabe',
      coalesce(nullif(p_payload->>'beschreibung',''), nullif(p_payload->>'typ',''), 'Kfz-Service'),
      'Service', coalesce(nullif(p_payload->>'kosten','')::numeric,0),
      coalesce(nullif(p_payload->>'datum','')::date,current_date), false
    ) RETURNING id INTO v_budget;
  END IF;

  INSERT INTO public.home_fahrzeug_services (
    household_id, fahrzeug_id, created_by_user_id, typ, datum, leistungsdatum,
    kilometerstand, kosten, werkstatt, beschreibung, naechste_faelligkeit_datum,
    naechste_faelligkeit_km, dokument_id, rechnung_id, budget_posten_id,
    rechnungsnummer, zahlungsart, analyse_meta, notizen
  ) VALUES (
    v_household, v_vehicle, v_user, coalesce(nullif(p_payload->>'typ',''),'Service'),
    coalesce(nullif(p_payload->>'datum','')::date,current_date),
    nullif(p_payload->>'leistungsdatum','')::date, nullif(p_payload->>'kilometerstand','')::integer,
    nullif(p_payload->>'kosten','')::numeric, nullif(p_payload->>'werkstatt',''),
    nullif(p_payload->>'beschreibung',''), nullif(p_payload->>'naechste_faelligkeit_datum','')::date,
    nullif(p_payload->>'naechste_faelligkeit_km','')::integer, v_document, v_invoice, v_budget,
    nullif(p_payload->>'rechnungsnummer',''), nullif(p_payload->>'zahlungsart',''),
    coalesce(p_payload->'analyse_meta','{}'::jsonb), nullif(p_payload->>'notizen','')
  ) RETURNING id INTO v_service;

  FOR v_row IN SELECT value FROM jsonb_array_elements(coalesce(p_payload->'positionen','[]'::jsonb))
  LOOP
    INSERT INTO public.home_fahrzeug_service_positionen (
      household_id, service_id, sortierung, originaltext, beschreibung, kategorie,
      menge, einheit, einzelpreis, gesamtpreis, ust_satz, rabatt_betrag,
      kostenlos, teilenummer, confidence, notizen
    ) VALUES (
      v_household, v_service, coalesce((v_row->>'sortierung')::integer,0),
      nullif(v_row->>'originaltext',''), coalesce(nullif(v_row->>'beschreibung',''),'Position'),
      coalesce(nullif(v_row->>'kategorie',''),'sonstiges'), nullif(v_row->>'menge','')::numeric,
      nullif(v_row->>'einheit',''), nullif(v_row->>'einzelpreis','')::numeric,
      nullif(v_row->>'gesamtpreis','')::numeric, nullif(v_row->>'ust_satz','')::numeric,
      nullif(v_row->>'rabatt_betrag','')::numeric, coalesce((v_row->>'kostenlos')::boolean,false),
      nullif(v_row->>'teilenummer',''), nullif(v_row->>'confidence','')::numeric,
      nullif(v_row->>'notizen','')
    );
    IF v_invoice IS NOT NULL THEN
      INSERT INTO public.rechnungs_positionen (
        household_id, rechnung_id, pos_nr, beschreibung, menge, einheit,
        einzelpreis, gesamtpreis, ust_satz, klassifikation
      ) VALUES (
        v_household, v_invoice, coalesce((v_row->>'sortierung')::integer,0),
        nullif(v_row->>'beschreibung',''), nullif(v_row->>'menge','')::numeric,
        nullif(v_row->>'einheit',''), nullif(v_row->>'einzelpreis','')::numeric,
        nullif(v_row->>'gesamtpreis','')::numeric, nullif(v_row->>'ust_satz','')::numeric,
        jsonb_build_object('kategorie',v_row->>'kategorie','kostenlos',coalesce((v_row->>'kostenlos')::boolean,false))
      );
    END IF;
  END LOOP;

  FOR v_row IN SELECT value FROM jsonb_array_elements(coalesce(p_payload->'reminders','[]'::jsonb))
  LOOP
    IF coalesce((v_row->>'selected')::boolean,false) THEN
      INSERT INTO public.home_fahrzeug_aufgaben (
        household_id, fahrzeug_id, service_id, created_by_user_id, titel,
        beschreibung, status, prioritaet, faellig_am, kilometerstand_faellig, quelle
      ) VALUES (
        v_household, v_vehicle, v_service, v_user,
        coalesce(nullif(v_row->>'titel',''),'Service-Erinnerung'), nullif(v_row->>'beschreibung',''),
        'offen', coalesce(nullif(v_row->>'prioritaet',''),'mittel'),
        nullif(v_row->>'faellig_am','')::date, nullif(v_row->>'kilometerstand_faellig','')::integer,
        'ki_serviceanalyse'
      );
    END IF;
  END LOOP;

  INSERT INTO public.dokument_links (household_id,dokument_id,entity_type,entity_id,role)
  VALUES (v_household,v_document,'home_fahrzeug_services',v_service,'original')
  ON CONFLICT (household_id,dokument_id,entity_type,entity_id,role) DO NOTHING;
  IF v_invoice IS NOT NULL THEN
    INSERT INTO public.dokument_links (household_id,dokument_id,entity_type,entity_id,role)
    VALUES (v_household,v_document,'rechnung',v_invoice,'original')
    ON CONFLICT (household_id,dokument_id,entity_type,entity_id,role) DO NOTHING;
  END IF;
  UPDATE public.home_fahrzeuge
  SET kilometerstand = greatest(coalesce(kilometerstand,0),coalesce(nullif(p_payload->>'kilometerstand','')::integer,0))
  WHERE id = v_vehicle;
  RETURN v_service;
END;
$$;
REVOKE ALL ON FUNCTION public.save_kfz_service_analysis(jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.save_kfz_service_analysis(jsonb) TO authenticated;

-- Automatische Erkennung von Tankbelegen aus Budget und Rechnungen.
ALTER TABLE public.home_fahrzeug_tankvorgaenge
  ADD COLUMN IF NOT EXISTS verbrauch_bestaetigt boolean NOT NULL DEFAULT true;

-- Expliziter Tankstatus fuer belastbare Volltank-Verbrauchssegmente.
ALTER TABLE public.home_fahrzeug_tankvorgaenge
  ADD COLUMN IF NOT EXISTS tankstatus text,
  ADD COLUMN IF NOT EXISTS tankstatus_quelle text;

UPDATE public.home_fahrzeug_tankvorgaenge
SET tankstatus = CASE WHEN vollgetankt THEN 'voll' ELSE 'teilweise' END,
    tankstatus_quelle = COALESCE(tankstatus_quelle, 'legacy')
WHERE tankstatus IS NULL;

UPDATE public.home_fahrzeug_tankvorgaenge
SET tankstatus_quelle = 'legacy'
WHERE tankstatus_quelle IS NULL;

ALTER TABLE public.home_fahrzeug_tankvorgaenge
  ALTER COLUMN tankstatus SET DEFAULT 'unbekannt',
  ALTER COLUMN tankstatus SET NOT NULL,
  ALTER COLUMN tankstatus_quelle SET DEFAULT 'manuell',
  ALTER COLUMN tankstatus_quelle SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'home_fahrzeug_tankvorgaenge_tankstatus_check' AND conrelid = 'public.home_fahrzeug_tankvorgaenge'::regclass) THEN
    ALTER TABLE public.home_fahrzeug_tankvorgaenge ADD CONSTRAINT home_fahrzeug_tankvorgaenge_tankstatus_check CHECK (tankstatus IN ('voll','teilweise','unbekannt'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'home_fahrzeug_tankvorgaenge_tankstatus_quelle_check' AND conrelid = 'public.home_fahrzeug_tankvorgaenge'::regclass) THEN
    ALTER TABLE public.home_fahrzeug_tankvorgaenge ADD CONSTRAINT home_fahrzeug_tankvorgaenge_tankstatus_quelle_check CHECK (tankstatus_quelle IN ('manuell','import','legacy'));
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.sync_kfz_tankstatus_compat()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.vollgetankt IS DISTINCT FROM OLD.vollgetankt
     AND NEW.tankstatus IS NOT DISTINCT FROM OLD.tankstatus THEN
    NEW.tankstatus := CASE WHEN NEW.vollgetankt THEN 'voll' ELSE 'teilweise' END;
    NEW.tankstatus_quelle := 'manuell';
  END IF;
  NEW.vollgetankt := NEW.tankstatus = 'voll';
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_kfz_tankstatus_compat ON public.home_fahrzeug_tankvorgaenge;
CREATE TRIGGER sync_kfz_tankstatus_compat BEFORE INSERT OR UPDATE OF tankstatus, vollgetankt
  ON public.home_fahrzeug_tankvorgaenge FOR EACH ROW EXECUTE FUNCTION public.sync_kfz_tankstatus_compat();

CREATE INDEX IF NOT EXISTS idx_home_fahrzeug_tank_vollanker
  ON public.home_fahrzeug_tankvorgaenge(fahrzeug_id, datum, kilometerstand)
  WHERE tankstatus = 'voll' AND verbrauch_bestaetigt = true;

CREATE TABLE IF NOT EXISTS public.home_fahrzeug_tank_importe (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  budget_posten_id uuid NOT NULL REFERENCES public.budget_posten(id) ON DELETE CASCADE,
  rechnung_id uuid REFERENCES public.rechnungen(id) ON DELETE SET NULL,
  dokument_id uuid REFERENCES public.dokumente(id) ON DELETE SET NULL,
  fahrzeug_id uuid REFERENCES public.home_fahrzeuge(id) ON DELETE SET NULL,
  tankvorgang_id uuid REFERENCES public.home_fahrzeug_tankvorgaenge(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','imported','ignored')),
  erkennungsgrund text NOT NULL,
  confidence numeric(4,3) CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  quell_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (household_id, budget_posten_id)
);
CREATE INDEX IF NOT EXISTS idx_home_fahrzeug_tank_importe_status
  ON public.home_fahrzeug_tank_importe(household_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_home_fahrzeug_tank_importe_rechnung
  ON public.home_fahrzeug_tank_importe(rechnung_id);
CREATE INDEX IF NOT EXISTS idx_home_fahrzeug_tank_importe_tankvorgang
  ON public.home_fahrzeug_tank_importe(tankvorgang_id);
DROP TRIGGER IF EXISTS set_home_fahrzeug_tank_importe_updated_at ON public.home_fahrzeug_tank_importe;
CREATE TRIGGER set_home_fahrzeug_tank_importe_updated_at
  BEFORE UPDATE ON public.home_fahrzeug_tank_importe
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
ALTER TABLE public.home_fahrzeug_tank_importe ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS home_fahrzeug_tank_importe_household_member_access ON public.home_fahrzeug_tank_importe;
CREATE POLICY home_fahrzeug_tank_importe_household_member_access
  ON public.home_fahrzeug_tank_importe FOR ALL
  USING (public.is_household_member(household_id))
  WITH CHECK (public.is_household_member(household_id));

SELECT pg_notify('pgrst', 'reload schema');


-- Stabilisierung 2026-06-10: Kilometerhistorie und atomare Kfz-Schreibvorgaenge.
create table if not exists public.home_fahrzeug_kilometerstaende (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  fahrzeug_id uuid not null references public.home_fahrzeuge(id) on delete cascade,
  created_by_user_id uuid references auth.users(id) on delete set null,
  datum date not null default current_date,
  kilometerstand integer not null check (kilometerstand >= 0 and kilometerstand <= 9999999),
  quelle text not null default 'manuell' check (quelle in ('manuell','legacy')),
  source_id uuid,
  notizen text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, fahrzeug_id, quelle, source_id)
);

create index if not exists idx_home_fahrzeug_kilometerstaende_vehicle_date
  on public.home_fahrzeug_kilometerstaende(fahrzeug_id, datum desc);
drop trigger if exists set_home_fahrzeug_kilometerstaende_updated_at on public.home_fahrzeug_kilometerstaende;
create trigger set_home_fahrzeug_kilometerstaende_updated_at
  before update on public.home_fahrzeug_kilometerstaende
  for each row execute function public.set_updated_at();
alter table public.home_fahrzeug_kilometerstaende enable row level security;
drop policy if exists home_fahrzeug_kilometerstaende_household_member_access on public.home_fahrzeug_kilometerstaende;
create policy home_fahrzeug_kilometerstaende_household_member_access
  on public.home_fahrzeug_kilometerstaende for all
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

insert into public.home_fahrzeug_kilometerstaende (
  household_id, fahrzeug_id, created_by_user_id, datum, kilometerstand, quelle, source_id, notizen
)
select household_id, id, created_by_user_id, coalesce(updated_at::date, current_date),
       greatest(coalesce(kilometerstand, 0), 0), 'legacy', id, 'Ausgangsstand vor Kilometerhistorie'
from public.home_fahrzeuge
on conflict (household_id, fahrzeug_id, quelle, source_id) do nothing;

create or replace function public.recompute_kfz_vehicle_mileage(
  p_household_id uuid,
  p_vehicle_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mileage integer;
begin
  select max(value) into v_mileage
  from (
    select kilometerstand as value
    from public.home_fahrzeug_kilometerstaende
    where household_id = p_household_id and fahrzeug_id = p_vehicle_id
    union all
    select kilometerstand
    from public.home_fahrzeug_tankvorgaenge
    where household_id = p_household_id and fahrzeug_id = p_vehicle_id and kilometerstand is not null
    union all
    select kilometerstand
    from public.home_fahrzeug_services
    where household_id = p_household_id and fahrzeug_id = p_vehicle_id and kilometerstand is not null
  ) values_source;

  update public.home_fahrzeuge
  set kilometerstand = coalesce(v_mileage, 0)
  where household_id = p_household_id and id = p_vehicle_id;
  return coalesce(v_mileage, 0);
end;
$$;
revoke all on function public.recompute_kfz_vehicle_mileage(uuid, uuid) from public;

create or replace function public.sync_kfz_vehicle_mileage_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op in ('UPDATE','DELETE') then
    perform public.recompute_kfz_vehicle_mileage(old.household_id, old.fahrzeug_id);
  end if;
  if tg_op in ('INSERT','UPDATE') then
    perform public.recompute_kfz_vehicle_mileage(new.household_id, new.fahrzeug_id);
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists sync_kfz_mileage_from_fuel on public.home_fahrzeug_tankvorgaenge;
create trigger sync_kfz_mileage_from_fuel
  after insert or update or delete on public.home_fahrzeug_tankvorgaenge
  for each row execute function public.sync_kfz_vehicle_mileage_trigger();
drop trigger if exists sync_kfz_mileage_from_service on public.home_fahrzeug_services;
create trigger sync_kfz_mileage_from_service
  after insert or update or delete on public.home_fahrzeug_services
  for each row execute function public.sync_kfz_vehicle_mileage_trigger();
drop trigger if exists sync_kfz_mileage_from_history on public.home_fahrzeug_kilometerstaende;
create trigger sync_kfz_mileage_from_history
  after insert or update or delete on public.home_fahrzeug_kilometerstaende
  for each row execute function public.sync_kfz_vehicle_mileage_trigger();

create or replace function public.record_kfz_mileage(
  p_household_id uuid,
  p_vehicle_id uuid,
  p_date date,
  p_mileage integer,
  p_source text default 'manuell',
  p_source_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null or not public.is_household_member(p_household_id) then
    raise exception using errcode = '42501', message = 'KFZ_HOUSEHOLD_ACCESS_DENIED';
  end if;
  if p_mileage is null or p_mileage < 0 or p_mileage > 9999999 then
    raise exception using errcode = '22023', message = 'KFZ_INVALID_MILEAGE';
  end if;
  if p_source not in ('manuell','legacy') then
    raise exception using errcode = '22023', message = 'KFZ_INVALID_MILEAGE_SOURCE';
  end if;
  if not exists (
    select 1 from public.home_fahrzeuge
    where household_id = p_household_id and id = p_vehicle_id
  ) then
    raise exception using errcode = 'P0002', message = 'KFZ_VEHICLE_NOT_FOUND';
  end if;

  delete from public.home_fahrzeug_kilometerstaende
  where household_id = p_household_id and fahrzeug_id = p_vehicle_id and quelle = 'legacy';

  insert into public.home_fahrzeug_kilometerstaende (
    household_id, fahrzeug_id, created_by_user_id, datum, kilometerstand, quelle, source_id
  ) values (
    p_household_id, p_vehicle_id, auth.uid(), coalesce(p_date, current_date), p_mileage, p_source, p_source_id
  )
  on conflict (household_id, fahrzeug_id, quelle, source_id)
  do update set datum = excluded.datum, kilometerstand = excluded.kilometerstand,
                created_by_user_id = excluded.created_by_user_id
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.record_kfz_mileage(uuid, uuid, date, integer, text, uuid) from public;
grant execute on function public.record_kfz_mileage(uuid, uuid, date, integer, text, uuid) to authenticated;

create or replace function public.save_kfz_vehicle(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_household uuid := nullif(p_payload->>'household_id','')::uuid;
  v_vehicle uuid := nullif(p_payload->>'id','')::uuid;
  v_mileage integer := coalesce(nullif(p_payload->>'kilometerstand','')::integer, 0);
  v_row public.home_fahrzeuge;
begin
  if auth.uid() is null or not public.is_household_member(v_household) then
    raise exception using errcode = '42501', message = 'KFZ_HOUSEHOLD_ACCESS_DENIED';
  end if;
  if nullif(btrim(p_payload->>'name'),'') is null then
    raise exception using errcode = '22023', message = 'KFZ_VEHICLE_NAME_REQUIRED';
  end if;
  if v_mileage < 0 or v_mileage > 9999999 then
    raise exception using errcode = '22023', message = 'KFZ_INVALID_MILEAGE';
  end if;

  if v_vehicle is null then
    insert into public.home_fahrzeuge (
      household_id, created_by_user_id, name, marke, modell, baujahr, kennzeichen,
      vin, kilometerstand, kraftstoffart, versicherung, polizzennummer,
      pickerl_termin, status, notizen
    ) values (
      v_household, auth.uid(), btrim(p_payload->>'name'), nullif(p_payload->>'marke',''),
      nullif(p_payload->>'modell',''), nullif(p_payload->>'baujahr','')::integer,
      nullif(p_payload->>'kennzeichen',''), nullif(p_payload->>'vin',''), 0,
      nullif(p_payload->>'kraftstoffart',''), nullif(p_payload->>'versicherung',''),
      nullif(p_payload->>'polizzennummer',''), nullif(p_payload->>'pickerl_termin','')::date,
      coalesce(nullif(p_payload->>'status',''),'aktiv'), nullif(p_payload->>'notizen','')
    ) returning * into v_row;
    v_vehicle := v_row.id;
  else
    update public.home_fahrzeuge set
      name = btrim(p_payload->>'name'),
      marke = nullif(p_payload->>'marke',''),
      modell = nullif(p_payload->>'modell',''),
      baujahr = nullif(p_payload->>'baujahr','')::integer,
      kennzeichen = nullif(p_payload->>'kennzeichen',''),
      vin = nullif(p_payload->>'vin',''),
      kraftstoffart = nullif(p_payload->>'kraftstoffart',''),
      versicherung = nullif(p_payload->>'versicherung',''),
      polizzennummer = nullif(p_payload->>'polizzennummer',''),
      pickerl_termin = nullif(p_payload->>'pickerl_termin','')::date,
      status = coalesce(nullif(p_payload->>'status',''),'aktiv'),
      notizen = nullif(p_payload->>'notizen','')
    where household_id = v_household and id = v_vehicle
    returning * into v_row;
    if not found then
      raise exception using errcode = 'P0002', message = 'KFZ_VEHICLE_NOT_FOUND';
    end if;
  end if;

  delete from public.home_fahrzeug_kilometerstaende
  where household_id = v_household and fahrzeug_id = v_vehicle and quelle = 'legacy';

  insert into public.home_fahrzeug_kilometerstaende (
    household_id, fahrzeug_id, created_by_user_id, datum, kilometerstand, quelle, source_id
  ) values (
    v_household, v_vehicle, auth.uid(), current_date, v_mileage, 'manuell', v_vehicle
  )
  on conflict (household_id, fahrzeug_id, quelle, source_id)
  do update set datum = excluded.datum, kilometerstand = excluded.kilometerstand,
                created_by_user_id = excluded.created_by_user_id;

  select * into v_row from public.home_fahrzeuge where id = v_vehicle;
  return to_jsonb(v_row);
end;
$$;
revoke all on function public.save_kfz_vehicle(jsonb) from public;
grant execute on function public.save_kfz_vehicle(jsonb) to authenticated;

create or replace function public.save_kfz_expense_with_budget(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_household uuid := nullif(p_payload->>'household_id','')::uuid;
  v_vehicle uuid := nullif(p_payload->>'fahrzeug_id','')::uuid;
  v_expense uuid := nullif(p_payload->>'id','')::uuid;
  v_budget uuid := nullif(p_payload->>'budget_posten_id','')::uuid;
  v_mirror boolean := coalesce((p_payload->>'mirror_to_budget')::boolean, false);
  v_row public.home_fahrzeug_ausgaben;
begin
  if auth.uid() is null or not public.is_household_member(v_household) then
    raise exception using errcode = '42501', message = 'KFZ_HOUSEHOLD_ACCESS_DENIED';
  end if;
  if not exists (select 1 from public.home_fahrzeuge where household_id = v_household and id = v_vehicle) then
    raise exception using errcode = 'P0002', message = 'KFZ_VEHICLE_NOT_FOUND';
  end if;

  if v_mirror then
    if v_budget is null then
      insert into public.budget_posten (
        user_id, household_id, app_modus, typ, beschreibung, kategorie, betrag, datum, wiederholen
      ) values (
        auth.uid(), v_household, 'home', 'ausgabe', p_payload->>'beschreibung',
        case when p_payload->>'kategorie' = 'Zubehoer' then 'Sonstiges' else p_payload->>'kategorie' end,
        coalesce(nullif(p_payload->>'betrag','')::numeric, 0),
        coalesce(nullif(p_payload->>'datum','')::date, current_date), false
      ) returning id into v_budget;
    else
      update public.budget_posten set
        beschreibung = p_payload->>'beschreibung',
        kategorie = case when p_payload->>'kategorie' = 'Zubehoer' then 'Sonstiges' else p_payload->>'kategorie' end,
        betrag = coalesce(nullif(p_payload->>'betrag','')::numeric, 0),
        datum = coalesce(nullif(p_payload->>'datum','')::date, current_date)
      where household_id = v_household and id = v_budget;
      if not found then
        raise exception using errcode = 'P0002', message = 'KFZ_BUDGET_NOT_FOUND';
      end if;
    end if;
  else
    v_budget := null;
  end if;

  if v_expense is null then
    insert into public.home_fahrzeug_ausgaben (
      household_id, fahrzeug_id, created_by_user_id, datum, kategorie, beschreibung,
      betrag, budget_posten_id, rechnung_id, dokument_id, notizen
    ) values (
      v_household, v_vehicle, auth.uid(), coalesce(nullif(p_payload->>'datum','')::date, current_date),
      p_payload->>'kategorie', p_payload->>'beschreibung',
      coalesce(nullif(p_payload->>'betrag','')::numeric, 0), v_budget,
      nullif(p_payload->>'rechnung_id','')::uuid, nullif(p_payload->>'dokument_id','')::uuid,
      nullif(p_payload->>'notizen','')
    ) returning * into v_row;
  else
    update public.home_fahrzeug_ausgaben set
      fahrzeug_id = v_vehicle,
      datum = coalesce(nullif(p_payload->>'datum','')::date, current_date),
      kategorie = p_payload->>'kategorie',
      beschreibung = p_payload->>'beschreibung',
      betrag = coalesce(nullif(p_payload->>'betrag','')::numeric, 0),
      budget_posten_id = v_budget,
      rechnung_id = nullif(p_payload->>'rechnung_id','')::uuid,
      dokument_id = nullif(p_payload->>'dokument_id','')::uuid,
      notizen = nullif(p_payload->>'notizen','')
    where household_id = v_household and id = v_expense
    returning * into v_row;
    if not found then
      raise exception using errcode = 'P0002', message = 'KFZ_EXPENSE_NOT_FOUND';
    end if;
  end if;
  return to_jsonb(v_row);
end;
$$;
revoke all on function public.save_kfz_expense_with_budget(jsonb) from public;
grant execute on function public.save_kfz_expense_with_budget(jsonb) to authenticated;

with ranked_covers as (
  select id, row_number() over (
    partition by household_id, entity_id order by created_at desc nulls last, id desc
  ) as position
  from public.dokument_links
  where entity_type = 'home_fahrzeuge' and role = 'vehicle_cover'
)
update public.dokument_links links
set role = 'vehicle_photo'
from ranked_covers ranked
where links.id = ranked.id and ranked.position > 1;

create unique index if not exists idx_dokument_links_one_vehicle_cover
  on public.dokument_links(household_id, entity_id)
  where entity_type = 'home_fahrzeuge' and role = 'vehicle_cover';

create or replace function public.set_kfz_vehicle_cover(
  p_household_id uuid,
  p_vehicle_id uuid,
  p_document_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.is_household_member(p_household_id) then
    raise exception using errcode = '42501', message = 'KFZ_HOUSEHOLD_ACCESS_DENIED';
  end if;
  if not exists (
    select 1 from public.dokument_links
    where household_id = p_household_id and entity_type = 'home_fahrzeuge'
      and entity_id = p_vehicle_id and dokument_id = p_document_id
      and role in ('vehicle_photo','vehicle_cover')
  ) then
    raise exception using errcode = 'P0002', message = 'KFZ_PHOTO_NOT_FOUND';
  end if;
  update public.dokument_links
  set role = 'vehicle_photo'
  where household_id = p_household_id and entity_type = 'home_fahrzeuge'
    and entity_id = p_vehicle_id and role = 'vehicle_cover'
    and dokument_id <> p_document_id;
  update public.dokument_links
  set role = 'vehicle_cover'
  where household_id = p_household_id and entity_type = 'home_fahrzeuge'
    and entity_id = p_vehicle_id and dokument_id = p_document_id;
end;
$$;
revoke all on function public.set_kfz_vehicle_cover(uuid, uuid, uuid) from public;
grant execute on function public.set_kfz_vehicle_cover(uuid, uuid, uuid) to authenticated;

create or replace function public.delete_kfz_fuel_entry(
  p_household_id uuid,
  p_fuel_id uuid,
  p_ignore_source boolean default false
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_budget uuid;
  v_invoice uuid;
begin
  if auth.uid() is null or not public.is_household_member(p_household_id) then
    raise exception using errcode = '42501', message = 'KFZ_HOUSEHOLD_ACCESS_DENIED';
  end if;
  delete from public.home_fahrzeug_tankvorgaenge
  where household_id = p_household_id and id = p_fuel_id
  returning budget_posten_id, rechnung_id into v_budget, v_invoice;
  if not found then
    raise exception using errcode = 'P0002', message = 'KFZ_FUEL_NOT_FOUND';
  end if;
  update public.home_fahrzeug_tank_importe
  set status = case when p_ignore_source then 'ignored' else 'pending' end,
      fahrzeug_id = null,
      tankvorgang_id = null,
      resolved_at = case when p_ignore_source then now() else null end,
      quell_snapshot = coalesce(quell_snapshot, '{}'::jsonb)
        || jsonb_build_object('manual_review_required', not p_ignore_source)
  where household_id = p_household_id
    and (budget_posten_id = v_budget or (v_invoice is not null and rechnung_id = v_invoice));
end;
$$;
revoke all on function public.delete_kfz_fuel_entry(uuid, uuid, boolean) from public;
grant execute on function public.delete_kfz_fuel_entry(uuid, uuid, boolean) to authenticated;

create or replace function public.delete_kfz_vehicle(
  p_household_id uuid,
  p_vehicle_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_paths jsonb := '[]'::jsonb;
begin
  if auth.uid() is null or not public.is_household_member(p_household_id) then
    raise exception using errcode = '42501', message = 'KFZ_HOUSEHOLD_ACCESS_DENIED';
  end if;
  if not exists (
    select 1 from public.home_fahrzeuge
    where household_id = p_household_id and id = p_vehicle_id
  ) then
    raise exception using errcode = 'P0002', message = 'KFZ_VEHICLE_NOT_FOUND';
  end if;

  select coalesce(jsonb_agg(d.storage_pfad) filter (where d.storage_pfad is not null), '[]'::jsonb)
  into v_paths
  from public.dokument_links l
  join public.dokumente d on d.id = l.dokument_id
  where l.household_id = p_household_id
    and l.entity_type = 'home_fahrzeuge'
    and l.entity_id = p_vehicle_id
    and l.role in ('vehicle_photo','vehicle_cover');

  delete from public.dokument_links
  where household_id = p_household_id
    and entity_type = 'home_fahrzeuge'
    and entity_id = p_vehicle_id;

  delete from public.dokumente d
  where d.household_id = p_household_id
    and d.dokument_typ = 'foto'
    and not exists (select 1 from public.dokument_links l where l.dokument_id = d.id)
    and d.storage_pfad in (
      select value #>> '{}' from jsonb_array_elements(v_paths)
    );

  delete from public.home_fahrzeuge
  where household_id = p_household_id and id = p_vehicle_id;
  return jsonb_build_object('storage_paths', v_paths);
end;
$$;
revoke all on function public.delete_kfz_vehicle(uuid, uuid) from public;
grant execute on function public.delete_kfz_vehicle(uuid, uuid) to authenticated;

create or replace function public.delete_kfz_service(
  p_household_id uuid,
  p_service_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.is_household_member(p_household_id) then
    raise exception using errcode = '42501', message = 'KFZ_HOUSEHOLD_ACCESS_DENIED';
  end if;
  delete from public.dokument_links
  where household_id = p_household_id
    and entity_type = 'home_fahrzeug_services'
    and entity_id = p_service_id;
  delete from public.home_fahrzeug_services
  where household_id = p_household_id and id = p_service_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'KFZ_SERVICE_NOT_FOUND';
  end if;
end;
$$;
revoke all on function public.delete_kfz_service(uuid, uuid) from public;
grant execute on function public.delete_kfz_service(uuid, uuid) to authenticated;

select pg_notify('pgrst', 'reload schema');
