-- Home Organizer / Umzugshelfer
-- Schema-Paritaet mit dem produktiven Stand vom 2026-08-02.
--
-- Diese Migration ist datenerhaltend und mehrfach ausfuehrbar. Sie ergaenzt
-- ausschliesslich fehlende Tabellen, Spalten, Indizes, RLS-Regeln, Trigger,
-- Storage-Konfiguration und Funktionen. Bestehende Nutzdaten werden nicht
-- geloescht.

BEGIN;

-- ============================================================
-- 1. Fehlende Spalten des produktiven Schemas
-- ============================================================

ALTER TABLE public.budget_posten
  ADD COLUMN IF NOT EXISTS kategorie_splits jsonb;

ALTER TABLE public.home_wissen
  ADD COLUMN IF NOT EXISTS analysis_confidence numeric(4,3);

ALTER TABLE public.todo_aufgaben
  ADD COLUMN IF NOT EXISTS letzte_push_erinnerung_am timestamptz;

ALTER TABLE public.kontakte
  ADD COLUMN IF NOT EXISTS bewertung integer,
  ADD COLUMN IF NOT EXISTS bemerkungen text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.kontakte'::regclass
      AND conname = 'kontakte_bewertung_check'
  ) THEN
    ALTER TABLE public.kontakte
      ADD CONSTRAINT kontakte_bewertung_check
      CHECK (bewertung BETWEEN 1 AND 5);
  END IF;
END $$;

DO $$
DECLARE
  v_origin_added boolean := false;
BEGIN
  ALTER TABLE public.budget_split_groups
    ADD COLUMN IF NOT EXISTS payer_share_input numeric(12,4);

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'budget_split_groups'
      AND column_name = 'split_origin'
  ) THEN
    ALTER TABLE public.budget_split_groups
      ADD COLUMN split_origin text NOT NULL DEFAULT 'manual_occurrence';
    v_origin_added := true;
  END IF;

  ALTER TABLE public.budget_split_groups
    ADD COLUMN IF NOT EXISTS source_template_id uuid
      REFERENCES public.budget_posten(id) ON DELETE SET NULL;

  IF v_origin_added THEN
    UPDATE public.budget_split_groups bsg
    SET split_origin = CASE
      WHEN bp.wiederholen = true THEN 'template_default'
      WHEN bp.ursprung_template_id IS NOT NULL THEN 'manual_occurrence'
      ELSE 'manual_occurrence'
    END,
    source_template_id = CASE
      WHEN bp.ursprung_template_id IS NOT NULL
        THEN COALESCE(bsg.source_template_id, bp.ursprung_template_id)
      ELSE bsg.source_template_id
    END
    FROM public.budget_posten bp
    WHERE bp.id = bsg.budget_posten_id;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.budget_split_groups'::regclass
      AND conname = 'budget_split_groups_split_origin_check'
  ) THEN
    ALTER TABLE public.budget_split_groups
      ADD CONSTRAINT budget_split_groups_split_origin_check
      CHECK (split_origin IN ('template_default', 'inherited_occurrence', 'manual_occurrence'));
  END IF;
END $$;

ALTER TABLE public.budget_split_shares
  ADD COLUMN IF NOT EXISTS share_type text NOT NULL DEFAULT 'equal',
  ADD COLUMN IF NOT EXISTS share_input numeric(12,4);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.budget_split_shares'::regclass
      AND conname = 'budget_split_shares_share_type_check'
  ) THEN
    ALTER TABLE public.budget_split_shares
      ADD CONSTRAINT budget_split_shares_share_type_check
      CHECK (share_type IN ('equal', 'fixed', 'percent'));
  END IF;
END $$;

-- ============================================================
-- 2. Budget-Defaults, Settlement-Allokationen und Monatsledger
-- ============================================================

CREATE TABLE IF NOT EXISTS public.home_budget_split_defaults (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id    uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  kategorie       text NOT NULL,
  payer_member_id uuid REFERENCES public.home_bewohner(id) ON DELETE SET NULL,
  split_mode      text NOT NULL DEFAULT 'equal'
                  CHECK (split_mode IN ('equal', 'fixed', 'percent')),
  teilnehmer_ids  uuid[] NOT NULL DEFAULT '{}',
  shares_input    jsonb,
  created_at      timestamptz DEFAULT now(),
  UNIQUE (household_id, kategorie)
);

CREATE INDEX IF NOT EXISTS idx_hbsd_household
  ON public.home_budget_split_defaults(household_id);

ALTER TABLE public.home_budget_split_defaults ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS hbsd_household ON public.home_budget_split_defaults;
CREATE POLICY hbsd_household ON public.home_budget_split_defaults FOR ALL TO authenticated
  USING (public.is_household_member(household_id))
  WITH CHECK (public.is_household_member(household_id));

CREATE TABLE IF NOT EXISTS public.budget_settlement_allocations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  settlement_id   uuid NOT NULL REFERENCES public.budget_settlements(id) ON DELETE CASCADE,
  split_share_id  uuid NOT NULL REFERENCES public.budget_split_shares(id) ON DELETE CASCADE,
  household_id    uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  amount          numeric(12,2) NOT NULL CHECK (amount > 0),
  created_at      timestamptz DEFAULT now(),
  UNIQUE (settlement_id, split_share_id)
);

CREATE INDEX IF NOT EXISTS idx_bsa_settlement
  ON public.budget_settlement_allocations(settlement_id);
CREATE INDEX IF NOT EXISTS idx_bsa_share
  ON public.budget_settlement_allocations(split_share_id);
CREATE INDEX IF NOT EXISTS idx_bsa_household
  ON public.budget_settlement_allocations(household_id);

ALTER TABLE public.budget_settlement_allocations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS bsa_household ON public.budget_settlement_allocations;
CREATE POLICY bsa_household ON public.budget_settlement_allocations FOR ALL TO authenticated
  USING (public.is_household_member(household_id))
  WITH CHECK (public.is_household_member(household_id));

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

DROP TRIGGER IF EXISTS validate_settlement_allocation_trigger
  ON public.budget_settlement_allocations;
CREATE TRIGGER validate_settlement_allocation_trigger
  BEFORE INSERT OR UPDATE ON public.budget_settlement_allocations
  FOR EACH ROW EXECUTE FUNCTION public.validate_settlement_allocation();

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
CREATE POLICY budget_ledger_state_household ON public.budget_ledger_state FOR ALL TO authenticated
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
CREATE POLICY budget_month_closes_household ON public.budget_month_closes FOR ALL TO authenticated
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

DROP TRIGGER IF EXISTS set_budget_month_close_members_updated_at
  ON public.budget_month_close_members;
CREATE TRIGGER set_budget_month_close_members_updated_at
  BEFORE UPDATE ON public.budget_month_close_members
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.budget_month_close_members ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS budget_month_close_members_household
  ON public.budget_month_close_members;
CREATE POLICY budget_month_close_members_household
  ON public.budget_month_close_members FOR ALL TO authenticated
  USING (public.is_household_member(household_id))
  WITH CHECK (public.is_household_member(household_id));

-- ============================================================
-- 3. Bibliothek und Kochprotokolle
-- ============================================================

CREATE TABLE IF NOT EXISTS public.home_buecher (
  id                            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id                  uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  user_id                       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by_user_id            uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  titel                         text NOT NULL,
  untertitel                    text,
  autoren                       text[] DEFAULT '{}'::text[],
  autor_anzeige                 text,
  isbn_10                       text,
  isbn_13                       text,
  verlag                        text,
  erscheinungsjahr              int,
  sprache                       text DEFAULT 'de',
  seitenzahl                    int,
  beschreibung                  text,
  cover_url                     text,
  thumbnail_url                 text,
  genres                        text[] DEFAULT '{}'::text[],
  tags                          text[] DEFAULT '{}'::text[],
  ort_id                        uuid REFERENCES public.home_orte(id) ON DELETE SET NULL,
  lagerort_id                   uuid REFERENCES public.home_lagerorte(id) ON DELETE SET NULL,
  status                        text NOT NULL DEFAULT 'im_regal'
                                CHECK (status IN ('im_regal', 'verliehen', 'vermisst', 'verschenkt', 'entsorgt')),
  zustand                       text CHECK (zustand IN ('sehr_gut', 'gut', 'akzeptabel', 'schlecht')),
  anzahl                        int NOT NULL DEFAULT 1,
  exemplar_nummer               int,
  notizen                       text,
  api_quelle                    text,
  api_ref                       text,
  api_payload                   jsonb DEFAULT '{}'::jsonb,
  scan_quelle                   text,
  scan_confidence               numeric(4,3),
  review_noetig                 boolean NOT NULL DEFAULT false,
  verliehen_an_name             text,
  verliehen_an_kontakt_id       uuid REFERENCES public.kontakte(id) ON DELETE SET NULL,
  verliehen_seit                date,
  rueckgabe_erwartet_am         date,
  erinnerung_aktiv              boolean NOT NULL DEFAULT false,
  erinnerung_intervall_tage     int DEFAULT 7,
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
CREATE POLICY household_member_access ON public.home_buecher FOR ALL TO authenticated
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

CREATE TABLE IF NOT EXISTS public.home_buch_verleihverlauf (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  user_id      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  buch_id      uuid NOT NULL REFERENCES public.home_buecher(id) ON DELETE CASCADE,
  ereignis     text NOT NULL
               CHECK (ereignis IN ('verliehen', 'zurueckgegeben', 'erinnerung_gesendet', 'verlaengert')),
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
CREATE POLICY household_member_access ON public.home_buch_verleihverlauf FOR ALL TO authenticated
  USING (public.is_household_member(household_id))
  WITH CHECK (public.is_household_member(household_id));

CREATE TABLE IF NOT EXISTS public.home_buch_importe (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  user_id      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  quelle       text NOT NULL CHECK (quelle IN ('regal_scan', 'csv', 'manuell')),
  status       text NOT NULL DEFAULT 'ausstehend'
               CHECK (status IN ('ausstehend', 'in_bearbeitung', 'abgeschlossen', 'verworfen')),
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
CREATE POLICY household_member_access ON public.home_buch_importe FOR ALL TO authenticated
  USING (public.is_household_member(household_id))
  WITH CHECK (public.is_household_member(household_id));

DROP TRIGGER IF EXISTS set_home_buch_importe_updated_at ON public.home_buch_importe;
CREATE TRIGGER set_home_buch_importe_updated_at
  BEFORE UPDATE ON public.home_buch_importe
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.home_buch_import_kandidaten (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id  uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  import_id     uuid NOT NULL REFERENCES public.home_buch_importe(id) ON DELETE CASCADE,
  roh_daten     jsonb DEFAULT '{}'::jsonb,
  api_match     jsonb DEFAULT '{}'::jsonb,
  confidence    numeric(4,3),
  vorschlag     jsonb DEFAULT '{}'::jsonb,
  review_status text NOT NULL DEFAULT 'ausstehend'
                CHECK (review_status IN ('ausstehend', 'bestaetigt', 'abgelehnt', 'bearbeitet')),
  buch_id       uuid REFERENCES public.home_buecher(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS home_buch_import_kandidaten_import_id_idx
  ON public.home_buch_import_kandidaten(import_id);
CREATE INDEX IF NOT EXISTS home_buch_import_kandidaten_household_idx
  ON public.home_buch_import_kandidaten(household_id);

ALTER TABLE public.home_buch_import_kandidaten ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS household_member_access ON public.home_buch_import_kandidaten;
CREATE POLICY household_member_access ON public.home_buch_import_kandidaten FOR ALL TO authenticated
  USING (public.is_household_member(household_id))
  WITH CHECK (public.is_household_member(household_id));

CREATE TABLE IF NOT EXISTS public.home_rezept_kochprotokolle (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rezept_id    uuid NOT NULL REFERENCES public.home_rezepte(id) ON DELETE CASCADE,
  gekocht_am   date NOT NULL DEFAULT CURRENT_DATE,
  bewertung    integer CHECK (bewertung BETWEEN 1 AND 5),
  anpassungen  text,
  notizen      text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS home_rezept_kochprotokolle_rezept_idx
  ON public.home_rezept_kochprotokolle(household_id, rezept_id, gekocht_am DESC);
CREATE INDEX IF NOT EXISTS home_rezept_kochprotokolle_user_idx
  ON public.home_rezept_kochprotokolle(user_id, created_at DESC);

ALTER TABLE public.home_rezept_kochprotokolle ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS home_rezept_kochprotokolle_select ON public.home_rezept_kochprotokolle;
CREATE POLICY home_rezept_kochprotokolle_select ON public.home_rezept_kochprotokolle
  FOR SELECT TO authenticated USING (public.is_household_member(household_id));
DROP POLICY IF EXISTS home_rezept_kochprotokolle_insert ON public.home_rezept_kochprotokolle;
CREATE POLICY home_rezept_kochprotokolle_insert ON public.home_rezept_kochprotokolle
  FOR INSERT TO authenticated WITH CHECK (public.is_household_member(household_id));
DROP POLICY IF EXISTS home_rezept_kochprotokolle_update ON public.home_rezept_kochprotokolle;
CREATE POLICY home_rezept_kochprotokolle_update ON public.home_rezept_kochprotokolle
  FOR UPDATE TO authenticated
  USING (public.is_household_member(household_id))
  WITH CHECK (public.is_household_member(household_id));
DROP POLICY IF EXISTS home_rezept_kochprotokolle_delete ON public.home_rezept_kochprotokolle;
CREATE POLICY home_rezept_kochprotokolle_delete ON public.home_rezept_kochprotokolle
  FOR DELETE TO authenticated USING (public.is_household_member(household_id));

DROP TRIGGER IF EXISTS set_home_rezept_kochprotokolle_updated_at
  ON public.home_rezept_kochprotokolle;
CREATE TRIGGER set_home_rezept_kochprotokolle_updated_at
  BEFORE UPDATE ON public.home_rezept_kochprotokolle
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- 4. Additive Reparaturen fuer aktive Funktionen
-- ============================================================

CREATE TABLE IF NOT EXISTS public.rechner_szenarien (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name         text NOT NULL,
  rechner_typ  text NOT NULL,
  ergebnis     text,
  notizen      text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.rechner_szenarien'::regclass
      AND conname = 'rechner_szenarien_rechner_typ_check'
  ) THEN
    ALTER TABLE public.rechner_szenarien
      ADD CONSTRAINT rechner_szenarien_rechner_typ_check
      CHECK (rechner_typ IN (
        'Wandfarbe', 'Bodenbelag', 'Tapete', 'Daemmstoff',
        'Dämmstoff', 'Kisten', 'Volumen', 'Sonstiges'
      ));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS rechner_szenarien_user_created_idx
  ON public.rechner_szenarien(user_id, created_at DESC);

ALTER TABLE public.rechner_szenarien ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rechner_szenarien_own ON public.rechner_szenarien;
CREATE POLICY rechner_szenarien_own ON public.rechner_szenarien FOR ALL TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP TRIGGER IF EXISTS set_rechner_szenarien_updated_at ON public.rechner_szenarien;
CREATE TRIGGER set_rechner_szenarien_updated_at
  BEFORE UPDATE ON public.rechner_szenarien
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.umzug_meilensteine (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id       uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  user_id            uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  titel              text NOT NULL,
  datum              date NOT NULL,
  beschreibung       text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS umzug_meilensteine_household_datum_idx
  ON public.umzug_meilensteine(household_id, datum);

ALTER TABLE public.umzug_meilensteine ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS umzug_meilensteine_household ON public.umzug_meilensteine;
CREATE POLICY umzug_meilensteine_household ON public.umzug_meilensteine FOR ALL TO authenticated
  USING (public.is_household_member(household_id))
  WITH CHECK (public.is_household_member(household_id));

DROP TRIGGER IF EXISTS set_household_scope_defaults_trigger ON public.umzug_meilensteine;
CREATE TRIGGER set_household_scope_defaults_trigger
  BEFORE INSERT OR UPDATE ON public.umzug_meilensteine
  FOR EACH ROW EXECUTE FUNCTION public.set_household_scope_defaults();

DROP TRIGGER IF EXISTS set_umzug_meilensteine_updated_at ON public.umzug_meilensteine;
CREATE TRIGGER set_umzug_meilensteine_updated_at
  BEFORE UPDATE ON public.umzug_meilensteine
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'book-covers', 'book-covers', true, 10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS book_covers_public_read ON storage.objects;
CREATE POLICY book_covers_public_read ON storage.objects FOR SELECT
  USING (bucket_id = 'book-covers');

DROP POLICY IF EXISTS book_covers_household_insert ON storage.objects;
CREATE POLICY book_covers_household_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'book-covers'
    AND EXISTS (
      SELECT 1 FROM public.household_members hm
      WHERE hm.user_id = (SELECT auth.uid())
        AND hm.household_id::text = (storage.foldername(name))[1]
    )
  );

DROP POLICY IF EXISTS book_covers_household_update ON storage.objects;
CREATE POLICY book_covers_household_update ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'book-covers'
    AND EXISTS (
      SELECT 1 FROM public.household_members hm
      WHERE hm.user_id = (SELECT auth.uid())
        AND hm.household_id::text = (storage.foldername(name))[1]
    )
  )
  WITH CHECK (
    bucket_id = 'book-covers'
    AND EXISTS (
      SELECT 1 FROM public.household_members hm
      WHERE hm.user_id = (SELECT auth.uid())
        AND hm.household_id::text = (storage.foldername(name))[1]
    )
  );

DROP POLICY IF EXISTS book_covers_household_delete ON storage.objects;
CREATE POLICY book_covers_household_delete ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'book-covers'
    AND EXISTS (
      SELECT 1 FROM public.household_members hm
      WHERE hm.user_id = (SELECT auth.uid())
        AND hm.household_id::text = (storage.foldername(name))[1]
    )
  );

CREATE INDEX IF NOT EXISTS idx_budget_posten_recurring_due
  ON public.budget_posten(household_id, app_modus, naechstes_datum)
  WHERE wiederholen = true
    AND archived_at IS NULL
    AND naechstes_datum IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_todo_aufgaben_open_due
  ON public.todo_aufgaben(household_id, app_modus, faelligkeitsdatum)
  WHERE erledigt = false
    AND faelligkeitsdatum IS NOT NULL;

-- Die Budget-Ledger-Funktionen folgen bewusst erst nach allen Tabellen.

-- ============================================================
-- 5. Budget-Ledger-, Schutz- und Stale-State-Funktionen
-- ============================================================

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

DROP TRIGGER IF EXISTS mark_budget_allocation_stale_trigger
  ON public.budget_settlement_allocations;
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
    v_remaining_cents := ROUND(v_settlement.amount * 100)::bigint
      - COALESCE(v_settlement.allocated_cents, 0);

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
    GREATEST(
      ROUND(bss.amount_owed * 100)::bigint - COALESCE(at.allocated_cents, 0),
      0
    ) AS open_amount_cents,
    GREATEST((p_as_of_date - bp.datum)::int, 0) AS age_days
  FROM public.budget_split_shares bss
  JOIN public.budget_split_groups bsg ON bsg.id = bss.split_group_id
  JOIN public.budget_posten bp ON bp.id = bsg.budget_posten_id
  LEFT JOIN allocation_totals at ON at.split_share_id = bss.id
  WHERE bsg.household_id = p_household_id
    AND bp.datum IS NOT NULL
    AND bp.datum <= p_as_of_date
    AND COALESCE(bp.wiederholen, false) = false
    AND GREATEST(
      ROUND(bss.amount_owed * 100)::bigint - COALESCE(at.allocated_cents, 0),
      0
    ) > 0
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

  IF p_from_member_id IS NULL
     OR p_to_member_id IS NULL
     OR p_from_member_id = p_to_member_id THEN
    RAISE EXCEPTION 'Ungueltige Settlement-Paarung.';
  END IF;

  v_amount := ROUND(COALESCE(p_amount, 0)::numeric, 2);
  IF v_amount <= 0 THEN
    RAISE EXCEPTION 'Der Settlement-Betrag muss groesser als 0 sein.';
  END IF;

  PERFORM public.assert_budget_ledger_ready(p_household_id);

  FOR v_share IN
    SELECT *
    FROM public.get_budget_open_split_ledger(
      p_household_id,
      COALESCE(p_date, CURRENT_DATE)
    ) AS ledger
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
    FROM public.get_budget_open_split_ledger(
      p_household_id,
      COALESCE(p_date, CURRENT_DATE)
    ) AS ledger
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
  FROM public.get_budget_open_split_ledger(
    p_household_id,
    COALESCE(p_date, CURRENT_DATE)
  ) AS ledger
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
    SELECT bss.member_id AS member_id,
      -SUM(ROUND(bss.amount_owed * 100))::bigint AS delta
    FROM public.budget_split_shares bss
    JOIN public.budget_split_groups bsg ON bsg.id = bss.split_group_id
    JOIN public.budget_posten bp ON bp.id = bsg.budget_posten_id
    WHERE bsg.household_id = p_household_id
      AND COALESCE(bp.wiederholen, false) = false
      AND bp.datum >= v_month
      AND bp.datum <= v_month_end
    GROUP BY bss.member_id
    UNION ALL
    SELECT bsg.payer_member_id AS member_id,
      SUM(ROUND(bss.amount_owed * 100))::bigint AS delta
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
    SELECT bs.from_member_id AS member_id,
      SUM(ROUND(bsa.amount * 100))::bigint AS delta
    FROM public.budget_settlement_allocations bsa
    JOIN public.budget_settlements bs ON bs.id = bsa.settlement_id
    WHERE bs.household_id = p_household_id
      AND bs.date >= v_month
      AND bs.date <= v_month_end
    GROUP BY bs.from_member_id
    UNION ALL
    SELECT bs.to_member_id AS member_id,
      -SUM(ROUND(bsa.amount * 100))::bigint AS delta
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

-- Die SECURITY-DEFINER-Helfer sind nicht anonym aufrufbar. Die sechs vom
-- Frontend verwendeten RPCs bleiben fuer angemeldete Benutzer verfuegbar.
REVOKE ALL ON FUNCTION public.can_access_household_budget(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ensure_budget_ledger_state(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mark_budget_months_stale_from(uuid, date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.has_budget_split_allocations(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.backfill_budget_settlement_allocations(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.assert_budget_ledger_ready(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_budget_open_split_ledger(uuid, date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_budget_settlement_with_allocations(uuid, uuid, uuid, numeric, date, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_budget_settlement_for_split_share(uuid, uuid, numeric, date, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.delete_budget_settlement(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.close_budget_month(uuid, date) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.backfill_budget_settlement_allocations(uuid)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_budget_open_split_ledger(uuid, date)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_budget_settlement_with_allocations(uuid, uuid, uuid, numeric, date, text)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_budget_settlement_for_split_share(uuid, uuid, numeric, date, text)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.delete_budget_settlement(uuid)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.close_budget_month(uuid, date)
  TO authenticated, service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.home_budget_split_defaults,
  public.budget_settlement_allocations,
  public.budget_ledger_state,
  public.budget_month_closes,
  public.budget_month_close_members,
  public.home_buecher,
  public.home_buch_verleihverlauf,
  public.home_buch_importe,
  public.home_buch_import_kandidaten,
  public.home_rezept_kochprotokolle,
  public.rechner_szenarien,
  public.umzug_meilensteine
TO authenticated;

SELECT pg_notify('pgrst', 'reload schema');

COMMIT;
