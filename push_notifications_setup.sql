-- ============================================================
-- PUSH NOTIFICATIONS SETUP
-- Im Supabase SQL Editor ausführen.
-- ============================================================

-- ── 1. Tabelle: push_subscriptions ───────────────────────────────────────────
-- Speichert Web-Push-Subscriptions pro Nutzer und Gerät.

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id         uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    uuid        REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  endpoint   text        NOT NULL,
  p256dh     text        NOT NULL,
  auth       text        NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, endpoint)
);

ALTER TABLE push_subscriptions
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Eigene Subscriptions verwalten"
  ON push_subscriptions
  FOR ALL
  USING (auth.uid() = user_id);


-- ── 2. Automatisches Bereinigen alter Subscriptions (optional) ───────────────
-- Löscht Subscriptions, die älter als 90 Tage sind (können abgelaufen sein).

CREATE OR REPLACE FUNCTION bereinige_alte_subscriptions()
RETURNS void LANGUAGE sql AS $$
  DELETE FROM push_subscriptions
  WHERE COALESCE(updated_at, created_at) < now() - INTERVAL '90 days';
$$;


-- ── 3. pg_cron – check-reminders alle 30 Minuten ─────────────────────────────
-- Benötigt pg_cron Extension (in Supabase unter Database → Extensions aktivieren).
-- URL und Service-Role-Key anpassen!

/*
  Aktiviere pg_cron in Supabase unter:
  Database → Extensions → cron → Enable

  Dann diesen Block ausführen (URL und Key anpassen):
*/

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


-- ── 4. Supabase Edge Function Secrets ────────────────────────────────────────
-- Im Supabase Dashboard unter: Project Settings → Edge Functions → Secrets
-- Folgende Secrets anlegen:
--
--   VAPID_SUBJECT     = mailto:deine@email.de
--   VAPID_PUBLIC_KEY  = <dein-public-key>
--   VAPID_PRIVATE_KEY = <dein-private-key>
--
-- WICHTIG: Den Private Key sicher aufbewahren und niemals im Code committen!


-- ── 4b. Push-Dedupe-Spalten für todo_aufgaben ────────────────────────────────
-- Verhindert Spam bei periodischen Cron-Reminder-Checks.
ALTER TABLE public.todo_aufgaben
  ADD COLUMN IF NOT EXISTS letzte_push_erinnerung_am     timestamptz,
  ADD COLUMN IF NOT EXISTS letzte_push_bald_faellig_am   timestamptz,
  ADD COLUMN IF NOT EXISTS letzte_push_bald_faellig_fuer date,
  ADD COLUMN IF NOT EXISTS letzte_push_ueberfaellig_am   timestamptz,
  ADD COLUMN IF NOT EXISTS letzte_push_neu_am             timestamptz;

ALTER TABLE public.user_profile
  ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'Europe/Vienna';

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
  delivery_status text NOT NULL DEFAULT 'sent',
  reserved_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.home_push_reminder_state
  ADD COLUMN IF NOT EXISTS delivery_status text NOT NULL DEFAULT 'sent',
  ADD COLUMN IF NOT EXISTS reserved_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_home_push_reminder_state_pending
  ON public.home_push_reminder_state (delivery_status, reserved_at)
  WHERE delivery_status = 'pending';

CREATE UNIQUE INDEX IF NOT EXISTS idx_home_push_reminder_state_unique
  ON public.home_push_reminder_state (
    household_id, recipient_user_id, entity_type, entity_id,
    reminder_type, reminder_key, period_key
  );

ALTER TABLE public.home_push_reminder_state ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS home_push_reminder_state_household_member_access
  ON public.home_push_reminder_state;


-- ── 5. Edge Functions deployen ───────────────────────────────────────────────
-- Im Terminal (Supabase CLI erforderlich: npm i -g supabase):
--
--   supabase login
--   supabase link --project-ref DEIN-PROJECT-REF
--   supabase functions deploy send-push
--   supabase functions deploy check-reminders
--
-- Für self-hosted Supabase (wie supa.enkination.de):
--   supabase functions deploy send-push --project-ref DEIN-PROJECT-REF
--   supabase functions deploy check-reminders --project-ref DEIN-PROJECT-REF
