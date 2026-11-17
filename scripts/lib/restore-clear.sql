-- Run together with the data import in ONE psql transaction, ON_ERROR_STOP=1.
-- Keep target service migration history; restore all user/auth/storage data.
SET LOCAL session_replication_role = replica;
DO $$
DECLARE statement text;
BEGIN
  SELECT 'TRUNCATE TABLE ' || string_agg(format('%I.%I', schemaname, tablename), ', ')
  INTO statement
  FROM pg_tables
  WHERE schemaname IN ('public', 'auth', 'storage')
    AND NOT (schemaname = 'auth' AND tablename = 'schema_migrations')
    AND NOT (schemaname = 'storage' AND tablename = 'migrations');
  IF statement IS NULL THEN RAISE EXCEPTION 'No application tables found'; END IF;
  -- RESTRICT prevents accidental cascading into an unrelated service schema.
  EXECUTE statement;
END $$;
