-- Optional performance indexes for existing installations.
-- Existing indexes are inspected before CREATE INDEX: even IF NOT EXISTS can
-- require table ownership. Never change owners, grants, policies or user data.
DO $$
DECLARE
  target record;
  table_oid oid;
  index_oid oid;
  column_number smallint;
BEGIN
  FOR target IN
    SELECT * FROM (VALUES
      ('home_einkaufliste', 'vorrat_id', 'idx_home_einkaufliste_vorrat_id'),
      ('home_rezept_zutaten', 'matched_vorrat_id', 'idx_home_rezept_zutaten_matched_vorrat_id')
    ) AS targets(table_name, column_name, index_name)
  LOOP
    table_oid := to_regclass(format('public.%I', target.table_name));
    IF table_oid IS NULL THEN CONTINUE; END IF;
    SELECT attnum INTO column_number FROM pg_attribute
      WHERE attrelid = table_oid AND attname = target.column_name
        AND attnum > 0 AND NOT attisdropped;
    IF column_number IS NULL THEN CONTINUE; END IF;

    index_oid := to_regclass(format('public.%I', target.index_name));
    IF index_oid IS NOT NULL THEN
      IF NOT EXISTS (
        SELECT 1 FROM pg_index
        WHERE indexrelid = index_oid AND indrelid = table_oid
          AND indisvalid AND indisready AND indislive
          AND indkey[0] = column_number
          AND indpred IS NULL AND indexprs IS NULL
      ) THEN
        RAISE WARNING 'UMZUG_INDEX_CONFLICT: public.% already exists but is not a ready matching index. Inspect it manually; left unchanged.', target.index_name;
      END IF;
      CONTINUE;
    END IF;

    BEGIN
      EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (%I)',
        target.index_name, target.table_name, target.column_name);
    EXCEPTION WHEN insufficient_privilege THEN
      -- These two indexes improve performance but are not required for correctness.
      -- Only this known optional permission failure is non-fatal. SQL/IO failures
      -- still propagate to ON_ERROR_STOP and abort the update.
      RAISE WARNING 'UMZUG_INDEX_PERMISSION_SKIPPED: optional index public.% on public.% was not created. Run this hotfix as the table owner or local supabase_admin after review. Owners and permissions unchanged.',
        target.index_name, target.table_name;
    END;
  END LOOP;
END
$$;
