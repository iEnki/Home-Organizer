-- ============================================================
-- Migration: Rechnungsscan-Pipeline (V1)
-- Idempotent — kann mehrfach ausgefuehrt werden.
--
-- Ausfuehren im Supabase SQL-Editor (oder psql).
-- Reihenfolge:
--   1) dokumente erweitern (household_id, dokument_typ, tags, meta, extrahierter_text)
--   2) home_wissen erweitern (household_id, dokument_id, rechnung_id)
--   3) rechnungen (neue Tabelle)
--   4) rechnungs_positionen (neue Tabelle)
--   5) dokument_links (neue Tabelle)
--   6) home_wissen.rechnung_id FK nachziehen (nach Tabelle rechnungen)
--   7) RLS-Policies aktualisieren
-- ============================================================


-- ============================================================
-- 1) dokumente erweitern
-- ============================================================

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


-- ============================================================
-- 2) home_wissen erweitern
-- ============================================================

ALTER TABLE public.home_wissen
  ADD COLUMN IF NOT EXISTS household_id uuid REFERENCES public.households(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS dokument_id  uuid REFERENCES public.dokumente(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS rechnung_id  uuid; -- FK zu rechnungen wird weiter unten nachgezogen

CREATE INDEX IF NOT EXISTS idx_home_wissen_household_id
  ON public.home_wissen (household_id);

CREATE INDEX IF NOT EXISTS idx_home_wissen_dokument_id
  ON public.home_wissen (dokument_id);


-- ============================================================
-- 3) rechnungen (neu)
-- ============================================================

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


-- ============================================================
-- 4) rechnungs_positionen (neu)
-- ============================================================

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


-- ============================================================
-- 5) dokument_links (neu)
-- ============================================================

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


-- ============================================================
-- 6) home_wissen.rechnung_id FK nachziehen
-- ============================================================

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


-- ============================================================
-- 7) RLS-Policies aktualisieren
-- ============================================================

-- ── dokumente ─────────────────────────────────────────────
-- Erweitert: eigene Rows (user_id) ODER Haushalt-Rows (household_id)
ALTER TABLE public.dokumente ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS dokumente_crud_own     ON public.dokumente;
DROP POLICY IF EXISTS dokumente_household    ON public.dokumente;

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


-- ── home_wissen ───────────────────────────────────────────
-- Erweitert: eigene Rows (user_id) ODER Haushalt-Rows (household_id)
ALTER TABLE public.home_wissen ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS home_wissen_own        ON public.home_wissen;
DROP POLICY IF EXISTS home_wissen_household  ON public.home_wissen;

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


-- ============================================================
-- Abschluss-Pruefung (optional — gibt Tabelleninfos aus)
-- ============================================================
SELECT
  table_name,
  COUNT(*) AS spaltenanzahl
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('rechnungen','rechnungs_positionen','dokument_links','dokumente','home_wissen')
GROUP BY table_name
ORDER BY table_name;
