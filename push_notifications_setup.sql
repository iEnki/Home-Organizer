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
  UNIQUE(user_id, endpoint)
);

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
  WHERE created_at < now() - INTERVAL '90 days';
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
--   VAPID_PUBLIC_KEY  = BJWU4i1CJRIwQDTPRGfxccDO9qAXVaEWnkl5SUn8SrcQK4IYhbENOsbFtw9LfcVYR4i45KWjjeYVeuKsXg-FW4A
--   VAPID_PRIVATE_KEY = lFEbXMQeRNX5LsfFPHkcatQM4jbPR1g0LH3ct10L648
--
-- WICHTIG: Den Private Key sicher aufbewahren und niemals im Code committen!


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
