-- ============================================================
-- UMZUGHELFER - Multiuser Haushaltssystem (V1)
-- Idempotente Migration fuer bestehende Installationen
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Kompatibilitaet: Manche Bestandsinstallationen verwenden handle_updated_at.
-- Wir stellen beide Trigger-Funktionsnamen bereit.
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

-- ============================================================
-- 1) Kernobjekte
-- ============================================================

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

CREATE INDEX IF NOT EXISTS idx_household_members_household_id
  ON public.household_members(household_id);
CREATE INDEX IF NOT EXISTS idx_household_members_user_id
  ON public.household_members(user_id);

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
  updated_at                    timestamptz NOT NULL DEFAULT NOW(),
  updated_by                    uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

DROP TRIGGER IF EXISTS set_household_settings_updated_at ON public.household_settings;
CREATE TRIGGER set_household_settings_updated_at
  BEFORE UPDATE ON public.household_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.household_invites (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  email       text NOT NULL,
  token_hash  text NOT NULL UNIQUE,
  invited_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT NOW(),
  expires_at  timestamptz NOT NULL,
  accepted_at timestamptz,
  revoked_at  timestamptz
);

CREATE INDEX IF NOT EXISTS idx_household_invites_household
  ON public.household_invites(household_id);
CREATE INDEX IF NOT EXISTS idx_household_invites_email
  ON public.household_invites(LOWER(email));
CREATE INDEX IF NOT EXISTS idx_household_invites_active
  ON public.household_invites(expires_at, accepted_at, revoked_at);

-- ============================================================
-- 2) Helper-Funktionen
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_current_household_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT hm.household_id
  FROM public.household_members hm
  WHERE hm.user_id = (SELECT auth.uid())
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.is_household_member(p_household_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.household_members hm
    WHERE hm.household_id = p_household_id
      AND hm.user_id = (SELECT auth.uid())
  );
$$;

CREATE OR REPLACE FUNCTION public.is_household_admin(p_household_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.household_members hm
    WHERE hm.household_id = p_household_id
      AND hm.user_id = (SELECT auth.uid())
      AND hm.role = 'admin'
  );
$$;

CREATE OR REPLACE FUNCTION public.get_household_context()
RETURNS TABLE (
  household_id uuid,
  household_name text,
  role text,
  is_admin boolean,
  app_modus text,
  umzug_deaktiviert boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
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
  user_id uuid,
  role text,
  joined_at timestamptz,
  display_name text,
  email text,
  avatar_url text,
  is_current_user boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
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
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid;
  v_household_id uuid;
  v_name text;
  v_profile record;
BEGIN
  v_uid := (SELECT auth.uid());
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Nicht authentifiziert.';
  END IF;

  SELECT hm.household_id INTO v_household_id
  FROM public.household_members hm
  WHERE hm.user_id = v_uid
  LIMIT 1;

  IF v_household_id IS NOT NULL THEN
    RETURN v_household_id;
  END IF;

  v_name := NULLIF(BTRIM(p_name), '');
  IF v_name IS NULL THEN
    v_name := 'Mein Haushalt';
  END IF;

  INSERT INTO public.households (name, created_by)
  VALUES (v_name, v_uid)
  RETURNING id INTO v_household_id;

  INSERT INTO public.household_members (household_id, user_id, role)
  VALUES (v_household_id, v_uid, 'admin');

  SELECT
    up.app_modus,
    up.umzug_deaktiviert,
    up.ki_provider,
    up.openai_api_key,
    up.ollama_base_url,
    up.ollama_model
  INTO v_profile
  FROM public.user_profile up
  WHERE up.id = v_uid;

  INSERT INTO public.household_settings (
    household_id, app_modus, umzug_deaktiviert, ki_provider,
    openai_api_key, ollama_base_url, ollama_model, updated_by
  )
  VALUES (
    v_household_id,
    COALESCE(v_profile.app_modus, 'umzug'),
    COALESCE(v_profile.umzug_deaktiviert, false),
    COALESCE(v_profile.ki_provider, 'openai'),
    v_profile.openai_api_key,
    v_profile.ollama_base_url,
    COALESCE(v_profile.ollama_model, 'llama3.2'),
    v_uid
  )
  ON CONFLICT (household_id) DO NOTHING;

  RETURN v_household_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_household_invite(
  p_email text,
  p_expires_in interval DEFAULT INTERVAL '7 days'
)
RETURNS TABLE (invite_id uuid, invite_token text, invite_url text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid;
  v_household_id uuid;
  v_email text;
  v_token text;
  v_hash text;
BEGIN
  v_uid := (SELECT auth.uid());
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Nicht authentifiziert.';
  END IF;

  v_household_id := public.get_current_household_id();
  IF v_household_id IS NULL OR NOT public.is_household_admin(v_household_id) THEN
    RAISE EXCEPTION 'Nur Admin kann Einladungen erstellen.';
  END IF;

  v_email := LOWER(BTRIM(p_email));
  IF v_email IS NULL OR v_email = '' THEN
    RAISE EXCEPTION 'E-Mail ist erforderlich.';
  END IF;

  IF to_regprocedure('extensions.gen_random_bytes(integer)') IS NOT NULL THEN
    v_token := ENCODE(extensions.gen_random_bytes(24), 'hex');
  ELSIF to_regprocedure('public.gen_random_bytes(integer)') IS NOT NULL THEN
    v_token := ENCODE(public.gen_random_bytes(24), 'hex');
  ELSE
    RAISE EXCEPTION 'pgcrypto Funktion gen_random_bytes(integer) nicht gefunden.';
  END IF;

  -- Token ist hochentropisch; md5 dient hier nur als gespeicherter Vergleichswert.
  v_hash := md5(v_token);

  INSERT INTO public.household_invites (
    household_id, email, token_hash, invited_by, expires_at
  )
  VALUES (
    v_household_id, v_email, v_hash, v_uid, NOW() + p_expires_in
  )
  RETURNING id INTO invite_id;

  invite_token := v_token;
  invite_url := '/join-household?token=' || v_token;
  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.accept_household_invite(p_token text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid;
  v_email text;
  v_hash text;
  v_invite record;
  v_invite_first_login_required boolean;
BEGIN
  v_uid := (SELECT auth.uid());
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Nicht authentifiziert.';
  END IF;

  IF EXISTS (SELECT 1 FROM public.household_members hm WHERE hm.user_id = v_uid) THEN
    RAISE EXCEPTION 'Dieser Benutzer ist bereits einem Haushalt zugeordnet.';
  END IF;

  SELECT
    LOWER(u.email),
    COALESCE((u.raw_user_meta_data->>'invite_first_login_required') = 'true', false)
  INTO v_email, v_invite_first_login_required
  FROM auth.users u
  WHERE u.id = v_uid;

  IF v_email IS NULL THEN
    RAISE EXCEPTION 'Konnte Benutzer-E-Mail nicht bestimmen.';
  END IF;

  v_hash := md5(BTRIM(p_token));

  SELECT *
  INTO v_invite
  FROM public.household_invites hi
  WHERE hi.token_hash = v_hash
    AND hi.revoked_at IS NULL
    AND hi.accepted_at IS NULL
    AND hi.expires_at > NOW()
  LIMIT 1;

  IF v_invite.id IS NULL THEN
    RAISE EXCEPTION 'Einladung ungÃƒÂ¼ltig oder abgelaufen.';
  END IF;

  IF LOWER(v_invite.email) <> v_email THEN
    RAISE EXCEPTION 'Einladung ist an eine andere E-Mail-Adresse gebunden.';
  END IF;

  INSERT INTO public.household_members (household_id, user_id, role)
  VALUES (v_invite.household_id, v_uid, 'member');

  UPDATE public.household_invites
  SET accepted_at = NOW()
  WHERE id = v_invite.id;

  INSERT INTO public.household_settings (household_id)
  VALUES (v_invite.household_id)
  ON CONFLICT (household_id) DO NOTHING;

  -- Nur neu per Invite erzeugte OTP-Konten markieren.
  IF COALESCE(v_invite_first_login_required, false) THEN
    INSERT INTO public.user_profile (id, password_change_required)
    VALUES (v_uid, true)
    ON CONFLICT (id) DO UPDATE
    SET password_change_required = true;
  END IF;

  RETURN v_invite.household_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.transfer_household_admin(p_new_admin_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid;
  v_household_id uuid;
BEGIN
  v_uid := (SELECT auth.uid());
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Nicht authentifiziert.';
  END IF;

  v_household_id := public.get_current_household_id();
  IF v_household_id IS NULL OR NOT public.is_household_admin(v_household_id) THEN
    RAISE EXCEPTION 'Nur Admin kann die Rolle ÃƒÂ¼bertragen.';
  END IF;

  IF p_new_admin_user_id = v_uid THEN
    RAISE EXCEPTION 'Neuer Admin muss ein anderes Mitglied sein.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.household_members hm
    WHERE hm.household_id = v_household_id
      AND hm.user_id = p_new_admin_user_id
  ) THEN
    RAISE EXCEPTION 'Zielbenutzer ist kein Mitglied dieses Haushalts.';
  END IF;

  UPDATE public.household_members
  SET role = CASE
    WHEN user_id = p_new_admin_user_id THEN 'admin'
    WHEN user_id = v_uid THEN 'member'
    ELSE role
  END
  WHERE household_id = v_household_id
    AND user_id IN (p_new_admin_user_id, v_uid);

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.leave_household()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid;
  v_household_id uuid;
BEGIN
  v_uid := (SELECT auth.uid());
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Nicht authentifiziert.';
  END IF;

  v_household_id := public.get_current_household_id();
  IF v_household_id IS NULL THEN
    RETURN true;
  END IF;

  IF public.is_household_admin(v_household_id) THEN
    RAISE EXCEPTION 'Admin kann den Haushalt nicht verlassen. Erst Admin ÃƒÂ¼bertragen oder Haushalt lÃƒÂ¶schen.';
  END IF;

  DELETE FROM public.household_members
  WHERE household_id = v_household_id
    AND user_id = v_uid;

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_household()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_household_id uuid;
BEGIN
  v_household_id := public.get_current_household_id();
  IF v_household_id IS NULL OR NOT public.is_household_admin(v_household_id) THEN
    RAISE EXCEPTION 'Nur Admin darf den Haushalt lÃƒÂ¶schen.';
  END IF;

  DELETE FROM public.households
  WHERE id = v_household_id;

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_household_app_mode(
  p_app_modus text,
  p_umzug_deaktiviert boolean DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_household_id uuid;
BEGIN
  v_household_id := public.get_current_household_id();
  IF v_household_id IS NULL OR NOT public.is_household_admin(v_household_id) THEN
    RAISE EXCEPTION 'Nur Admin darf globale Haushaltseinstellungen ÃƒÂ¤ndern.';
  END IF;

  INSERT INTO public.household_settings (household_id, app_modus, umzug_deaktiviert, updated_by)
  VALUES (v_household_id, COALESCE(NULLIF(BTRIM(p_app_modus), ''), 'umzug'), COALESCE(p_umzug_deaktiviert, false), (SELECT auth.uid()))
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
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_household_id uuid;
BEGIN
  v_household_id := public.get_current_household_id();
  IF v_household_id IS NULL OR NOT public.is_household_admin(v_household_id) THEN
    RAISE EXCEPTION 'Nur Admin darf KI-Einstellungen ÃƒÂ¤ndern.';
  END IF;

  INSERT INTO public.household_settings (
    household_id, ki_provider, openai_api_key, ollama_base_url, ollama_model, updated_by
  )
  VALUES (
    v_household_id,
    COALESCE(NULLIF(BTRIM(p_ki_provider), ''), 'openai'),
    NULLIF(BTRIM(p_openai_api_key), ''),
    NULLIF(BTRIM(p_ollama_base_url), ''),
    COALESCE(NULLIF(BTRIM(p_ollama_model), ''), 'llama3.2'),
    (SELECT auth.uid())
  )
  ON CONFLICT (household_id) DO UPDATE
  SET ki_provider = EXCLUDED.ki_provider,
      openai_api_key = EXCLUDED.openai_api_key,
      ollama_base_url = EXCLUDED.ollama_base_url,
      ollama_model = EXCLUDED.ollama_model,
      updated_by = (SELECT auth.uid()),
      updated_at = NOW();

  RETURN true;
END;
$$;

-- ============================================================
-- 3) Automatische Datenmigration (bestehende Nutzer/Tabellen)
-- ============================================================

-- 3.1 Pro bestehendem User Haushalt + Admin-Mitglied sicherstellen
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

-- 3.2 Settings fuer bestehende Haushalte sicherstellen (aus Admin-Profil)
INSERT INTO public.household_settings (
  household_id, app_modus, umzug_deaktiviert,
  ki_provider, openai_api_key, ollama_base_url, ollama_model, updated_by
)
SELECT
  hm.household_id,
  COALESCE(up.app_modus, 'umzug'),
  COALESCE(up.umzug_deaktiviert, false),
  COALESCE(up.ki_provider, 'openai'),
  up.openai_api_key,
  up.ollama_base_url,
  COALESCE(up.ollama_model, 'llama3.2'),
  hm.user_id
FROM public.household_members hm
LEFT JOIN public.user_profile up ON up.id = hm.user_id
WHERE hm.role = 'admin'
ON CONFLICT (household_id) DO NOTHING;

-- 3.3 Shared Tabellen auf household_id migrieren
DO $$
DECLARE
  shared_tables text[] := ARRAY[
    'kontakte',
    'budget_posten',
    'budget_teilzahlungen',
    'todo_aufgaben',
    'pack_kisten',
    'pack_gegenstaende',
    'dokumente',
    'renovierungs_posten',
    'home_projekte',
    'home_orte',
    'home_lagerorte',
    'home_objekte',
    'home_vorraete',
    'home_einkaufliste',
    'home_geraete',
    'home_wartungen',
    'home_bewohner',
    'home_budget_limits',
    'home_sparziele',
    'home_verlauf',
    'home_wissen',
    'haushaltsaufgaben',
    'vorraete',
    'projekte',
    'geraete'
  ];
  t text;
  fk record;
  pol record;
BEGIN
  FOREACH t IN ARRAY shared_tables
  LOOP
    IF EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = t
    ) THEN
      EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS household_id uuid', t);
      EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS created_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL', t);

      EXECUTE format('UPDATE public.%I SET created_by_user_id = user_id WHERE created_by_user_id IS NULL', t);

      EXECUTE format(
        'UPDATE public.%I tbl
         SET household_id = hm.household_id
         FROM public.household_members hm
         WHERE tbl.household_id IS NULL
           AND tbl.user_id = hm.user_id',
        t
      );

      EXECUTE format(
        'UPDATE public.%I tbl
         SET household_id = hm.household_id
         FROM public.household_members hm
         WHERE tbl.household_id IS NULL
           AND tbl.created_by_user_id = hm.user_id',
        t
      );

      EXECUTE format(
        'UPDATE public.%I
         SET household_id = (SELECT id FROM public.households ORDER BY created_at ASC LIMIT 1)
         WHERE household_id IS NULL',
        t
      );

      -- user_id-FK auf ON DELETE SET NULL umstellen
      FOR fk IN
        SELECT con.conname
        FROM pg_constraint con
        JOIN pg_class rel ON rel.oid = con.conrelid
        JOIN pg_namespace ns ON ns.oid = rel.relnamespace
        JOIN pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
        WHERE ns.nspname = 'public'
          AND rel.relname = t
          AND con.contype = 'f'
          AND att.attname = 'user_id'
      LOOP
        EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT IF EXISTS %I', t, fk.conname);
      END LOOP;

      EXECUTE format('ALTER TABLE public.%I ALTER COLUMN user_id DROP NOT NULL', t);
      BEGIN
        EXECUTE format(
          'ALTER TABLE public.%I
           ADD CONSTRAINT %I
           FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL',
          t, t || '_user_id_setnull_fkey'
        );
      EXCEPTION WHEN duplicate_object THEN
        NULL;
      END;

      -- household_id NOT NULL + FK
      EXECUTE format('ALTER TABLE public.%I ALTER COLUMN household_id SET NOT NULL', t);

      FOR fk IN
        SELECT con.conname
        FROM pg_constraint con
        JOIN pg_class rel ON rel.oid = con.conrelid
        JOIN pg_namespace ns ON ns.oid = rel.relnamespace
        JOIN pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
        WHERE ns.nspname = 'public'
          AND rel.relname = t
          AND con.contype = 'f'
          AND att.attname = 'household_id'
      LOOP
        EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT IF EXISTS %I', t, fk.conname);
      END LOOP;

      EXECUTE format(
        'ALTER TABLE public.%I
         ADD CONSTRAINT %I
         FOREIGN KEY (household_id) REFERENCES public.households(id) ON DELETE CASCADE',
        t, t || '_household_id_fkey'
      );

      EXECUTE format(
        'CREATE INDEX IF NOT EXISTS %I ON public.%I(household_id)',
        'idx_' || t || '_household_id',
        t
      );

      -- Alte Policies ersetzen (Member-Vollzugriff)
      FOR pol IN
        SELECT policyname
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = t
      LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, t);
      END LOOP;

      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
      EXECUTE format(
        'CREATE POLICY household_member_access ON public.%I
         FOR ALL TO authenticated
         USING (public.is_household_member(household_id))
         WITH CHECK (public.is_household_member(household_id))',
        t
      );
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
LANGUAGE sql
STABLE
SECURITY DEFINER
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
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
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

-- home_budget_limits: Unique von user_id -> household_id
DO $$
BEGIN
  ALTER TABLE public.home_budget_limits
    DROP CONSTRAINT IF EXISTS home_budget_limits_user_id_kategorie_key;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'home_budget_limits_household_id_kategorie_key'
      AND conrelid = 'public.home_budget_limits'::regclass
  ) THEN
    BEGIN
      ALTER TABLE public.home_budget_limits
        ADD CONSTRAINT home_budget_limits_household_id_kategorie_key
        UNIQUE (household_id, kategorie);
    EXCEPTION
      WHEN duplicate_table THEN
        -- Es existiert bereits ein gleichnamiger Unique-Index aus einem frÃƒÂ¼heren Lauf.
        DROP INDEX IF EXISTS public.home_budget_limits_household_id_kategorie_key;
        ALTER TABLE public.home_budget_limits
          ADD CONSTRAINT home_budget_limits_household_id_kategorie_key
          UNIQUE (household_id, kategorie);
    END;
  END IF;
END $$;

-- ============================================================
-- 4) Insert/Update-Helfer fuer alte Frontend-Payloads
-- ============================================================

CREATE OR REPLACE FUNCTION public.set_household_scope_defaults()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
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
    'kontakte',
    'budget_posten',
    'budget_teilzahlungen',
    'todo_aufgaben',
    'pack_kisten',
    'pack_gegenstaende',
    'dokumente',
    'renovierungs_posten',
    'home_projekte',
    'home_orte',
    'home_lagerorte',
    'home_objekte',
    'home_vorraete',
    'home_einkaufliste',
    'home_geraete',
    'home_wartungen',
    'home_bewohner',
    'home_budget_limits',
    'home_sparziele',
    'home_verlauf',
    'home_wissen',
    'haushaltsaufgaben',
    'vorraete',
    'projekte',
    'geraete'
  ];
  t text;
BEGIN
  FOREACH t IN ARRAY shared_tables
  LOOP
    IF EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = t
    ) THEN
      EXECUTE format('DROP TRIGGER IF EXISTS set_household_scope_defaults_trigger ON public.%I', t);
      EXECUTE format(
        'CREATE TRIGGER set_household_scope_defaults_trigger
         BEFORE INSERT OR UPDATE ON public.%I
         FOR EACH ROW EXECUTE FUNCTION public.set_household_scope_defaults()',
        t
      );
    END IF;
  END LOOP;
END $$;

-- ============================================================
-- 5) RLS fuer neue Tabellen
-- ============================================================

ALTER TABLE public.households ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.household_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.household_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.household_invites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS household_member_read_household ON public.households;
CREATE POLICY household_member_read_household
  ON public.households FOR SELECT TO authenticated
  USING (public.is_household_member(id));

DROP POLICY IF EXISTS household_admin_update_household ON public.households;
CREATE POLICY household_admin_update_household
  ON public.households FOR UPDATE TO authenticated
  USING (public.is_household_admin(id))
  WITH CHECK (public.is_household_admin(id));

DROP POLICY IF EXISTS household_admin_delete_household ON public.households;
CREATE POLICY household_admin_delete_household
  ON public.households FOR DELETE TO authenticated
  USING (public.is_household_admin(id));

DROP POLICY IF EXISTS household_member_read_members ON public.household_members;
CREATE POLICY household_member_read_members
  ON public.household_members FOR SELECT TO authenticated
  USING (public.is_household_member(household_id));

DROP POLICY IF EXISTS household_admin_manage_members ON public.household_members;
CREATE POLICY household_admin_manage_members
  ON public.household_members FOR ALL TO authenticated
  USING (public.is_household_admin(household_id))
  WITH CHECK (public.is_household_admin(household_id));

DROP POLICY IF EXISTS household_admin_read_settings ON public.household_settings;
CREATE POLICY household_admin_read_settings
  ON public.household_settings FOR SELECT TO authenticated
  USING (public.is_household_admin(household_id));

DROP POLICY IF EXISTS household_admin_manage_settings ON public.household_settings;
CREATE POLICY household_admin_manage_settings
  ON public.household_settings FOR ALL TO authenticated
  USING (public.is_household_admin(household_id))
  WITH CHECK (public.is_household_admin(household_id));

DROP POLICY IF EXISTS household_admin_manage_invites ON public.household_invites;
CREATE POLICY household_admin_manage_invites
  ON public.household_invites FOR ALL TO authenticated
  USING (public.is_household_admin(household_id))
  WITH CHECK (public.is_household_admin(household_id));

-- ============================================================
-- 6) Sync: Admin user_profile -> household_settings
--    (kompatibel mit bestehender UI)
-- ============================================================

CREATE OR REPLACE FUNCTION public.sync_user_profile_to_household_settings()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
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
  )
  VALUES (
    v_household_id,
    COALESCE(NEW.app_modus, 'umzug'),
    COALESCE(NEW.umzug_deaktiviert, false),
    COALESCE(NEW.ki_provider, 'openai'),
    NEW.openai_api_key,
    NEW.ollama_base_url,
    COALESCE(NEW.ollama_model, 'llama3.2'),
    NEW.id
  )
  ON CONFLICT (household_id) DO UPDATE
  SET app_modus = EXCLUDED.app_modus,
      umzug_deaktiviert = EXCLUDED.umzug_deaktiviert,
      ki_provider = EXCLUDED.ki_provider,
      openai_api_key = EXCLUDED.openai_api_key,
      ollama_base_url = EXCLUDED.ollama_base_url,
      ollama_model = EXCLUDED.ollama_model,
      updated_by = NEW.id,
      updated_at = NOW();

  RETURN NEW;
END;
$$;

ALTER TABLE public.user_profile
  ADD COLUMN IF NOT EXISTS password_change_required boolean NOT NULL DEFAULT false;

DROP TRIGGER IF EXISTS sync_user_profile_to_household_settings_trigger ON public.user_profile;
CREATE TRIGGER sync_user_profile_to_household_settings_trigger
  AFTER INSERT OR UPDATE OF app_modus, umzug_deaktiviert, ki_provider, openai_api_key, ollama_base_url, ollama_model
  ON public.user_profile
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_user_profile_to_household_settings();

-- ============================================================
-- 7) Schema Reload
-- ============================================================
SELECT pg_notify('pgrst', 'reload schema');

