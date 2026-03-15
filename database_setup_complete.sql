-- ============================================================
-- UMZUGSHELFER & HOME ORGANIZER — Komplettes Datenbank-Setup
-- Zuletzt aktualisiert: 2026-03-15
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
--  10. Schema neu laden
-- ============================================================


-- ============================================================
-- 1. EXTENSIONS & HILFSFUNKTIONEN
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Hilfsfunktion: updated_at automatisch setzen
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
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
  id             uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email          text,
  username       text,
  gesamtbudget   numeric(12,2) DEFAULT 0,
  openai_api_key text,
  created_at     timestamptz DEFAULT NOW(),
  updated_at     timestamptz DEFAULT NOW()
);

-- Neuen User automatisch anlegen
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
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
CREATE POLICY user_profile_select_own ON public.user_profile FOR SELECT USING (auth.uid() = id);

DROP POLICY IF EXISTS user_profile_insert_own ON public.user_profile;
CREATE POLICY user_profile_insert_own ON public.user_profile FOR INSERT WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS user_profile_update_own ON public.user_profile;
CREATE POLICY user_profile_update_own ON public.user_profile FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS user_profile_delete_own ON public.user_profile;
CREATE POLICY user_profile_delete_own ON public.user_profile FOR DELETE USING (auth.uid() = id);


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
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);


-- ── budget_posten ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.budget_posten (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  beschreibung text NOT NULL,
  kategorie    text,
  betrag       numeric(12,2) NOT NULL,
  datum        date NOT NULL DEFAULT CURRENT_DATE,
  lieferdatum  date,
  created_at   timestamptz DEFAULT NOW(),
  updated_at   timestamptz DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_budget_posten_user_id ON public.budget_posten(user_id);
CREATE INDEX IF NOT EXISTS idx_budget_posten_datum   ON public.budget_posten(datum);

DROP TRIGGER IF EXISTS set_budget_posten_updated_at ON public.budget_posten;
CREATE TRIGGER set_budget_posten_updated_at
  BEFORE UPDATE ON public.budget_posten
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.budget_posten ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS budget_posten_crud_own ON public.budget_posten;
CREATE POLICY budget_posten_crud_own ON public.budget_posten FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);


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
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);


-- ── todo_aufgaben ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.todo_aufgaben (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
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
  angehaengte_dokument_ids uuid[],
  created_at               timestamptz DEFAULT NOW(),
  updated_at               timestamptz DEFAULT NOW()
);

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
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);


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
  USING (user_id IS NULL OR auth.uid() = user_id);

DROP POLICY IF EXISTS todo_vorlagen_insert ON public.todo_vorlagen;
CREATE POLICY todo_vorlagen_insert ON public.todo_vorlagen FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS todo_vorlagen_delete ON public.todo_vorlagen;
CREATE POLICY todo_vorlagen_delete ON public.todo_vorlagen FOR DELETE TO authenticated
  USING (auth.uid() = user_id);


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
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);


-- ── pack_gegenstaende ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pack_gegenstaende (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  beschreibung text NOT NULL,
  menge        integer DEFAULT 1,
  kategorie    text,
  created_at   timestamptz DEFAULT NOW(),
  updated_at   timestamptz DEFAULT NOW()
);

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
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);


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

CREATE INDEX IF NOT EXISTS idx_dokumente_user_id         ON public.dokumente(user_id);
CREATE INDEX IF NOT EXISTS idx_dokumente_todo_aufgabe_id ON public.dokumente(todo_aufgabe_id);

DROP TRIGGER IF EXISTS set_dokumente_updated_at ON public.dokumente;
CREATE TRIGGER set_dokumente_updated_at
  BEFORE UPDATE ON public.dokumente
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.dokumente ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS dokumente_crud_own ON public.dokumente;
CREATE POLICY dokumente_crud_own ON public.dokumente FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);


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
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);


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
  WITH CHECK (bucket_id = 'user-dokumente' AND auth.uid()::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS storage_user_dokumente_select ON storage.objects;
CREATE POLICY storage_user_dokumente_select ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'user-dokumente' AND auth.uid()::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS storage_user_dokumente_delete ON storage.objects;
CREATE POLICY storage_user_dokumente_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'user-dokumente' AND auth.uid()::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS storage_kisten_fotos_insert ON storage.objects;
CREATE POLICY storage_kisten_fotos_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'kisten-fotos' AND auth.uid()::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS storage_kisten_fotos_select ON storage.objects;
CREATE POLICY storage_kisten_fotos_select ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'kisten-fotos' AND auth.uid()::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS storage_kisten_fotos_delete ON storage.objects;
CREATE POLICY storage_kisten_fotos_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'kisten-fotos' AND auth.uid()::text = (storage.foldername(name))[1]);


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
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);


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
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);


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
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);


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
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);


-- ── home_vorraete ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.home_vorraete (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  lagerort_id  uuid REFERENCES public.home_lagerorte(id) ON DELETE SET NULL,
  name         text NOT NULL,
  kategorie    text DEFAULT 'Haushalt',
  einheit      text DEFAULT 'Stück',
  menge        numeric(10,2) DEFAULT 0,
  mindest_menge numeric(10,2) DEFAULT 1,
  ablaufdatum  date,
  notizen      text,
  created_at   timestamptz DEFAULT NOW(),
  updated_at   timestamptz DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_home_vorraete_user_id ON public.home_vorraete(user_id);

DROP TRIGGER IF EXISTS set_home_vorraete_updated_at ON public.home_vorraete;
CREATE TRIGGER set_home_vorraete_updated_at
  BEFORE UPDATE ON public.home_vorraete
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.home_vorraete ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS home_vorraete_crud_own ON public.home_vorraete;
CREATE POLICY home_vorraete_crud_own ON public.home_vorraete FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);


-- ── home_einkaufliste ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.home_einkaufliste (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  vorrat_id   uuid REFERENCES public.home_vorraete(id) ON DELETE SET NULL,
  name        text NOT NULL,
  menge       numeric(10,2) DEFAULT 1,
  einheit     text DEFAULT 'Stück',
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
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);


-- ── home_geraete ──────────────────────────────────────────
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
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);


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
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);


-- ── home_bewohner ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.home_bewohner (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name       text NOT NULL,
  farbe      text NOT NULL DEFAULT '#10B981',
  emoji      text DEFAULT '👤',
  created_at timestamptz DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_home_bewohner_user_id ON public.home_bewohner(user_id);

ALTER TABLE public.home_bewohner ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS home_bewohner_user_own ON public.home_bewohner;
CREATE POLICY home_bewohner_user_own ON public.home_bewohner FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);


-- ── home_budget_limits ────────────────────────────────────
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
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_home_budget_limits_user ON public.home_budget_limits(user_id);


-- ── home_sparziele ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.home_sparziele (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name             text NOT NULL,
  ziel_betrag      numeric(10,2) NOT NULL,
  aktueller_betrag numeric(10,2) NOT NULL DEFAULT 0,
  zieldatum        date,
  farbe            text DEFAULT '#10B981',
  emoji            text DEFAULT '🎯',
  created_at       timestamptz DEFAULT NOW(),
  updated_at       timestamptz DEFAULT NOW()
);

ALTER TABLE public.home_sparziele ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS home_sparziele_own ON public.home_sparziele;
CREATE POLICY home_sparziele_own ON public.home_sparziele FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_home_sparziele_user ON public.home_sparziele(user_id);

DROP TRIGGER IF EXISTS set_home_sparziele_updated_at ON public.home_sparziele;
CREATE TRIGGER set_home_sparziele_updated_at
  BEFORE UPDATE ON public.home_sparziele
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
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);


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
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);


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
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);


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
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);


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
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS storage_home_fotos_select ON storage.objects;
CREATE POLICY storage_home_fotos_select ON storage.objects FOR SELECT
  USING (
    bucket_id = 'home-fotos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS storage_home_fotos_delete ON storage.objects;
CREATE POLICY storage_home_fotos_delete ON storage.objects FOR DELETE
  USING (
    bucket_id = 'home-fotos'
    AND auth.uid()::text = (storage.foldername(name))[1]
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
  UNIQUE(user_id, endpoint)
);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Eigene Subscriptions verwalten" ON public.push_subscriptions;
CREATE POLICY "Eigene Subscriptions verwalten"
  ON public.push_subscriptions FOR ALL
  USING (auth.uid() = user_id);

-- Alte Subscriptions automatisch bereinigen (> 90 Tage)
CREATE OR REPLACE FUNCTION public.bereinige_alte_subscriptions()
RETURNS void LANGUAGE sql AS $$
  DELETE FROM public.push_subscriptions
  WHERE created_at < NOW() - INTERVAL '90 days';
$$;


-- ============================================================
-- 9. MIGRATIONEN (für bestehende Installationen)
-- Neue Installationen können diesen Block ignorieren.
-- Er ist idempotent und schadet nicht.
-- ============================================================

-- Migration: persönliche To-Do-Vorlagen (user_id nullable)
ALTER TABLE public.todo_vorlagen
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

-- RLS für todo_vorlagen aktualisieren
DROP POLICY IF EXISTS todo_vorlagen_read ON public.todo_vorlagen;
CREATE POLICY todo_vorlagen_read ON public.todo_vorlagen FOR SELECT TO authenticated
  USING (user_id IS NULL OR auth.uid() = user_id);

DROP POLICY IF EXISTS todo_vorlagen_insert ON public.todo_vorlagen;
CREATE POLICY todo_vorlagen_insert ON public.todo_vorlagen FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS todo_vorlagen_delete ON public.todo_vorlagen;
CREATE POLICY todo_vorlagen_delete ON public.todo_vorlagen FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- Migration: home_vorraete Spalten normalisieren (bestand → menge, mindestmenge → mindest_menge)
ALTER TABLE public.home_vorraete
  RENAME COLUMN bestand      TO menge        RENAME COLUMN IF EXISTS bestand TO menge;
ALTER TABLE public.home_vorraete
  RENAME COLUMN mindestmenge TO mindest_menge RENAME COLUMN IF EXISTS mindestmenge TO mindest_menge;

-- home_projekte: deadline-Spalte sicherstellen
ALTER TABLE public.home_projekte
  ADD COLUMN IF NOT EXISTS deadline date;


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

SELECT pg_notify('pgrst', 'reload schema');
